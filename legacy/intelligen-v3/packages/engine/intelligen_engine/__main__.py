"""引擎包入口，支持 `python -m intelligen_engine` 启动"""
import uvicorn
from intelligen_engine.core.config import settings

if __name__ == "__main__":
    uvicorn.run(
        "intelligen_engine.main:app",
        host=settings.ENGINE_HOST,
        port=settings.ENGINE_PORT,
        reload=True,
    )
