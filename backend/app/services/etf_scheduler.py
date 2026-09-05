"""
Weekday ETF ledger refresh scheduler (Asia/Seoul).

Enabled via ETF_SYNC_SCHEDULER_ENABLED. Runs sync_etf (KRX → Firestore → kb md
→ optional S3 → optional Bedrock ingest). Does not run on the HTTP request path.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import get_settings

logger = logging.getLogger(__name__)

_scheduler: Optional[AsyncIOScheduler] = None
_job_lock = asyncio.Lock()


async def run_scheduled_etf_sync() -> None:
    if _job_lock.locked():
        logger.warning("ETF sync already running; skip overlapping schedule tick")
        return
    async with _job_lock:
        from app.jobs.sync_etf import sync_etf

        logger.info("Scheduled ETF sync starting")
        try:
            result = await sync_etf(publish=True)
            logger.info(
                "Scheduled ETF sync done source=%s count=%s s3=%s ingest=%s",
                result.get("source"),
                result.get("count"),
                (result.get("s3") or {}).get("skipped"),
                (result.get("ingestion") or {}).get("skipped"),
            )
        except Exception:
            logger.exception("Scheduled ETF sync failed")


def start_etf_scheduler() -> Optional[AsyncIOScheduler]:
    global _scheduler
    settings = get_settings()
    if not settings.etf_sync_scheduler_enabled:
        logger.info("ETF sync scheduler disabled (ETF_SYNC_SCHEDULER_ENABLED=false)")
        return None
    if _scheduler and _scheduler.running:
        return _scheduler

    hour = max(0, min(23, int(settings.etf_sync_hour_kst)))
    minute = max(0, min(59, int(settings.etf_sync_minute_kst)))
    scheduler = AsyncIOScheduler(timezone="Asia/Seoul")
    scheduler.add_job(
        run_scheduled_etf_sync,
        CronTrigger(
            day_of_week="mon-fri",
            hour=hour,
            minute=minute,
            timezone="Asia/Seoul",
        ),
        id="etf_daily_sync",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    _scheduler = scheduler
    logger.info(
        "ETF sync scheduler started (Mon–Fri %02d:%02d Asia/Seoul)",
        hour,
        minute,
    )
    return scheduler


def stop_etf_scheduler() -> None:
    global _scheduler
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
        logger.info("ETF sync scheduler stopped")
    _scheduler = None
