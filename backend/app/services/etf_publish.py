"""
Publish local kb/etf markdown to S3 and kick off Bedrock KB ingestion.

Optional steps after sync_etf(); skipped when bucket / data-source env is empty.
"""

from __future__ import annotations

import logging
import mimetypes
from pathlib import Path
from typing import Any

from app.config import get_settings

logger = logging.getLogger(__name__)


def _aws_client(service: str):
    import boto3

    settings = get_settings()
    kwargs: dict[str, Any] = {"region_name": settings.aws_region}
    if settings.aws_access_key_id and settings.aws_secret_access_key:
        kwargs["aws_access_key_id"] = settings.aws_access_key_id
        kwargs["aws_secret_access_key"] = settings.aws_secret_access_key
    return boto3.client(service, **kwargs)


def upload_kb_dir_to_s3(kb_dir: Path) -> dict[str, Any]:
    """
    Upload all files under kb_dir to s3://{bucket}/{prefix}/...
    Returns {uploaded, deleted, bucket, prefix} or {skipped: reason}.
    """
    settings = get_settings()
    bucket = (settings.etf_s3_bucket or "").strip()
    if not bucket:
        return {"skipped": True, "reason": "ETF_S3_BUCKET 미설정"}

    prefix = (settings.etf_s3_prefix or "kb/etf/").strip().lstrip("/")
    if prefix and not prefix.endswith("/"):
        prefix += "/"

    if not kb_dir.is_dir():
        return {"skipped": True, "reason": f"kb 디렉터리 없음: {kb_dir}"}

    client = _aws_client("s3")
    uploaded = 0
    local_keys: set[str] = set()

    for path in sorted(kb_dir.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(kb_dir).as_posix()
        key = f"{prefix}{rel}"
        local_keys.add(key)
        content_type = mimetypes.guess_type(path.name)[0] or "text/markdown; charset=utf-8"
        client.upload_file(
            str(path),
            bucket,
            key,
            ExtraArgs={"ContentType": content_type},
        )
        uploaded += 1

    deleted = 0
    if settings.etf_s3_sync_delete:
        paginator = client.get_paginator("list_objects_v2")
        remote_keys: list[str] = []
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            for obj in page.get("Contents") or []:
                key = obj.get("Key")
                if key:
                    remote_keys.append(key)
        stale = [key for key in remote_keys if key not in local_keys]
        for i in range(0, len(stale), 1000):
            chunk = stale[i : i + 1000]
            if not chunk:
                continue
            client.delete_objects(
                Bucket=bucket,
                Delete={"Objects": [{"Key": key} for key in chunk], "Quiet": True},
            )
            deleted += len(chunk)

    logger.info("ETF KB uploaded to s3://%s/%s (%s files, deleted=%s)", bucket, prefix, uploaded, deleted)
    return {
        "skipped": False,
        "bucket": bucket,
        "prefix": prefix,
        "uploaded": uploaded,
        "deleted": deleted,
    }


def start_kb_ingestion() -> dict[str, Any]:
    """Start Bedrock Knowledge Base ingestion job (async on AWS side)."""
    settings = get_settings()
    kb_id = (settings.bedrock_knowledge_base_id or "").strip()
    ds_id = (settings.bedrock_kb_data_source_id or "").strip()
    if not kb_id:
        return {"skipped": True, "reason": "BEDROCK_KNOWLEDGE_BASE_ID 미설정"}
    if not ds_id:
        return {"skipped": True, "reason": "BEDROCK_KB_DATA_SOURCE_ID 미설정"}

    client = _aws_client("bedrock-agent")
    response = client.start_ingestion_job(
        knowledgeBaseId=kb_id,
        dataSourceId=ds_id,
        description="ETF daily kb sync",
    )
    job = response.get("ingestionJob") or {}
    job_id = job.get("ingestionJobId")
    status = job.get("status")
    logger.info("Bedrock ingestion started jobId=%s status=%s", job_id, status)
    return {
        "skipped": False,
        "knowledgeBaseId": kb_id,
        "dataSourceId": ds_id,
        "ingestionJobId": job_id,
        "status": status,
    }
