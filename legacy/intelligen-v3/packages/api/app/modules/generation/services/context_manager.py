"""向后兼容包装：上下文管理器。"""
from importlib import import_module as _import_module
import sys as _sys

_sys.modules[__name__] = _import_module("app.modules.generation.writing.context_manager")
