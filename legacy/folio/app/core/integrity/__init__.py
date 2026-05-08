# SPDX-License-Identifier: MPL-2.0
"""Integrity & honesty primitives (M4)."""

from app.core.integrity.audit import AuditBundle, write_audit_zip
from app.core.integrity.license import LicenseDecision, check_compatibility
from app.core.integrity.plagiarism import (
    PlagiarismFlag,
    flag_overlaps,
    overlap_ratio,
    shingles,
)

__all__ = [
    "AuditBundle",
    "LicenseDecision",
    "PlagiarismFlag",
    "check_compatibility",
    "flag_overlaps",
    "overlap_ratio",
    "shingles",
    "write_audit_zip",
]
