from __future__ import annotations

import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from paper_fucker_tools.external_tools import discover_external_tools, save_tool_link
from paper_fucker_tools.mcp_tools import TOOL_REGISTRY, call_tool
from paper_fucker_tools.models import ToolResult


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

    def test_docx_generation_uses_canonical_tool_name(self) -> None:
        self.assertIn("docx_generation", TOOL_REGISTRY)
        legacy_name = "docx_generation" + "_stub"
        self.assertNotIn(legacy_name, TOOL_REGISTRY)

        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "draft.docx"
            result = call_tool(
                "docx_generation",
                {
                    "output_path": str(output),
                    "title": "paper_fucker draft",
                    "paragraphs": ["Claim-ledger backed draft paragraph."],
                },
            )
            self.assertEqual(result.status, "succeeded")
            self.assertEqual(result.tool_name, "docx_generation")
            self.assertTrue(output.exists())


class MCPServerAdapterTest(unittest.TestCase):
    def test_mcp_server_registers_each_tool_with_its_own_handler(self) -> None:
        import paper_fucker_tools.mcp_server as mcp_server

        class FakeFastMCP:
            def __init__(self, name: str) -> None:
                self.name = name
                self.registered = {}

            def tool(self, *, name: str):
                def decorator(func):
                    self.registered[name] = func
                    return func

                return decorator

        fake_fastmcp_module = types.ModuleType("mcp.server.fastmcp")
        fake_fastmcp_module.FastMCP = FakeFastMCP
        fake_server_module = types.ModuleType("mcp.server")
        fake_mcp_module = types.ModuleType("mcp")

        original_modules = {
            key: sys.modules.get(key)
            for key in ("mcp", "mcp.server", "mcp.server.fastmcp")
        }
        original_registry = mcp_server.TOOL_REGISTRY

        def first_handler(input_data):
            return ToolResult.ok("first_tool", metadata={"value": input_data.get("value")})

        def second_handler(input_data):
            return ToolResult.ok("second_tool", metadata={"value": input_data.get("value")})

        try:
            sys.modules["mcp"] = fake_mcp_module
            sys.modules["mcp.server"] = fake_server_module
            sys.modules["mcp.server.fastmcp"] = fake_fastmcp_module
            mcp_server.TOOL_REGISTRY = {
                "first_tool": first_handler,
                "second_tool": second_handler,
            }

            server = mcp_server.create_server()

            self.assertEqual(sorted(server.registered), ["first_tool", "second_tool"])
            self.assertEqual(server.registered["first_tool"]({"value": 1})["tool_name"], "first_tool")
            self.assertEqual(server.registered["second_tool"]({"value": 2})["tool_name"], "second_tool")
            self.assertEqual(server.registered["first_tool"]({"value": 3})["metadata"]["value"], 3)
        finally:
            mcp_server.TOOL_REGISTRY = original_registry
            for key, module in original_modules.items():
                if module is None:
                    sys.modules.pop(key, None)
                else:
                    sys.modules[key] = module


if __name__ == "__main__":
    unittest.main()
