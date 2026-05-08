"""Code parser — analyses source files and ZIP archives to extract structure.

Supports: .py, .java, .js, .ts, .c, .cpp, .go, .rs and ZIP bundles.
"""

from __future__ import annotations

import io
import os
import re
import zipfile
import logging
from typing import Dict, List, Optional
from dataclasses import dataclass, field, asdict

logger = logging.getLogger(__name__)

SUPPORTED_EXTENSIONS = {
    ".py", ".java", ".js", ".ts", ".tsx", ".jsx",
    ".c", ".cpp", ".h", ".hpp", ".go", ".rs",
}

LANGUAGE_MAP = {
    ".py": "Python", ".java": "Java", ".js": "JavaScript", ".jsx": "JavaScript",
    ".ts": "TypeScript", ".tsx": "TypeScript",
    ".c": "C", ".cpp": "C++", ".h": "C", ".hpp": "C++",
    ".go": "Go", ".rs": "Rust",
}

# Patterns for common function/class definitions
_PATTERNS = {
    "Python": {
        "class": re.compile(r"^\s*class\s+(\w+)"),
        "function": re.compile(r"^\s*(?:async\s+)?def\s+(\w+)"),
        "import": re.compile(r"^\s*(?:from\s+\S+\s+)?import\s+(.+)"),
    },
    "Java": {
        "class": re.compile(r"(?:public|private|protected)?\s*class\s+(\w+)"),
        "function": re.compile(r"(?:public|private|protected)?\s+\w+\s+(\w+)\s*\("),
        "import": re.compile(r"^\s*import\s+(.+);"),
    },
    "JavaScript": {
        "class": re.compile(r"^\s*(?:export\s+)?class\s+(\w+)"),
        "function": re.compile(r"(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\())"),
        "import": re.compile(r"""^\s*import\s+.+\s+from\s+['"](.+)['"]"""),
    },
    "TypeScript": {
        "class": re.compile(r"^\s*(?:export\s+)?class\s+(\w+)"),
        "function": re.compile(r"(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*(?::\s*\w+)?\s*=\s*(?:async\s+)?(?:function|\())"),
        "import": re.compile(r"""^\s*import\s+.+\s+from\s+['"](.+)['"]"""),
    },
    "Go": {
        "class": re.compile(r"^\s*type\s+(\w+)\s+struct"),
        "function": re.compile(r"^\s*func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\("),
        "import": re.compile(r"""^\s*"(.+)"$"""),
    },
    "C": {
        "class": re.compile(r"^\s*(?:typedef\s+)?struct\s+(\w+)"),
        "function": re.compile(r"^\w[\w\s\*]+\s+(\w+)\s*\([^)]*\)\s*\{"),
        "import": re.compile(r'^\s*#include\s+[<"](.+)[>"]'),
    },
    "C++": {
        "class": re.compile(r"^\s*class\s+(\w+)"),
        "function": re.compile(r"^\w[\w\s\*:]+\s+(\w+)\s*\([^)]*\)\s*(?:const\s*)?\{"),
        "import": re.compile(r'^\s*#include\s+[<"](.+)[>"]'),
    },
    "Rust": {
        "class": re.compile(r"^\s*(?:pub\s+)?struct\s+(\w+)"),
        "function": re.compile(r"^\s*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)"),
        "import": re.compile(r"^\s*use\s+(.+);"),
    },
}


@dataclass
class FileInfo:
    path: str
    language: str
    size: int
    classes: List[str] = field(default_factory=list)
    functions: List[str] = field(default_factory=list)
    imports: List[str] = field(default_factory=list)
    comment_lines: int = 0
    total_lines: int = 0


