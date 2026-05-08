from pathlib import Path

import pytest

from intelligen_engine.paper import (
    FormatIntent,
    FormatSpec,
    PaperRunRequest,
    PaperDraft,
    PaperSection,
    apply_intervention,
    assess_novelty,
    audit_format,
    audit_citations,
    audit_figures_tables,
    audit_metadata_consistency,
    audit_question_quality,
    browse_code,
    classify_paper_type,
    generate_paper,
    ingest_materials,
    initial_stage_events,
    plan_experiment,
    plan_experiment_adjustment,
    plan_intervention,
    plan_questions,
    plan_research,
    prefill_metadata,
    repair_format,
    resolve_format,
    route_input,
    suggest_code_directions,
)
from intelligen_engine.api.routes import (
    PaperCitationAuditRequest,
    PaperFormatResolveRequest,
    PaperInterventionPlanRequest,
    audit_paper_citations,
    paper_stage_contract,
    plan_paper_intervention,
    resolve_paper_format,
)
from intelligen_engine.tasks.task_manager import TaskManager, _paper_result_markdown


def test_explicit_ieee_overrides_conflicting_sample_spec() -> None:
    sample = FormatSpec(
        venue_label="Custom",
        display_name="Custom PDF",
        columns=1,
        bibliography_style="gbt7714-numerical",
        template_hint="_generic.tex.j2",
    )

    decision = resolve_format(FormatIntent(venue_label="IEEE"), sample_spec=sample)

    assert decision.spec.venue_label == "IEEE"
    assert decision.spec.template_hint == "ieee.tex.j2"
    assert decision.spec.columns == 2
    assert decision.has_conflict


def test_stage_contract_contains_first_paper_workflow() -> None:
    stages = [event.stage.value for event in initial_stage_events()]

    assert stages[:4] == [
        "intent_parse",
        "clarify",
        "format_resolve",
        "literature_search",
    ]
    assert "experiment" in stages
    assert "figure_table_audit" in stages


@pytest.mark.asyncio
async def test_stage_contract_api_shape() -> None:
    response = await paper_stage_contract()

    assert response.stages[0]["stage"] == "intent_parse"
    assert response.stages[0]["status"] == "pending"


@pytest.mark.asyncio
async def test_format_resolve_api_reports_confirmation_for_conflict() -> None:
    response = await resolve_paper_format(
        PaperFormatResolveRequest(
            venue_label="IEEE",
            venue_variant="conference",
            conflict_policy="ask",
            sample_spec={
                "venue_label": "Custom",
                "display_name": "Uploaded sample",
                "columns": 1,
                "template_hint": "_generic.tex.j2",
            },
        )
    )

    assert response.spec["venue_label"] == "IEEE"
    assert response.requires_confirmation
    assert response.conflicts


def test_sample_spec_is_used_when_no_explicit_venue() -> None:
    sample = FormatSpec(
        venue_label="Custom",
        display_name="Custom PDF",
        columns=1,
        bibliography_style="gbt7714-numerical",
        template_hint="_generic.tex.j2",
    )

    decision = resolve_format(FormatIntent(), sample_spec=sample)

    assert decision.spec.venue_label == "Custom"
    assert decision.source == "sample_spec"


def test_ieee_audit_rejects_article_template() -> None:
    spec = resolve_format(FormatIntent(venue_label="IEEE")).spec

    audit = audit_format(
        "\\documentclass{article}\n\\tableofcontents\n\\begin{document}",
        spec,
    )

    assert not audit.passed
    assert any("article" in failure for failure in audit.failures)


def test_repair_loop_fixes_basic_ieee_format_failures() -> None:
    spec = resolve_format(FormatIntent(venue_label="IEEE")).spec
    tex = (
        "\\documentclass{article}\n"
        "\\begin{document}\n"
        "\\begin{abstract}x\\end{abstract}\n"
        "\\tableofcontents\n"
        "\\bibliographystyle{plain}\n"
        "\\bibliography{references}\n"
        "\\end{document}"
    )
    audit = audit_format(tex, spec)
    repaired = repair_format(tex, spec, audit)

    assert repaired.attempted
    assert repaired.passed
    assert "IEEEtran" in repaired.repaired_tex
    assert "\\tableofcontents" not in repaired.repaired_tex
    assert "\\begin{IEEEkeywords}" in repaired.repaired_tex
    assert "\\bibliographystyle{IEEEtran}" in repaired.repaired_tex


def test_research_context_routes_three_entry_points() -> None:
    topic = route_input("agent paper")
    material = route_input("", uploaded_files=["reference.pdf"])
    code = route_input("study this project", uploaded_files=["repo.zip"])

    assert topic.input_kind == "topic"
    assert material.input_kind == "material"
    assert code.input_kind == "code"
    assert plan_research(code)["next_stage"] == "literature_search"


