# SPDX-License-Identifier: MPL-2.0
# ruff: noqa: RUF002, RUF003
"""ExportPDF stage — compile `paper.tex` to `paper.pdf`.

后端按优先级逐个尝试，第一个能跑的就用：

1. ``$FOLIO_LATEX_ENGINE`` 显式指定（tectonic / latexmk / xelatex / pdflatex / lualatex）
2. host ``tectonic``（含 ``~/.folio/bin/tectonic``）—— 单文件、无需本地 TeX 发行版
3. host ``latexmk`` —— TeX Live / MiKTeX 自带，自动多遍编译，处理交叉引用最稳
4. host ``xelatex`` —— Unicode/CJK 友好，适合中文论文（CJC 模板等）
5. host ``pdflatex`` —— 经典选择，MiKTeX 默认装好
6. host ``lualatex`` —— 现代替代
7. docker ``tectonictypesetting/tectonic`` —— 上述都没装时兜底
8. ``$FOLIO_AUTO_INSTALL_TECTONIC=1`` —— 全部缺失时自动下载 tectonic 静态二进制
   到 ``~/.folio/bin/`` 后重试（即"pip install"等价体验）

任何后端都跑不了就 ``skipped``，``payload['exports']['pdf']`` 缺失，
不阻塞流水线。
"""

from __future__ import annotations

import asyncio
import os
import shutil
from collections.abc import Sequence
from datetime import UTC, datetime
from pathlib import Path

from app.core.contract import StageMessage, StageRecord
from app.sandbox import tectonic_installer

STAGE = "export_pdf"


async def _run(*cmd: str, cwd: Path) -> tuple[int, str, str]:
    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=str(cwd),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out_b, err_b = await proc.communicate()
    return (
        proc.returncode or 0,
        out_b.decode("utf-8", errors="replace"),
        err_b.decode("utf-8", errors="replace"),
    )


def _backend_command(name: str, tex_name: str, work: Path) -> list[str] | None:
    """Return argv for ``name``, or None if the binary is missing."""
    if name == "tectonic":
        binary = tectonic_installer.discover()
        if binary is not None:
            return [str(binary), "-X", "compile", tex_name]
        return None
    if name == "latexmk" and shutil.which("latexmk"):
        # -xelatex 兼容中文最稳；-interaction=nonstopmode 防止卡住。
        return [
            "latexmk",
            "-xelatex",
            "-interaction=nonstopmode",
            "-halt-on-error",
            tex_name,
        ]
    if name == "xelatex" and shutil.which("xelatex"):
        return ["xelatex", "-interaction=nonstopmode", "-halt-on-error", tex_name]
    if name == "pdflatex" and shutil.which("pdflatex"):
        return ["pdflatex", "-interaction=nonstopmode", "-halt-on-error", tex_name]
    if name == "lualatex" and shutil.which("lualatex"):
        return ["lualatex", "-interaction=nonstopmode", "-halt-on-error", tex_name]
    if name == "docker-tectonic" and shutil.which("docker"):
        return [
            "docker",
            "run",
            "--rm",
            "-v",
            f"{work}:/work",
            "-w",
            "/work",
            "tectonictypesetting/tectonic",
            "-X",
            "compile",
            tex_name,
        ]
    return None


def _resolve_backends() -> Sequence[str]:
    forced = os.environ.get("FOLIO_LATEX_ENGINE", "").strip().lower()
    default_chain = (
        "tectonic",
        "latexmk",
        "xelatex",
        "pdflatex",
        "lualatex",
        "docker-tectonic",
    )
    if not forced:
        return default_chain
    # 显式指定时把它放到链首，其余作为 fallback。
    rest = tuple(b for b in default_chain if b != forced)
    return (forced, *rest)


async def run(msg: StageMessage) -> StageMessage:
    started = datetime.now(UTC)
    tex_path = Path(msg.payload["exports"]["tex"])
    work = tex_path.parent
    candidate = work / (tex_path.stem + ".pdf")

    pdf_path: Path | None = None
    note: str
    attempts: list[str] = []
    last_stderr: str = ""
    auto_install_enabled = os.environ.get(
        "FOLIO_AUTO_INSTALL_TECTONIC", ""
    ).strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    auto_installed = False

    backend_chain = list(_resolve_backends())
    backend_idx = 0
    while backend_idx < len(backend_chain):
        backend = backend_chain[backend_idx]
        backend_idx += 1
        cmd = _backend_command(backend, tex_path.name, work)
        if cmd is None:
            # 所有后端都没找到时，最后兜底：按需下载 tectonic 静态二进制
            if (
                backend_idx == len(backend_chain)
                and pdf_path is None
                and not auto_installed
                and auto_install_enabled
            ):
                installed = tectonic_installer.ensure_tectonic(auto=True)
                auto_installed = True
                if installed is not None:
                    attempts.append("auto-install=tectonic")
                    backend_chain.append("tectonic")
            continue
        rc, _stdout, stderr = await _run(*cmd, cwd=work)
        last_stderr = stderr
        if rc == 0 and candidate.exists():
            pdf_path = candidate
            note = f"compiled via {backend}"
            attempts.append(f"{backend}=ok")
            break
        attempts.append(f"{backend}=rc{rc}")
    if pdf_path is None:
        if attempts:
            note = "all backends failed: " + ", ".join(attempts)
            if last_stderr:
                note += f" — {last_stderr[-200:]}"
        else:
            note = (
                "skipped: no LaTeX engine on host "
                "(install tectonic / MiKTeX / TeX Live, set "
                "FOLIO_AUTO_INSTALL_TECTONIC=1 to auto-download, or use docker)"
            )

    new = msg.model_copy(deep=True)
    new.payload.setdefault("exports", {})
    if pdf_path is not None:
        new.payload["exports"]["pdf"] = str(pdf_path)
    else:
        new.payload["exports"]["pdf_skipped_reason"] = note

    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        note=note,
    )
    return new.with_record(record)
