# SPDX-License-Identifier: MPL-2.0
"""生成 Folio 项目报告 PPT（中文，技术详版）。

用法::

    uv run python scripts/build_report_pptx.py
    # 输出: ./Folio_设计报告.pptx
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Iterable

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN
from pptx.util import Cm, Pt

OUTPUT = Path(__file__).resolve().parents[1] / "Folio_设计报告.pptx"


def _save_with_fallback(prs: Presentation, output: Path) -> Path:
    try:
        prs.save(output)
        return output
    except PermissionError:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        alt = output.with_name(f"{output.stem}_{ts}{output.suffix}")
        prs.save(alt)
        return alt

# 主题色
PRIMARY = RGBColor(0x1F, 0x3A, 0x68)  # 深蓝
ACCENT = RGBColor(0xE0, 0x6C, 0x2A)  # 橙
TEXT = RGBColor(0x20, 0x20, 0x20)
MUTED = RGBColor(0x60, 0x60, 0x60)
BG_BAND = RGBColor(0xF2, 0xF4, 0xF8)
SUCCESS = RGBColor(0x3C, 0x8D, 0x5A)
WARN = RGBColor(0xD9, 0x8A, 0x00)
LIGHT_BLUE = RGBColor(0xDA, 0xE7, 0xF7)
LIGHT_ORANGE = RGBColor(0xFF, 0xEA, 0xDA)
LIGHT_GREEN = RGBColor(0xE3, 0xF1, 0xE7)


def _add_header(slide, slide_width: int, title: str) -> None:
    bar = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, slide_width, Cm(2))
    bar.fill.solid()
    bar.fill.fore_color.rgb = PRIMARY
    bar.line.fill.background()

    title_box = slide.shapes.add_textbox(Cm(1), Cm(0.3), Cm(30), Cm(1.5))
    p = title_box.text_frame.paragraphs[0]
    r = p.add_run()
    r.text = title
    _set_font(r, size=25, bold=True, color=RGBColor(0xFF, 0xFF, 0xFF))


def _add_box(slide, x: float, y: float, w: float, h: float, title: str, lines: Iterable[str], *, fill: RGBColor = BG_BAND, title_color: RGBColor = PRIMARY, body_size: int = 12, rounded: bool = False) -> None:
    shape_type = MSO_SHAPE.ROUNDED_RECTANGLE if rounded else MSO_SHAPE.RECTANGLE
    box = slide.shapes.add_shape(shape_type, x, y, w, h)
    box.fill.solid()
    box.fill.fore_color.rgb = fill
    box.line.color.rgb = PRIMARY
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = Cm(0.25)
    tf.margin_right = Cm(0.2)
    tf.margin_top = Cm(0.15)
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = title
    _set_font(r, size=14, bold=True, color=title_color)
    for line in lines:
        p = tf.add_paragraph()
        r = p.add_run()
        r.text = "• " + line
        _set_font(r, size=body_size, color=TEXT)
        p.space_after = Pt(2)


def _add_text(slide, x: float, y: float, w: float, h: float, lines: list[str], *, size: int = 15, color: RGBColor = TEXT) -> None:
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        r = p.add_run()
        r.text = line
        _set_font(r, size=size, color=color)
        p.space_after = Pt(4)


def _add_formula_box(slide, x: float, y: float, w: float, h: float, formula: str, *, subtitle: str | None = None) -> None:
    box = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, x, y, w, h)
    box.fill.solid()
    box.fill.fore_color.rgb = RGBColor(0xF7, 0xFA, 0xFF)
    box.line.color.rgb = PRIMARY

    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = Cm(0.3)
    tf.margin_right = Cm(0.3)
    tf.margin_top = Cm(0.2)

    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = formula
    _set_font(r, size=19, bold=True, color=PRIMARY, name="Cambria Math")

    if subtitle:
        p2 = tf.add_paragraph()
        p2.alignment = PP_ALIGN.CENTER
        r2 = p2.add_run()
        r2.text = subtitle
        _set_font(r2, size=12, color=MUTED)


def _add_arrow(slide, x1: float, y1: float, x2: float, y2: float, *, color: RGBColor = ACCENT) -> None:
    line = slide.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, x1, y1, x2, y2)
    line.line.color.rgb = color
    line.line.width = Pt(2)
    line.line.end_arrowhead = True


def _set_font(run, *, size=18, bold=False, color=TEXT, name="微软雅黑"):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color


def add_title_slide(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])  # blank
    # 顶部色带
    band = slide.shapes.add_shape(
        MSO_SHAPE.RECTANGLE, 0, 0, prs.slide_width, Cm(3.5)
    )
    band.fill.solid()
    band.fill.fore_color.rgb = PRIMARY
    band.line.fill.background()

    title_box = slide.shapes.add_textbox(Cm(2), Cm(6), Cm(29), Cm(3))
    tf = title_box.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    r = p.add_run()
    r.text = "Folio：TUI 原生学术论文生成引擎"
    _set_font(r, size=40, bold=True, color=PRIMARY)

    sub = slide.shapes.add_textbox(Cm(2), Cm(10), Cm(29), Cm(2))
    p = sub.text_frame.paragraphs[0]
    r = p.add_run()
    r.text = "详细技术报告 · 架构 / 数据流 / 算法 / 工程实现"
    _set_font(r, size=22, color=ACCENT)

    foot = slide.shapes.add_textbox(Cm(2), Cm(16), Cm(29), Cm(1))
    p = foot.text_frame.paragraphs[0]
    r = p.add_run()
    r.text = "项目语言：Python 3.11+   |   许可证：MPL-2.0（代码）/ MIT（生成稿）"
    _set_font(r, size=14, color=MUTED)


def add_section_slide(prs: Presentation, title: str, bullets: list[str]) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_header(slide, prs.slide_width, title)

    # 内容
    body = slide.shapes.add_textbox(Cm(1.5), Cm(2.8), Cm(30), Cm(15))
    tf = body.text_frame
    tf.word_wrap = True
    for i, item in enumerate(bullets):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        if item.startswith("# "):
            r = p.add_run()
            r.text = item[2:]
            _set_font(r, size=18, bold=True, color=ACCENT)
            p.space_after = Pt(4)
        else:
            r = p.add_run()
            r.text = "• " + item
            _set_font(r, size=16, color=TEXT)
            p.space_after = Pt(6)


def add_system_context_slide(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_header(slide, prs.slide_width, "1 · 系统定位与问题定义")
    _add_box(
        slide,
        Cm(1), Cm(3), Cm(15), Cm(6.3),
        "业务输入",
        [
            "模糊研究主题，如“写一篇 diffusion model 综述”",
            "期刊样例 PDF / 模板 / 投稿规范",
            "用户偏好：语言、字数、受众、作者画像",
            "可选：数据集、已有参考文献、附加要求",
        ],
        fill=LIGHT_BLUE,
    )
    _add_box(
        slide,
        Cm(17.2), Cm(3), Cm(15), Cm(6.3),
        "核心输出",
        [
            "结构完整的学术论文草稿",
            "格式合规的 LaTeX / PDF / DOCX 产物",
            "BibTeX / 引用核验结果 / 审计轨迹",
            "可恢复运行状态与阶段级快照",
        ],
        fill=LIGHT_GREEN,
    )
    _add_box(
        slide,
        Cm(1), Cm(10.3), Cm(31.2), Cm(5.8),
        "设计目标",
        [
            "TUI 原生交互：像 Copilot CLI 一样在本地终端完成全部工作流",
            "纯域核心：业务决策放在 app/core，界面层只展示状态和转发事件",
            "可替换基础设施：Provider / MCP Tool / Docker Sandbox / SQLite / Trace 解耦",
            "可验证与可追责：所有 LLM 调用、引用、事实检查都有 trace 与 provenance",
        ],
        fill=LIGHT_ORANGE,
        body_size=13,
    )


def add_layered_arch_slide(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_header(slide, prs.slide_width, "2 · 总体分层架构图")

    layers = [
        ("表现层 app/tui/", "Textual + Rich；事件驱动；只负责渲染状态、收集输入、触发 orchestrator", RGBColor(0xDD, 0xE7, 0xF5)),
        ("编排层 app/core/orchestrator/", "sequential / parallel / survey；统一调度 stage，负责重试、路由、恢复", RGBColor(0xCB, 0xDC, 0xF0)),
        ("阶段层 app/core/stages/", "format / outline / draft / cite_fetch / verify_refs / export_* 等纯业务 stage", RGBColor(0xB7, 0xCD, 0xEA)),
        ("契约层 app/core/contract/", "StageMessage + StageRecord + Capability；所有阶段共享统一消息协议", RGBColor(0xA1, 0xBE, 0xE3)),
        ("基础设施层", "providers / tools / sandbox / persistence / observability / config", RGBColor(0x8B, 0xAE, 0xDC)),
    ]
    y = Cm(3)
    h = Cm(2.35)
    for i, (name, desc, color) in enumerate(layers):
        _add_box(slide, Cm(2), y + i * (h + Cm(0.3)), Cm(29), h, name, [desc], fill=color, body_size=12)

    for i in range(len(layers) - 1):
        _add_arrow(slide, Cm(16.5), y + i * (h + Cm(0.3)) + h, Cm(16.5), y + (i + 1) * (h + Cm(0.3)))


def add_contract_slide(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_header(slide, prs.slide_width, "3 · 核心契约：StageMessage 与 Capability")
    _add_box(
        slide,
        Cm(1), Cm(3), Cm(15.2), Cm(11.5),
        "StageMessage（阶段唯一流通货币）",
        [
            "run_id：整次运行的唯一标识，便于 trace / checkpoint 关联",
            "created_at：创建时间，构成运行时间轴基线",
            "payload: dict[str, Any]：阶段间共享的数据面，如 clarify / outline / draft / citations",
            "history: list[StageRecord]：每个 stage 的执行记录，含模型、token、cost、备注",
            "with_record()：通过 copy-on-write 追加 history，避免篡改先前阶段记录",
            "validate()：Pydantic round-trip 校验，保证跨 stage 数据仍满足 schema",
        ],
        fill=LIGHT_BLUE,
    )
    _add_box(
        slide,
        Cm(17), Cm(3), Cm(15.2), Cm(11.5),
        "Capability（Provider 能力侧写）",
        [
            "label / base_url / default_model：端点身份信息",
            "available_models：端点可用模型集合",
            "flags：CHAT / STREAM / TOOLS / EMBEDDINGS / JSON_SCHEMA / VISION",
            "context_window：上下文窗大小，供 long_ctx 打分",
            "probed_at / last_error：启动探测时间与异常状态",
            "supports(flag)：供路由器快速判断端点特征",
        ],
        fill=LIGHT_GREEN,
    )
    _add_text(
        slide,
        Cm(1.2), Cm(15.4), Cm(31), Cm(2),
        [
            "设计含义：StageMessage 解决“数据如何在阶段间安全流动”，Capability 解决“哪个模型更适合当前阶段”。"
        ],
        size=15,
        color=PRIMARY,
    )


def add_runtime_flow_slide(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_header(slide, prs.slide_width, "4 · 运行时数据流 / 控制流")

    blocks = [
        (Cm(1), Cm(5), "用户 / CLI / TUI", LIGHT_BLUE),
        (Cm(6.2), Cm(5), "Orchestrator", LIGHT_ORANGE),
        (Cm(11.4), Cm(5), "Stage", LIGHT_GREEN),
        (Cm(16.6), Cm(3.4), "ProviderRegistry", LIGHT_BLUE),
        (Cm(16.6), Cm(6.6), "Tools / Sandbox", LIGHT_BLUE),
        (Cm(23.2), Cm(3.4), "Trace JSONL", LIGHT_GREEN),
        (Cm(23.2), Cm(6.6), "SQLite Checkpoint", LIGHT_GREEN),
        (Cm(28.6), Cm(5), "Artifacts", LIGHT_ORANGE),
    ]
    for x, y, title, color in blocks:
        _add_box(slide, x, y, Cm(4.2), Cm(2.2), title, [], fill=color, rounded=True)

    _add_arrow(slide, Cm(5.2), Cm(6.1), Cm(6.2), Cm(6.1))
    _add_arrow(slide, Cm(10.4), Cm(6.1), Cm(11.4), Cm(6.1))
    _add_arrow(slide, Cm(15.6), Cm(5.5), Cm(16.6), Cm(4.5))
    _add_arrow(slide, Cm(15.6), Cm(6.7), Cm(16.6), Cm(7.7))
    _add_arrow(slide, Cm(20.8), Cm(4.5), Cm(23.2), Cm(4.5), color=SUCCESS)
    _add_arrow(slide, Cm(20.8), Cm(7.7), Cm(23.2), Cm(7.7), color=SUCCESS)
    _add_arrow(slide, Cm(20.8), Cm(6.1), Cm(28.6), Cm(6.1), color=ACCENT)

    _add_text(
        slide,
        Cm(1), Cm(10.2), Cm(31), Cm(6),
        [
            "1. 用户从 TUI 提交主题或模板，TUI 只把事件转交给 orchestrator。",
            "2. orchestrator 构造 StageMessage，并逐阶段调用 stage.run(...)。",
            "3. stage 需要 LLM 时，经 ProviderRegistry 选择 provider；需要外部能力时调用 MCP Tool 或 Docker Sandbox。",
            "4. 每次 LLM 调用写 TraceEvent 到 JSONL；每个阶段可把输入/输出 StageMessage 成对落入 SQLite checkpoint。",
            "5. 最终 artifacts 为论文正文、BibTeX、验证结果与导出产物。",
        ],
        size=14,
    )


def add_pipeline_slide(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_header(slide, prs.slide_width, "5 · 端到端核心流水线")

    stages = [
        "intent / clarify",
        "format_stage",
        "outline",
        "draft / refine",
        "cite_fetch",
        "verify_refs / fact_verify",
        "export_latex / pdf / docx",
    ]
    captions = [
        "识别主题、补齐字段、决定是否继续追问",
        "抽取版式、引用风格、章节结构",
        "生成章节树与写作计划",
        "逐节成稿并按反馈修订",
        "补齐引用元数据与 bib 条目",
        "检查真实性、可访问性、事实一致性",
        "生成论文文件与最终工件",
    ]
    box_w = Cm(4.1)
    y = Cm(4.1)
    for i, (stage_name, caption) in enumerate(zip(stages, captions, strict=True)):
        x = Cm(0.8 + i * 4.75)
        _add_box(slide, x, y, box_w, Cm(3.3), stage_name, [caption], fill=LIGHT_BLUE if i % 2 == 0 else LIGHT_ORANGE, body_size=11, rounded=True)
        if i < len(stages) - 1:
            _add_arrow(slide, x + box_w, y + Cm(1.65), x + Cm(4.65), y + Cm(1.65))

    _add_box(
        slide,
        Cm(1), Cm(9.2), Cm(31), Cm(6.8),
        "流水线控制特征",
        [
            "统一签名：绝大多数 stage 形如 async run(msg: StageMessage, registry=...) -> StageMessage。",
            "sequential.py 负责主链路顺序驱动；parallel.py 用于综述类任务的分支并发；survey.py 管理 survey 专用流程。",
            "format / export 等可利用 stage_cache 与 snapshot_runner，减少重复成本。",
            "失败时可依据 checkpoint 回到某个 stage 的输入/输出对继续执行，而不是整条链路重跑。",
        ],
        fill=LIGHT_GREEN,
        body_size=13,
    )


def add_module_collaboration_slide(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_header(slide, prs.slide_width, "6 · 模块协同架构图（核心运行面）")

    _add_box(
        slide,
        Cm(1.0), Cm(3.0), Cm(6.6), Cm(2.4),
        "TUI",
        ["commands.py", "progress.py", "task_panel.py"],
        fill=LIGHT_BLUE,
        body_size=11,
        rounded=True,
    )
    _add_box(
        slide,
        Cm(8.6), Cm(3.0), Cm(7.5), Cm(2.4),
        "Orchestrator",
        ["sequential.py", "parallel.py", "survey.py"],
        fill=LIGHT_ORANGE,
        body_size=11,
        rounded=True,
    )
    _add_box(
        slide,
        Cm(17.2), Cm(3.0), Cm(8.4), Cm(2.4),
        "Stages",
        ["format / outline / draft", "cite / verify / export"],
        fill=LIGHT_GREEN,
        body_size=11,
        rounded=True,
    )
    _add_box(
        slide,
        Cm(26.6), Cm(3.0), Cm(5.2), Cm(2.4),
        "Contract",
        ["StageMessage"],
        fill=LIGHT_BLUE,
        body_size=11,
        rounded=True,
    )

    _add_box(
        slide,
        Cm(1.0), Cm(7.0), Cm(7.7), Cm(3.0),
        "Provider 子系统",
        ["registry.py", "factory.py", "sama.py", "failover.py"],
        fill=RGBColor(0xE9, 0xF1, 0xFF),
        body_size=11,
    )
    _add_box(
        slide,
        Cm(9.4), Cm(7.0), Cm(7.7), Cm(3.0),
        "Tool / Sandbox 子系统",
        ["tools/* (MCP)", "sandbox/runner.py", "sandbox/replay_runner.py"],
        fill=RGBColor(0xFF, 0xF3, 0xE7),
        body_size=11,
    )
    _add_box(
        slide,
        Cm(17.8), Cm(7.0), Cm(7.7), Cm(3.0),
        "Persistence 子系统",
        ["db.py", "checkpoint.py", "snapshots.py", "transcript.py"],
        fill=RGBColor(0xE9, 0xF5, 0xEC),
        body_size=11,
    )
    _add_box(
        slide,
        Cm(26.2), Cm(7.0), Cm(6.0), Cm(3.0),
        "Observability",
        ["trace.py", "pricing.py", "llm_call_history.py"],
        fill=RGBColor(0xF1, 0xEE, 0xFF),
        body_size=11,
    )

    _add_arrow(slide, Cm(7.6), Cm(4.2), Cm(8.6), Cm(4.2))
    _add_arrow(slide, Cm(16.1), Cm(4.2), Cm(17.2), Cm(4.2))
    _add_arrow(slide, Cm(25.6), Cm(4.2), Cm(26.6), Cm(4.2))

    _add_arrow(slide, Cm(20.8), Cm(5.4), Cm(4.8), Cm(7.0), color=ACCENT)
    _add_arrow(slide, Cm(21.0), Cm(5.4), Cm(13.2), Cm(7.0), color=ACCENT)
    _add_arrow(slide, Cm(21.2), Cm(5.4), Cm(21.6), Cm(7.0), color=ACCENT)
    _add_arrow(slide, Cm(21.4), Cm(5.4), Cm(29.2), Cm(7.0), color=ACCENT)

    _add_text(
        slide,
        Cm(1.0), Cm(11.2), Cm(31), Cm(5.4),
        [
            "交互面（TUI）与决策面（core）完全解耦，核心流程由 orchestrator 驱动 stage 链并向下调用 provider/tool/persistence/trace。",
            "Contract 层通过 StageMessage 统一了跨模块边界，避免上层直接依赖底层实现细节，实现低耦合和可替换。",
        ],
        size=13,
    )


def add_clarify_slide(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_header(slide, prs.slide_width, "6 · 算法一：渐进式澄清（Clarify）")
    _add_formula_box(
        slide,
        Cm(1.0), Cm(2.35), Cm(31.0), Cm(1.9),
        "stop ⇔ (min_{f∈must_have} conf(f) ≥ τ_f) ∧ (coverage > τ_c) ∧ (H(gap) < τ_e)",
        subtitle="coverage = mean(conf),  gap = 1 - conf,  H 为归一化 Shannon 熵",
    )
    _add_box(
        slide,
        Cm(1), Cm(4.6), Cm(14.5), Cm(10.0),
        "真实停止条件（app/core/clarify/entropy.py）",
        [
            "每个字段有置信度 f∈[0,1]：未知=0.0，用户画像预填=0.4，用户显式回答=1.0。",
            "coverage = mean(f)；表示整体信息覆盖率。",
            "gap = 1-f；对 gap 分布计算归一化 Shannon 熵。",
            "must_have 字段若任意低于 tau_f，则继续追问。",
            "若 coverage <= tau_c，则继续追问。",
            "若 entropy >= tau_e，则说明“多个字段都还不确定”，继续追问。",
            "默认阈值：tau_e=0.7, tau_f=0.3, tau_c=0.6。",
        ],
        fill=LIGHT_BLUE,
        body_size=12,
    )
    _add_box(
        slide,
        Cm(17), Cm(4.6), Cm(15.2), Cm(10.0),
        "状态机示意",
        [
            "状态 A：字段稀缺，进入 ClarifyModal 逐步追问。",
            "状态 B：有些字段来自 profile，可信但未确认。",
            "状态 C：关键信息补齐，coverage 上升，entropy 下降。",
            "状态 D：达到 should_stop=True，切到 format / outline。",
            "next_question.py 负责找“信息增益最大”的下一个问题。",
            "好处：避免固定问卷式交互，最少问题数就能到达可执行状态。",
        ],
        fill=LIGHT_ORANGE,
        body_size=12,
    )
    _add_text(
        slide,
        Cm(1), Cm(15.2), Cm(31), Cm(2.5),
        [
            "算法本质：不是“问满固定字段再继续”，而是根据不确定性分布动态决定是否继续问，从而兼顾交互成本与信息充分性。"
        ],
        size=15,
        color=PRIMARY,
    )


def add_sama_slide(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_header(slide, prs.slide_width, "7 · 算法二：SAMA 模型分配")
    _add_formula_box(
        slide,
        Cm(1.0), Cm(2.35), Cm(31.0), Cm(1.9),
        "score(stage,p) = Σ_i w_stage[i]·v_p[i] − λ_cost·cost_norm(p)",
        subtitle="i ∈ {chat, code, long_ctx, speed, cost_axis};  route(stage)=argmax_p score(stage,p)",
    )
    _add_box(
        slide,
        Cm(1), Cm(4.6), Cm(15.5), Cm(9.6),
        "真实打分模型（app/providers/sama.py）",
        [
            "Capability 先映射为 5 维轴：chat / code / long_ctx / speed / cost。",
            "chat：支持 CHAT 记 1.0，否则 0.0。",
            "code：支持 TOOLS 记 0.8，否则 0.5。",
            "long_ctx：context_window / 128000 截断到 [0,1]。",
            "speed：支持 STREAM 记 0.8，否则 0.4。",
            "cost 轴不直接放进向量，而由 lambda_cost 单独惩罚。",
            "score = w_stage · v(provider) - lambda_cost * normalized_cost。",
        ],
        fill=LIGHT_BLUE,
        body_size=12,
    )
    _add_box(
        slide,
        Cm(18), Cm(4.6), Cm(14.2), Cm(9.6),
        "Stage 权重差异",
        [
            "format: (0.7, 0.4, 0.9, 0.4, 0.0) 重视长上下文与对话。",
            "clarify: (0.9, 0.2, 0.4, 0.8, 0.0) 重视对话与响应速度。",
            "draft: (0.9, 0.4, 0.9, 0.3, 0.0) 重视对话质量与长上下文。",
            "code: (0.5, 0.95, 0.7, 0.5, 0.0) 明显偏向代码能力。",
            "fact_verify: (0.8, 0.3, 0.7, 0.6, 0.0) 强调稳定推理与速度。",
            "无候选时抛 NoCandidatesError；未配置 stage 则抛 StageNotConfiguredError。",
        ],
        fill=LIGHT_GREEN,
        body_size=12,
    )
    _add_text(
        slide,
        Cm(1), Cm(14.7), Cm(31), Cm(2.2),
        [
            "工程价值：把“模型选择”从业务 stage 内部拿出来，收敛为纯函数路由问题，既可解释，也便于后续扩展多 provider。"
        ],
        size=15,
        color=PRIMARY,
    )


def add_sama_numeric_slide(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_header(slide, prs.slide_width, "9 · SAMA 数值化示例（可解释路由）")
    _add_formula_box(
        slide,
        Cm(1), Cm(2.35), Cm(31), Cm(1.9),
        "score = dot(w_stage, v_provider) - λ·cost_norm",
        subtitle="以 stage=code 为例，展示不同 provider 在同一权重下的可解释对比",
    )
    _add_box(
        slide,
        Cm(1), Cm(4.55), Cm(31), Cm(3.0),
        "评分公式",
        [
            "其中 i ∈ {chat, code, long_ctx, speed, cost_axis}，而 cost_axis 在当前实现中固定 0，由 λ 单独惩罚。",
            "route(stage, candidates) 取 score 最大 provider；如并列由标签稳定排序保证可重复性。",
        ],
        fill=LIGHT_BLUE,
        body_size=12,
    )
    _add_box(
        slide,
        Cm(1), Cm(8.0), Cm(15.3), Cm(8.0),
        "输入假设",
        [
            "stage = code，w=(0.5, 0.95, 0.7, 0.5, 0.0)",
            "Provider A: v=(1.0, 0.8, 0.9, 0.8, 0), cost_norm=0.7",
            "Provider B: v=(1.0, 0.5, 1.0, 0.4, 0), cost_norm=0.2",
            "λ=0.3",
        ],
        fill=LIGHT_ORANGE,
        body_size=12,
    )
    _add_box(
        slide,
        Cm(17), Cm(8.0), Cm(15.0), Cm(8.0),
        "计算结果",
        [
            "A: dot = 0.5*1.0 + 0.95*0.8 + 0.7*0.9 + 0.5*0.8 = 2.29",
            "A: score = 2.29 - 0.3*0.7 = 2.08",
            "B: dot = 0.5*1.0 + 0.95*0.5 + 0.7*1.0 + 0.5*0.4 = 1.875",
            "B: score = 1.875 - 0.3*0.2 = 1.815",
            "决策：A 胜出；当 λ 上升时，低成本模型将更容易胜出。",
        ],
        fill=LIGHT_GREEN,
        body_size=12,
    )


def add_format_verify_slide(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_header(slide, prs.slide_width, "8 · 算法三：格式抽取、引用绑定与事实核验")
    _add_box(
        slide,
        Cm(1), Cm(3), Cm(10), Cm(11.5),
        "Format 抽取",
        [
            "输入：样例 PDF、venue_label 或投稿规范。",
            "pdfplumber 先抽正文；若文本缺失，回退 OCR。",
            "prompt 模板 format_extract.j2 驱动 LLM 输出结构化格式规格。",
            "对内置 venue（IEEE/CJC/Springer）可走缓存命中，减少重复调用。",
        ],
        fill=LIGHT_BLUE,
        body_size=12,
    )
    _add_box(
        slide,
        Cm(11.6), Cm(3), Cm(10), Cm(11.5),
        "Cite Fetch / Bind",
        [
            "从 draft 文本中识别候选参考文献和占位 bibkey。",
            "调用 DOI / Crossref / arXiv 等外部数据源补全文献元数据。",
            "生成或绑定 BibTeX 条目，并把 citations 写回 payload。",
            "为后续 verify_refs 与 export_* 准备结构化输入。",
        ],
        fill=LIGHT_ORANGE,
        body_size=12,
    )
    _add_box(
        slide,
        Cm(22.2), Cm(3), Cm(10), Cm(11.5),
        "Verify Refs / Fact Verify",
        [
            "verify_refs：检查引用是否真实存在、字段是否可解析。",
            "fact_verify：把论文中的事实表述回投到来源文本做 round-trip 校验。",
            "lenient 模式下，未解析 bibkey 可降级 warning，保证样例回放稳定。",
            "输出 verify_status / verify_warnings 进入最终导出与审计链。",
        ],
        fill=LIGHT_GREEN,
        body_size=12,
    )


def add_provider_slide(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_header(slide, prs.slide_width, "9 · Provider 抽象：统一协议而非厂商分支")
    _add_box(
        slide,
        Cm(1), Cm(3), Cm(14.5), Cm(11.8),
        "Provider 基类（app/providers/base.py）",
        [
            "chat(request) -> ChatResponse：标准单次补全接口。",
            "stream(request) -> AsyncIterator[str]：标准流式接口。",
            "probe() -> Capability：启动或定期刷新能力侧写。",
            "ChatRequest 统一消息结构、温度、tools、response_format、stream 等参数。",
            "ChatResponse 统一 content / model / token 统计 / raw 响应。",
        ],
        fill=LIGHT_BLUE,
        body_size=12,
    )
    _add_box(
        slide,
        Cm(17), Cm(3), Cm(15.2), Cm(11.8),
        "工程原则",
        [
            "所有模型调用必须经 ProviderRegistry；stage 不直接 import OpenAI/Anthropic SDK。",
            "当前唯一具体适配器是 OpenAICompatibleProvider，所有端点都按 Chat Completions v1 对接。",
            "好处：厂商差异被压缩到 provider 层；上层只关心 ChatRequest / ChatResponse。",
            "failover.py 用于多端点回退；factory.py 根据配置装配 registry。",
            "未来扩展本质是“再接一个符合协议的端点”，而不是侵入每个 stage。",
        ],
        fill=LIGHT_GREEN,
        body_size=12,
    )


def add_observability_slide(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_header(slide, prs.slide_width, "10 · 可观测性与恢复机制")
    _add_box(
        slide,
        Cm(1), Cm(3), Cm(10), Cm(11.2),
        "Trace JSONL",
        [
            "路径：~/.folio/trace/<YYYY-MM-DD>.jsonl。",
            "字段：run_id / stage / provider_label / model / tokens / cost / latency / hash。",
            "每次 LLM 调用一行，线程内写入有锁。",
            "用于 HUD 成本聚合、问题排查、审计导出。",
        ],
        fill=LIGHT_BLUE,
        body_size=12,
    )
    _add_box(
        slide,
        Cm(11.6), Cm(3), Cm(10), Cm(11.2),
        "Checkpoint",
        [
            "以 (input_msg, output_msg) 成对保存某 stage 的快照。",
            "字段包括 run_id / stage_name / checkpoint_num / note / created_at。",
            "失败后可以从中间 stage 恢复，而不是整条流水线重跑。",
            "本质上是对 StageMessage 时序状态的持久化。",
        ],
        fill=LIGHT_ORANGE,
        body_size=12,
    )
    _add_box(
        slide,
        Cm(22.2), Cm(3), Cm(10), Cm(11.2),
        "Snapshot / Resume",
        [
            "snapshots.py 与 snapshot_runner.py 管理阶段产物的读取与重放。",
            "CLI/TUI 提供 :resume 与 resume 子命令恢复历史运行。",
            "llm_call_history.py 为界面提供调用历史与成本面板。",
            "这套机制把“实验性 LLM 工作流”变成“可恢复工程系统”。",
        ],
        fill=LIGHT_GREEN,
        body_size=12,
    )


def add_testing_slide(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_header(slide, prs.slide_width, "11 · 测试与可复现性")
    _add_box(
        slide,
        Cm(1), Cm(3), Cm(15.5), Cm(10.8),
        "Cassette 策略",
        [
            "运行时不允许 MockProvider；测试也不在 CI 真打线上 LLM。",
            "采用 pytest-recording / vcrpy，一次录制，多次回放。",
            "FOLIO_TEST_RECORD_MODE=true 时允许录制；默认 record_mode='none'。",
            "缺 cassette 直接失败，防止 CI 偷偷联网。",
        ],
        fill=LIGHT_BLUE,
        body_size=12,
    )
    _add_box(
        slide,
        Cm(17), Cm(3), Cm(15.2), Cm(10.8),
        "样例画廊 / 黄金回归",
        [
            "scripts/build_sample_gallery.py 会用已录好的 e2e cassette 重新生成 examples/<demo>/expected。",
            "冻结产物包括 LaTeX bundle 与 payload.json；用于回归比对。",
            "因为回放是确定性的，重复执行应得到字节级稳定产物。",
            "这保证了“论文生成”这种高波动任务也能纳入工程化回归测试。",
        ],
        fill=LIGHT_GREEN,
        body_size=12,
    )
    _add_text(
        slide,
        Cm(1), Cm(14.6), Cm(31), Cm(2),
        ["可复现性核心不只是测试通过，而是任何一次重要 LLM 交互都能被重放、追踪和解释。"],
        size=15,
        color=PRIMARY,
    )


def add_reliability_complexity_slide(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_header(slide, prs.slide_width, "13 · 复杂度与可靠性设计")
    _add_box(
        slide,
        Cm(1), Cm(3), Cm(10), Cm(11.8),
        "时间复杂度（高层）",
        [
            "串行编排：O(N_stage) 次 stage 调用。",
            "SAMA 路由：每个 stage 对 K 个候选评分，O(K)。",
            "澄清循环：O(Q) 次问答，Q 由熵收敛速度决定。",
            "引用核验：O(R) 文献条目处理，R 为引用数。",
            "总体近似：O(N_stage*K + Q + R)。",
        ],
        fill=LIGHT_BLUE,
        body_size=12,
    )
    _add_box(
        slide,
        Cm(11.6), Cm(3), Cm(10), Cm(11.8),
        "失败恢复机制",
        [
            "Provider failover：端点级回退，避免单点 provider 故障中断。",
            "checkpoint：按 stage 保存输入/输出对，支持中断续跑。",
            "snapshot/replay：阶段结果重放，降低重算成本。",
            "lenient verify：在样例回放场景下将部分错误降级 warning。",
            "cassette replay：CI 不依赖外网，确保稳定。",
        ],
        fill=LIGHT_ORANGE,
        body_size=12,
    )
    _add_box(
        slide,
        Cm(22.2), Cm(3), Cm(10), Cm(11.8),
        "工程权衡",
        [
            "准确率 vs 成本：由 λ_cost 与 stage 权重共同调节。",
            "交互成本 vs 信息充分：由 tau_e/tau_f/tau_c 三阈值平衡。",
            "吞吐 vs 可解释：显式 stage + trace 增加开销但显著提升可审计性。",
            "实现复杂度 vs 扩展性：统一契约与抽象层提高初始复杂度，但降低长期维护成本。",
        ],
        fill=LIGHT_GREEN,
        body_size=12,
    )


def add_future_slide(prs: Presentation) -> None:
    slide = prs.slides.add_slide(prs.slide_layouts[6])
    _add_header(slide, prs.slide_width, "12 · 演进路线与技术价值")
    _add_box(
        slide,
        Cm(1), Cm(3), Cm(31), Cm(11.8),
        "为什么这个架构成立",
        [
            "把“论文生成”拆成可解释 stage 后，复杂系统被化约成“统一消息 + 可替换执行器 + 外部能力插件”。",
            "TUI 与核心解耦，保证未来即便换 CLI / Web 前端，也不需要重写业务逻辑。",
            "Provider 协议统一，避免模型供应商变化导致上层 stage 大面积重构。",
            "trace + checkpoint + cassette 三件套，分别覆盖在线审计、失败恢复、离线复现。",
            "下一阶段重点：M2 多 provider 路由与 profile；M3 代码实验闭环；M4 全量 provenance 与 plagiarism；M5 产品化交付。",
        ],
        fill=LIGHT_ORANGE,
        body_size=14,
    )


def build() -> None:
    prs = Presentation()
    # 16:9
    prs.slide_width = Cm(33.867)
    prs.slide_height = Cm(19.05)

    # 1. 封面
    add_title_slide(prs)

    add_system_context_slide(prs)
    add_layered_arch_slide(prs)
    add_contract_slide(prs)
    add_runtime_flow_slide(prs)
    add_pipeline_slide(prs)
    add_module_collaboration_slide(prs)

    add_section_slide(prs, "7 · 目标场景与 MVP（M1）", [
        "# 北极星 Demo",
        "用户拖入一篇 IEEE 样例 PDF + 主题 “transformer 时序预测” →",
        "Folio 询问 3–5 个澄清问题 → 抽取 IEEE 格式 → 生成 8 页论文 + 已核验引用 → 导出 .tex / .pdf。",
        "# 里程碑路线",
        "M0 引导（项目骨架、契约、CI、TUI hello）",
        "M1 format_to_paper 端到端薄切片（当前已贯通）",
        "M2 多 Provider 路由 + 深度澄清",
        "M3 Docker 沙箱代码实验",
        "M4 全溯源 + 抄袭自检 + 审计导出",
        "M5 打包发行、配置向导、文档站、样例画廊",
    ])

    add_section_slide(prs, "8 · 技术栈与硬约束", [
        "# 技术栈",
        "语言：Python 3.11+，包管理：uv（lock 文件锁版本）。",
        "TUI：Textual + Rich（async 事件循环，支持流式输出）。",
        "持久化：SQLite + Alembic；存储根 ~/.folio/。",
        "代码执行：Docker 沙箱（tectonic 编译 LaTeX、隔离用户实验）。",
        "外部能力：MCP Client（fetch / arxiv / playwright / context7 …）。",
        "# 硬约束（AGENTS.md）",
        "TUI 哑端；所有 LLM 调用必须经 ProviderRegistry。",
        "跨阶段值统一为 StageMessage，禁止裸 dict / str。",
        "每次 LLM 调用必写 trace 记录；运行时不允许 MockProvider。",
        "Provider 层供应商无关：唯一适配器 OpenAICompatibleProvider（OpenAI Chat Completions v1）。",
    ])
    add_clarify_slide(prs)
    add_sama_slide(prs)
    add_sama_numeric_slide(prs)
    add_format_verify_slide(prs)
    add_provider_slide(prs)
    add_observability_slide(prs)
    add_testing_slide(prs)
    add_reliability_complexity_slide(prs)
    add_future_slide(prs)

    add_section_slide(prs, "15 · 小结", [
        "Folio 把“TUI + 纯域核心 + 可替换 Provider/Tool/Sandbox”做到了硬约束级别，避免了 IntelliGen 的耦合教训。",
        "核心抽象只有两件事：StageMessage（数据契约）+ Capability/SAMA（调度契约）。",
        "算法侧：Clarify 决定“是否继续追问”，SAMA 决定“当前阶段用谁做”，Verify 决定“结果是否可信”。",
        "工程侧：cassette 回放 + JSONL trace + SQLite checkpoint 共同保证可复现、可审计、可续跑。",
        "下一步：M2 多 Provider 路由 → M3 沙箱实验 → M4 全溯源 → M5 打包发行。",
    ])

    saved = _save_with_fallback(prs, OUTPUT)
    print(f"已生成: {saved}")


if __name__ == "__main__":
    build()
