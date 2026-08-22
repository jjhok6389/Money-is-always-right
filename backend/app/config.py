"""
Application settings loaded from environment variables.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Always load backend/.env regardless of the process working directory.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
_ENV_FILE = _BACKEND_DIR / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    firebase_project_id: str = ""
    # Absolute path to the Firebase service account JSON, or leave empty to
    # use GOOGLE_APPLICATION_CREDENTIALS / Application Default Credentials.
    firebase_credentials_path: str = ""
    # When true and credentials are missing, use an in-memory store for local UI work.
    allow_demo_mode: bool = True

    # 금융감독원 금융상품한눈에 Open API
    # https://finlife.fss.or.kr/finlife/main/contents.do?menuNo=700029
    fss_api_key: str = ""
    fss_base_url: str = "https://finlife.fss.or.kr/finlifeapi"
    # 020000=은행, 030300=저축은행, 030200=여신전문, 050000=보험, 060000=금융투자
    fss_top_fin_grp_no: str = "020000"

    # AWS Bedrock (Phase 5 AI Financial Coach)
    aws_region: str = "ap-northeast-2"
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    bedrock_model_id: str = "anthropic.claude-3-haiku-20240307-v1:0"
    bedrock_max_tokens: int = 1024
    bedrock_fallback_enabled: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
