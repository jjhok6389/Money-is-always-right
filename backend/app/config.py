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

    # 지식 검색(RAG). 인덱스는 scripts/build_knowledge_index.py 로 생성한다.
    bedrock_embedding_model_id: str = "amazon.titan-embed-text-v2:0"
    bedrock_embedding_dimensions: int = 1024
    # 빈 값이면 backend/data/knowledge_index.json 을 사용한다.
    knowledge_index_path: str = ""
    knowledge_top_k: int = 3
    # 검색 결과에 confidence=high 를 붙이는 기준. 문서를 버리는 차단선이 아니라
    # 라벨 기준이며, 낮으면 모델이 단정을 피하도록 프롬프트가 유도한다.
    # 점수만으로는 '코퍼스에 없는 주제'를 못 거른다(짧은 질의는 무관한 문서와도 높게 나옴).
    # 최종 방어선은 모델이 문서 내용을 읽고 판단하는 것이고, 이 값은 보조 신호다.
    # scripts/eval_knowledge.py 로 코퍼스가 커질 때마다 재측정할 것.
    knowledge_min_vector_score: float = 0.33
    knowledge_min_keyword_score: float = 0.31


@lru_cache
def get_settings() -> Settings:
    return Settings()
