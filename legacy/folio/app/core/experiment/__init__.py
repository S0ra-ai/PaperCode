# SPDX-License-Identifier: MPL-2.0
"""Experiment subsystem: parse + loop."""

from app.core.experiment.loop import LoopOutcome, run_experiment
from app.core.experiment.parse import ExperimentResult, parse

__all__ = ["ExperimentResult", "LoopOutcome", "parse", "run_experiment"]
