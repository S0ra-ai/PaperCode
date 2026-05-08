"""seed builtin ccf template

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-18 00:00:01.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import json

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# 中国计算机学报格式定义
CCF_FORMAT = {
    "page_layout": {
        "page_size": "A4",
        "margin_top": "2.54cm",
        "margin_bottom": "2.54cm",
        "margin_left": "3.17cm",
        "margin_right": "3.17cm"
    },
    "body_style": {
        "font_family": "SimSun",
        "font_size": "12pt",
        "line_spacing": 1.5,
        "alignment": "justified",
        "first_line_indent": "2em"
    },
    "heading_styles": [
        {
            "level": 1,
            "font_family": "SimHei",
            "font_size": "16pt",
            "bold": True,
            "numbering_format": "1",
            "alignment": "center",
            "space_before": "24pt",
            "space_after": "12pt"
        },
        {
            "level": 2,
            "font_family": "SimHei",
            "font_size": "14pt",
            "bold": True,
            "numbering_format": "1.1",
            "alignment": "left",
            "space_before": "12pt",
            "space_after": "6pt"
        },
        {
            "level": 3,
            "font_family": "SimHei",
            "font_size": "12pt",
            "bold": True,
            "numbering_format": "1.1.1",
            "alignment": "left",
            "space_before": "6pt",
            "space_after": "6pt"
        }
    ],
    "sections": [
        {"title": "摘要", "required": True, "order": 1, "description": "中英文摘要，200-300字"},
        {"title": "关键词", "required": True, "order": 2, "description": "3-5个关键词，分号分隔"},
        {"title": "引言", "required": True, "order": 3, "description": "研究背景、目的和意义"},
        {"title": "相关工作", "required": False, "order": 4, "description": "国内外相关研究综述"},
        {"title": "正文", "required": True, "order": 5, "description": "核心内容，可分多节"},
        {"title": "实验与分析", "required": False, "order": 6, "description": "实验设计、结果与讨论"},
        {"title": "结论", "required": True, "order": 7, "description": "研究总结与展望"},
        {"title": "参考文献", "required": True, "order": 8, "description": "GB/T 7714 格式"}
    ],
    "citation_format": {
        "style": "GB/T 7714",
        "in_text_format": "[N]",
        "bibliography_format": "顺序编码制"
    },
    "header_footer": {
        "header_text": "",
        "footer_text": "",
        "page_number_position": "bottom_center"
    },
    "abstract_required": True,
    "keywords_required": True,
    "cover_page_required": False,
    "table_of_contents": True,
    "extra_notes": "适用于中国计算机学会推荐期刊论文格式"
}


def upgrade() -> None:
    templates = sa.table(
        'templates',
        sa.column('id', sa.String),
        sa.column('name', sa.String),
        sa.column('description', sa.Text),
        sa.column('type', sa.String),
        sa.column('status', sa.String),
        sa.column('journal_name', sa.String),
        sa.column('format_json', sa.JSON),
        sa.column('is_public', sa.Integer),
        sa.column('created_by', sa.String),
    )
    op.bulk_insert(templates, [
        {
            'id': 'builtin-ccf-journal',
            'name': '中国计算机学报',
            'description': 'CCF 推荐期刊标准格式 — A4, 宋体12pt正文, 黑体标题, GB/T 7714引用',
            'type': 'BUILTIN',
            'status': 'APPROVED',
            'journal_name': '中国计算机学报 (Chinese Journal of Computers)',
            'format_json': json.dumps(CCF_FORMAT, ensure_ascii=False),
            'is_public': 1,
            'created_by': 'system',
        }
    ])


def downgrade() -> None:
    op.execute("DELETE FROM templates WHERE id = 'builtin-ccf-journal'")
