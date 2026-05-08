# SPDX-License-Identifier: MPL-2.0
"""Stage implementations.

Each stage exposes ``async def run(msg, ...) -> StageMessage`` and lives
in its own module per AGENTS.md § 2.
"""
