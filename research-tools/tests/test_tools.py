from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path

from paper_fucker_tools.external_tools import discover_external_tools, save_tool_link
from paper_fucker_tools.mcp_tools import call_tool


class ToolDiscoveryTest(unittest.TestCase):
    def test_config_link_has_priority(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            fake = root / ("pandoc.exe" if os.name == "nt" else "pandoc")
            fake.write_text("", encoding="utf-8")
            config = root / "tools.json"
            save_tool_link("pandoc", str(fake), config)

            report = discover_external_tools(config)
            self.assertEqual(report.tools["pandoc"].status, "available")
            self.assertEqual(report.tools["pandoc"].source, "config")
            self.assertEqual(Path(report.tools["pandoc"].path or ""), fake)


class StructuredToolTest(unittest.TestCase):
    def test_dataset_metadata_probe_csv(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            dataset = Path(tmp) / "data.csv"
            dataset.write_text("epoch,loss\n1,0.5\n2,0.25\n", encoding="utf-8")

            result = call_tool("dataset_metadata_probe", {"path": str(dataset)})
            self.assertEqual(result.status, "succeeded")
            self.assertEqual(result.metadata["columns"], ["epoch", "loss"])
            self.assertEqual(result.metadata["rows"], 2)

    def test_experiment_log_parse(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "train.log"
            log.write_text("step=1 loss=0.91 acc: 0.62\nstep=2 loss=0.51 accuracy=0.77\n", encoding="utf-8")

            result = call_tool("experiment_log_parse", {"path": str(log)})
            self.assertEqual(result.status, "succeeded")
            self.assertEqual(result.metadata["metric_count"], 4)

    def test_cli_style_mcp_call_result_is_json_serializable(self) -> None:
        result = call_tool("tool_diagnostics", {})
        encoded = json.dumps(result.model_dump(), ensure_ascii=False)
        self.assertIn("tool_diagnostics", encoded)


if __name__ == "__main__":
    unittest.main()
