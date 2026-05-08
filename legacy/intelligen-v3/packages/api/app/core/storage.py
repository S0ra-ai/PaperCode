"""Dual-mode file storage: Local filesystem + Tencent COS.

The active backend is determined by the ``FILE_STORAGE_MODE`` setting
(``"local"`` or ``"cos"``).  COS mode requires valid credentials.
"""

from __future__ import annotations

import logging
import os
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional

from app.platform.config import settings

logger = logging.getLogger(__name__)


class StorageBackend(ABC):
    """Abstract storage interface."""

    @abstractmethod
    def upload(self, local_path: str, remote_key: str) -> str:
        """Upload a local file and return its access URL."""
        ...

    @abstractmethod
    def download(self, remote_key: str) -> bytes:
        """Download file content by key."""
        ...

    @abstractmethod
    def get_signed_url(self, remote_key: str, expires: int = 3600) -> str:
        """Return a time-limited access URL."""
        ...

    @abstractmethod
    def delete(self, remote_key: str) -> None:
        """Delete a remote file."""
        ...


class LocalStorage(StorageBackend):
    """Local filesystem storage with path isolation."""

    def __init__(self):
        self.base_dir = os.path.abspath(settings.FILE_STORAGE_PATH)
        os.makedirs(self.base_dir, exist_ok=True)

    def _full_path(self, remote_key: str) -> str:
        # Prevent path traversal
        safe_key = remote_key.lstrip("/").lstrip("\\")
        full = os.path.normpath(os.path.join(self.base_dir, safe_key))
        if not full.startswith(self.base_dir):
            raise ValueError("Invalid storage key — path traversal detected")
        return full

    def upload(self, local_path: str, remote_key: str) -> str:
        dest = self._full_path(remote_key)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copy2(local_path, dest)
        url = f"{settings.FILE_PUBLIC_BASE_URL}/uploads/{remote_key}"
        logger.debug("LocalStorage: uploaded %s → %s", local_path, dest)
        return url

    def download(self, remote_key: str) -> bytes:
        full = self._full_path(remote_key)
        if not os.path.exists(full):
            raise FileNotFoundError(f"File not found: {remote_key}")
        with open(full, "rb") as f:
            return f.read()

    def get_signed_url(self, remote_key: str, expires: int = 3600) -> str:
        # Local storage returns the direct URL (no signing needed)
        return f"{settings.FILE_PUBLIC_BASE_URL}/uploads/{remote_key}"

    def delete(self, remote_key: str) -> None:
        full = self._full_path(remote_key)
        if os.path.exists(full):
            os.remove(full)
            logger.debug("LocalStorage: deleted %s", full)


class COSStorage(StorageBackend):
    """Tencent Cloud COS storage with signed URLs."""

    def __init__(self):
        try:
            from qcloud_cos import CosConfig, CosS3Client
        except ImportError:
            raise ImportError(
                "cos-python-sdk-v5 is required for COS storage. "
                "Install it with: pip install cos-python-sdk-v5"
            )

        if not settings.COS_SECRET_ID or not settings.COS_SECRET_KEY:
            raise ValueError("COS credentials not configured (COS_SECRET_ID / COS_SECRET_KEY)")

        region = settings.COS_REGION or "ap-shanghai"
        endpoint = settings.COS_ENDPOINT or None

        config = CosConfig(
            Region=region,
            SecretId=settings.COS_SECRET_ID,
            SecretKey=settings.COS_SECRET_KEY,
            Endpoint=endpoint,
        )
        self.client = CosS3Client(config)
        self.bucket = settings.COS_BUCKET
        if not self.bucket:
            raise ValueError("COS_BUCKET not configured")

        logger.info(
            "COS storage initialized: bucket=%s region=%s",
            self.bucket, region,
        )

    def upload(self, local_path: str, remote_key: str) -> str:
        self.client.upload_file(
            Bucket=self.bucket,
            Key=remote_key,
            LocalFilePath=local_path,
            EnableMD5=True,
        )
        url = self.get_signed_url(remote_key)
        logger.debug("COSStorage: uploaded %s → cos://%s/%s", local_path, self.bucket, remote_key)
        return url

    def download(self, remote_key: str) -> bytes:
        response = self.client.get_object(
            Bucket=self.bucket,
            Key=remote_key,
        )
        return response["Body"].get_raw_stream().read()

    def get_signed_url(self, remote_key: str, expires: int = 3600) -> str:
        url = self.client.get_presigned_url(
            Method="GET",
            Bucket=self.bucket,
            Key=remote_key,
            Expired=expires,
        )
        return url

    def delete(self, remote_key: str) -> None:
        self.client.delete_object(
            Bucket=self.bucket,
            Key=remote_key,
        )
        logger.debug("COSStorage: deleted cos://%s/%s", self.bucket, remote_key)


# ── Factory singleton ──────────────────────────────────────

_storage: Optional[StorageBackend] = None


def get_storage() -> StorageBackend:
    """Factory: return COS if configured and mode is 'cos', else Local."""
    global _storage
    if _storage is not None:
        return _storage

    mode = getattr(settings, "FILE_STORAGE_MODE", "local") or "local"

    if mode == "cos":
        try:
            _storage = COSStorage()
        except Exception as e:
            logger.warning("COS init failed (%s), falling back to local storage", e)
            _storage = LocalStorage()
    else:
        _storage = LocalStorage()

    return _storage