def test_dynamic_question_plan_and_metadata_prefill() -> None:
    context = route_input("Authors: Ada, Grace\nInstitution: Example University")
    question_plan = plan_questions(context, control_mode="batch_autopilot")
    metadata = prefill_metadata("作者: Ada, Grace\n院校: Example University")

    assert question_plan["batch_recommended"]
    assert any(q["id"] == "paper_type" for q in question_plan["questions"])
    assert metadata["authors"] == ["Ada", "Grace"]
    assert metadata["institutions"] == ["Example University"]


def test_code_direction_suggestions_include_detected_language() -> None:
    directions = suggest_code_directions(["main.py", "ui.ts"])

    assert len(directions) == 3
    assert "Python" in directions[0]["description"]
    assert "TypeScript" in directions[0]["description"]


def test_research_planning_contracts_are_fail_safe() -> None:
    context = route_input("benchmark a code project", code_files=["main.py", "index.ts"])
    material = ingest_materials(["guide.tex", "data.csv", "paper.pdf"])
    code_summary = browse_code(["main.py", "index.ts"])
    paper_type = classify_paper_type(context, "benchmark")
    novelty = assess_novelty(context)
    experiment = plan_experiment(context)
    adjustment = plan_experiment_adjustment("result below baseline")

    assert [item["role"] for item in material["materials"]] == [
        "format_requirement",
        "data_source",
        "document",
    ]
    assert "Python" in code_summary["languages"]
    assert paper_type["paper_type"] == "experimental_evaluation"
    assert novelty["status"] == "requires_literature_search"
    assert experiment["execution_status"] == "planned_not_run"
    assert adjustment["decision_required"]


def test_quality_audits_for_questions_metadata_and_figures() -> None:
    context = route_input("topic")
    question_audit = audit_question_quality(plan_questions(context))
    metadata_audit = audit_metadata_consistency({"authors": ["Ada"], "institutions": []})
    figure_audit = audit_figures_tables([{"caption": "Accuracy", "source": "run-1"}, {"caption": ""}])

    assert question_audit["passed"]
    assert not metadata_audit["passed"]
    assert metadata_audit["missing"] == ["institutions"]
    assert not figure_audit["passed"]


def test_citation_audit_requires_source_or_override() -> None:
    failed = audit_citations("@article{no_source,\n  title = {Missing Source}\n}")
    overridden = audit_citations(
        "@article{no_source,\n  title = {Missing Source}\n}",
        manual_overrides=["no_source"],
    )

    assert not failed.passed
    assert failed.failures == ["no_source: missing DOI or URL"]
    assert overridden.passed
    assert overridden.manual_overrides == ["no_source"]


@pytest.mark.asyncio
async def test_citation_audit_api_accepts_manual_override() -> None:
    response = await audit_paper_citations(
        PaperCitationAuditRequest(
            bibtex="@article{manual_ok,\n  title = {Manual Source}\n}",
            manual_overrides=["manual_ok"],
        )
    )

    assert response.passed
    assert response.manual_overrides == ["manual_ok"]


def test_intervention_plan_scopes_changed_content() -> None:
    plan = plan_intervention("请重写实验部分并检查引用")

    assert "experiment" in plan.target_sections
    assert "references" in plan.target_sections
    assert "citation_verify" in plan.required_audits
    assert "figure_table_audit" in plan.required_audits


def test_intervention_apply_updates_only_scoped_sections() -> None:
    draft = PaperDraft(
        title="Intervention",
        abstract="abstract",
        keywords=["agent"],
        sections=[
            PaperSection("Method", ["method body"]),
            PaperSection("Evaluation Plan", ["evaluation body"]),
        ],
    )

    updated, plan = apply_intervention(draft, "请重写实验部分")

    assert plan.target_sections == ["experiment"]
    assert updated.sections[0].paragraphs == ["method body"]
    assert updated.sections[1].paragraphs[-1] == "Intervention note: 请重写实验部分"


def test_content_rubric_tracks_word_progress(tmp_path: Path) -> None:
    result = generate_paper(
        PaperRunRequest(
            topic="Rubric Test",
            output_dir=tmp_path,
            target_word_count=1000,
        )
    )

    assert result.content_rubric.passed
    assert result.content_rubric.target_words == 1000
    assert result.content_rubric.completion_pct is not None
    assert result.content_rubric.section_progress


@pytest.mark.asyncio
async def test_intervention_plan_api_shape() -> None:
    response = await plan_paper_intervention(
        PaperInterventionPlanRequest(message="IEEE 格式不对，帮我修复")
    )

    assert response.target_sections == ["format"]
    assert response.required_audits == ["format_audit"]


