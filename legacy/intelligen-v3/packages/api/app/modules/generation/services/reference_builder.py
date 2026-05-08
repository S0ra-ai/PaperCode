"""向后兼容包装：参考文献构建器。"""
from importlib import import_module as _import_module
import sys as _sys

_sys.modules[__name__] = _import_module("app.modules.generation.retrieval.reference_builder")
