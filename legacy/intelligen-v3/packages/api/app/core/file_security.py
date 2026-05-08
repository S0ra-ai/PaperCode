"""File upload security: validation, sanitization, storage isolation."""

from __future__ import annotations

import logging
import os
import re
import uuid
from pathlib import Path, PurePosixPath
from typing import Optional

logger = logging.getLogger(__name__)

# ── Allowed extensions ─────────────────────────────────────

ALLOWED_EXTENSIONS = {
    # Documents
    ".pdf", ".docx", ".doc", ".txt", ".md", ".rtf",
    # Code
    ".py", ".java", ".js", ".ts", ".c", ".cpp", ".h", ".hpp",
    ".go", ".rs", ".rb", ".php", ".swift", ".kt",
    # Archives
    ".zip", ".tar", ".gz",
    # Data
    ".csv", ".json", ".xml", ".yaml", ".yml",
    # Academic
    ".tex", ".bib",
    # Spreadsheets / presentations (from existing config)
    ".xlsx", ".xls", ".pptx", ".ppt",
}

# ── Size limits ────────────────────────────────────────────

MAX_FILE_SIZE = 50 * 1024 * 1024       # 50 MB per file
MAX_TOTAL_SIZE = 200 * 1024 * 1024     # 200 MB per user

# ── Magic number validation ────────────────────────────────

MAGIC_NUMBERS: dict[bytes, set[str]] = {
    b"%PDF":          {".pdf"},
    b"PK":            {".zip", ".docx", ".xlsx", ".pptx", ".jar"},
    b"\x1f\x8b":      {".gz", ".tar.gz"},
    b"\xd0\xcf\x11\xe0": {".doc", ".xls", ".ppt"},  # OLE2 compound doc
    b"{\\":           {".rtf"},
}

# Dangerous patterns in filenames
_UNSAFE_FILENAME_RE = re.compile(r"[^\w\-. ()\[\]]", re.UNICODE)
_PATH_TRAVERSAL_RE = re.compile(r"\.\.|[/\\]")


def _sanitize_filename(filename: str) -> str:
    """Remove path traversal and dangerous characters from filename."""
    # Strip any directory components
    name = PurePosixPath(filename).name
    name = Path(name).name  # Also handles Windows backslashes

    # Remove path traversal patterns
    name = _PATH_TRAVERSAL_RE.sub("", name)

    # Replace unsafe characters
    name = _UNSAFE_FILENAME_RE.sub("_", name)

    # Collapse multiple underscores/spaces
    name = re.sub(r"[_ ]{2,}", "_", name).strip("_. ")

    if not name:
        name = "unnamed"

    return name


def _check_magic_number(content: bytes, extension: str) -> bool:
    """Verify file content matches expected magic number for extension.

    Returns True if content is consistent with the extension, or if we
    have no magic number rule for this extension (fail-open for unknown types).
    """
    if len(content) < 4:
        return True  # Too small to check

    header = content[:8]
    for magic, allowed_exts in MAGIC_NUMBERS.items():
        if header.startswith(magic):
            # Content matches this magic number —
            # extension must be in the allowed set for this magic
            return extension in allowed_exts

    # No magic number matched — allow (plain text files, code, etc.)
    return True


def validate_upload(
    content: bytes,
    filename: str,
    user_id: str,
    current_user_total: int = 0,
) -> str:
    """Validate file extension, magic number, and size.

    Args:
        content: Raw file bytes.
        filename: Original filename from upload.
        user_id: Owner user ID.
        current_user_total: Current total bytes stored by this user.

    Returns:
        Sanitized safe filename.

    Raises:
        ValueError with descriptive message on validation failure.
    """
    if not filename:
        raise ValueError("文件名不能为空")

    # Extension check
    ext = ""
    if "." in filename:
        ext = "." + filename.rsplit(".", 1)[-1].lower()
    if ext and ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"不支持的文件类型: {ext}")

    # Size check — single file
    if len(content) > MAX_FILE_SIZE:
        max_mb = MAX_FILE_SIZE // (1024 * 1024)
        raise ValueError(f"文件大小超过限制 ({max_mb} MB)")

    # Size check — user total
    if current_user_total + len(content) > MAX_TOTAL_SIZE:
        max_mb = MAX_TOTAL_SIZE // (1024 * 1024)
        raise ValueError(f"用户存储空间已满 ({max_mb} MB)")

    # Magic number verification
    if ext and not _check_magic_number(content, ext):
        raise ValueError("文件内容与扩展名不匹配，请确认文件未被篡改")

    # Sanitize filename
    safe_name = _sanitize_filename(filename)
    return safe_name


def get_upload_path(
    base_dir: str,
    user_id: str,
    task_id: Optional[str] = None,
    filename: str = "file",
) -> Path:
    """Generate isolated upload path: base_dir/{user_id}/{task_id}/{safe_filename}.

    Creates directories as needed.
    """
    parts = [base_dir, user_id]
    if task_id:
        parts.append(task_id)

    upload_dir = Path(os.path.join(*parts))
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Add UUID prefix to avoid collisions
    unique_name = f"{uuid.uuid4().hex[:8]}_{filename}"
    return upload_dir / unique_name
