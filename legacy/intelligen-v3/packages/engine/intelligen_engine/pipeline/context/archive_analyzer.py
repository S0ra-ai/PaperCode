"""压缩包分析服务 — 解析上传的项目资料"""
from __future__ import annotations

import io
import logging
import zipfile
from pathlib import PurePosixPath
from pydantic import BaseModel

logger = logging.getLogger(__name__)

CODE_EXT = {'.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.cpp', '.c', '.h', '.go', '.rs', '.vue'}
DOC_EXT = {'.md', '.txt', '.rst', '.doc', '.docx', '.pdf'}
DATA_EXT = {'.csv', '.json', '.xml', '.yaml', '.yml', '.toml'}
IGNORE_DIRS = {'node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build'}


class FileEntry(BaseModel):
    path: str
    size: int
    category: str  # code/doc/data/other


class ArchiveAnalysis(BaseModel):
    file_tree: list[FileEntry]
    project_type: str
    file_counts: dict[str, int]
    total_files: int
    readme_content: str | None = None
    code_snippets: list[dict] = []
    suggested_topics: list[str] = []


class ArchiveAnalyzer:
    """压缩包分析器 — 提取文件结构和关键内容"""

    MAX_FILES = 200
    MAX_FILE_READ = 10 * 1024  # 10KB per file
    MAX_ZIP_SIZE = 50 * 1024 * 1024  # 50MB

    def analyze(self, zip_bytes: bytes) -> ArchiveAnalysis:
        """分析ZIP压缩包"""
        if len(zip_bytes) > self.MAX_ZIP_SIZE:
            raise ValueError(f"压缩包超过大小限制: {len(zip_bytes)} > {self.MAX_ZIP_SIZE}")

        with zipfile.ZipFile(io.BytesIO(zip_bytes), 'r') as zf:
            # 安全检查：防止zip炸弹
            total_uncompressed = sum(i.file_size for i in zf.infolist())
            if total_uncompressed > self.MAX_ZIP_SIZE * 10:
                raise ValueError("疑似ZIP炸弹，解压后体积过大")

            entries = self._build_entries(zf)
            readme = self._find_readme(zf, entries)
            snippets = self._extract_code_snippets(zf, entries)
            project_type = self._detect_project_type(entries)

        counts = {}
        for e in entries:
            counts[e.category] = counts.get(e.category, 0) + 1

        return ArchiveAnalysis(
            file_tree=entries[:self.MAX_FILES],
            project_type=project_type,
            file_counts=counts,
            total_files=len(entries),
            readme_content=readme,
            code_snippets=snippets[:10],
            suggested_topics=self._suggest_topics(project_type, entries, readme),
        )

    def _build_entries(self, zf: zipfile.ZipFile) -> list[FileEntry]:
        """构建文件列表，过滤忽略目录"""
        entries = []
        for info in zf.infolist():
            if info.is_dir():
                continue
            path = PurePosixPath(info.filename)
            if any(part in IGNORE_DIRS for part in path.parts):
                continue
            suffix = path.suffix.lower()
            if suffix in CODE_EXT:
                cat = 'code'
            elif suffix in DOC_EXT:
                cat = 'doc'
            elif suffix in DATA_EXT:
                cat = 'data'
            else:
                cat = 'other'
            entries.append(FileEntry(path=info.filename, size=info.file_size, category=cat))
        return entries

    def _find_readme(self, zf, entries) -> str | None:
        """查找README文件"""
        for e in entries:
            name = PurePosixPath(e.path).name.lower()
            if name in ('readme.md', 'readme.txt', 'readme'):
                try:
                    content = zf.read(e.path)
                    return content[:self.MAX_FILE_READ].decode('utf-8', errors='replace')
                except Exception:
                    pass
        return None

    def _extract_code_snippets(self, zf, entries) -> list[dict]:
        """提取关键代码文件片段"""
        snippets = []
        code_files = [e for e in entries if e.category == 'code']
        # 按大小排序，取有代表性的文件
        code_files.sort(key=lambda x: x.size, reverse=True)
        for e in code_files[:5]:
            try:
                content = zf.read(e.path)
                text = content[:self.MAX_FILE_READ].decode('utf-8', errors='replace')
                snippets.append({'path': e.path, 'content': text, 'size': e.size})
            except Exception:
                pass
        return snippets

    def _detect_project_type(self, entries) -> str:
        """检测项目类型"""
        names = {PurePosixPath(e.path).name.lower() for e in entries}
        if 'package.json' in names:
            return 'Node.js'
        if 'requirements.txt' in names or 'setup.py' in names or 'pyproject.toml' in names:
            return 'Python'
        if 'pom.xml' in names or 'build.gradle' in names:
            return 'Java'
        if 'go.mod' in names:
            return 'Go'
        if 'Cargo.toml' in names:
            return 'Rust'
        if any(e.path.endswith('.sln') for e in entries):
            return 'C#/.NET'
        return '未知'

    def _suggest_topics(self, project_type, entries, readme) -> list[str]:
        """根据项目内容建议论文方向"""
        topics = []
        if project_type != '未知':
            topics.append(f"基于{project_type}的软件系统设计与实现")
        code_count = sum(1 for e in entries if e.category == 'code')
        if code_count > 20:
            topics.append("大规模软件架构分析与优化")
        if any('test' in e.path.lower() for e in entries):
            topics.append("软件测试方法与质量保证")
        if readme and ('api' in readme.lower() or 'rest' in readme.lower()):
            topics.append("RESTful API设计与实现")
        if any('ml' in e.path.lower() or 'model' in e.path.lower() for e in entries):
            topics.append("机器学习模型应用研究")
        return topics if topics else ["软件系统设计与实现研究"]
