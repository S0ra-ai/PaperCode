# SPDX-License-Identifier: MPL-2.0
"""ExportDocx stage — convert `paper.tex` to `paper.docx` via pandoc.

Same skip-on-missing policy as `export_pdf`.
"""

from __future__ import annotations

import asyncio
import shutil
from datetime import UTC, datetime
from pathlib import Path

from app.core.contract import StageMessage, StageRecord

STAGE = "export_docx"


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


async def run(msg: StageMessage) -> StageMessage:
    started = datetime.now(UTC)
    tex_path = Path(msg.payload["exports"]["tex"])
    bib_path = Path(msg.payload["exports"]["bib"])
    work = tex_path.parent
    docx_path = work / (tex_path.stem + ".docx")

    cmd: list[str] | None
    if shutil.which("pandoc"):
        cmd = [
            "pandoc",
            "-s",
            tex_path.name,
            "--bibliography",
            bib_path.name,
            "-o",
            docx_path.name,
        ]
        backend = "host-pandoc"
    elif shutil.which("docker"):
        cmd = [
            "docker",
            "run",
            "--rm",
            "-v",
            f"{work}:/work",
            "-w",
            "/work",
            "pandoc/latex",
            "-s",
            tex_path.name,
            "--bibliography",
            bib_path.name,
            "-o",
            docx_path.name,
        ]
        backend = "docker-pandoc"
    else:
        cmd = None
        backend = "none"

    note: str
    if cmd is None:
        note = "skipped: no pandoc / docker on host"
    else:
        rc, _out, err = await _run(*cmd, cwd=work)
        if rc == 0 and docx_path.exists():
            note = f"converted via {backend}"
        else:
            note = f"{backend} failed (rc={rc}): {err[-300:]}"

    new = msg.model_copy(deep=True)
    new.payload.setdefault("exports", {})
    if docx_path.exists():
        new.payload["exports"]["docx"] = str(docx_path)
    else:
        new.payload["exports"]["docx_skipped_reason"] = note

    record = StageRecord(
        stage=STAGE,
        started_at=started,
        finished_at=datetime.now(UTC),
        note=note,
    )
    return new.with_record(record)