@dataclass
class CodeAnalysis:
    file_tree: List[str] = field(default_factory=list)
    languages: Dict[str, int] = field(default_factory=dict)
    files: List[FileInfo] = field(default_factory=list)
    entry_points: List[str] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)
    total_files: int = 0
    total_lines: int = 0

    def to_dict(self) -> dict:
        return asdict(self)

    def summary_text(self) -> str:
        """Return a human-readable summary for LLM consumption."""
        lines = [f"Total files: {self.total_files}, Total lines: {self.total_lines}"]
        lines.append(f"Languages: {', '.join(f'{k} ({v} files)' for k, v in self.languages.items())}")
        if self.entry_points:
            lines.append(f"Entry points: {', '.join(self.entry_points)}")
        lines.append("")
        for f in self.files:
            lines.append(f"## {f.path} ({f.language}, {f.total_lines} lines)")
            if f.classes:
                lines.append(f"  Classes: {', '.join(f.classes)}")
            if f.functions:
                lines.append(f"  Functions: {', '.join(f.functions[:20])}")
            if f.imports:
                lines.append(f"  Imports: {', '.join(f.imports[:10])}")
        return "\n".join(lines)


def _detect_language(filepath: str) -> Optional[str]:
    ext = os.path.splitext(filepath)[1].lower()
    return LANGUAGE_MAP.get(ext)


def _parse_single_file(filepath: str, content: str, language: str) -> FileInfo:
    """Parse a single source file and extract structural information."""
    lines = content.split("\n")
    patterns = _PATTERNS.get(language, {})

    classes, functions, imports = [], [], []
    comment_lines = 0

    for line in lines:
        stripped = line.strip()
        # Count comment lines (simple heuristic)
        if stripped.startswith(("#", "//", "/*", "*", "<!--")):
            comment_lines += 1

        if "class" in patterns:
            m = patterns["class"].match(line)
            if m:
                classes.append(m.group(1))

        if "function" in patterns:
            m = patterns["function"].match(line)
            if m:
                name = m.group(1) or (m.group(2) if m.lastindex and m.lastindex >= 2 else None)
                if name:
                    functions.append(name)

        if "import" in patterns:
            m = patterns["import"].match(line)
            if m:
                imports.append(m.group(1).strip())

    return FileInfo(
        path=filepath,
        language=language,
        size=len(content),
        classes=classes,
        functions=functions,
        imports=imports[:50],
        comment_lines=comment_lines,
        total_lines=len(lines),
    )


def _detect_entry_points(files: List[FileInfo]) -> List[str]:
    """Heuristic detection of likely entry points."""
    entry_names = {"main", "__main__", "index", "app", "server", "cli"}
    entries = []
    for f in files:
        basename = os.path.splitext(os.path.basename(f.path))[0].lower()
        if basename in entry_names:
            entries.append(f.path)
        elif "main" in f.functions:
            entries.append(f.path)
    return entries


def parse_code_file(filename: str, content: bytes) -> CodeAnalysis:
    """Parse a single source code file."""
    language = _detect_language(filename)
    if not language:
        return CodeAnalysis(file_tree=[filename], total_files=1)

    text = content.decode("utf-8", errors="replace")
    info = _parse_single_file(filename, text, language)

    return CodeAnalysis(
        file_tree=[filename],
        languages={language: 1},
        files=[info],
        entry_points=_detect_entry_points([info]),
        dependencies=info.imports[:30],
        total_files=1,
        total_lines=info.total_lines,
    )


def parse_zip_archive(content: bytes) -> CodeAnalysis:
    """Parse a ZIP archive and analyse all supported source files."""
    analysis = CodeAnalysis()
    all_files: List[FileInfo] = []
    language_counts: Dict[str, int] = {}
    all_deps: List[str] = []

    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        for name in sorted(zf.namelist()):
            if name.endswith("/"):
                continue
            analysis.file_tree.append(name)

            language = _detect_language(name)
            if not language:
                continue

            language_counts[language] = language_counts.get(language, 0) + 1
            try:
                raw = zf.read(name)
                text = raw.decode("utf-8", errors="replace")
                info = _parse_single_file(name, text, language)
                all_files.append(info)
                all_deps.extend(info.imports)
                analysis.total_lines += info.total_lines
            except Exception as e:
                logger.warning("Failed to parse %s in ZIP: %s", name, e)

    analysis.files = all_files
    analysis.languages = language_counts
    analysis.total_files = len(all_files)
    analysis.entry_points = _detect_entry_points(all_files)
    # Deduplicate dependencies
    analysis.dependencies = list(dict.fromkeys(all_deps))[:100]

    return analysis
