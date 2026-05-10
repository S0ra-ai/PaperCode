from __future__ import annotations

import unittest

from paper_fucker_tools.huggingface_loop import hf_research_probe
from paper_fucker_tools.mcp_tools import TOOL_REGISTRY, call_tool


class HuggingFaceLoopToolTest(unittest.TestCase):
    def test_probe_blocks_when_network_is_not_authorized(self) -> None:
        result = hf_research_probe({"kind": "datasets", "query": "paper generation"})

        self.assertEqual(result["mode"], "blocked")
        self.assertEqual(result["records"], [])
        self.assertEqual(result["diagnostics"], ["network_not_authorized"])

    def test_fixture_records_are_explicit_test_inputs(self) -> None:
        fixture = {
            "schema_version": "HFDatasetRecord.v1",
            "dataset_id": "fixture/dataset",
            "title": "fixture dataset",
            "url": "https://huggingface.co/datasets/fixture/dataset",
            "license": "apache-2.0",
            "version": "fixture",
            "splits": ["train"],
            "task_categories": ["text-generation"],
            "source_verified": True,
            "trust": "local_fixture",
        }

        result = hf_research_probe({"kind": "datasets", "query": "paper generation", "fixture": fixture})

        self.assertEqual(result["mode"], "fixture")
        self.assertEqual(result["records"], [fixture])
        self.assertEqual(result["diagnostics"], [])

    def test_mcp_probe_fails_when_product_call_would_mock(self) -> None:
        self.assertIn("hf_research_probe", TOOL_REGISTRY)

        result = call_tool("hf_research_probe", {"kind": "datasets", "query": "paper generation"})

        self.assertEqual(result.status, "failed")
        self.assertEqual(result.metadata["mode"], "blocked")
        self.assertIn("network_not_authorized", result.error or "")

    def test_mcp_probe_succeeds_with_explicit_fixture(self) -> None:
        result = call_tool(
            "hf_research_probe",
            {
                "kind": "papers",
                "query": "paper generation",
                "fixture": {
                    "schema_version": "HFPaperRecord.v1",
                    "paper_id": "fixture-paper",
                    "title": "fixture paper",
                    "url": "https://huggingface.co/papers/fixture-paper",
                    "authors": ["paper_fucker fixture"],
                    "source_verified": True,
                    "trust": "local_fixture",
                },
            },
        )

        self.assertEqual(result.status, "succeeded")
        self.assertEqual(result.metadata["mode"], "fixture")


if __name__ == "__main__":
    unittest.main()
