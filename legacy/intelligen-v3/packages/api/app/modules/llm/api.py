"""LLM 提供商管理 API — Admin 端点"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import List, Optional

import httpx
from fastapi import APIRouter, Depends, Path
from sqlalchemy.orm import Session as DBSession

from app.platform.exceptions import NotFoundException, BusinessException
from app.platform.response import ApiResponse
from app.platform.database import get_db
from app.modules.auth.deps import CurrentUser, require_admin
from app.modules.llm.models import LLMProvider, LLMStageConfig
from app.modules.llm.schemas import (
    ProviderCreateRequest,
    ProviderUpdateRequest,
    StageConfigUpdateRequest,
    ProbeModelsRequest,
    AutoConfigureRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/providers", tags=["llm-providers"])

ENGINE_BASE = "http://127.0.0.1:9993"
try:
    from app.platform.config import settings as _settings
    ENGINE_BASE = _settings.ENGINE_BASE_URL
except Exception:
    pass

# ── 加密辅助 ────────────────────────────────────────────

_FERNET_KEY: bytes | None = None


def _derive_key_from_secret(secret: str) -> bytes:
    """从 JWT_SECRET 稳定派生 Fernet 密钥（SHA256 → base64url 32 字节）"""
    import base64
    import hashlib
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def _get_fernet():
    """懒加载 Fernet 实例。

    优先级:
      1. LLM_ENCRYPTION_KEY 环境变量 (显式设置的 Fernet key)
      2. 从 JWT_SECRET 稳定派生 (跨重启一致，避免数据丢失)
      3. 临时生成 (仅在 JWT_SECRET 也为空时 —— 这种情况下服务本不该启动)
    """
    global _FERNET_KEY
    from cryptography.fernet import Fernet
    if _FERNET_KEY is None:
        import os
        env_key = os.environ.get("LLM_ENCRYPTION_KEY", "").strip()
        if env_key:
            try:
                Fernet(env_key.encode())
                _FERNET_KEY = env_key.encode()
            except Exception:
                _FERNET_KEY = _derive_key_from_secret(env_key)
        else:
            try:
                from app.platform.config import settings as _s
                jwt_secret = (_s.JWT_SECRET or "").strip()
            except Exception:
                jwt_secret = ""
            if jwt_secret:
                _FERNET_KEY = _derive_key_from_secret(jwt_secret)
                logger.info("LLM_ENCRYPTION_KEY 未设置，从 JWT_SECRET 派生稳定密钥")
            else:
                _FERNET_KEY = Fernet.generate_key()
                logger.error(
                    "JWT_SECRET 和 LLM_ENCRYPTION_KEY 均未设置！"
                    "已生成临时密钥，重启后 Provider api_key 将失效！"
                )
    return Fernet(_FERNET_KEY)


def _encrypt(plain: str) -> str:
    return _get_fernet().encrypt(plain.encode()).decode()


def _decrypt(token: str) -> str:
    return _get_fernet().decrypt(token.encode()).decode()


async def _sync_providers_to_engine(db: DBSession) -> None:
    """把 DB 中的 active providers + stage configs 同步到 Engine 的 ProviderRegistry。

    在 Provider/Stage config 的 CRUD 操作后调用，使 UI 配置立即生效。
    失败不抛异常（只记 warning），避免影响 CRUD 本身。
    """
    try:
        providers = db.query(LLMProvider).filter(LLMProvider.is_active == True).all()  # noqa: E712
        stage_cfgs = db.query(LLMStageConfig).order_by(LLMStageConfig.priority).all()

        provider_payload = []
        name_by_id: dict[str, str] = {}
        for p in providers:
            name_by_id[p.id] = p.name
            api_key = ""
            if p.api_key_encrypted:
                try:
                    api_key = _decrypt(p.api_key_encrypted)
                except Exception as dec_exc:
                    logger.error(
                        "Provider %s (id=%s) api_key 解密失败: %s — "
                        "密钥可能被加密时使用了不同的 LLM_ENCRYPTION_KEY/JWT_SECRET",
                        p.name, p.id, dec_exc,
                    )
                    api_key = ""
            provider_payload.append({
                "name": p.name,
                "api_format": p.api_format,
                "base_url": p.base_url,
                "api_key": api_key,
                "deployment_type": p.deployment_type or "cloud",
                "auth_required": bool(p.auth_required),
            })

        stage_payload = []
        fallback_chain: list[list[str]] = []
        for cfg in stage_cfgs:
            pname = name_by_id.get(cfg.provider_id)
            if not pname:
                continue
            if cfg.is_fallback:
                fallback_chain.append([pname, cfg.model])
            else:
                stage_payload.append({
                    "stage": cfg.stage,
                    "provider_name": pname,
                    "model": cfg.model,
                })

        async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
            resp = await client.post(
                f"{ENGINE_BASE}/engine/providers/reload",
                json={
                    "providers": provider_payload,
                    "stage_configs": stage_payload,
                    "fallback_chain": fallback_chain,
                    "preserve_env_providers": True,
                },
            )
            if resp.status_code == 200:
                logger.info("Providers synced to engine: %s", resp.json().get("providers"))
            else:
                logger.warning("Engine reload returned HTTP %s: %s", resp.status_code, resp.text)
    except Exception as exc:
        logger.warning("同步 Provider 到 Engine 失败: %s", exc)


# ── Provider CRUD ────────────────────────────────────────


@router.get("")
def list_providers(
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    """列出所有已注册的 LLM 提供商"""
    providers = db.query(LLMProvider).order_by(LLMProvider.priority).all()
    return ApiResponse.success(
        "获取提供商列表成功",
        [p.to_dict() for p in providers],
    )


@router.post("")
async def create_provider(
    req: ProviderCreateRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    """新增 LLM 提供商"""
    existing = db.query(LLMProvider).filter(LLMProvider.name == req.name).first()
    if existing:
        raise BusinessException(400, f"提供商名称 '{req.name}' 已存在")

    provider = LLMProvider(
        id=str(uuid.uuid4()),
        name=req.name,
        api_format=req.api_format,
        base_url=req.base_url.rstrip("/"),
        api_key_encrypted=_encrypt(req.api_key) if req.api_key else None,
        models_json=req.models_json,
        deployment_type=req.deployment_type,
        auth_required=req.auth_required,
        is_active=req.is_active,
        priority=req.priority,
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    await _sync_providers_to_engine(db)
    return ApiResponse.success("提供商创建成功", provider.to_dict())


# ── 静态路径必须在 /{provider_id} 动态路径之前注册，否则 FastAPI 会把 "stages"/"probe-models" 当成 provider_id ──


@router.get("/stages")
def get_stage_configs(
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    """获取所有 stage 的 LLM 配置"""
    configs = (
        db.query(LLMStageConfig)
        .order_by(LLMStageConfig.stage, LLMStageConfig.priority)
        .all()
    )
    return ApiResponse.success(
        "获取 stage 配置成功",
        [c.to_dict() for c in configs],
    )


@router.put("/stages")
async def update_stage_configs(
    req: StageConfigUpdateRequest,
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    """批量更新 stage 配置 (全量替换)"""
    provider_ids = {item.provider_id for item in req.configs if item.provider_id}
    if provider_ids:
        existing = {
            p.id for p in db.query(LLMProvider.id).filter(LLMProvider.id.in_(provider_ids)).all()
        }
        missing = provider_ids - existing
        if missing:
            raise NotFoundException(f"提供商不存在 (id={', '.join(sorted(missing))})")

    db.query(LLMStageConfig).delete()

    for item in req.configs:
        if not item.provider_id:
            continue
        cfg = LLMStageConfig(
            id=str(uuid.uuid4()),
            stage=item.stage,
            provider_id=item.provider_id,
            model=item.model,
            is_fallback=item.is_fallback,
            priority=item.priority,
        )
        db.add(cfg)

    db.commit()
    await _sync_providers_to_engine(db)
    return ApiResponse.success("Stage 配置已更新")


@router.post("/probe-models")
async def probe_models(
    req: ProbeModelsRequest,
    current_user: CurrentUser = Depends(require_admin),
):
    """探测 provider 可用模型列表（不落库），供 UI 向导选择决策模型。"""
    try:
        models = await _probe_provider_models(req.base_url, req.api_key, req.api_format)
    except httpx.HTTPStatusError as e:
        raise BusinessException(
            f"模型探测失败：HTTP {e.response.status_code} {e.response.text[:200]}"
        )
    except Exception as e:
        raise BusinessException(f"模型探测失败：{e}")
    if not models:
        raise BusinessException("该 Provider 未返回任何模型")
    return ApiResponse.success("模型探测成功", {"models": models, "count": len(models)})


@router.put("/{provider_id}")
async def update_provider(
    provider_id: str = Path(...),
    req: ProviderUpdateRequest = ...,
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    """更新 LLM 提供商"""
    provider = db.query(LLMProvider).filter(LLMProvider.id == provider_id).first()
    if not provider:
        raise NotFoundException(f"提供商不存在 (id={provider_id})")

    if req.name is not None:
        provider.name = req.name
    if req.api_format is not None:
        provider.api_format = req.api_format
    if req.base_url is not None:
        provider.base_url = req.base_url.rstrip("/")
    if req.api_key is not None:
        provider.api_key_encrypted = _encrypt(req.api_key) if req.api_key else None
    if req.models_json is not None:
        provider.models_json = req.models_json
    if req.deployment_type is not None:
        provider.deployment_type = req.deployment_type
    if req.auth_required is not None:
        provider.auth_required = req.auth_required
    if req.is_active is not None:
        provider.is_active = req.is_active
    if req.priority is not None:
        provider.priority = req.priority

    db.commit()
    db.refresh(provider)
    await _sync_providers_to_engine(db)
    return ApiResponse.success("提供商更新成功", provider.to_dict())


@router.delete("/{provider_id}")
async def delete_provider(
    provider_id: str = Path(...),
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    """删除 LLM 提供商 (级联删除关联 stage 配置)"""
    provider = db.query(LLMProvider).filter(LLMProvider.id == provider_id).first()
    if not provider:
        raise NotFoundException(f"提供商不存在 (id={provider_id})")

    db.delete(provider)
    db.commit()
    await _sync_providers_to_engine(db)
    return ApiResponse.success("提供商已删除")


@router.post("/{provider_id}/test")
async def test_provider(
    provider_id: str = Path(...),
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    """测试提供商连通性 — 转发到 Engine"""
    provider = db.query(LLMProvider).filter(LLMProvider.id == provider_id).first()
    if not provider:
        raise NotFoundException(f"提供商不存在 (id={provider_id})")

    # 解密 API key 传给 engine
    api_key = ""
    decrypt_error: str | None = None
    if provider.api_key_encrypted:
        try:
            api_key = _decrypt(provider.api_key_encrypted)
        except Exception as dec_exc:
            logger.error(
                "Provider %s (id=%s) api_key 解密失败: %s",
                provider.name, provider.id, dec_exc,
            )
            decrypt_error = "api_key 解密失败，请重新保存 Provider"
            api_key = ""

    if decrypt_error:
        raise BusinessException(decrypt_error)

    test_payload = {
        "api_format": provider.api_format,
        "base_url": provider.base_url,
        "api_key": api_key,
        "name": provider.name,
    }

    healthy = False
    detail = ""
    try:
        async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
            resp = await client.post(
                f"{ENGINE_BASE}/engine/providers/test",
                json=test_payload,
            )
            if resp.status_code == 200:
                data = resp.json()
                healthy = data.get("healthy", False)
                detail = data.get("detail", "")
            else:
                detail = f"Engine 返回 HTTP {resp.status_code}"
    except Exception as exc:
        detail = f"无法连接 Engine: {exc}"

    # 更新健康状态
    provider.health_status = "healthy" if healthy else "unhealthy"
    provider.health_checked_at = datetime.utcnow()
    db.commit()

    return ApiResponse.success(
        "连通性测试完成",
        {"healthy": healthy, "detail": detail, "health_status": provider.health_status},
    )


# ── Stage 配置（路由已上移到 /{provider_id} 之前） ───────────────────────────


# ── AI 辅助自动配置 ─────────────────────────────────────

STAGE_KEYS = [
    "topic_analysis", "outline_planning", "literature_review", "abstract",
    "section_writing", "conclusion", "references", "review",
]

_STAGE_HINTS = {
    "topic_analysis": "轻，需要综合推理，短 prompt 短输出",
    "outline_planning": "中，需要长上下文理解 + 结构化 JSON 输出",
    "literature_review": "长上下文输入，严格 JSON 输出",
    "abstract": "短输出但对风格/精炼度要求高",
    "section_writing": "长输出，最重的阶段，需要强写作能力",
    "conclusion": "中等输出，需综合归纳",
    "references": "严格结构化 JSON，容错率低",
    "review": "审校润色，需要批判性阅读能力",
}


async def _probe_provider_models(base_url: str, api_key: str, api_format: str) -> List[str]:
    """调用 provider 自己的 /models 端点枚举可用模型。"""
    base = base_url.rstrip("/")
    headers = {"Authorization": f"Bearer {api_key}"}
    models: List[str] = []
    async with httpx.AsyncClient(timeout=15, trust_env=False) as client:
        if api_format == "anthropic":
            return [
                "claude-opus-4-20250514", "claude-sonnet-4-20250514",
                "claude-3-5-sonnet-latest", "claude-3-5-haiku-latest",
            ]
        if api_format == "google":
            resp = await client.get(f"{base}/models", params={"key": api_key})
            resp.raise_for_status()
            data = resp.json()
            for m in data.get("models", []):
                mid = m.get("name", "").replace("models/", "")
                if mid:
                    models.append(mid)
            return models
        resp = await client.get(f"{base}/models", headers=headers)
        resp.raise_for_status()
        data = resp.json()
        for m in data.get("data", []):
            mid = m.get("id")
            if mid:
                models.append(mid)
    return models


def _rule_based_assignment(models: List[str]) -> List[dict]:
    """LLM 返回非法时的规则式回退分配。"""
    if not models:
        return []

    def find(keywords, exclude=()):
        for m in models:
            lower = m.lower()
            if any(ex in lower for ex in exclude):
                continue
            if any(k in lower for k in keywords):
                return m
        return None

    strong = (find(["opus", "gpt-5", "gpt-4.1", "claude-sonnet-4", "pro", "reasoner", "max"])
              or models[0])
    fast = (find(["haiku", "mini", "flash", "fast", "small", "30b", "8b"],
                 exclude=["vision", "free"])
            or models[-1])
    fallback = models[1] if len(models) > 1 else models[0]

    return [
        {"stage": "topic_analysis",   "primary": strong, "fallback": fallback},
        {"stage": "outline_planning", "primary": strong, "fallback": fallback},
        {"stage": "literature_review","primary": strong, "fallback": fallback},
        {"stage": "abstract",         "primary": fast,   "fallback": fallback},
        {"stage": "section_writing",  "primary": strong, "fallback": fallback},
        {"stage": "conclusion",       "primary": strong, "fallback": fallback},
        {"stage": "references",       "primary": fast,   "fallback": fallback},
        {"stage": "review",           "primary": strong, "fallback": fallback},
    ]


def _extract_json_block(text: str) -> Optional[str]:
    """从含前言/后记/代码围栏的任意文本中切出首个完整的 JSON 对象或数组。

    使用括号栈匹配，忽略字符串内部的括号。
    """
    if not text:
        return None
    s = text.strip()
    # 剥离代码围栏（```json / ``` / ~~~ 等）
    if s.startswith("```") or s.startswith("~~~"):
        fence = s[:3]
        s = s[3:]
        # 跳过可能的语言标识
        nl = s.find("\n")
        if nl >= 0 and s[:nl].strip().lower() in {"json", "javascript", "js", ""}:
            s = s[nl + 1:]
        # 去掉尾部围栏
        end = s.rfind(fence)
        if end >= 0:
            s = s[:end]
        s = s.strip()
    # 括号栈扫描
    start_chars = {"{": "}", "[": "]"}
    start = -1
    for i, c in enumerate(s):
        if c in start_chars:
            start = i
            break
    if start < 0:
        return None
    open_ch = s[start]
    close_ch = start_chars[open_ch]
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(s)):
        c = s[i]
        if in_str:
            if esc:
                esc = False
            elif c == "\\":
                esc = True
            elif c == '"':
                in_str = False
            continue
        if c == '"':
            in_str = True
            continue
        if c == open_ch:
            depth += 1
        elif c == close_ch:
            depth -= 1
            if depth == 0:
                return s[start:i + 1]
    return None


def _parse_assignment_payload(raw_json: str, models: List[str]) -> List[dict]:
    """宽容解析三种布局的 JSON → 统一的 stage 分配列表（未补全）。

    1) {"stages":[{stage,primary,fallback}, ...]}
    2) 裸数组 [{stage,primary,fallback}, ...]
    3) 映射 {"topic_analysis":{"primary":..,"fallback":..}, ...}
    """
    import json as _json
    try:
        parsed = _json.loads(raw_json)
    except Exception:
        return []

    models_set = set(models)
    items: List[dict] = []

    raw_items: List[dict] = []
    if isinstance(parsed, dict) and isinstance(parsed.get("stages"), list):
        raw_items = [x for x in parsed["stages"] if isinstance(x, dict)]
    elif isinstance(parsed, list):
        raw_items = [x for x in parsed if isinstance(x, dict)]
    elif isinstance(parsed, dict):
        # 映射布局
        for k, v in parsed.items():
            if k in STAGE_KEYS and isinstance(v, dict):
                raw_items.append({
                    "stage": k,
                    "primary": v.get("primary") or v.get("model"),
                    "fallback": v.get("fallback"),
                })

    seen = set()
    for item in raw_items:
        stage = item.get("stage")
        primary = item.get("primary") or item.get("model")
        fallback = item.get("fallback")
        if stage not in STAGE_KEYS or stage in seen:
            continue
        if primary not in models_set:
            continue
        if fallback and fallback not in models_set:
            fallback = None
        seen.add(stage)
        items.append({"stage": stage, "primary": primary, "fallback": fallback})
    return items


def _should_skip_json_response_format(base_url: str, decision_model: str) -> bool:
    """判断是否应该跳过 OpenAI 风格的 response_format:json_object。

    OpenRouter 与 claude/gemini/grok/deepseek-reasoner 等已知不稳定。
    """
    b = (base_url or "").lower()
    m = (decision_model or "").lower()
    if "openrouter" in b:
        return True
    if any(tag in m for tag in ("claude", "gemini", "grok", "reasoner", "anthropic", "o1", "o3")):
        return True
    return False


async def _call_decision_model(
    base_url: str, api_key: str, api_format: str,
    decision_model: str, models: List[str],
) -> dict:
    """调用决策模型，返回 {assignment, raw, parse_notes, llm_called_ok}。"""
    import json as _json

    stage_desc = "\n".join(f"- {s}: {_STAGE_HINTS[s]}" for s in STAGE_KEYS)
    base_prompt = (
        "你是 LLM Orchestrator。为论文生成流水线的 8 个阶段分配最合适的主 + 备模型。\n"
        "规则：\n"
        "1) primary 和 fallback 都必须来自下方 available_models；\n"
        "2) 强阶段（长输出/写作）用强模型，轻阶段（短/结构化）可用经济模型；\n"
        "3) fallback 尽量与 primary 不同。\n\n"
        f"available_models: {_json.dumps(models, ensure_ascii=False)}\n\n"
        f"stages（8 个）及负载特征:\n{stage_desc}\n\n"
        'JSON Schema: {"stages":[{"stage":"...","primary":"...","fallback":"..."}]}\n'
        "只输出 JSON 对象本身，不要包裹在 markdown 代码块或任何解释文字中。"
    )

    skip_json_fmt = _should_skip_json_response_format(base_url, decision_model)
    notes: List[str] = []

    async def _one_call(prompt: str) -> Optional[str]:
        try:
            async with httpx.AsyncClient(timeout=120, trust_env=False) as client:
                if api_format == "anthropic":
                    resp = await client.post(
                        f"{base_url.rstrip('/')}/v1/messages",
                        headers={"x-api-key": api_key, "anthropic-version": "2023-06-01"},
                        json={
                            "model": decision_model, "max_tokens": 4096,
                            "temperature": 0.1,
                            "messages": [{"role": "user", "content": prompt}],
                        },
                    )
                    resp.raise_for_status()
                    return resp.json()["content"][0]["text"]
                if api_format == "google":
                    resp = await client.post(
                        f"{base_url.rstrip('/')}/models/{decision_model}:generateContent",
                        params={"key": api_key},
                        json={
                            "contents": [{"parts": [{"text": prompt}]}],
                            "generationConfig": {"temperature": 0.1, "maxOutputTokens": 4096},
                        },
                    )
                    resp.raise_for_status()
                    return resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                # openai_compatible
                body = {
                    "model": decision_model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1,
                    "max_tokens": 4096,
                }
                if not skip_json_fmt:
                    body["response_format"] = {"type": "json_object"}
                resp = await client.post(
                    f"{base_url.rstrip('/')}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"},
                    json=body,
                )
                resp.raise_for_status()
                return resp.json()["choices"][0]["message"]["content"]
        except httpx.HTTPStatusError as e:
            notes.append(f"HTTP {e.response.status_code}: {e.response.text[:200]}")
            logger.warning(
                f"decision model HTTP 错误: {e.response.status_code} {e.response.text[:300]}"
            )
            return None
        except Exception as e:
            notes.append(f"调用异常: {e}")
            logger.warning(f"decision model 调用异常: {e}")
            return None

    # 第一次
    raw1 = await _one_call(base_prompt)
    logger.info(f"decision model raw1 (len={len(raw1) if raw1 else 0}): {(raw1 or '')[:1500]}")
    assignment: List[dict] = []
    if raw1:
        block = _extract_json_block(raw1)
        if block:
            assignment = _parse_assignment_payload(block, models)
        else:
            notes.append("第 1 次：未能提取 JSON 块")

    # 若首次 0 合法 stage，重试一次（更严格的提示）
    raw2 = None
    if not assignment:
        strict_prompt = base_prompt + (
            "\n\n=== 严格重试 ===\n"
            "上一次你的输出不能被解析。请严格遵守：\n"
            "- 只输出一个 JSON 对象\n"
            "- 不要任何 markdown、代码围栏、前言、后记、自然语言解释\n"
            "- 第一个字符必须是 `{`，最后一个字符必须是 `}`"
        )
        raw2 = await _one_call(strict_prompt)
        logger.info(f"decision model raw2 (len={len(raw2) if raw2 else 0}): {(raw2 or '')[:1500]}")
        if raw2:
            block = _extract_json_block(raw2)
            if block:
                assignment = _parse_assignment_payload(block, models)
            else:
                notes.append("第 2 次：未能提取 JSON 块")

    combined_raw = ""
    if raw1:
        combined_raw += f"--- 第1次响应 ---\n{raw1}\n"
    if raw2:
        combined_raw += f"\n--- 第2次响应 ---\n{raw2}\n"

    return {
        "assignment": assignment,
        "raw": combined_raw,
        "parse_notes": notes,
        "llm_called_ok": bool(raw1 or raw2),
    }


@router.post("/{provider_id}/auto-configure-stages")
async def auto_configure_stages(
    req: AutoConfigureRequest,
    provider_id: str = Path(...),
    current_user: CurrentUser = Depends(require_admin),
    db: DBSession = Depends(get_db),
):
    """让决策模型自动为 8 个 stage 分配主 + 备模型，并写入 stage_configs。"""
    provider = db.query(LLMProvider).filter(LLMProvider.id == provider_id).first()
    if not provider:
        raise NotFoundException(f"提供商不存在 (id={provider_id})")

    models = provider.models_json or []
    if not isinstance(models, list) or not models:
        raise BusinessException("该 Provider 的 models_json 为空，请先编辑 Provider 并探测模型")
    if req.decision_model not in models:
        raise BusinessException(f"决策模型 '{req.decision_model}' 不在该 Provider 的可用模型列表中")

    if not provider.api_key_encrypted:
        raise BusinessException("Provider 未配置 api_key")
    try:
        api_key = _decrypt(provider.api_key_encrypted)
    except Exception as e:
        logger.error(f"auto_configure decrypt failed: {e}")
        raise BusinessException("api_key 解密失败，请重新保存 Provider")

    # 1) 让 decision model 尝试（内含 1 次重试 + 宽容解析）
    call_result = await _call_decision_model(
        provider.base_url, api_key, provider.api_format,
        req.decision_model, models,
    )
    llm_items: List[dict] = call_result["assignment"]
    llm_stages = {it["stage"]: it for it in llm_items}

    # 2) 规则式默认分配作为底板，再用 LLM 结果逐 stage 覆盖
    rule_items = _rule_based_assignment(models)
    rule_stages = {it["stage"]: it for it in rule_items}

    per_stage_source: dict = {}
    merged: List[dict] = []
    for stage in STAGE_KEYS:
        if stage in llm_stages:
            item = llm_stages[stage]
            # 确保 fallback 存在（不然从规则补一个）
            if not item.get("fallback"):
                item["fallback"] = rule_stages.get(stage, {}).get("fallback")
            merged.append(item)
            per_stage_source[stage] = "llm"
        else:
            merged.append(rule_stages.get(stage, {
                "stage": stage, "primary": models[0], "fallback": None,
            }))
            per_stage_source[stage] = "rule"

    used_fallback_rule = not any(v == "llm" for v in per_stage_source.values())
    llm_count = sum(1 for v in per_stage_source.values() if v == "llm")
    rule_count = len(STAGE_KEYS) - llm_count

    # 3) 写入 stage_configs（全量重置：auto-configure 意为「以此 Provider 接管所有 8 阶段」）
    db.query(LLMStageConfig).delete(synchronize_session=False)

    for item in merged:
        db.add(LLMStageConfig(
            id=str(uuid.uuid4()), stage=item["stage"],
            provider_id=provider_id, model=item["primary"],
            is_fallback=False, priority=0,
        ))
        if item.get("fallback"):
            db.add(LLMStageConfig(
                id=str(uuid.uuid4()), stage=item["stage"],
                provider_id=provider_id, model=item["fallback"],
                is_fallback=True, priority=1,
            ))
    db.commit()
    await _sync_providers_to_engine(db)

    raw_preview = (call_result.get("raw") or "")[:2000]
    return ApiResponse.success(
        f"已完成 Stage 配置（LLM {llm_count}/8，规则 {rule_count}/8）",
        {
            "assignment": merged,
            "used_rule_fallback": used_fallback_rule,
            "decision_model": req.decision_model,
            "per_stage_source": per_stage_source,
            "llm_count": llm_count,
            "rule_count": rule_count,
            "parse_notes": call_result.get("parse_notes", []),
            "raw_preview": raw_preview,
            "llm_called_ok": call_result.get("llm_called_ok", False),
        },
    )
