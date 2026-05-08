"""向后兼容包装：本地文档服务。"""
from importlib import import_module as _import_module
import sys as _sys

_sys.modules[__name__] = _import_module("app.modules.generation.retrieval.local_doc_service")
