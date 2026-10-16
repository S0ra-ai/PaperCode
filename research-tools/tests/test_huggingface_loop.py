from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from papercode_tools import huggingface_loop
from papercode_tools.huggingface_loop import hf_research_probe
from papercode_tools.mcp_tools import TOOL_REGISTRY, call_tool


class HuggingFaceLoopToolTest(unittest.TestCase):
    def test_probe_blocks_when_network_is_not_authorized(self) -> None:
        result = hf_research_probe({"kind": "datasets", "query": "paper generation"})

        self.assertEqual(result["mode"], "blocked")
        self.assertEqual(result["records"], [])
        self.assertEqual(result["diagnostics"], ["network_not_authorized"])

    def test_records_require_explicit_test_mode(self) -> None:
        test_record = {
            "schema_version": "HFDatasetRecord.v1",
            "dataset_id": "test/dataset",
            "title": "test dataset",
            "url": "https://huggingface.co/datasets/test/dataset",
            "license": "apache-2.0",
            "version": "test",
            "splits": ["train"],
            "task_categories": ["text-generation"],
            "source_verified": True,
            "trust": "test_record",
        }

        blocked = hf_research_probe({"kind": "datasets", "query": "paper generation", "test_records": test_record})
        result = hf_research_probe(
            {
                "kind": "datasets",
                "query": "paper generation",
                "test_records": test_record,
                "allow_test_records": True,
            }
        )

        self.assertEqual(blocked["mode"], "blocked")
        self.assertEqual(blocked["diagnostics"], ["test_records_require_allow_test_records"])
        self.assertEqual(result["mode"], "test_records")
        self.assertEqual(result["records"], [test_record])
        self.assertEqual(result["diagnostics"], [])

    def test_live_paper_records_use_huggingface_api_data(self) -> None:
        with patch.object(
            huggingface_loop,
            "_hf_get",
            return_value=[
                {
                    "paper": {
                        "id": "2309.16588",
                        "title": "A Paper",
                        "summary": "official paper metadata",
                        "authors": [{"name": "Researcher"}],
                    }
                }
            ],
        ):
            result = huggingface_loop.hf_research_probe({"kind": "papers", "query": "paper generation", "allow_network": True})

        self.assertEqual(result["mode"], "live")
        self.assertEqual(result["records"][0]["schema_version"], "HFPaperRecord.v1")
        self.assertEqual(result["records"][0]["trust"], "hf_official")

    def test_jobs_require_token_for_live_product_access(self) -> None:
        result = hf_research_probe({"kind": "jobs", "query": "paper generation", "allow_network": True})

        self.assertEqual(result["mode"], "blocked")
        self.assertEqual(result["records"], [])
        self.assertEqual(result["diagnostics"], ["hf_token_required_for_jobs"])

    def test_trackio_accepts_explicit_export_without_fixture_mode(self) -> None:
        result = hf_research_probe(
            {
                "kind": "trackio",
                "query": "paper generation",
                "trackio_export": {
                    "run_id": "trackio-live-export",
                    "title": "Trackio exported metrics",
                    "metrics": [{"name": "accuracy", "value": 0.91, "step": 1}],
                },
            }
        )

        self.assertEqual(result["mode"], "provided")
        self.assertEqual(result["records"][0]["schema_version"], "HFTrackioRecord.v1")
        self.assertEqual(result["records"][0]["trust"], "user_provided_trackio_export")

    def test_mcp_probe_fails_when_product_call_would_mock(self) -> None:
        self.assertIn("hf_research_probe", TOOL_REGISTRY)

        result = call_tool("hf_research_probe", {"kind": "datasets", "query": "paper generation"})

        self.assertEqual(result.status, "failed")
        self.assertEqual(result.metadata["mode"], "blocked")
        self.assertIn("network_not_authorized", result.error or "")

    def test_mcp_probe_succeeds_with_explicit_test_records(self) -> None:
        result = call_tool(
            "hf_research_probe",
            {
                "kind": "papers",
                "query": "paper generation",
                "test_records": {
                    "schema_version": "HFPaperRecord.v1",
                    "paper_id": "test-paper",
                    "title": "test paper",
                    "url": "https://huggingface.co/papers/test-paper",
                    "authors": ["papercode test"],
                    "source_verified": True,
                    "trust": "test_record",
                },
                "allow_test_records": True,
            },
        )

        self.assertEqual(result.status, "succeeded")
        self.assertEqual(result.metadata["mode"], "test_records")


if __name__ == "__main__":
    unittest.main()