def test_direct_runner_writes_ieee_tex_and_audit(tmp_path: Path) -> None:
    result = generate_paper(
        PaperRunRequest(
            topic="A Short Note on Agentic Paper Generation",
            output_dir=tmp_path,
            venue_label="IEEE",
            authors=["Test Author"],
        )
    )

    tex = result.tex_path.read_text(encoding="utf-8")
    audit = result.audit_path.read_text(encoding="utf-8")

    assert result.audit.passed
    assert result.citation_audit.passed
    assert result.content_rubric.passed
    assert result.repair.passed
    assert result.pdf_compiled
    assert result.source_bundle_path.is_file()
    assert "\\documentclass[10pt,letterpaper,conference]{IEEEtran}" in tex
    assert "\\begin{IEEEkeywords}" in tex
    assert "\\tableofcontents" not in tex
    assert '"passed": true' in audit


def test_paper_result_markdown_lists_artifacts() -> None:
    markdown = _paper_result_markdown(
        topic="Agentic Paper Generation",
        venue="IEEE",
        artifact_paths={
            "tex_path": "run/paper.tex",
            "bib_path": "run/references.bib",
            "docx_path": "run/paper.docx",
            "pdf_path": "run/paper.pdf",
            "audit_path": "run/audit.json",
            "source_bundle_path": "run/source_bundle.zip",
        },
    )

    assert "# Agentic Paper Generation" in markdown
    assert "Venue: IEEE" in markdown
    assert "`run/paper.tex`" in markdown
    assert "`run/paper.docx`" in markdown
    assert "`run/paper.pdf`" in markdown
    assert "`run/source_bundle.zip`" in markdown
    assert "does not invent experimental results" in markdown


@pytest.mark.asyncio
async def test_task_manager_paper_generation_writes_artifacts(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    events: list[tuple[str, dict]] = []

    async def fake_update_task_status(*args, **kwargs):
        return None

    async def fake_publish_progress(task_id: str, event: dict):
        events.append((task_id, event))

    monkeypatch.setattr(
        "intelligen_engine.tasks.task_manager.update_task_status",
        fake_update_task_status,
    )
    monkeypatch.setattr(
        "intelligen_engine.tasks.task_manager.publish_progress",
        fake_publish_progress,
    )
    monkeypatch.setattr(
        "intelligen_engine.tasks.task_manager.settings.FILE_STORAGE_PATH",
        str(tmp_path),
    )

    manager = TaskManager()
    markdown, artifacts = await manager._run_paper_generation(
        task_id="paper-task-1",
        topic="Agentic Paper Generation",
        task_data={
            "venue_label": "IEEE",
            "venue_variant": "conference",
            "authors": ["Ada Lovelace"],
        },
        cancel_event=__import__("asyncio").Event(),
    )

    assert "Format audit: passed" in markdown
    assert Path(artifacts["tex_path"]).is_file()
    assert Path(artifacts["bib_path"]).is_file()
    assert Path(artifacts["docx_path"]).is_file()
    assert Path(artifacts["pdf_path"]).is_file()
    assert Path(artifacts["audit_path"]).is_file()
    assert Path(artifacts["source_bundle_path"]).is_file()
    assert any(event["stage"] == "format_resolve" for _, event in events)
    assert any(event["stage"] == "export" for _, event in events)


@pytest.mark.asyncio
async def test_ieee_e2e_generates_downloadable_artifacts(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_update_task_status(*args, **kwargs):
        return None

    async def fake_publish_progress(*args, **kwargs):
        return None

    monkeypatch.setattr(
        "intelligen_engine.tasks.task_manager.update_task_status",
        fake_update_task_status,
    )
    monkeypatch.setattr(
        "intelligen_engine.tasks.task_manager.publish_progress",
        fake_publish_progress,
    )
    monkeypatch.setattr(
        "intelligen_engine.tasks.task_manager.settings.FILE_STORAGE_PATH",
        str(tmp_path),
    )

    markdown, artifacts = await TaskManager()._run_paper_generation(
        task_id="ieee-e2e",
        topic="Strict IEEE Artifact E2E",
        task_data={
            "generation_mode": "paper_format_to_paper",
            "venue_label": "IEEE",
            "venue_variant": "conference",
            "authors": ["Grace Hopper"],
            "target_word_count": 1000,
        },
        cancel_event=__import__("asyncio").Event(),
    )

    tex = Path(artifacts["tex_path"]).read_text(encoding="utf-8")
    audit = Path(artifacts["audit_path"]).read_text(encoding="utf-8")
    assert "\\documentclass[10pt,letterpaper,conference]{IEEEtran}" in tex
    assert "\\begin{IEEEkeywords}" in tex
    assert Path(artifacts["pdf_path"]).read_bytes().startswith(b"%PDF")
    assert Path(artifacts["docx_path"]).read_bytes().startswith(b"PK")
    assert Path(artifacts["source_bundle_path"]).is_file()
    assert '"content_rubric"' in audit
    assert "Strict IEEE Artifact E2E" in markdown
