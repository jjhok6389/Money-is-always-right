"""
Batch-only ETF sync: KRX (or mock on missing key / 401) → ledger → kb markdown.
Never call this from the dashboard request path.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Literal, Optional

from app.services import etf_store, krx_etf_client

_REPO_ROOT = Path(__file__).resolve().parents[3]
_KB_DIR = _REPO_ROOT / "kb" / "etf"

BUCKET_KO = {
    "ultra_low": "초저변동",
    "low_mid": "저~중변동",
    "mid_high": "중~고변동",
    "high": "고변동",
}


def _write_kb_markdown(metrics: dict[str, dict[str, Any]], source: str) -> None:
    _KB_DIR.mkdir(parents=True, exist_ok=True)
    policy = etf_store.get_policy()
    messages = policy.get("messages") or etf_store.POLICY_KO
    _KB_DIR.joinpath("00_policy.md").write_text(
        "\n".join(
            [
                "# ETF 추천 정책",
                "",
                f"- 변동성 창: 최근 {policy.get('windowTradingDays', 126)} 영업일 종가(~6개월)",
                "- 산출: 일간 수익률 표준편차 × √252 (연율화). 화면 라벨은 「6개월 변동성」.",
                "- 버킷: 유니버스 안 상대 사분위 (ultra_low / low_mid / mid_high / high).",
                "",
                "## 성향 매핑",
                f"- 안정형(stable): {messages['stable']}",
                f"- 안정추구형(stable_seeking): {messages['stable_seeking']}",
                f"- 위험중립형(neutral): {messages['neutral']}",
                f"- 적극투자형(aggressive): {messages['aggressive']}",
                f"- 공격투자형(very_aggressive): {messages['very_aggressive']}",
                "",
                "## 면책",
                messages["disclaimer"],
                "",
            ]
        ),
        encoding="utf-8",
    )
    _KB_DIR.joinpath("01_glossary.md").write_text(
        "\n".join(
            [
                "# ETF 용어",
                "",
                "## ETF",
                "거래소에 상장되어 주식처럼 사고팔 수 있는 펀드입니다. 지수나 자산군을 묶어 추종합니다.",
                "",
                "## NAV (순자산가치)",
                "펀드가 보유한 자산에서 부채를 뺀 뒤 좌수로 나눈 가치입니다. 시장 가격과 조금 다를 수 있습니다.",
                "",
                "## 6개월 변동성",
                "최근 약 126 영업일(6개월) 종가로 구한 일간 수익률의 연율화 표준편차입니다. 과거 출렁임을 비교하는 숫자이며 미래 수익이 아닙니다.",
                "",
                "## 레버리지 ETF",
                "하루 수익률의 배수(예: 2배)를 추종합니다. 여러 날을 보유하면 복리 효과로 지수 누적 수익의 2배가 되지 않을 수 있고, 손실이 커질 수 있습니다.",
                "",
                "## 인버스 ETF",
                "지수가 내릴 때 수익이 나도록 설계된 상품입니다. 단기 헤지 목적에 가깝고 장기 투자에는 잘 맞지 않습니다.",
                "",
            ]
        ),
        encoding="utf-8",
    )
    for item in krx_etf_client.list_universe():
        symbol = item["symbol"]
        row = metrics.get(symbol) or {}
        bucket = row.get("bucket")
        text = "\n".join(
            [
                f"# {item['name']} ({symbol})",
                "",
                item.get("oneLiner") or "",
                "",
                f"- 기초: {item.get('underlierName') or '-'}",
                f"- 자산군: {item.get('assetClass') or '-'}",
                f"- 기준일: {row.get('asOfDate') or '-'}",
                f"- 6개월 변동성: {row.get('vol60Pct')}%",
                f"- 버킷: {BUCKET_KO.get(bucket, bucket) if bucket else '산출 제외'}",
                f"- 6개월 수익률: {row.get('change60Pct')}%",
                f"- 데이터 출처: {source}",
                "",
                etf_store.POLICY_KO["disclaimer"],
                "",
            ]
        )
        _KB_DIR.joinpath(f"10_{symbol}.md").write_text(text, encoding="utf-8")


async def sync_etf() -> dict[str, Any]:
    series_list, source, message = await krx_etf_client.fetch_krx_universe()
    metrics = etf_store.save_snapshot(series_list, source)
    _write_kb_markdown(metrics, source)
    return {
        "source": source,
        "count": len(metrics),
        "asOfDate": etf_store.date_today_iso(),
        "message": message or "ETF 원장을 갱신했습니다.",
        "kbDir": str(_KB_DIR),
    }


def main() -> None:
    result = asyncio.run(sync_etf())
    print(result)


if __name__ == "__main__":
    main()
