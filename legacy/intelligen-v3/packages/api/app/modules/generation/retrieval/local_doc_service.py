"""
Local Document Manager — FAISS-based RAG for uploaded knowledge files.
Migrated from model_strategy/app/services/local_doc_service.py
Flask deps removed: no Flask context, no KnowledgeBase model, temp-only mode.
"""
import os
import logging
from typing import List, Optional

from app.platform.config import settings


class LocalDocManager:
    """Local document management: loads, chunks, and indexes uploaded files for RAG."""

    def __init__(self):
        self.knowledge_dir = os.path.abspath(settings.KNOWLEDGE_DIR)
        self.vector_db = None
        self.embeddings = None
        self._init_embeddings()

    def _init_embeddings(self):
        try:
            from langchain_huggingface import HuggingFaceEmbeddings

            local_model_path = settings.EMBEDDING_MODEL_NAME
            if not os.path.exists(local_model_path):
                logging.warning(f"Embedding model path not found: {local_model_path}, RAG disabled")
                self.embeddings = None
                return

            self.embeddings = HuggingFaceEmbeddings(
                model_name=local_model_path,
                cache_folder="./.cache/huggingface",
                model_kwargs={'device': 'cpu'},
                encode_kwargs={'normalize_embeddings': True}
            )
            logging.info("✅ Local Embedding model loaded")
        except (ImportError, OSError, RuntimeError) as e:
            logging.warning(f"Embedding model unavailable: {e}")
            self.embeddings = None

    def build_index(self, uploaded_files: List[str] = None):
        """Build FAISS index from uploaded files. Accepts full paths or filenames."""
        if not self.embeddings:
            return []
        if not uploaded_files:
            logging.info("No uploaded files to index, skipping")
            return []

        from langchain_text_splitters import RecursiveCharacterTextSplitter
        from langchain_community.vectorstores import FAISS

        documents = []
        temp_files = []

        for file_path in uploaded_files:
            # Support both absolute paths and filenames relative to knowledge_dir
            if os.path.isabs(file_path) and os.path.exists(file_path):
                path = file_path
                filename = os.path.basename(file_path)
            else:
                filename = file_path
                path = os.path.join(self.knowledge_dir, filename)

            try:
                _, ext = os.path.splitext(filename)
                ext = (ext[1:] if ext else filename).lower()

                loader = self._get_loader(path, ext)
                if loader is None:
                    logging.warning(f"Unsupported file type: {filename} ({ext})")
                    continue

                docs = loader.load()
                for d in docs:
                    d.metadata['source'] = filename
                    d.metadata['path'] = path
                documents.extend(docs)
                temp_files.append(path)
            except Exception as e:
                logging.error(f"Failed to load {filename}: {e}")

        if documents:
            splitter = RecursiveCharacterTextSplitter(
                chunk_size=2000, chunk_overlap=300
            )
            split_docs = splitter.split_documents(documents)
            self.vector_db = FAISS.from_documents(split_docs, self.embeddings)
            logging.info(f"✅ Index built: {len(split_docs)} chunks from {len(uploaded_files)} files")

        return temp_files

    def _get_loader(self, path: str, ext: str):
        """Return the appropriate document loader for a file extension."""
        if not os.path.exists(path):
            logging.error(f"File not found: {path}")
            return None

        from langchain_community.document_loaders import PyPDFLoader, TextLoader, Docx2txtLoader

        loaders = {
            'pdf': lambda: PyPDFLoader(path),
            'txt': lambda: TextLoader(path, encoding='utf-8'),
            'md': lambda: TextLoader(path, encoding='utf-8'),
            'docx': lambda: Docx2txtLoader(path),
        }
        factory = loaders.get(ext)
        return factory() if factory else None

    def query_raw(self, text: str, k: int = 5) -> List[dict]:
        """Return raw search results without formatting.

        Returns a list of dicts: ``[{"source": filename, "content": text}, ...]``
        The caller is responsible for citation numbering via the CitationRegistry.
        """
        if not self.vector_db:
            return []
        try:
            docs = self.vector_db.similarity_search(text, k=k)
            results = []
            for d in docs:
                source = d.metadata.get('source', 'Unknown')
                content = d.page_content[:500].replace('\n', ' ').strip()
                results.append({"source": source, "content": content})
            return results
        except Exception as e:
            logging.error(f"Knowledge base query failed: {e}")
            return []

    def query(self, text: str, start_number: int = None) -> str:
        """Query the FAISS index for relevant chunks.

        Args:
            text: Query text
            start_number: Starting citation number. If None, returns without citation numbers.
        """
        hits = self.query_raw(text)
        if not hits:
            return ""
        result = []
        for i, hit in enumerate(hits):
            source = hit["source"]
            content = hit["content"]
            if start_number is not None:
                num = start_number + i
                result.append(
                    f"[{num}] Title: {source}\n"
                    f"    Source: Local Knowledge Base\n"
                    f"    Content: {content}"
                )
            else:
                result.append(
                    f"Source: {source}\n"
                    f"Content: {content}"
                )
        return "\n\n".join(result)
