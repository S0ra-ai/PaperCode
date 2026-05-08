"""Tests for IndexService — persistent FAISS indexing with content-hash dedup."""

import hashlib
import json
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.modules.generation.retrieval.index_service import (
    ChunkMeta,
    DocumentIndexInfo,
    IndexService,
    QueryResult,
)
from app.modules.generation.retrieval.evidence import (
    EvidenceItem,
    SourceTier,
    VerificationStatus,
)


class TestChunkMeta:

    def test_fields(self):
        meta = ChunkMeta(
            chunk_id="abc123",
            doc_id="hash456",
            source_filename="paper.pdf",
            chunk_index=0,
            page=1,
            offset=0,
            length=500,
            content_preview="Introduction to...",
        )
        assert meta.chunk_id == "abc123"
        assert meta.chunk_index == 0
        assert meta.page == 1


class TestDocumentIndexInfo:

    def test_fields(self):
        info = DocumentIndexInfo(
            doc_id="hash",
            source_filename="test.pdf",
            file_size=1024,
            chunk_count=5,
            indexed_at=1700000000.0,
            chunk_size=2000,
            chunk_overlap=300,
        )
        assert info.chunk_count == 5
        assert info.chunk_size == 2000


class TestQueryResult:

    def test_empty_result(self):
        qr = QueryResult(items=[], total_searched=0, query_text="test")
        assert len(qr.items) == 0
        assert qr.total_searched == 0
        assert qr.elapsed_ms == 0.0

    def test_with_items(self):
        items = [
            EvidenceItem(
                id="e1", source="Local", source_tier=SourceTier.A,
                title="Doc", content="text", score=0.9,
            )
        ]
        qr = QueryResult(items=items, total_searched=3, query_text="hello", elapsed_ms=12.5)
        assert len(qr.items) == 1
        assert qr.total_searched == 3
        assert qr.elapsed_ms == 12.5


class TestIndexServiceInit:

    def test_creates_index_dir(self, tmp_path):
        idx_dir = tmp_path / "indexes"
        svc = IndexService(index_dir=str(idx_dir))
        assert idx_dir.exists()
        # Embedding model won't be available in test, so service is unavailable
        assert svc.available is False

    def test_unavailable_returns_empty_query(self, tmp_path):
        svc = IndexService(index_dir=str(tmp_path / "idx"))
        result = svc.query("anything")
        assert isinstance(result, QueryResult)
        assert result.items == []
        assert result.total_searched == 0

    def test_unavailable_returns_empty_index_documents(self, tmp_path):
        svc = IndexService(index_dir=str(tmp_path / "idx"))
        result = svc.index_documents(["/fake/file.pdf"])
        assert result == []


class TestIndexServiceHelpers:

    def test_compute_file_hash(self, tmp_path):
        f = tmp_path / "test.txt"
        f.write_text("hello world")
        h = IndexService._compute_file_hash(str(f))
        expected = hashlib.sha256(b"hello world").hexdigest()
        assert h == expected

    def test_make_chunk_id_deterministic(self):
        id1 = IndexService._make_chunk_id("doc1", 0)
        id2 = IndexService._make_chunk_id("doc1", 0)
        assert id1 == id2
        assert len(id1) == 16

    def test_make_chunk_id_varies_with_index(self):
        id1 = IndexService._make_chunk_id("doc1", 0)
        id2 = IndexService._make_chunk_id("doc1", 1)
        assert id1 != id2


class TestIndexServiceMaintenance:

    def test_list_indexed_empty(self, tmp_path):
        svc = IndexService(index_dir=str(tmp_path / "idx"))
        assert svc.list_indexed_documents() == []

    def test_remove_nonexistent(self, tmp_path):
        svc = IndexService(index_dir=str(tmp_path / "idx"))
        assert svc.remove_index("nonexistent") is False

    def test_remove_existing(self, tmp_path):
        idx_dir = tmp_path / "idx"
        svc = IndexService(index_dir=str(idx_dir))
        # Create a fake index dir
        fake_dir = idx_dir / "fakehash"
        fake_dir.mkdir()
        (fake_dir / "index.faiss").write_bytes(b"fake")
        (fake_dir / "chunks.json").write_text("[]")
        assert svc.remove_index("fakehash") is True
        assert not fake_dir.exists()

    def test_cache_invalidated_on_remove(self, tmp_path):
        svc = IndexService(index_dir=str(tmp_path / "idx"))
        svc._index_cache["test_id"] = "some_index"
        svc.remove_index("test_id")
        assert "test_id" not in svc._index_cache
