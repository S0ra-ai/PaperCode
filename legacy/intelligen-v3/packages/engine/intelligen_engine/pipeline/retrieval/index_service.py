"""
Index Service — persistent, content-hash-deduped FAISS indexing.

Replaces the temporary per-task LocalDocManager with a service that:
- Indexes documents once (by content hash) and persists to disk
- Reuses existing indexes across tasks for the same document
- Returns chunk-level EvidenceItems with stable IDs
- Falls back gracefully if embedding model is unavailable
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path
from typing import Optional

from intelligen_engine.pipeline.retrieval.evidence import (
    EvidenceItem,
    SourceTier,
    VerificationStatus,
)
from intelligen_engine.core.config import settings

logger = logging.getLogger(__name__)

# Source-tier weighting for score normalization
_SOURCE_TIER_WEIGHTS = {
    "tier_a": 1.0,    # Primary databases (Crossref, ArXiv)
    "tier_b": 0.85,   # Secondary (Google Scholar)
    "tier_c": 0.7,    # Tertiary (web search)
    "local": 1.1,     # Local uploaded files (slight boost)
}


@dataclass
class ChunkMeta:
    """Metadata for a single chunk stored alongside the FAISS index."""
    chunk_id: str
    doc_id: str
    source_filename: str
    chunk_index: int
    page: Optional[int]
    offset: int
    length: int
    content_preview: str  # first 200 chars for quick display


@dataclass
class DocumentIndexInfo:
    """Metadata about a persisted document index."""
    doc_id: str           # content hash
    source_filename: str
    file_size: int
    chunk_count: int
    indexed_at: float     # unix timestamp
    chunk_size: int
    chunk_overlap: int


@dataclass
class QueryResult:
    """Structured return type for IndexService.query()."""
    items: list  # list[EvidenceItem] (forward ref avoids circular import)
    total_searched: int  # number of indexes searched
    query_text: str
    elapsed_ms: float = 0.0


class IndexService:
    """Manages persistent per-document FAISS indexes.

    Directory layout::

        {index_dir}/
            {content_hash}/
                index.faiss      — FAISS binary index
                chunks.json      — List[ChunkMeta]
                info.json        — DocumentIndexInfo
    """

    def __init__(self, index_dir: str | None = None):
        self.index_dir = Path(index_dir or getattr(settings, "RAG_INDEX_DIR", "./data/indexes"))
        self.index_dir.mkdir(parents=True, exist_ok=True)
        self.embeddings = None
        self._index_cache: dict[str, object] = {}  # doc_id → loaded FAISS index
        self._index_cache_max = 8  # max cached indexes in memory
        self._init_embeddings()

    def _init_embeddings(self):
        """Initialize embedding model (same as old LocalDocManager)."""
        try:
            from langchain_huggingface import HuggingFaceEmbeddings

            model_path = getattr(settings, "EMBEDDING_MODEL_NAME", "")
            if not os.path.exists(model_path):
                logger.warning(f"Embedding model not found: {model_path}, IndexService disabled")
                return

            self.embeddings = HuggingFaceEmbeddings(
                model_name=model_path,
                cache_folder="./.cache/huggingface",
                model_kwargs={"device": "cpu"},
                encode_kwargs={"normalize_embeddings": True},
            )
            logger.info("✅ IndexService embedding model loaded")
        except (ImportError, OSError, RuntimeError) as e:
            logger.warning(f"Embedding model unavailable: {e}")

    @property
    def available(self) -> bool:
        return self.embeddings is not None

    # ------------------------------------------------------------------
    # Content hashing
    # ------------------------------------------------------------------
    @staticmethod
    def _compute_file_hash(file_path: str) -> str:
        """SHA-256 content hash of a file."""
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(8192), b""):
                h.update(chunk)
        return h.hexdigest()

    @staticmethod
    def _make_chunk_id(doc_id: str, chunk_index: int) -> str:
        """Deterministic chunk ID from doc hash + index."""
        raw = f"{doc_id}:{chunk_index}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    # ------------------------------------------------------------------
    # Index directory helpers
    # ------------------------------------------------------------------
    def _doc_dir(self, doc_id: str) -> Path:
        return self.index_dir / doc_id

    def _has_index(self, doc_id: str) -> bool:
        d = self._doc_dir(doc_id)
        return (d / "index.faiss").exists() and (d / "chunks.json").exists()

    def _load_chunks_meta(self, doc_id: str) -> list[ChunkMeta]:
        path = self._doc_dir(doc_id) / "chunks.json"
        with open(path, "r", encoding="utf-8") as f:
            return [ChunkMeta(**item) for item in json.load(f)]

    def _load_info(self, doc_id: str) -> DocumentIndexInfo | None:
        path = self._doc_dir(doc_id) / "info.json"
        if not path.exists():
            return None
        with open(path, "r", encoding="utf-8") as f:
            return DocumentIndexInfo(**json.load(f))

    # ------------------------------------------------------------------
    # Indexing
    # ------------------------------------------------------------------
    def index_document(self, file_path: str) -> str | None:
        """Index a single document. Returns doc_id (content hash) or None on failure.

        If the document has already been indexed (same content hash), skips re-indexing.
        """
        if not self.available:
            return None

        file_path = os.path.abspath(file_path)
        if not os.path.exists(file_path):
            logger.error(f"File not found: {file_path}")
            return None

        filename = os.path.basename(file_path)
        doc_id = self._compute_file_hash(file_path)

        # Check for existing index
        if self._has_index(doc_id):
            logger.info(f"Index exists for {filename} (hash={doc_id[:12]}…), reusing")
            return doc_id

        # Parse and chunk
        _, ext = os.path.splitext(filename)
        ext = ext.lstrip(".").lower()

        docs = self._load_file(file_path, ext)
        if not docs:
            return None

        from langchain_text_splitters import RecursiveCharacterTextSplitter

        chunk_size = getattr(settings, "RAG_CHUNK_SIZE", 2000)
        chunk_overlap = getattr(settings, "RAG_CHUNK_OVERLAP", 300)
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size, chunk_overlap=chunk_overlap,
        )
        split_docs = splitter.split_documents(docs)

        if not split_docs:
            logger.warning(f"No chunks produced from {filename}")
            return None

        # Build chunk metadata
        chunks_meta: list[ChunkMeta] = []
        for i, doc in enumerate(split_docs):
            chunk_id = self._make_chunk_id(doc_id, i)
            doc.metadata["chunk_id"] = chunk_id
            doc.metadata["doc_id"] = doc_id
            doc.metadata["chunk_index"] = i
            doc.metadata["source_filename"] = filename

            chunks_meta.append(ChunkMeta(
                chunk_id=chunk_id,
                doc_id=doc_id,
                source_filename=filename,
                chunk_index=i,
                page=doc.metadata.get("page"),
                offset=i * max(chunk_size - chunk_overlap, 1),
                length=len(doc.page_content),
                content_preview=doc.page_content[:200],
            ))

        # Build FAISS index
        from langchain_community.vectorstores import FAISS

        faiss_index = FAISS.from_documents(split_docs, self.embeddings)

        # Persist atomically: write to temp dir, then rename to final location
        doc_dir = self._doc_dir(doc_id)
        tmp_dir = doc_dir.parent / f".tmp_{doc_id}_{os.getpid()}"
        try:
            tmp_dir.mkdir(parents=True, exist_ok=True)

            faiss_index.save_local(str(tmp_dir), index_name="index")

            with open(tmp_dir / "chunks.json", "w", encoding="utf-8") as f:
                json.dump([asdict(c) for c in chunks_meta], f, ensure_ascii=False, indent=2)

            info = DocumentIndexInfo(
                doc_id=doc_id,
                source_filename=filename,
                file_size=os.path.getsize(file_path),
                chunk_count=len(chunks_meta),
                indexed_at=time.time(),
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
            )
            with open(tmp_dir / "info.json", "w", encoding="utf-8") as f:
                json.dump(asdict(info), f, ensure_ascii=False, indent=2)

            # Atomic rename: if target already appeared (race), just use it
            if not doc_dir.exists():
                try:
                    tmp_dir.rename(doc_dir)
                except OSError:
                    # Another process may have created it; that's fine
                    if self._has_index(doc_id):
                        shutil.rmtree(tmp_dir, ignore_errors=True)
                    else:
                        raise
            else:
                shutil.rmtree(tmp_dir, ignore_errors=True)

        except Exception:
            shutil.rmtree(tmp_dir, ignore_errors=True)
            raise

        logger.info(f"✅ Indexed {filename}: {len(chunks_meta)} chunks (hash={doc_id[:12]}…)")
        return doc_id

    def index_documents(self, file_paths: list[str]) -> list[str]:
        """Index multiple documents in parallel, return list of doc_ids (skipping failures)."""
        if not file_paths:
            return []
        if len(file_paths) == 1:
            doc_id = self.index_document(file_paths[0])
            return [doc_id] if doc_id else []

        max_workers = min(len(file_paths), 4)
        doc_ids: list[str] = []
        with ThreadPoolExecutor(max_workers=max_workers) as pool:
            futures = {pool.submit(self.index_document, fp): fp for fp in file_paths}
            for future in as_completed(futures):
                try:
                    doc_id = future.result(timeout=120)
                    if doc_id:
                        doc_ids.append(doc_id)
                except Exception as e:
                    logger.error(f"Failed to index {futures[future]}: {e}")
        return doc_ids

    # ------------------------------------------------------------------
    # Querying
    # ------------------------------------------------------------------
    def query(
        self,
        text: str,
        doc_ids: list[str] | None = None,
        k: int = 5,
    ) -> QueryResult:
        """Query across one or more document indexes.

        Args:
            text: Query text
            doc_ids: Document content hashes to search. If None, searches all.
            k: Number of results per document index.

        Returns:
            QueryResult with sorted EvidenceItems (highest score first).
        """
        t0 = time.time()
        if not self.available:
            return QueryResult(items=[], total_searched=0, query_text=text)

        targets = doc_ids if doc_ids else self._list_all_doc_ids()
        if not targets:
            return QueryResult(items=[], total_searched=0, query_text=text)

        all_results: list[EvidenceItem] = []
        searched = 0

        for doc_id in targets:
            if not self._has_index(doc_id):
                continue

            searched += 1
            try:
                faiss_index = self._get_cached_index(doc_id)
                if faiss_index is None:
                    continue

                docs_with_scores = faiss_index.similarity_search_with_score(text, k=k)
                chunks_meta = {c.chunk_id: c for c in self._load_chunks_meta(doc_id)}

                for doc, score in docs_with_scores:
                    chunk_id = doc.metadata.get("chunk_id", "")
                    chunk_meta = chunks_meta.get(chunk_id)

                    # FAISS L2 distance → similarity (lower distance = higher similarity)
                    similarity = 1.0 / (1.0 + float(score))

                    # Apply source-tier weighting
                    source_tier_key = doc.metadata.get("source_tier", "local")
                    tier_weight = _SOURCE_TIER_WEIGHTS.get(source_tier_key, 1.0)
                    similarity = min(max(similarity * tier_weight, 0.0), 1.0)

                    evidence = EvidenceItem(
                        id=chunk_id or f"{doc_id}:{hash(doc.page_content) % 10000}",
                        source="Local Knowledge Base",
                        source_tier=SourceTier.A,
                        title=doc.metadata.get("source_filename", doc.metadata.get("source", "Unknown")),
                        content=doc.page_content,
                        doc_id=doc_id,
                        chunk_id=chunk_id,
                        chunk_index=chunk_meta.chunk_index if chunk_meta else None,
                        page=doc.metadata.get("page") or (chunk_meta.page if chunk_meta else None),
                        offset=chunk_meta.offset if chunk_meta else None,
                        source_filename=doc.metadata.get("source_filename", ""),
                        score=similarity,
                        verification_status=VerificationStatus.LIKELY_VALID,
                    )
                    all_results.append(evidence)

            except Exception as e:
                logger.error(f"Failed to query index {doc_id[:12]}…: {e}")

        # Sort by score descending, return top-k across all docs
        all_results.sort(key=lambda e: e.score, reverse=True)
        elapsed = (time.time() - t0) * 1000
        return QueryResult(
            items=all_results[:k],
            total_searched=searched,
            query_text=text,
            elapsed_ms=round(elapsed, 1),
        )

    # ------------------------------------------------------------------
    # Maintenance
    # ------------------------------------------------------------------
    def list_indexed_documents(self) -> list[DocumentIndexInfo]:
        """List all indexed documents."""
        results = []
        for doc_id in self._list_all_doc_ids():
            info = self._load_info(doc_id)
            if info:
                results.append(info)
        return results

    def remove_index(self, doc_id: str) -> bool:
        """Remove a document index from disk and cache."""
        self._index_cache.pop(doc_id, None)
        doc_dir = self._doc_dir(doc_id)
        if doc_dir.exists():
            shutil.rmtree(doc_dir)
            logger.info(f"Removed index for {doc_id[:12]}…")
            return True
        return False

    def cleanup_expired(self, max_age_days: int | None = None) -> int:
        """Remove indexes older than max_age_days. Returns count removed."""
        max_age = max_age_days or getattr(settings, "RAG_INDEX_TTL_DAYS", 90)
        cutoff = time.time() - (max_age * 86400)
        removed = 0
        for doc_id in self._list_all_doc_ids():
            info = self._load_info(doc_id)
            if info and info.indexed_at < cutoff:
                self.remove_index(doc_id)
                removed += 1
        return removed

    def rebuild_index(self, doc_id: str, file_path: str) -> str | None:
        """Remove existing index and re-index from file.

        Returns the new doc_id (content hash) or None on failure.
        Note: the returned doc_id may differ from the input if the file
        content has changed since original indexing.
        """
        self.remove_index(doc_id)
        return self.index_document(file_path)

    def get_stats(self) -> dict:
        """Return summary statistics about the index store."""
        doc_ids = self._list_all_doc_ids()
        total_chunks = 0
        disk_usage = 0
        oldest: float | None = None
        newest: float | None = None

        for doc_id in doc_ids:
            info = self._load_info(doc_id)
            if info:
                total_chunks += info.chunk_count
                if oldest is None or info.indexed_at < oldest:
                    oldest = info.indexed_at
                if newest is None or info.indexed_at > newest:
                    newest = info.indexed_at
            doc_dir = self._doc_dir(doc_id)
            if doc_dir.exists():
                for f in doc_dir.iterdir():
                    if f.is_file():
                        disk_usage += f.stat().st_size

        return {
            "total_indexes": len(doc_ids),
            "total_chunks": total_chunks,
            "disk_usage_bytes": disk_usage,
            "oldest_indexed_at": oldest,
            "newest_indexed_at": newest,
            "cache_loaded": len(self._index_cache),
        }

    def preload_indexes(self) -> int:
        """Load all existing indexes into memory cache on startup.

        Returns the number of indexes successfully loaded.
        """
        doc_ids = self._list_all_doc_ids()
        loaded = 0
        for doc_id in doc_ids:
            if len(self._index_cache) >= self._index_cache_max:
                break
            try:
                idx = self._get_cached_index(doc_id)
                if idx is not None:
                    loaded += 1
            except Exception as e:
                logger.warning(f"Failed to preload index {doc_id[:12]}…: {e}")
        logger.info(f"✅ Preloaded {loaded}/{len(doc_ids)} indexes into memory cache")
        return loaded

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------
    def _get_cached_index(self, doc_id: str):
        """Load FAISS index with in-memory LRU cache to avoid repeated disk I/O."""
        if doc_id in self._index_cache:
            return self._index_cache[doc_id]

        try:
            from langchain_community.vectorstores import FAISS
            doc_dir = str(self._doc_dir(doc_id))
            faiss_index = FAISS.load_local(
                doc_dir, self.embeddings,
                index_name="index",
                allow_dangerous_deserialization=True,
            )
            # Evict oldest if cache is full
            if len(self._index_cache) >= self._index_cache_max:
                oldest_key = next(iter(self._index_cache))
                del self._index_cache[oldest_key]
            self._index_cache[doc_id] = faiss_index
            return faiss_index
        except Exception as e:
            logger.error(f"Failed to load FAISS index for {doc_id[:12]}…: {e}")
            return None

    def _list_all_doc_ids(self) -> list[str]:
        """List all doc_ids that have a valid index on disk."""
        if not self.index_dir.exists():
            return []
        return [
            d.name for d in self.index_dir.iterdir()
            if d.is_dir() and (d / "index.faiss").exists()
        ]

    def _load_file(self, path: str, ext: str):
        """Load a file into LangChain Document objects."""
        if not os.path.exists(path):
            logger.error(f"File not found: {path}")
            return []

        try:
            from langchain_community.document_loaders import (
                PyPDFLoader, TextLoader, Docx2txtLoader,
            )

            loaders = {
                "pdf": lambda: PyPDFLoader(path),
                "txt": lambda: TextLoader(path, encoding="utf-8"),
                "md": lambda: TextLoader(path, encoding="utf-8"),
                "docx": lambda: Docx2txtLoader(path),
            }
            factory = loaders.get(ext)
            if not factory:
                logger.warning(f"Unsupported file type: {ext}")
                return []

            return factory().load()
        except Exception as e:
            logger.error(f"Failed to load {path}: {e}")
            return []
