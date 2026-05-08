"""
Unified Report Pipeline — Plan → Retrieve → Write → Normalize.
Migrated from model_strategy/app/services/report_pipeline.py
"""
import logging
import re
import time
import json
from typing import Callable, Dict, List, Optional, Set, Tuple
from datetime import datetime
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

from app.modules.generation.planning.outline_planner import OutlinePlanner
from app.modules.generation.planning.schemas import OutlineSection, ReportOutline
from app.modules.generation.regeneration.generation_bridge import build_error_payload, to_generation_error
from app.modules.generation.retrieval.citation_registry import CitationRegistry
from app.modules.generation.retrieval.citation_validator import CitationValidator
from app.modules.generation.retrieval.local_doc_service import LocalDocManager
from app.modules.generation.retrieval.reference_builder import ReferenceBuilder
from app.modules.generation.retrieval.search_service import UnifiedAcademicSearcher
from app.modules.generation.review.schemas import SectionReviewIssue, SectionRubricReview
from app.modules.generation.shared.llm_service import LLMService
from app.modules.generation.writing.context_manager import ContextManager
from app.modules.generation.writing.quality_checker import run_quality_checks
from app.modules.generation.writing.schemas import SectionGroundingPlan
from app.platform.config import settings


class ReportPipeline:
    """Unified report generation pipeline.

    Stages:
        1. plan()      — generate structured outline
        2. retrieve()   — search academic sources + local RAG
        3. write()      — generate sections with structured context management
        4. normalize()  — final formatting pass
    """

    def __init__(self):
        self.llm = LLMService()
        self.searcher = UnifiedAcademicSearcher()
        self.planner = OutlinePlanner(self.llm)
        self.search_limit = settings.SEARCH_LIMIT
        self.citation_validator = CitationValidator()
        self.reference_builder = ReferenceBuilder()

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------
    def generate(self, topic: str, *,
                 local_rag: Optional[LocalDocManager] = None,
                 index_service=None,
                 doc_ids: Optional[List[str]] = None,
                 template: str = "",
                 outline: str = "",
                 requirement: str = "",
                 citation_style: str = "gb",
                 progress_callback: Optional[Callable] = None,
                 checkpoint_callback: Optional[Callable] = None,
                 existing_checkpoints: Optional[List[Dict]] = None,
                 content_callback: Optional[Callable] = None,
                 target_word_count: Optional[int] = None) -> Dict:
        try:
            logging.info(f"🚀 ReportPipeline.generate: {topic}")

            # Fresh citation registry for this report
            registry = CitationRegistry()

            planning_evidence = ""
            planning_queries = None
            if not (template and template.strip()) and not (outline and outline.strip()):
                planning_evidence, planning_queries = self._build_planning_evidence(topic)

            # Stage 1: Plan
            report_outline = self.plan(
                topic, template, outline, requirement,
                evidence_summary=planning_evidence,
            )

            # Apply target_word_count: scale each section proportionally
            if target_word_count and target_word_count > 0:
                current_total = sum(s.target_words for s in report_outline.sections) or 1
                scale = target_word_count / current_total
                for s in report_outline.sections:
                    s.target_words = max(200, int(s.target_words * scale))
                logging.info(f"   Scaled section targets to total ≈{target_word_count} words (×{scale:.2f})")

            total_sections = len(report_outline.sections)
            if progress_callback:
                progress_callback(0, total_sections, stage="planning", stage_name="规划大纲")

            # Stage 2: Retrieve
            context_str, web_results = self.retrieve(
                topic, report_outline, local_rag, registry,
                queries=planning_queries,
                index_service=index_service,
                doc_ids=doc_ids,
            )
            if progress_callback:
                progress_callback(0, total_sections, stage="retrieving", stage_name="检索文献")

            # Stage 3: Write
            sections_content, token_totals = self.write(
                topic, report_outline, context_str, web_results,
                registry=registry,
                progress_callback=progress_callback,
                checkpoint_callback=checkpoint_callback,
                existing_checkpoints=existing_checkpoints,
                index_service=index_service,
                doc_ids=doc_ids,
                content_callback=content_callback,
            )

            # Stage 3.5: Quality checks (non-blocking)
            if progress_callback:
                progress_callback(total_sections, total_sections, stage="quality_check", stage_name="质量检查")
            sections_meta = [
                {"title": s.title, "target_words": s.target_words}
                for s in report_outline.sections
            ]
            quality_report = run_quality_checks(sections_content, sections_meta)

            # Stage 4: Normalize
            if progress_callback:
                progress_callback(total_sections, total_sections, stage="normalizing", stage_name="格式化")
            final_content = self.normalize(sections_content, report_outline, registry,
                                           citation_style=citation_style)

            filename = self._build_filename(topic)
            logging.info(f"✅ Report complete: {filename} ({len(final_content)} chars)")

            return {
                "status": "success",
                "filename": filename,
                "filepath": None,
                "content": final_content,
                "word_count": len(final_content),
                "prompt_tokens": token_totals["prompt"],
                "completion_tokens": token_totals["completion"],
                "total_tokens": token_totals["total"],
                "quality": {
                    "pass": quality_report.overall_pass,
                    "summary": quality_report.summary,
                    "duplicate_pairs": quality_report.duplicate_pairs,
                    "section_issues": [
                        {"title": s.title, "issues": s.issues}
                        for s in quality_report.sections if s.issues
                    ],
                },
            }

        except Exception as e:
            logging.error(f"❌ ReportPipeline failed: {e}", exc_info=True)
            return build_error_payload(e)

    # ------------------------------------------------------------------
    # Stage 1: Plan
    # ------------------------------------------------------------------
    def plan(self, topic: str, template: str = "", outline: str = "",
             requirement: str = "", evidence_summary: str = "") -> ReportOutline:
        logging.info("📋 [Stage 1/4] Planning outline...")
        result = self.planner.plan(
            topic, template, outline, requirement,
            evidence_summary=evidence_summary,
        )
        logging.info(f"   Outline: {len(result.sections)} sections — "
                     + ", ".join(s.title for s in result.sections))
        return result

    # ------------------------------------------------------------------
    # Stage 2: Retrieve
    # ------------------------------------------------------------------
    def retrieve(self, topic: str, outline: Optional[ReportOutline] = None,
                 local_rag: Optional[LocalDocManager] = None,
                 registry: Optional[CitationRegistry] = None,
                 queries: Optional[Dict[str, str]] = None,
                 index_service=None,
                 doc_ids: Optional[List[str]] = None):
        logging.info("🔍 [Stage 2/4] Retrieving sources...")
        queries = queries if isinstance(queries, dict) else self.llm.translate_to_keywords(topic)
        logging.info(f"   Search queries: {json.dumps(queries, ensure_ascii=False)}")

        # Check evidence cache for verified results (cross-task reuse)
        cache_hit = False
        web_results = []
        try:
            from app.modules.generation.retrieval.evidence_cache import EvidenceCache
            evidence_cache = EvidenceCache()
            cache_key = queries.get("precise") or queries.get("general") or topic
            cached = evidence_cache.get(cache_key)
            if cached:
                web_results = cached
                cache_hit = True
                logging.info(f"   💾 Evidence cache hit: {len(web_results)} verified results")
        except Exception as e:
            logging.debug(f"Evidence cache check failed (non-fatal): {e}")

        if not cache_hit:
            # Search service: fused + ranked results from all sources
            web_results = list(self.searcher.run_ensemble_search(queries, limit=self.search_limit))

            # Verify search results (tier classification, corroboration, liveness)
            try:
                from app.modules.generation.retrieval.search_verifier import verify_search_results
                web_results = verify_search_results(web_results, check_liveness=True)
            except Exception as e:
                logging.warning(f"Search verification failed (non-fatal): {e}")

            # Cache verified results for future reuse
            try:
                from app.modules.generation.retrieval.evidence_cache import EvidenceCache
                evidence_cache = EvidenceCache()
                cache_key = queries.get("precise") or queries.get("general") or topic
                evidence_cache.put(cache_key, web_results)
            except Exception as e:
                logging.debug(f"Evidence caching failed (non-fatal): {e}")

        # Register all results in the citation registry
        if registry is not None:
            registry.register_batch(web_results)

        local_context = ""

        # Try IndexService first (persistent indexes), then legacy LocalDocManager
        if index_service and doc_ids:
            try:
                query_result = index_service.query(topic, doc_ids=doc_ids, k=5)
                evidence_items = query_result.items
                evidence_items = [e for e in evidence_items if not e.is_expired()]
                if evidence_items and registry is not None:
                    local_context = self._register_evidence_items(
                        evidence_items, registry
                    )
                    logging.info(f"   IndexService returned {len(evidence_items)} evidence items ({query_result.elapsed_ms:.0f}ms)")
            except Exception as e:
                logging.warning(f"IndexService query failed, falling back to legacy RAG: {e}")
                local_context = ""

        # Legacy fallback: LocalDocManager
        if not local_context:
            rag = local_rag or self._try_init_local_rag()
            if rag:
                try:
                    local_hits = rag.query_raw(topic)
                    if local_hits and registry is not None:
                        local_context = self._register_local_hits(local_hits, registry)
                    elif local_hits:
                        local_context = rag.query(topic)
                except Exception as e:
                    logging.warning(f"Local RAG query failed: {e}")

        context_str = ""
        if local_context:
            context_str += f"【Local Knowledge Base】\n{local_context}\n\n"

        context_str += "【Web References】\n"
        if registry is not None and registry.count > 0:
            # Build context using authoritative registry numbers (exclude local KB)
            for entry in registry.get_all():
                if entry.source == "Local Knowledge Base":
                    continue
                context_str += (
                    f"[{entry.number}] Title: {entry.title}\n"
                    f"    Source: {entry.source} ({entry.year})\n"
                    f"    Authors: {entry.authors}\n"
                    f"    Abstract: {entry.snippet}\n"
                    f"    URL: {entry.url}\n\n"
                )
        else:
            # Fallback: old behavior without registry
            for i, r in enumerate(web_results[:18], 1):
                context_str += (
                    f"[{i}] Title: {r['title']}\n"
                    f"    Source: {r['source']} ({r['year']})\n"
                    f"    Authors: {r['authors']}\n"
                    f"    Abstract: {r['snippet']}\n"
                    f"    URL: {r['link']}\n\n"
                )

        logging.info(f"   Retrieved {len(web_results)} web results, "
                     f"registered {registry.count if registry else 'N/A'} citations, "
                     f"context={len(context_str)} chars")

        # Build retrieval trace for observability
        try:
            from app.modules.generation.retrieval.retrieval_trace import RetrievalTrace
            trace = RetrievalTrace(
                topic=topic,
                total_web_results=len(web_results),
                cache_hit=cache_hit,
            )
            # Summarize verification statuses
            for r in web_results:
                status = r.get("_verification_status", "unknown")
                trace.verification_summary[status] = trace.verification_summary.get(status, 0) + 1
            trace.finalize()
            trace.summary_log()
            # Store trace on pipeline for later use in write()
            self._last_retrieval_trace = trace
        except Exception:
            pass

        return context_str, web_results

    # ------------------------------------------------------------------
    # Stage 0.5: Lightweight planning evidence
    # ------------------------------------------------------------------
    def _build_planning_evidence(self, topic: str) -> Tuple[str, Optional[Dict[str, str]]]:
        logging.info("🧭 Building lightweight planning evidence...")
        try:
            queries = self.llm.translate_to_keywords(topic)
        except Exception as e:
            logging.warning(f"Planning keyword translation failed: {e}")
            return "", None

        if not isinstance(queries, dict):
            return "", None

        precise_query = (queries.get("precise") or queries.get("general") or topic).strip()
        results: List[Dict] = []
        if precise_query:
            try:
                raw_results = self.searcher.search_crossref(precise_query, limit=3)
                if isinstance(raw_results, list):
                    seen_titles = set()
                    for item in raw_results:
                        if not isinstance(item, dict):
                            continue
                        title = str(item.get("title", "")).strip()
                        if not title:
                            continue
                        norm_title = re.sub(r"[\W_]+", "", title.lower())
                        if norm_title in seen_titles:
                            continue
                        seen_titles.add(norm_title)
                        results.append(item)
                        if len(results) >= 3:
                            break
            except Exception as e:
                logging.warning(f"Planning evidence search failed: {e}")

        evidence_lines = [
            "Seed queries:",
            f"- precise: {queries.get('precise', topic)}",
            f"- general: {queries.get('general', topic)}",
            f"- arxiv: {queries.get('arxiv', topic)}",
        ]
        if results:
            evidence_lines.append("")
            evidence_lines.append("Representative evidence:")
            for item in results:
                snippet = re.sub(r"\s+", " ", str(item.get("snippet", ""))).strip()[:180]
                source = item.get("source", "Unknown Source")
                year = item.get("year", "N/A")
                title = item.get("title", "Untitled")
                evidence_lines.append(f"- {title} ({source}, {year}): {snippet}")

        return "\n".join(evidence_lines), queries

    # ------------------------------------------------------------------
    # Local evidence registration helpers
    # ------------------------------------------------------------------
    def _register_evidence_items(self, evidence_items, registry: CitationRegistry) -> str:
        """Register IndexService EvidenceItems into CitationRegistry at document level.

        Groups chunks by source_filename to keep citations at document level
        (consistent with existing bibliography model), while exposing
        chunk-level page/offset metadata for more precise attribution.
        """
        from collections import OrderedDict

        grouped: OrderedDict = OrderedDict()
        for item in evidence_items:
            src = item.source_filename or item.title
            if src not in grouped:
                grouped[src] = []
            grouped[src].append(item)

        local_parts = []
        for source_file, items in grouped.items():
            snippet = (items[0].content or "")[:200]
            num = registry.register(
                title=source_file,
                authors="",
                year="N/A",
                url="",
                source="Local Knowledge Base",
                snippet=snippet,
            )
            # Format each chunk with page/offset metadata when available
            chunk_parts = []
            for it in items:
                if not it.content:
                    continue
                location = ""
                if it.page is not None:
                    location = f" (p.{it.page})"
                elif it.chunk_index is not None:
                    location = f" (chunk {it.chunk_index})"
                chunk_parts.append(f"{it.content[:300]}{location}")

            merged_content = " ... ".join(chunk_parts) if chunk_parts else ""
            local_parts.append(
                f"[{num}] Title: {source_file}\n"
                f"    Source: Local Knowledge Base\n"
                f"    Content: {merged_content}"
            )
        return "\n\n".join(local_parts)

    def _register_local_hits(self, local_hits: list, registry: CitationRegistry) -> str:
        """Register legacy LocalDocManager hits into CitationRegistry at document level."""
        from collections import OrderedDict

        grouped: OrderedDict = OrderedDict()
        for hit in local_hits:
            src = hit["source"]
            if src not in grouped:
                grouped[src] = []
            grouped[src].append(hit["content"])

        local_parts = []
        for source_file, contents in grouped.items():
            snippet = contents[0][:200]
            num = registry.register(
                title=source_file,
                authors="",
                year="N/A",
                url="",
                source="Local Knowledge Base",
                snippet=snippet,
            )
            merged_content = " ... ".join(contents)
            local_parts.append(
                f"[{num}] Title: {source_file}\n"
                f"    Source: Local Knowledge Base\n"
                f"    Content: {merged_content}"
            )
        return "\n\n".join(local_parts)

    # ------------------------------------------------------------------
    # Stage 2.5: Chapter-level reranking (keyword-based, no LLM)
    # ------------------------------------------------------------------
    def _rerank_for_section(self, section: OutlineSection,
                            web_results: List[Dict],
                            registry: Optional[CitationRegistry] = None,
                            top_k: int = 5) -> str:
        """Select the most relevant references for a section using hybrid
        scoring: keyword overlap + source tier + verification status.

        Uses ``section.search_queries`` (already in the language of the search
        sources) to avoid Chinese-vs-English mismatch.  Falls back to
        section title + instruction words.
        """
        if registry is None or registry.count == 0:
            if not web_results:
                return ""
            lines = []
            for i, r in enumerate(web_results[:top_k], 1):
                lines.append(f"[{i}] {r['title']} — {r['snippet'][:200]}")
            return "\n".join(lines)

        # Build query keywords from search_queries (preferred) or title
        query_words: Set[str] = set()
        if section.search_queries:
            for q in section.search_queries:
                query_words.update(self._tokenize(q))
        if not query_words:
            query_words.update(self._tokenize(section.title))
            query_words.update(self._tokenize(section.instruction))

        if not query_words:
            entries = registry.get_all()[:top_k]
            return "\n".join(
                f"[{e.number}] {e.title} — {e.snippet[:200]}"
                for e in entries
            )

        # Build a lookup from title → verification metadata (from web_results)
        _tier_bonus = {"A": 0.3, "B+": 0.2, "B": 0.1, "C": 0.0}
        _status_bonus = {
            "verified": 0.4, "likely_valid": 0.2,
            "unverified": 0.0, "suspicious": -0.3,
        }
        title_meta: Dict[str, Dict] = {}
        for r in (web_results or []):
            norm_title = r.get("title", "").strip().lower()
            if norm_title:
                title_meta[norm_title] = {
                    "tier": r.get("_source_tier", "C"),
                    "status": r.get("_verification_status", "unverified"),
                }

        # Score each registry entry by keyword overlap + quality bonuses
        scored = []
        for entry in registry.get_all():
            entry_words = self._tokenize(entry.title) | self._tokenize(entry.snippet)
            overlap = len(query_words & entry_words)

            # Quality bonus from verification metadata
            meta = title_meta.get(entry.title.strip().lower(), {})
            tier = meta.get("tier", "C")
            status = meta.get("status", "unverified")
            quality = _tier_bonus.get(tier, 0.0) + _status_bonus.get(status, 0.0)

            total_score = overlap + quality
            if total_score > 0:
                scored.append((total_score, entry))

        scored.sort(key=lambda x: x[0], reverse=True)
        selected = [e for _, e in scored[:top_k]]

        # Pad if needed
        if len(selected) < top_k:
            existing_nums = {e.number for e in selected}
            for entry in registry.get_all():
                if entry.number not in existing_nums:
                    selected.append(entry)
                    if len(selected) >= top_k:
                        break

        return "\n".join(
            f"[{e.number}] {e.title} — {e.snippet[:200]}"
            for e in selected
        )

    # ------------------------------------------------------------------
    # Stage 3: Write
    # ------------------------------------------------------------------
    def write(self, topic: str, outline: ReportOutline, context_str: str,
              web_results: Optional[List[Dict]] = None, *,
              registry: Optional[CitationRegistry] = None,
              progress_callback=None, checkpoint_callback=None,
              existing_checkpoints=None,
              index_service=None,
              doc_ids: Optional[List[str]] = None,
              content_callback: Optional[Callable] = None) -> tuple:
        logging.info("✍️ [Stage 3/4] Writing sections...")
        date_str = datetime.now().strftime("%Y-%m")

        sections_desc = "\n".join(f"{s.number}. {s.title}" for s in outline.sections)

        system_prefix = f"""You are a Principal Investigator writing a comprehensive review paper on "{topic}".
Writing Date: {date_str}

**Requirements:**
1. **Format:** Academic Markdown with LaTeX math support
2. **Length:** Each section should be comprehensive and detailed
3. **Evidence:** Cite sources using the provided reference numbers [1], [2], etc.
4. **Structure:** Follow academic paper structure with proper section numbering
5. **Language:** Write in Chinese (Professional Scientific Tone)
6. **Heading format:** Start each section with: # {{number}} {{title}}
7. **Citation Rules:**
   - ONLY use reference numbers [N] from the provided source material
   - Do NOT invent or fabricate citation numbers
   - If unsure about a claim, write "据相关研究表明" instead of citing
   - Every factual claim should have a citation from the provided references

You will write the report section by section, maintaining consistency throughout."""

        router = self.llm._get_router()
        # Keep context sizing tied to the base writing profile; per-section
        # completion budgets are tuned dynamically at call time.
        writing_max = router.get_profile("writing").max_tokens
        ctx = ContextManager(self.llm, max_tokens=writing_max)
        ctx.set_immutable_context(
            system_prefix=system_prefix,
            outline_text=sections_desc,
            retrieval_summary=context_str,
        )

        generated_sections = []
        token_totals = {"prompt": 0, "completion": 0, "total": 0}

        resume_from = 0
        if existing_checkpoints:
            # Validate checkpoints match current outline before restoring
            valid_checkpoints = []
            for cp in sorted(existing_checkpoints, key=lambda x: x["section_index"]):
                idx = cp["section_index"]
                if idx < len(outline.sections) and outline.sections[idx].title == cp.get("title"):
                    valid_checkpoints.append(cp)
                else:
                    logging.warning(
                        f"   ⚠️ Discarding checkpoint {idx} (title mismatch: "
                        f"'{cp.get('title')}' vs '{outline.sections[idx].title if idx < len(outline.sections) else 'N/A'}')"
                    )
            if valid_checkpoints:
                ctx.restore_from_checkpoints(valid_checkpoints)
                for cp in valid_checkpoints:
                    generated_sections.append(cp["content"])
                resume_from = len(valid_checkpoints)
                logging.info(f"   Resuming from checkpoint: {resume_from} sections already done")
            elif existing_checkpoints:
                logging.warning("   All checkpoints discarded due to outline mismatch — starting fresh")

        total_sections = len(outline.sections)
        ref_keywords = ["参考文献", "references", "bibliography"]
        writable_sections = sum(
            1 for s in outline.sections
            if not any(kw in s.title.lower() for kw in ref_keywords)
        )

        for i, section in enumerate(outline.sections):
            if i < resume_from:
                if progress_callback:
                    progress_callback(i + 1, total_sections, stage="writing", stage_name="撰写内容", section_title=section.title)
                continue

            # Skip LLM generation for references section — built in normalize()
            if any(kw in section.title.lower() for kw in ref_keywords):
                logging.info(f"⏭️ Skipping LLM generation for '{section.title}' — will be built from registry")
                generated_sections.append("")  # placeholder, replaced in normalize
                if progress_callback:
                    progress_callback(i + 1, total_sections, stage="writing", stage_name="撰写内容", section_title=section.title)
                continue

            logging.info(f"📝 Writing section {section.number}: {section.title}")

            # Section-level local retrieval via IndexService
            if index_service and doc_ids and registry is not None:
                section_query = section.title
                if section.search_queries:
                    section_query = " ".join(section.search_queries[:2])
                try:
                    section_result = index_service.query(section_query, doc_ids=doc_ids, k=3)
                    section_evidence = section_result.items
                    section_evidence = [e for e in section_evidence if not e.is_expired()]
                    if section_evidence:
                        self._register_evidence_items(section_evidence, registry)
                        logging.info(f"   📚 Section local retrieval: {len(section_evidence)} chunks for '{section.title}'")
                except Exception as e:
                    logging.warning(f"   Section local retrieval failed: {e}")

            # Section-level web search: run additional queries if available
            if registry is not None and section.search_queries:
                self._run_section_search(section, registry)

            # Rerank references for this section
            section_refs = ""
            if registry is not None:
                section_refs = self._rerank_for_section(section, web_results or [], registry)
            elif web_results:
                section_refs = self._rerank_for_section(section, web_results)
            section_source = section_refs.strip() or None
            section_token_totals = {"prompt": 0, "completion": 0, "total": 0}
            had_review_pass = False

            claim_plan = None
            try:
                claim_plan, plan_usage = self._plan_section_grounding(
                    i,
                    section,
                    ctx,
                    source_material_override=section_source,
                )
                self._merge_token_usage(section_token_totals, plan_usage)
            except Exception as plan_error:
                logging.warning(
                    "Grounding plan failed for '%s', falling back to direct draft: %s",
                    section.title,
                    plan_error,
                )

            if claim_plan:
                prompt = self._build_grounded_section_prompt(i, section, claim_plan)
            else:
                prompt = self._build_section_prompt(i, section, section_refs)
            messages = ctx.build_messages(
                i,
                prompt,
                source_material_override=section_source,
            )
            routing_metadata = {
                "section_index": i,
                "target_words": section.target_words,
                "has_review_pass": False,
            }

            try:
                result = self.llm.chat_routed(
                    messages,
                    task_type="writing",
                    routing_metadata=routing_metadata,
                )
                self._merge_token_usage(section_token_totals, result)
                content = result.get("content", "")
                content = self._clean_section_heading(content, section)

                # Validate citations in this section before accepting
                if registry is not None:
                    content = self.citation_validator.fix(content, registry)

                rubric_review = None
                try:
                    rubric_review, review_usage = self._review_section(
                        i,
                        section,
                        content,
                        ctx,
                        claim_plan=claim_plan,
                        source_material_override=section_source,
                    )
                    self._merge_token_usage(section_token_totals, review_usage)
                    had_review_pass = True
                except Exception as review_error:
                    logging.warning(
                        "Rubric review failed for '%s', keeping current draft: %s",
                        section.title,
                        review_error,
                    )

                if rubric_review and rubric_review.needs_revision:
                    try:
                        rewrite_prompt = self._build_section_rewrite_prompt(
                            section,
                            claim_plan,
                            content,
                            rubric_review,
                        )
                        rewrite_messages = ctx.build_messages(
                            i,
                            rewrite_prompt,
                            source_material_override=section_source,
                            include_recent_sections=False,
                        )
                        rewrite_result = self.llm.chat_routed(
                            rewrite_messages,
                            task_type="review",
                            routing_metadata={
                                "section_index": i,
                                "target_words": section.target_words,
                                "has_review_pass": True,
                            },
                        )
                        self._merge_token_usage(section_token_totals, rewrite_result)
                        rewritten_content = rewrite_result.get("content", "").strip()
                        if rewritten_content:
                            content = self._clean_section_heading(rewritten_content, section)
                            if registry is not None:
                                content = self.citation_validator.fix(content, registry)
                    except Exception as rewrite_error:
                        logging.warning(
                            "Targeted rewrite failed for '%s', keeping reviewed draft: %s",
                            section.title,
                            rewrite_error,
                        )

                # Anti-hallucination: verify claims against source material
                try:
                    from app.modules.generation.writing.content_verifier import verify_section
                    verification = verify_section(
                        self.llm, section.title, content,
                        source_material=section_source or context_str[:4000],
                    )
                    if verification.fabricated_count > 0:
                        logging.warning(
                            f"⚠️ Hallucination detected in '{section.title}': "
                            f"{verification.fabricated_count} fabricated claims — "
                            f"stripping unsupported citations"
                        )
                        # Remove citation references for fabricated claims
                        for claim in verification.claims:
                            if claim.status == "fabricated" and claim.cited_refs:
                                for ref_num in claim.cited_refs:
                                    if registry and registry.is_valid(ref_num):
                                        content = content.replace(
                                            f"[{ref_num}]", "（据相关研究）"
                                        )
                                    else:
                                        # Invalid citation number — remove entirely
                                        content = content.replace(f"[{ref_num}]", "")
                except Exception as verify_err:
                    logging.debug(f"Content verification skipped for '{section.title}': {verify_err}")

                summary, summary_tokens = ctx._generate_summary(
                    section.title,
                    content,
                    section_index=i,
                    target_words=section.target_words,
                    has_review_pass=had_review_pass,
                )
                ctx.on_section_complete(i, section.title, content, summary)

                generated_sections.append(content)

                token_totals["prompt"] += section_token_totals["prompt"]
                token_totals["completion"] += section_token_totals["completion"]
                token_totals["total"] += section_token_totals["total"] + summary_tokens

                if checkpoint_callback:
                    checkpoint_callback(
                        section_index=i, title=section.title,
                        content=content, summary=summary,
                        tokens=section_token_totals["total"] + summary_tokens,
                    )

                if content_callback:
                    content_callback(
                        section_index=i,
                        section_title=section.title,
                        content=content,
                        total_sections=total_sections,
                    )

                logging.info(f"✅ Done: {section.title} ({len(content)} chars)")
                if progress_callback:
                    progress_callback(i + 1, total_sections, stage="writing", stage_name="撰写内容", section_title=section.title)

            except Exception as e:
                logging.error(f"❌ Failed section {section.title}: {e}", exc_info=True)
                # Section-level recovery: mark failed section with placeholder
                placeholder = (
                    f"# {section.number} {section.title}\n\n"
                    f"> ⚠️ 此章节生成失败，可点击「重新生成」重试。\n\n"
                    f"错误信息：{type(e).__name__}"
                )
                generated_sections.append(placeholder)
                failed_section_count = getattr(self, '_failed_section_count', 0) + 1
                self._failed_section_count = failed_section_count
                self._last_section_error = e
                if progress_callback:
                    progress_callback(i + 1, total_sections, stage="writing", stage_name="撰写内容", section_title=section.title)

        # If ALL writable sections failed, raise so the task is marked as failed
        failed = getattr(self, '_failed_section_count', 0)
        last_err = getattr(self, '_last_section_error', None)
        self._failed_section_count = 0  # reset for potential retry
        self._last_section_error = None
        if failed >= writable_sections:
            # Re-raise the original error to preserve proper error classification
            raise to_generation_error(last_err or RuntimeError("所有章节均生成失败")) from last_err
        if failed > 0:
            logging.warning(f"⚠️ {failed}/{writable_sections} 章节生成失败，已用占位符替代")

        return generated_sections, token_totals

    # ------------------------------------------------------------------
    # Stage 3 helpers: multi-pass section writing
    # ------------------------------------------------------------------
    @staticmethod
    def _merge_token_usage(token_totals: Dict[str, int], usage: Optional[Dict]) -> None:
        if not usage:
            return
        token_totals["prompt"] += int(usage.get("prompt_tokens", 0) or 0)
        token_totals["completion"] += int(usage.get("completion_tokens", 0) or 0)
        token_totals["total"] += int(usage.get("total_tokens", 0) or 0)

    def _plan_section_grounding(self, index: int, section: OutlineSection,
                                ctx: ContextManager, *,
                                source_material_override: Optional[str] = None) -> tuple[SectionGroundingPlan, Dict[str, int]]:
        prompt = self._build_section_grounding_prompt(section)
        messages = ctx.build_messages(
            index,
            prompt,
            source_material_override=source_material_override,
        )
        plan, usage = self.llm.chat_json_with_metrics(
            messages,
            schema=SectionGroundingPlan,
            task_type="planning",
            routing_metadata={
                "section_index": index,
                "target_words": section.target_words,
            },
        )
        if not plan.focus.strip():
            raise ValueError("empty section grounding focus")
        if not plan.bullet_plan and not plan.claims:
            raise ValueError("section grounding plan missing bullets and claims")
        return plan, usage

    def _build_section_grounding_prompt(self, section: OutlineSection) -> str:
        return f"""Create a compact grounded writing plan for Section {section.number}: {section.title}.

Section instruction: {section.instruction}
Target length: approximately {section.target_words} words.

Requirements:
- Use ONLY the provided source material and citation numbers [N]
- Return a concise plan for drafting, not the full section
- focus: 1 sentence describing the section's main analytical goal
- bullet_plan: 3-5 ordered bullets for paragraph flow
- claims: 3-6 grounded claims or evidence-backed points
- Each claim should cite only the relevant reference numbers from the source material
- If support is weak, keep the claim cautious and leave citations empty instead of inventing them"""

    @staticmethod
    def _format_grounding_plan(plan: SectionGroundingPlan) -> str:
        lines = [f"Focus: {plan.focus.strip()}"]
        if plan.bullet_plan:
            lines.append("Planned flow:")
            lines.extend(f"- {bullet.strip()}" for bullet in plan.bullet_plan[:5] if bullet.strip())
        if plan.claims:
            lines.append("Grounded claims:")
            for claim in plan.claims[:6]:
                claim_text = claim.claim.strip()
                if not claim_text:
                    continue
                citation_suffix = " ".join(f"[{n}]" for n in claim.citations[:4])
                if citation_suffix:
                    lines.append(f"- {claim_text} {citation_suffix}".rstrip())
                else:
                    lines.append(f"- {claim_text}（如证据不足请谨慎表述）")
        return "\n".join(lines)

    def _build_grounded_section_prompt(self, index: int, section: OutlineSection,
                                       plan: SectionGroundingPlan) -> str:
        grounded_plan = self._format_grounding_plan(plan)
        transition_rules = (
            "- This is the first section of the report\n"
            "- Establish scope and academic framing"
            if index == 0 else
            "- Maintain consistency with previous sections\n"
            "- Ensure smooth transitions and avoid repetition"
        )
        return f"""Write the full Markdown draft for Section {section.number}: {section.title}.

Section instruction: {section.instruction}
Target length: approximately {section.target_words} words.

Grounded section plan:
{grounded_plan}

Requirements:
- Begin with: # {section.number} {section.title}
- Follow the grounded plan while writing natural academic prose
- Keep factual claims aligned with the cited references from the plan/source material
- Do NOT invent citation numbers or unsupported findings
- If evidence is limited, use cautious wording such as "据相关研究表明"
{transition_rules}"""

    def _review_section(self, index: int, section: OutlineSection, draft: str,
                        ctx: ContextManager, *,
                        claim_plan: Optional[SectionGroundingPlan] = None,
                        source_material_override: Optional[str] = None) -> tuple[SectionRubricReview, Dict[str, int]]:
        signals = self._collect_section_review_signals(index, section, draft, claim_plan)
        prompt = self._build_section_review_prompt(index, section, draft, claim_plan, signals)
        messages = ctx.build_messages(
            index,
            prompt,
            source_material_override=source_material_override,
            include_recent_sections=False,
        )
        review, usage = self.llm.chat_json_with_metrics(
            messages,
            schema=SectionRubricReview,
            task_type="review",
            routing_metadata={
                "section_index": index,
                "target_words": section.target_words,
                "has_review_pass": False,
            },
        )
        return self._merge_review_with_signals(section, review, signals), usage

    def _build_section_review_prompt(self, index: int, section: OutlineSection,
                                     draft: str,
                                     plan: Optional[SectionGroundingPlan],
                                     signals: Dict[str, object]) -> str:
        grounded_plan = (
            self._format_grounding_plan(plan)
            if plan is not None else
            "No grounded plan is available for this section. Rely on the source material and existing citations."
        )
        transition_expectation = (
            "The section should establish scope cleanly as the opening section."
            if index == 0 else
            "The opening should connect smoothly with prior sections and avoid abrupt topic jumps."
        )
        return f"""Review the following Markdown section against a compact rubric.

Section: {section.number} {section.title}
Target length: approximately {section.target_words} words.

Heuristic signals:
{self._format_section_review_signals(signals)}

Grounded section plan:
{grounded_plan}

Current draft:
{draft}

Rubric:
- unsupported or weakly grounded claims
- missing or sparse citations relative to factual density
- repetition or redundancy
- target length mismatch
- weak transitions or coherence
- {transition_expectation}

Instructions:
- Be conservative: if the section is already solid, set needs_revision to false
- Keep issues focused on material problems only
- Use issue codes from: unsupported_claims, sparse_citations, repetition, length_mismatch, weak_transitions
- Provide at most 3 issues and at most 3 rewrite_instructions
- Do not recommend invented citation numbers"""

    def _build_section_rewrite_prompt(self, section: OutlineSection,
                                      plan: Optional[SectionGroundingPlan],
                                      draft: str,
                                      review: SectionRubricReview) -> str:
        grounded_plan = (
            self._format_grounding_plan(plan)
            if plan is not None else
            "Grounded plan unavailable. Keep only claims supported by the provided source material and existing citations."
        )
        issues_text = "\n".join(
            f"- [{issue.severity}] {issue.code}: {issue.detail}"
            for issue in review.issues[:3]
        ) or "- No additional issue detail provided."
        instructions_text = "\n".join(
            f"- {instruction}"
            for instruction in review.rewrite_instructions[:3]
            if instruction.strip()
        ) or "- Tighten only the flagged problems; preserve already-good material."
        return f"""Revise the following section only where needed to satisfy the rubric review.

Grounded section plan:
{grounded_plan}

Rubric verdict:
{review.verdict or "Section needs a targeted rewrite."}

Flagged issues:
{issues_text}

Rewrite instructions:
{instructions_text}

Current draft:
{draft}

Requirements:
- Preserve the heading: # {section.number} {section.title}
- Address only the flagged issues while keeping strong passages intact
- Keep valid citations [N] intact and do not invent new citation numbers
- If support is weak, soften or trim the claim instead of fabricating evidence
- Improve coherence and transitions only where the review identified problems
- Return ONLY the revised Markdown section"""

    def _collect_section_review_signals(self, index: int, section: OutlineSection,
                                        draft: str,
                                        plan: Optional[SectionGroundingPlan]) -> Dict[str, object]:
        body = self._extract_section_body(draft)
        paragraphs = [
            para.strip()
            for para in re.split(r'\n\s*\n', body)
            if para.strip()
        ]
        sentences = [
            re.sub(r'\s+', ' ', sentence).strip()
            for sentence in re.split(r'[。！？!?]+|(?<=[.])\s+', body)
            if re.sub(r'\[[0-9]+\]', '', sentence).strip()
        ]
        citations = [int(number) for number in re.findall(r'\[(\d+)\]', body)]
        unique_citations = sorted(set(citations))
        supported_claim_count = sum(1 for claim in (plan.claims if plan else []) if claim.citations)
        word_count = self._estimate_word_count(body)

        min_words = max(120, int(section.target_words * 0.55))
        max_words = max(min_words + 100, int(section.target_words * 1.45))
        length_mismatch = word_count < min_words or word_count > max_words

        sparse_citations = False
        if word_count >= 260 and len(sentences) >= 3:
            if supported_claim_count >= 3 and len(unique_citations) < max(1, min(3, supported_claim_count // 2)):
                sparse_citations = True
            elif word_count >= 600 and not unique_citations:
                sparse_citations = True
            elif word_count >= 1200 and len(unique_citations) < 2:
                sparse_citations = True

        repetition = (
            self._count_duplicate_fragments(paragraphs, minimum_length=80) > 0
            or self._count_duplicate_fragments(sentences, minimum_length=30) > 0
        )

        opening = paragraphs[0] if paragraphs else body[:240]
        transition_gap = (
            index > 0
            and len(body) >= 180
            and not re.search(
                r'(此外|另外|同时|然而|因此|进一步|综上|在此基础上|相比之下|与此同时|furthermore|however|therefore|building on|in contrast|meanwhile|additionally)',
                opening,
                re.IGNORECASE,
            )
        )

        return {
            "word_count": word_count,
            "sentence_count": len(sentences),
            "paragraph_count": len(paragraphs),
            "citation_mentions": len(citations),
            "unique_citations": len(unique_citations),
            "supported_claim_count": supported_claim_count,
            "flag_length_mismatch": length_mismatch,
            "flag_sparse_citations": sparse_citations,
            "flag_repetition": repetition,
            "flag_transition_gap": transition_gap,
        }

    @staticmethod
    def _format_section_review_signals(signals: Dict[str, object]) -> str:
        return "\n".join([
            f"- approximate_word_count: {signals['word_count']}",
            f"- paragraph_count: {signals['paragraph_count']}",
            f"- sentence_count: {signals['sentence_count']}",
            f"- citation_mentions: {signals['citation_mentions']}",
            f"- unique_citations: {signals['unique_citations']}",
            f"- grounded_claims_with_citations: {signals['supported_claim_count']}",
            (
                "- heuristic_flags: "
                f"length_mismatch={signals['flag_length_mismatch']}, "
                f"sparse_citations={signals['flag_sparse_citations']}, "
                f"repetition={signals['flag_repetition']}, "
                f"transition_gap={signals['flag_transition_gap']}"
            ),
        ])

    def _merge_review_with_signals(self, section: OutlineSection,
                                   review: SectionRubricReview,
                                   signals: Dict[str, object]) -> SectionRubricReview:
        normalized = review.model_copy(deep=True)
        normalized.verdict = normalized.verdict.strip()
        normalized.rewrite_instructions = [
            instruction.strip()
            for instruction in normalized.rewrite_instructions
            if instruction and instruction.strip()
        ][:3]
        normalized.issues = normalized.issues[:3]

        if (
            not normalized.needs_revision and (
                normalized.unsupported_claims
                or normalized.sparse_citations
                or normalized.repetition
                or normalized.length_mismatch
                or normalized.weak_transitions
                or normalized.issues
                or normalized.rewrite_instructions
            )
        ):
            normalized.needs_revision = True

        issue_codes = {issue.code for issue in normalized.issues}

        def add_issue(flag_name: str, code: str, detail: str,
                      instruction: str, severity: str = "medium") -> None:
            setattr(normalized, flag_name, True)
            normalized.needs_revision = True
            if code not in issue_codes and len(normalized.issues) < 3:
                normalized.issues.append(
                    SectionReviewIssue(code=code, detail=detail, severity=severity)
                )
                issue_codes.add(code)
            if instruction not in normalized.rewrite_instructions and len(normalized.rewrite_instructions) < 3:
                normalized.rewrite_instructions.append(instruction)

        if signals["flag_sparse_citations"]:
            add_issue(
                "sparse_citations",
                "sparse_citations",
                "Citation coverage looks thin relative to the section's factual density.",
                "Trim unsupported statements or attach existing valid citations only where the source material already supports them.",
            )
        if signals["flag_repetition"]:
            add_issue(
                "repetition",
                "repetition",
                "Repeated paragraphs or sentences were detected in the draft.",
                "Remove duplicated phrasing and consolidate overlapping points.",
            )

        if not normalized.needs_revision:
            normalized.rewrite_instructions = []
        if not normalized.verdict:
            normalized.verdict = (
                "Section needs targeted revision."
                if normalized.needs_revision else
                "Section passes the rubric."
            )
        return normalized

    @staticmethod
    def _extract_section_body(text: str) -> str:
        stripped = text.strip()
        if not stripped:
            return ""
        lines = stripped.splitlines()
        if lines and lines[0].lstrip().startswith("#"):
            return "\n".join(lines[1:]).strip()
        return stripped

    @staticmethod
    def _estimate_word_count(text: str) -> int:
        if not text:
            return 0
        cjk_chars = len(re.findall(r'[\u4e00-\u9fff]', text))
        latin_words = len(re.findall(r'[A-Za-z0-9]+(?:[-/][A-Za-z0-9]+)*', text))
        return cjk_chars + latin_words

    @staticmethod
    def _count_duplicate_fragments(fragments: List[str], minimum_length: int) -> int:
        counts: Dict[str, int] = {}
        for fragment in fragments:
            normalized = re.sub(r'\s+', ' ', fragment).strip()
            if len(normalized) < minimum_length:
                continue
            counts[normalized] = counts.get(normalized, 0) + 1
        return sum(count - 1 for count in counts.values() if count > 1)

    # ------------------------------------------------------------------
    # Stage 4: Normalize
    # ------------------------------------------------------------------
    def normalize(self, sections: List[str], outline: ReportOutline,
                  registry: Optional[CitationRegistry] = None,
                  citation_style: str = "gb") -> str:
        """Stage 4: Final formatting pass.

        - Validate/fix citations in each section
        - Build the references section from registry
        - Remove duplicate paragraphs
        - Clean up heading levels and whitespace
        """
        ref_keywords = ["参考文献", "references", "bibliography"]

        cleaned: List[str] = []
        for i, (section_text, outline_sec) in enumerate(zip(sections, outline.sections)):
            # Skip empty placeholders (references section placeholder)
            if any(kw in outline_sec.title.lower() for kw in ref_keywords):
                continue  # will be replaced below
            if not section_text.strip():
                continue

            text = section_text

            # Fix invalid citations if registry is available
            if registry is not None:
                text = self.citation_validator.fix(text, registry)

            cleaned.append(text)

        # Remove duplicate paragraphs across sections
        cleaned = self._remove_duplicate_paragraphs(cleaned)

        # Join body sections
        content = "\n\n".join(cleaned)

        # Build references section from registry
        if registry is not None and registry.count > 0:
            used_numbers = self.citation_validator.extract_used_numbers(content)
            refs_text = self.reference_builder.build(registry, used_numbers,
                                                     style=citation_style)
            if refs_text:
                # Find the references section number from outline
                ref_number = ""
                for sec in outline.sections:
                    if any(kw in sec.title.lower() for kw in ref_keywords):
                        ref_number = sec.number
                        break
                heading = f"# {ref_number} 参考文献" if ref_number else "# 参考文献"
                content += f"\n\n{heading}\n\n{refs_text}"

                logging.info(f"📚 Built references section: {len(used_numbers)} citations used "
                             f"out of {registry.count} registered")

        # Final whitespace cleanup
        content = re.sub(r'\n{3,}', '\n\n', content)

        return content

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _build_section_prompt(self, index: int, section: OutlineSection,
                              section_refs: str = "") -> str:
        base = f"""Please write Section {section.number}: {section.title}

Section Instruction: {section.instruction}
Target length: approximately {section.target_words} words."""

        if section_refs:
            base += f"\n\n**Most relevant references for this section:**\n{section_refs}"

        if index == 0:
            return base + f"""

**Important:**
- Begin with: # {section.number} {section.title}
- This is the first section of the report
- Ensure proper academic tone and structure
- Include relevant citations from the provided references"""
        else:
            return base + f"""

**Important:**
- Begin with: # {section.number} {section.title}
- Maintain consistency with previous sections
- Ensure smooth transitions
- Do not repeat content from previous sections
- Include relevant citations"""

    def _clean_section_heading(self, content: str, section: OutlineSection) -> str:
        content = content.strip()
        expected_heading = f"# {section.number} {section.title}"
        if not re.match(r'^#\s', content):
            content = f"{expected_heading}\n\n{content}"
        return content

    def _build_filename(self, topic: str) -> str:
        safe = re.sub(r'[\/*?:"<>|]', '_', topic).strip()
        if not safe:
            safe = f"report_{int(time.time())}"
        return f"{safe}.md"

    def _try_init_local_rag(self) -> Optional[LocalDocManager]:
        try:
            rag = LocalDocManager()
            if rag.embeddings:
                return rag
        except Exception:
            pass
        return None

    # ------------------------------------------------------------------
    # Section-level search
    # ------------------------------------------------------------------
    def _run_section_search(self, section: OutlineSection,
                            registry: CitationRegistry) -> None:
        """Run additional searches for a section's ``search_queries`` and
        register results in the citation registry.

        Uses Crossref only (single source) to avoid API rate limits.
        """
        for query in section.search_queries[:2]:  # cap at 2 queries per section
            try:
                results = self.searcher.search_crossref(query, limit=3)
                if results:
                    nums = registry.register_batch(results)
                    logging.info(f"   📎 Section search '{query}': "
                                 f"{len(results)} results, registered as {nums}")
            except Exception as e:
                logging.warning(f"   Section search failed for '{query}': {e}")

    # ------------------------------------------------------------------
    # Keyword tokenization for reranking
    # ------------------------------------------------------------------
    @staticmethod
    def _tokenize(text: str) -> Set[str]:
        """Split text into lowercase alphanumeric tokens (≥2 chars)."""
        if not text:
            return set()
        tokens = re.findall(r'[a-zA-Z]{2,}|\d{4}', text.lower())
        # Also split on common CJK by extracting multi-char runs
        cjk_tokens = re.findall(r'[\u4e00-\u9fff]{2,}', text)
        return set(tokens) | set(cjk_tokens)

    # ------------------------------------------------------------------
    # Duplicate paragraph removal
    # ------------------------------------------------------------------
    @staticmethod
    def _remove_duplicate_paragraphs(sections: List[str]) -> List[str]:
        """Remove paragraphs that appear identically in multiple sections."""
        seen_paragraphs: Set[str] = set()
        cleaned = []
        for section_text in sections:
            paragraphs = section_text.split('\n\n')
            unique = []
            for para in paragraphs:
                stripped = para.strip()
                # Skip dedup for headings and short fragments
                if not stripped or stripped.startswith('#') or len(stripped) < 80:
                    unique.append(para)
                    continue
                if stripped in seen_paragraphs:
                    continue  # duplicate — drop
                seen_paragraphs.add(stripped)
                unique.append(para)
            cleaned.append('\n\n'.join(unique))
        return cleaned
