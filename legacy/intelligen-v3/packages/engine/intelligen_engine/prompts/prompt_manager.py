"""
提示词管理器 — 统一加载、缓存和渲染 YAML 提示词模板。
"""
import logging
from pathlib import Path
from typing import Any, Optional

import yaml
from jinja2 import BaseLoader, Environment, Undefined

logger = logging.getLogger(__name__)


class _SilentUndefined(Undefined):
    """未提供的变量渲染为空字符串而非抛出异常。"""

    def __str__(self) -> str:
        return ""

    def __repr__(self) -> str:
        return ""

    def __bool__(self) -> bool:
        return False


_jinja_env = Environment(
    loader=BaseLoader(),
    undefined=_SilentUndefined,
)


class PromptManager:
    """加载 YAML 提示词文件并支持 Jinja2 变量插值。

    用法:
        pm = PromptManager()
        prompt = pm.render("clarification", "generate_questions", context="用户输入: AI论文")
    """

    _instance: Optional["PromptManager"] = None

    def __init__(self, prompts_dir: Optional[str] = None):
        if prompts_dir is None:
            prompts_dir = str(Path(__file__).parent)
        self._dir = prompts_dir
        self._prompts: dict[str, dict[str, Any]] = {}
        self._load_all()

    @classmethod
    def get_instance(cls) -> "PromptManager":
        """单例获取，首次调用自动初始化。"""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load_all(self) -> None:
        """扫描目录下所有 .yaml 文件并加载到缓存。"""
        prompts_path = Path(self._dir)
        for yaml_file in prompts_path.glob("*.yaml"):
            stage = yaml_file.stem  # e.g. "clarification"
            try:
                with open(yaml_file, "r", encoding="utf-8") as f:
                    self._prompts[stage] = yaml.safe_load(f) or {}
                logger.debug(f"已加载提示词: {stage} ({len(self._prompts[stage])} 条)")
            except Exception as e:
                logger.error(f"加载提示词失败 {yaml_file}: {e}")

    def reload(self) -> None:
        """重新加载所有提示词（管理端修改后调用）。"""
        self._prompts.clear()
        self._load_all()

    def get_raw(self, stage: str, key: str) -> Any:
        """获取原始值（不渲染），用于获取列表/字典类型数据。"""
        stage_data = self._prompts.get(stage, {})
        if key not in stage_data:
            logger.warning(f"提示词未找到: {stage}.{key}")
            return None
        return stage_data[key]

    def render(self, stage: str, key: str, **variables: Any) -> str:
        """渲染提示词模板，替换 Jinja2 变量。

        Args:
            stage: YAML 文件名（不含 .yaml），如 "clarification"
            key: 提示词键名，如 "generate_questions"
            **variables: Jinja2 变量键值对

        Returns:
            渲染后的字符串。如果找不到模板返回空字符串。
        """
        raw = self.get_raw(stage, key)
        if raw is None:
            return ""
        if not isinstance(raw, str):
            logger.warning(f"{stage}.{key} 不是字符串类型，无法渲染")
            return str(raw)
        try:
            template = _jinja_env.from_string(raw)
            return template.render(**variables)
        except Exception as e:
            logger.error(f"渲染提示词失败 {stage}.{key}: {e}")
            return raw  # 回退到原始模板

    def list_stages(self) -> list[str]:
        """列出所有已加载的阶段名。"""
        return list(self._prompts.keys())

    def list_keys(self, stage: str) -> list[str]:
        """列出某阶段下所有提示词键名。"""
        return list(self._prompts.get(stage, {}).keys())
