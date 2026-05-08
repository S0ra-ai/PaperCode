"""LLM 相关自定义异常"""


class LLMError(Exception):
    """LLM 调用基类异常"""
    def __init__(self, message: str = "", code: str = "LLM_ERROR",
                 detail: str = "", provider: str = ""):
        self.message = message
        self.code = code
        self.detail = detail
        self.provider = provider
        super().__init__(message or detail)


class LLMConfigError(LLMError):
    """LLM 配置缺失或无效 (如 API Key 为空)"""
    def __init__(self, message: str = "模型服务未配置，请联系管理员",
                 detail: str = "", provider: str = ""):
        super().__init__(message, code="LLM_CONFIG_ERROR",
                         detail=detail, provider=provider)


class LLMGenerationError(LLMError):
    """LLM 调用失败 (网络/超时/服务端错误)"""
    def __init__(self, message: str = "模型服务暂时不可用，请稍后重试",
                 detail: str = "", provider: str = "", status_code: int = 0):
        self.status_code = status_code
        super().__init__(message, code="LLM_GENERATION_ERROR",
                         detail=detail, provider=provider)


class LLMRateLimitError(LLMError):
    """LLM 频率限制"""
    def __init__(self, message: str = "请求过于频繁，请稍后重试",
                 detail: str = "", provider: str = "", retry_after: float = 60):
        self.retry_after = retry_after
        super().__init__(message, code="LLM_RATE_LIMIT",
                         detail=detail, provider=provider)
