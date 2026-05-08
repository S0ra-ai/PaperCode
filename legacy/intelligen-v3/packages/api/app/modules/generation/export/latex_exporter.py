"""Markdown → LaTeX 转换器，集成 BibTeX 支持。"""

from __future__ import annotations

import io
import re
import zipfile
import logging

from .bibtex_generator import BibTeXGenerator

logger = logging.getLogger(__name__)


class LaTeXExporter:
    """将 Markdown 转换为 LaTeX 格式，支持 BibTeX 引用、数学公式和表格。"""

    DOCUMENT_TEMPLATE = r"""\documentclass[12pt,a4paper]{{article}}
\usepackage[utf8]{{inputenc}}
\usepackage[T1]{{fontenc}}
\usepackage{{ctex}}
\usepackage{{amsmath,amssymb}}
\usepackage{{graphicx}}
\usepackage{{hyperref}}
\usepackage{{booktabs}}
\usepackage{{geometry}}
\usepackage{{natbib}}
\usepackage{{listings}}
\usepackage{{xcolor}}
\usepackage{{float}}
\usepackage{{enumitem}}

\geometry{{left=2.5cm,right=2.5cm,top=2.5cm,bottom=2.5cm}}

\lstset{{
  basicstyle=\ttfamily\small,
  breaklines=true,
  frame=single,
  numbers=left,
  numberstyle=\tiny\color{{gray}},
  keywordstyle=\color{{blue}},
  commentstyle=\color{{gray}},
  stringstyle=\color{{red}},
  showstringspaces=false,
  tabsize=4,
}}

\hypersetup{{
  colorlinks=true,
  linkcolor=blue,
  citecolor=blue,
  urlcolor=blue,
}}

\title{{{title}}}
\author{{{author}}}
\date{{{date}}}

\begin{{document}}

\maketitle

{abstract_block}

{keywords_block}

\tableofcontents
\newpage

{body}

{bibliography_block}

\end{{document}}
"""

    def __init__(self, title: str = "", author: str = "", date: str = ""):
        self.title = title
        self.author = author
        self.date = date or r"\today"

    def export(
        self,
        markdown: str,
        citations: list[dict] | None = None,
        citation_style: str = "GB/T 7714",
        abstract: str = "",
        keywords: str = "",
    ) -> tuple[str, str]:
        body = self.markdown_to_latex(markdown)
        bib_gen = BibTeXGenerator()
        bib_content = bib_gen.generate_bib(citations or [])

        abstract_block = ""
        if abstract:
            abstract_block = (
                "\\begin{abstract}\n"
                + self._escape_text(abstract)
                + "\n\\end{abstract}"
            )

        keywords_block = ""
        if keywords:
            keywords_block = (
                "\\noindent\\textbf{Keywords:} "
                + self._escape_text(keywords)
            )

        bib_style = bib_gen.get_bibtex_style(citation_style)
        bibliography_block = ""
        if bib_content:
            bibliography_block = (
                f"\\bibliographystyle{{{bib_style}}}\n"
                "\\bibliography{references}"
            )

        tex_content = self.DOCUMENT_TEMPLATE.format(
            title=self._escape_text(self.title),
            author=self._escape_text(self.author),
            date=self.date,
            abstract_block=abstract_block,
            keywords_block=keywords_block,
            body=body,
            bibliography_block=bibliography_block,
        )
        return tex_content, bib_content

    def export_zip(
        self,
        markdown: str,
        citations: list[dict] | None = None,
        citation_style: str = "GB/T 7714",
        abstract: str = "",
        keywords: str = "",
    ) -> bytes:
        tex_content, bib_content = self.export(
            markdown, citations=citations, citation_style=citation_style,
            abstract=abstract, keywords=keywords,
        )
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("main.tex", tex_content.encode("utf-8"))
            if bib_content:
                zf.writestr("references.bib", bib_content.encode("utf-8"))
        return buf.getvalue()

    def markdown_to_latex(self, markdown: str) -> str:
        lines = markdown.split("\n")
        output: list[str] = []
        i = 0
        length = len(lines)

        while i < length:
            line = lines[i]

            m_code = re.match(r"^```(\w*)", line)
            if m_code:
                lang = self._normalize_language(m_code.group(1))
                code_lines: list[str] = []
                i += 1
                while i < length and not lines[i].startswith("```"):
                    code_lines.append(lines[i])
                    i += 1
                lang_opt = f"[language={lang}]" if lang else ""
                output.append(f"\\begin{{lstlisting}}{lang_opt}")
                output.extend(code_lines)
                output.append("\\end{lstlisting}")
                i += 1
                continue

            if line.strip().startswith("$$"):
                math_lines: list[str] = []
                rest = line.strip()[2:]
                if rest.endswith("$$") and rest[:-2].strip():
                    output.append("\\begin{equation}")
                    output.append(rest[:-2].strip())
                    output.append("\\end{equation}")
                    i += 1
                    continue
                if rest.strip():
                    math_lines.append(rest)
                i += 1
                while i < length:
                    if lines[i].strip().endswith("$$"):
                        before_close = lines[i].strip()[:-2]
                        if before_close.strip():
                            math_lines.append(before_close.strip())
                        break
                    math_lines.append(lines[i])
                    i += 1
                output.append("\\begin{equation}")
                output.extend(math_lines)
                output.append("\\end{equation}")
                i += 1
                continue

            m_heading = re.match(r"^(#{1,4})\s+(.*)", line)
            if m_heading:
                level = len(m_heading.group(1))
                title_text = self._convert_inline(m_heading.group(2).strip())
                cmds = {1: "section", 2: "subsection", 3: "subsubsection", 4: "paragraph"}
                output.append(f"\\{cmds[level]}{{{title_text}}}")
                i += 1
                continue

            if re.match(r"^-{3,}$", line.strip()) or re.match(r"^\*{3,}$", line.strip()):
                output.append("")
                output.append("\\bigskip\\hrule\\bigskip")
                output.append("")
                i += 1
                continue

            if line.startswith("> ") or line.strip() == ">":
                quote_lines: list[str] = []
                while i < length and (lines[i].startswith("> ") or lines[i].strip() == ">"):
                    content = lines[i][2:] if lines[i].startswith("> ") else ""
                    quote_lines.append(self._convert_inline(content))
                    i += 1
                output.append("\\begin{quote}")
                output.extend(quote_lines)
                output.append("\\end{quote}")
                continue

            if "|" in line and i + 1 < length and re.match(r"^\s*\|?[\s\-:|]+\|", lines[i + 1]):
                table_lines: list[str] = []
                while i < length and "|" in lines[i]:
                    table_lines.append(lines[i])
                    i += 1
                output.extend(self._convert_table(table_lines))
                continue

            if re.match(r"^\s*[-*+]\s+", line):
                list_items: list[str] = []
                while i < length and re.match(r"^\s*[-*+]\s+", lines[i]):
                    text = re.sub(r"^\s*[-*+]\s+", "", lines[i])
                    list_items.append(f"  \\item {self._convert_inline(text)}")
                    i += 1
                output.append("\\begin{itemize}")
                output.extend(list_items)
                output.append("\\end{itemize}")
                continue

            if re.match(r"^\s*\d+\.\s+", line):
                list_items_o: list[str] = []
                while i < length and re.match(r"^\s*\d+\.\s+", lines[i]):
                    text = re.sub(r"^\s*\d+\.\s+", "", lines[i])
                    list_items_o.append(f"  \\item {self._convert_inline(text)}")
                    i += 1
                output.append("\\begin{enumerate}")
                output.extend(list_items_o)
                output.append("\\end{enumerate}")
                continue

            m_img = re.match(r"^!\[([^\]]*)\]\(([^)]+)\)", line.strip())
            if m_img:
                alt = self._escape_text(m_img.group(1))
                url = m_img.group(2)
                output.append("\\begin{figure}[H]")
                output.append("  \\centering")
                output.append(f"  \\includegraphics[width=0.8\\textwidth]{{{url}}}")
                if alt:
                    output.append(f"  \\caption{{{alt}}}")
                output.append("\\end{figure}")
                i += 1
                continue

            if not line.strip():
                output.append("")
                i += 1
                continue

            output.append(self._convert_inline(line))
            i += 1

        return "\n".join(output)

    def _convert_inline(self, text: str) -> str:
        segments = self._split_math(text)
        result_parts: list[str] = []
        for is_math, content in segments:
            if is_math:
                result_parts.append(content)
            else:
                result_parts.append(self._convert_inline_text(content))
        return "".join(result_parts)

    def _convert_inline_text(self, text: str) -> str:
        text = self._escape_text(text)
        text = re.sub(r"!\[([^\]]*)\]\(([^)]+)\)", r"\\includegraphics[width=0.5\\textwidth]{\2}", text)
        text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\\href{\2}{\1}", text)
        text = re.sub(r"\*\*(.+?)\*\*", r"\\textbf{\1}", text)
        text = re.sub(r"\*(.+?)\*", r"\\textit{\1}", text)
        text = re.sub(r"`([^`]+)`", r"\\texttt{\1}", text)
        text = re.sub(r"\[@([^\]]+)\]", r"\\cite{\1}", text)
        text = re.sub(
            r"\[(\d+(?:\s*,\s*\d+)*)\]",
            lambda m: "\\cite{" + ",".join(f"ref{n.strip()}" for n in m.group(1).split(",")) + "}",
            text,
        )
        return text

    @staticmethod
    def _split_math(text: str) -> list[tuple[bool, str]]:
        segments: list[tuple[bool, str]] = []
        pattern = re.compile(r"(?<!\\)\$(?!\$)(.+?)(?<!\\)\$")
        last = 0
        for m in pattern.finditer(text):
            if m.start() > last:
                segments.append((False, text[last:m.start()]))
            segments.append((True, m.group(0)))
            last = m.end()
        if last < len(text):
            segments.append((False, text[last:]))
        return segments if segments else [(False, text)]

    def _convert_table(self, table_lines: list[str]) -> list[str]:
        if len(table_lines) < 2:
            return [self._convert_inline(ln) for ln in table_lines]

        def parse_row(line: str) -> list[str]:
            line = line.strip()
            if line.startswith("|"):
                line = line[1:]
            if line.endswith("|"):
                line = line[:-1]
            return [cell.strip() for cell in line.split("|")]

        header_cells = parse_row(table_lines[0])
        num_cols = len(header_cells)
        sep_cells = parse_row(table_lines[1])
        alignments = []
        for cell in sep_cells:
            cell = cell.strip()
            if cell.startswith(":") and cell.endswith(":"):
                alignments.append("c")
            elif cell.endswith(":"):
                alignments.append("r")
            else:
                alignments.append("l")
        while len(alignments) < num_cols:
            alignments.append("l")
        col_spec = " ".join(alignments[:num_cols])
        out: list[str] = []
        out.append(f"\\begin{{tabular}}{{{col_spec}}}")
        out.append("  \\toprule")
        out.append("  " + " & ".join(self._convert_inline(c) for c in header_cells) + " \\\\")
        out.append("  \\midrule")
        for row_line in table_lines[2:]:
            if re.match(r"^\s*\|?[\s\-:|]+\|?\s*$", row_line):
                continue
            cells = parse_row(row_line)
            cells = (cells + [""] * num_cols)[:num_cols]
            out.append("  " + " & ".join(self._convert_inline(c) for c in cells) + " \\\\")
        out.append("  \\bottomrule")
        out.append("\\end{tabular}")
        return out

    _SPECIAL_CHARS = re.compile(r"([&%$#_{}])")
    _TILDE = re.compile(r"~")
    _CARET = re.compile(r"\^")
    _BACKSLASH = re.compile(r"\\")

    @classmethod
    def _escape_text(cls, text: str) -> str:
        text = cls._BACKSLASH.sub(r"\\textbackslash{}", text)
        text = cls._SPECIAL_CHARS.sub(r"\\\1", text)
        text = cls._TILDE.sub(r"\\textasciitilde{}", text)
        text = cls._CARET.sub(r"\\textasciicircum{}", text)
        return text

    @staticmethod
    def _normalize_language(lang: str) -> str:
        mapping = {
            "python": "Python", "py": "Python", "javascript": "JavaScript",
            "js": "JavaScript", "typescript": "JavaScript", "ts": "JavaScript",
            "java": "Java", "c": "C", "cpp": "C++", "c++": "C++",
            "go": "Go", "ruby": "Ruby", "perl": "Perl", "php": "PHP",
            "sql": "SQL", "r": "R", "matlab": "Matlab",
            "bash": "bash", "sh": "bash", "shell": "bash",
            "html": "HTML", "xml": "XML", "tex": "TeX", "latex": "TeX",
            "json": "", "yaml": "", "yml": "",
        }
        return mapping.get(lang.lower(), lang) if lang else ""


def markdown_to_latex_zip(
    markdown_text: str,
    title: str = "",
    author: str = "",
    citations: list[dict] | None = None,
    citation_style: str = "GB/T 7714",
) -> bytes:
    """将 Markdown 转为 LaTeX + BibTeX 并打包为 ZIP。"""
    exporter = LaTeXExporter(title=title, author=author)
    return exporter.export_zip(
        markdown_text, citations=citations, citation_style=citation_style,
    )
