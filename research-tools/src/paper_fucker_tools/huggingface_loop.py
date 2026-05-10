"""Hugging Face research loop bridge.

This module keeps fixture records available only when tests or callers pass an
explicit ``fixture`` payload. Product calls never synthesize Hugging Face records
when live access is not authorized; they return a blocked diagnostic instead.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


HF_API_ROOT = "https://huggingface.co/api"


def _fixture_record(kind: str, query: str) -> dict[str, Any]:
    if kind == "papers":
        return {
            "schema_version": "HFPaperRecord.v1",
            "paper_id": f"paper-fixture:{query}",
            "title": f"HF paper fixture for {query}",
            "url": f"https://huggingface.co/papers?q={urllib.parse.quote(query)}",
            "summary": "Fixture paper metadata for offline research-loop validation.",
            "authors": ["paper_fucker fixture"],
            "source_verified": True,
            "trust": "local_fixture",
        }
    if kind == "datasets":
        return {
            "schema_version": "HFDatasetRecord.v1",
            "dataset_id": f"dataset-fixture/{query.replace(' ', '-')}",
            "title": f"HF dataset fixture for {query}",
            "url": f"https://huggingface.co/datasets/dataset-fixture/{urllib.parse.quote(query.replace(' ', '-'))}",
            "license": "apache-2.0",
            "version": "fixture",
            "splits": ["train", "validation"],
            "task_categories": ["text-classification"],
            "source_verified": True,
            "trust": "local_fixture",
        }
    if kind == "models":
        return {
            "schema_version": "HFModelRecord.v1",
            "model_id": f"model-fixture/{query.replace(' ', '-')}",
            "title": f"HF model fixture for {query}",
            "url": f"https://huggingface.co/model-fixture/{urllib.parse.quote(query.replace(' ', '-'))}",
            "pipeline_tag": "text-generation",
            "license": "apache-2.0",
            "source_verified": True,
            "trust": "local_fixture",
        }
    if kind == "spaces":
        return {
            "schema_version": "HFSpaceRecord.v1",
            "space_id": f"space-fixture/{query.replace(' ', '-')}",
            "title": f"HF Space fixture for {query}",
            "url": f"https://huggingface.co/spaces/space-fixture/{urllib.parse.quote(query.replace(' ', '-'))}",
            "sdk": "gradio",
            "source_verified": True,
            "trust": "local_fixture",
        }
    if kind == "jobs":
        return {
            "schema_version": "HFJobRecord.v1",
            "job_id": f"job-fixture-{query.replace(' ', '-')}",
            "title": f"HF job fixture for {query}",
            "status": "approval_required",
            "command": ["python", "train.py", "--fixture", query],
            "metrics": [{"name": "accuracy", "value": 0.88, "direction": "higher_better"}],
            "cost_usd": 0.0,
            "source_verified": True,
            "trust": "local_fixture",
        }
    return {
        "schema_version": "HFTrackioRecord.v1",
        "run_id": f"trackio-fixture-{query.replace(' ', '-')}",
        "title": f"HF Trackio fixture for {query}",
        "metrics": [{"name": "loss", "value": 0.42, "step": 1}],
        "source_verified": True,
        "trust": "local_fixture",
    }


def _hf_get(path: str, params: dict[str, Any] | None = None, token: str | None = None) -> Any:
    query = urllib.parse.urlencode(params or {})
    url = f"{HF_API_ROOT}{path}"
    if query:
        url = f"{url}?{query}"
    request = urllib.request.Request(url)
    request.add_header("Accept", "application/json")
    if token:
        request.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(request, timeout=20) as response:  # nosec B310 - opt-in user-authorized URL
        return json.loads(response.read().decode("utf-8"))


def _author_names(item: dict[str, Any]) -> list[str]:
    authors = item.get("authors", [])
    names: list[str] = []
    if isinstance(authors, list):
        for author in authors:
            if isinstance(author, str):
                names.append(author)
            elif isinstance(author, dict):
                user = author.get("user")
                if isinstance(user, dict) and isinstance(user.get("fullname"), str):
                    names.append(user["fullname"])
                elif isinstance(author.get("name"), str):
                    names.append(author["name"])
    return names


def _paper_record(item: dict[str, Any]) -> dict[str, Any]:
    paper = item.get("paper") if isinstance(item.get("paper"), dict) else item
    paper_id = str(paper.get("id") or paper.get("paper_id") or "unknown")
    return {
        "schema_version": "HFPaperRecord.v1",
        "paper_id": paper_id,
        "title": paper.get("title") or paper_id,
        "url": paper.get("url") or f"https://huggingface.co/papers/{urllib.parse.quote(paper_id)}",
        "summary": paper.get("summary") or paper.get("abstract"),
        "authors": _author_names(paper),
        "source_verified": True,
        "trust": "hf_official",
    }


def _job_record(item: dict[str, Any]) -> dict[str, Any]:
    status = item.get("status")
    if isinstance(status, dict):
        status_text = str(status.get("stage") or status.get("message") or "unknown").lower()
    else:
        status_text = str(status or item.get("stage") or "unknown").lower()
    command = item.get("command", [])
    if isinstance(command, str):
        command = [command]
    if not isinstance(command, list):
        command = []
    return {
        "schema_version": "HFJobRecord.v1",
        "job_id": str(item.get("id") or item.get("job_id") or "unknown"),
        "title": item.get("label") or item.get("title") or item.get("id") or "Hugging Face Job",
        "status": status_text,
        "command": [str(part) for part in command],
        "metrics": item.get("metrics", []) if isinstance(item.get("metrics"), list) else [],
        "logs_uri": item.get("url"),
        "cost_usd": item.get("cost_usd"),
        "source_verified": True,
        "trust": "hf_official",
    }


def _trackio_record(input_data: dict[str, Any], query: str) -> dict[str, Any] | None:
    export = input_data.get("trackio_export")
    if not isinstance(export, dict):
        return None
    metrics = export.get("metrics", [])
    if not isinstance(metrics, list):
        metrics = []
    return {
        "schema_version": "HFTrackioRecord.v1",
        "run_id": str(export.get("run_id") or f"trackio-export-{query.replace(' ', '-')}"),
        "title": str(export.get("title") or f"Trackio export for {query}"),
        "metrics": [item for item in metrics if isinstance(item, dict)],
        "source_verified": True,
        "trust": "user_provided_trackio_export",
    }


def _live_records(kind: str, query: str, limit: int, token: str | None = None) -> list[dict[str, Any]]:
    if kind == "papers":
        data = _hf_get("/papers/search", {"q": query}, token)
        if not isinstance(data, list) or len(data) == 0:
            data = _hf_get("/papers", {"search": query}, token)
        return [_paper_record(item) for item in data[:limit] if isinstance(item, dict)]
    if kind == "datasets":
        data = _hf_get("/datasets", {"search": query, "limit": limit}, token)
        return [
            {
                "schema_version": "HFDatasetRecord.v1",
                "dataset_id": item.get("id") or item.get("name") or "unknown",
                "title": item.get("id") or item.get("name") or "unknown",
                "url": f"https://huggingface.co/datasets/{item.get('id') or item.get('name') or ''}",
                "license": item.get("license"),
                "version": item.get("sha"),
                "splits": [],
                "task_categories": item.get("tags", [])[:8] if isinstance(item.get("tags"), list) else [],
                "source_verified": True,
                "trust": "hf_official",
            }
            for item in data[:limit]
        ]
    if kind == "jobs":
        if not token:
            raise PermissionError("hf_token_required_for_jobs")
        data = _hf_get("/jobs", {"limit": limit}, token)
        if isinstance(data, dict):
            data = data.get("jobs", [])
        return [_job_record(item) for item in data[:limit] if isinstance(item, dict)]
    if kind == "models":
        data = _hf_get("/models", {"search": query, "limit": limit}, token)
        return [
            {
                "schema_version": "HFModelRecord.v1",
                "model_id": item.get("id") or "unknown",
                "title": item.get("id") or "unknown",
                "url": f"https://huggingface.co/{item.get('id') or ''}",
                "pipeline_tag": item.get("pipeline_tag"),
                "license": item.get("license"),
                "source_verified": True,
                "trust": "hf_official",
            }
            for item in data[:limit]
        ]
    if kind == "spaces":
        data = _hf_get("/spaces", {"search": query, "limit": limit}, token)
        return [
            {
                "schema_version": "HFSpaceRecord.v1",
                "space_id": item.get("id") or "unknown",
                "title": item.get("id") or "unknown",
                "url": f"https://huggingface.co/spaces/{item.get('id') or ''}",
                "sdk": item.get("sdk"),
                "source_verified": True,
                "trust": "hf_official",
            }
            for item in data[:limit]
        ]
    raise PermissionError(f"live_{kind}_source_required")


def hf_research_probe(input_data: dict[str, Any]) -> dict[str, Any]:
    kind = str(input_data.get("kind", "datasets"))
    query = str(input_data.get("query", input_data.get("topic", ""))).strip() or "paper_fucker"
    limit = int(input_data.get("limit", 3))
    fixture = input_data.get("fixture")
    if isinstance(fixture, dict):
        records = [fixture]
        mode = "fixture"
        diagnostics: list[str] = []
    elif isinstance(fixture, list):
        records = [item for item in fixture if isinstance(item, dict)]
        mode = "fixture"
        diagnostics = []
    elif kind == "trackio" and (record := _trackio_record(input_data, query)) is not None:
        records = [record]
        mode = "provided"
        diagnostics = []
    elif bool(input_data.get("allow_network", False)):
        try:
            records = _live_records(kind, query, limit, input_data.get("token"))
            mode = "live"
            diagnostics = []
        except PermissionError as error:
            records = []
            mode = "blocked"
            diagnostics = [str(error)]
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            records = []
            mode = "blocked"
            diagnostics = [f"hf_live_fetch_failed:{type(error).__name__}"]
    else:
        records = []
        mode = "blocked"
        diagnostics = ["network_not_authorized"]
    return {
        "schema_version": "HFResearchProbeResult.v1",
        "kind": kind,
        "query": query,
        "mode": mode,
        "records": records[:limit],
        "diagnostics": diagnostics,
    }
