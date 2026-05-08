"""向后兼容包装：模型路由。"""
from importlib import import_module as _import_module
import sys as _sys

_sys.modules[__name__] = _import_module("app.modules.generation.shared.model_router")
