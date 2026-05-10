from __future__ import annotations

import unittest

from paper_fucker_tools.crawler import crawl_html_fixture, crawl_url, parse_html, scrapling_status
from paper_fucker_tools.mcp_tools import TOOL_REGISTRY, call_tool


class CrawlerToolTest(unittest.TestCase):
    def test_parse_html_extracts_title_and_visible_text(self) -> None:
        parsed = parse_html(
            "<html><head><title>Example Dataset</title><script>hidden()</script></head>"
            "<body><h1>Visible</h1><p>Metric accuracy=0.91</p></body></html>"
        )

        self.assertEqual(parsed["title"], "Example Dataset")
        self.assertIn("Visible", parsed["text"])
        self.assertNotIn("hidden", parsed["text"])

    def test_fixture_crawl_returns_auditable_source_record(self) -> None:
        record = crawl_html_fixture(
            url="https://example.test/data",
            html="<html><title>Data</title><body>sample table</body></html>",
            license_status="compatible",
        )

        self.assertEqual(record["schema_version"], "CrawlSourceRecord.v1")
        self.assertEqual(record["status"], "fetched")
        self.assertEqual(record["license_status"], "compatible")
        self.assertEqual(len(record["content_sha256"]), 64)
        self.assertIn("sample table", record["text_excerpt"])

    def test_live_crawl_is_blocked_without_fixture_or_authorization(self) -> None:
        record = crawl_url({"url": "https://example.test/live"})

        self.assertEqual(record["schema_version"], "CrawlSourceRecord.v1")
        self.assertEqual(record["status"], "blocked")
        self.assertTrue(record["diagnostics"])

    def test_mcp_web_crawl_probe_uses_fixture_path(self) -> None:
        self.assertIn("web_crawl_probe", TOOL_REGISTRY)
        result = call_tool(
            "web_crawl_probe",
            {
                "url": "https://example.test/data",
                "html": "<html><title>Data</title><body>sample table</body></html>",
                "license_status": "compatible",
            },
        )

        self.assertEqual(result.status, "succeeded")
        self.assertEqual(result.metadata["record"]["status"], "fetched")
        self.assertIn("scrapling", result.metadata)

    def test_scrapling_status_is_structured(self) -> None:
        status = scrapling_status()

        self.assertEqual(status["adapter"], "scrapling")
        self.assertIn("available", status)


if __name__ == "__main__":
    unittest.main()
