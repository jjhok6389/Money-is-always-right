"""
Measure knowledge retrieval quality (YP2026-59 검증 도구).

  cd backend
  python -m scripts.eval_knowledge                        # 벡터 + 키워드 둘 다
  python -m scripts.eval_knowledge --mode keyword         # AWS 키 없이 실행 가능
  python -m scripts.eval_knowledge --save runs/base.json
  python -m scripts.eval_knowledge --baseline runs/base.json

스코어링은 재구현하지 않고 knowledge_service 의 함수를 그대로 호출한다.
search() 는 폴백 로직이 섞여 경로별 비교가 불가능하므로 우회하고
_vector_search / _keyword_search 를 직접 부른다.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import statistics
import sys
from pathlib import Path

for _stream in (sys.stdout, sys.stderr):
    if hasattr(_stream, "reconfigure"):
        _stream.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import get_settings  # noqa: E402
from app.services import knowledge_service  # noqa: E402

EVAL_DIR = knowledge_service._BACKEND_DIR / "data" / "eval"
EVAL_FILE = EVAL_DIR / "knowledge_eval.jsonl"
CACHE_FILE = EVAL_DIR / ".query_cache.json"

# 상위 몇 건까지 받아와서 지표를 계산할지. recall@k 의 최대 k 보다 커야 한다.
RANK_DEPTH = 10
# 서비스가 실제로 모델에 넘기는 문서 수 (config.knowledge_top_k 기본값).
SERVE_LIMIT = 3
GROUP_ORDER = ["glossary", "paraphrase", "product", "policy", "gap", "negative"]


# --- 평가 세트 ------------------------------------------------------------


def load_cases() -> list[dict]:
    cases = []
    for lineno, line in enumerate(EVAL_FILE.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            cases.append(json.loads(line))
        except json.JSONDecodeError as exc:
            print(f"  ! {EVAL_FILE.name}:{lineno} 건너뜀 — {exc}")
    return cases


def _norm(text: str) -> str:
    return " ".join(text.split()).lower()


def resolve_expected(specs: list[str], docs) -> tuple[set[str], list[str]]:
    """정답 표기를 실제 문서 id 로 바꾼다. 'title:부분문자열' 과 id 정확일치를 지원."""
    resolved: set[str] = set()
    stale: list[str] = []
    for spec in specs:
        if spec.startswith("title:"):
            needle = _norm(spec[len("title:"):])
            found = {doc.id for doc in docs if needle in _norm(doc.title)}
        else:
            found = {doc.id for doc in docs if doc.id == spec}
        if found:
            resolved |= found
        else:
            stale.append(spec)
    return resolved, stale


# --- 쿼리 임베딩 캐시 -----------------------------------------------------


def _cache_key(query: str) -> str:
    settings = get_settings()
    raw = f"{query}|{settings.bedrock_embedding_model_id}|{settings.bedrock_embedding_dimensions}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def load_query_vectors(queries: list[str]) -> dict[str, list[float]]:
    """캐시에 없는 질의만 Bedrock 에 보낸다. 반복 실행이 무료가 되도록."""
    cache: dict[str, list[float]] = {}
    if CACHE_FILE.exists():
        try:
            cache = json.loads(CACHE_FILE.read_text(encoding="utf-8"))
        except Exception:
            cache = {}

    missing = [q for q in queries if _cache_key(q) not in cache]
    if missing:
        print(f"  임베딩 {len(missing)}건 신규 호출 (캐시 적중 {len(queries) - len(missing)}건)...")
        vectors = knowledge_service.embed_texts(missing)
        for query, vector in zip(missing, vectors):
            cache[_cache_key(query)] = vector
        CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        CACHE_FILE.write_text(json.dumps(cache), encoding="utf-8")
    else:
        print(f"  임베딩 전부 캐시 적중 ({len(queries)}건)")

    return {q: cache[_cache_key(q)] for q in queries}


# --- 실행 ------------------------------------------------------------------


def run_mode(mode: str, cases: list[dict], docs) -> list[dict]:
    query_vectors: dict[str, list[float]] = {}
    needs_vectors = mode in ("vector", "union")
    if needs_vectors:
        if not any(doc.vector for doc in docs):
            if mode == "vector":
                raise SystemExit(
                    "인덱스에 벡터가 없습니다. build_knowledge_index 를 임베딩과 함께 돌리거나 "
                    "--mode keyword 로 실행하세요."
                )
            print("  인덱스에 벡터가 없어 union 을 키워드 단독으로 실행합니다.")
            needs_vectors = False
        else:
            query_vectors = load_query_vectors([case["query"] for case in cases])

    results = []
    for case in cases:
        category = case.get("category")
        if mode == "union":
            # 서비스와 같은 병합 로직을 그대로 쓴다 (search() 는 Bedrock 을 다시 부르므로 우회).
            vector_hits = (
                knowledge_service._vector_search(
                    query_vectors[case["query"]], category, RANK_DEPTH
                )
                if needs_vectors
                else []
            )
            keyword_hits = knowledge_service._keyword_search(case["query"], category, RANK_DEPTH)
            hits = knowledge_service.merge(vector_hits, keyword_hits, RANK_DEPTH)
        elif mode == "vector":
            hits = knowledge_service._vector_search(
                query_vectors[case["query"]], category, RANK_DEPTH
            )
        else:
            hits = knowledge_service._keyword_search(case["query"], category, RANK_DEPTH)

        expected, stale = resolve_expected(case.get("expected") or [], docs)
        ranked_ids = [hit.doc.id for hit in hits]
        rank = next(
            (i + 1 for i, doc_id in enumerate(ranked_ids) if doc_id in expected), None
        )
        scores = [hit.score for hit in hits]

        results.append(
            {
                "id": case["id"],
                "query": case["query"],
                "group": case["group"],
                "reason": case.get("reason"),
                "note": case.get("note"),
                "expected": sorted(expected),
                "expectedSpecs": case.get("expected") or [],
                "stale": stale,
                "rank": rank,
                "top": [
                    {
                        "id": hit.doc.id,
                        "title": " ".join(hit.doc.title.split()),
                        "score": hit.score,
                        "confidence": hit.confidence,
                        "matchType": hit.matchType,
                    }
                    for hit in hits[:3]
                ],
                "top1Score": scores[0] if scores else None,
                "margin": round(scores[0] - scores[1], 4) if len(scores) > 1 else None,
                "returned": len(hits),
                # 서비스가 실제로 넘기는 건 상위 SERVE_LIMIT 건. 그 안의 신뢰도가 판단 근거다.
                "bestConfidence": (
                    "high"
                    if any(hit.confidence == "high" for hit in hits[:SERVE_LIMIT])
                    else "low"
                )
                if hits
                else None,
                "inServed": bool(
                    rank is not None and rank <= SERVE_LIMIT
                ),
            }
        )
    return results


# --- 지표 ------------------------------------------------------------------


def _summarize(rows: list[dict], ks: list[int]) -> dict:
    """정답이 있는 케이스는 순위 지표, 정답이 없는 케이스는 오검출 지표를 낸다."""
    positives = [r for r in rows if r["expected"] and not r["stale"]]
    empties = [r for r in rows if not r["expected"] and not r["stale"]]

    out: dict = {"n": len(rows), "positive": len(positives), "empty": len(empties)}

    for k in ks:
        if positives:
            out[f"recall@{k}"] = round(
                sum(1 for r in positives if r["rank"] and r["rank"] <= k) / len(positives), 4
            )
    if positives:
        # 합집합 방식의 핵심 지표: 모델에 실제로 넘어가는 상위 SERVE_LIMIT 건에 정답이 있는가.
        out["recall@set"] = round(
            sum(1 for r in positives if r["inServed"]) / len(positives), 4
        )
        # 넘긴 문서를 high 로 표시했는가. 낮으면 정답인데도 "확인 필요"로 헤지하게 된다.
        served = [r for r in positives if r["inServed"]]
        if served:
            out["high_label_rate"] = round(
                sum(1 for r in served if r["bestConfidence"] == "high") / len(served), 4
            )
        out["mrr"] = round(
            sum(1 / r["rank"] for r in positives if r["rank"]) / len(positives), 4
        )
        margins = [r["margin"] for r in positives if r["margin"] is not None]
        if margins:
            out["margin_median"] = round(statistics.median(margins), 4)
        tops = [r["top1Score"] for r in positives if r["top1Score"] is not None]
        if tops:
            out["top1_median"] = round(statistics.median(tops), 4)

    if empties:
        # 문서를 반환하는 것 자체는 문제가 아니다. low 로 표시해 모델이 걸러낼 수 있으면 성공.
        out["low_label_rate"] = round(
            sum(1 for r in empties if r["bestConfidence"] != "high") / len(empties), 4
        )
        # 참고용: 반환 여부 자체 (합집합 도입 전 지표와 비교하려면 이 값을 볼 것)
        out["false_positive_rate"] = round(
            sum(1 for r in empties if r["returned"]) / len(empties), 4
        )
        tops = [r["top1Score"] for r in empties if r["top1Score"] is not None]
        if tops:
            out["fp_top1_median"] = round(statistics.median(tops), 4)

    return out


def _threshold_view(rows: list[dict]) -> dict:
    """임계값이 통할지 판단하는 근거: 맞힌 케이스와 오검출 케이스의 1위 점수 분포 비교."""
    good = [
        r["top1Score"] for r in rows
        if r["expected"] and not r["stale"] and r["rank"] == 1 and r["top1Score"] is not None
    ]
    bad = [
        r["top1Score"] for r in rows
        if not r["expected"] and not r["stale"] and r["top1Score"] is not None
    ]

    def spread(values):
        if not values:
            return None
        return {
            "n": len(values),
            "min": round(min(values), 4),
            "median": round(statistics.median(values), 4),
            "max": round(max(values), 4),
        }

    view = {"hit": spread(good), "noise": spread(bad)}
    if good and bad:
        # 오검출 최고점 < 정답 최저점 이면 완전 분리 → 임계값 하나로 해결 가능
        view["separated"] = max(bad) < min(good)
        view["suggested_threshold"] = round((max(bad) + min(good)) / 2, 4) if view["separated"] else None
    return view


# --- 출력 ------------------------------------------------------------------


def _fmt(value) -> str:
    if value is None:
        return "  -  "
    if isinstance(value, float):
        return f"{value:.3f}"
    return str(value)


def print_report(mode: str, rows: list[dict], ks: list[int], baseline: dict | None) -> dict:
    print(f"\n{'=' * 78}")
    print(f"  {mode.upper()} 검색")
    print("=" * 78)

    groups = [g for g in GROUP_ORDER if any(r["group"] == g for r in rows)]
    metric_keys = [f"recall@{k}" for k in ks] + [
        "recall@set", "high_label_rate", "mrr", "low_label_rate", "fp_top1_median"
    ]

    header = f"{'group':<12}{'n':>4}" + "".join(f"{key:>18}" for key in metric_keys)
    print(header)
    print("-" * len(header))

    summaries = {}
    base_metrics = (baseline or {}).get(mode, {}).get("groups", {})
    for group in groups + ["ALL"]:
        subset = rows if group == "ALL" else [r for r in rows if r["group"] == group]
        summary = _summarize(subset, ks)
        summaries[group] = summary
        line = f"{group:<12}{summary['n']:>4}"
        for key in metric_keys:
            cell = _fmt(summary.get(key))
            prev = base_metrics.get(group, {}).get(key)
            if prev is not None and summary.get(key) is not None:
                delta = summary[key] - prev
                if abs(delta) >= 0.0005:
                    cell = f"{cell}({delta:+.3f})"
            line += f"{cell:>18}"
        print(line)

    # 임계값 판단 근거
    view = _threshold_view(rows)
    print("\n[임계값 적용 가능성] 1위 점수 분포")
    for label, key in (("정답 1위", "hit"), ("오검출", "noise")):
        spread = view.get(key)
        if spread:
            print(f"  {label:<8} n={spread['n']:<3} min={spread['min']:.4f}  "
                  f"median={spread['median']:.4f}  max={spread['max']:.4f}")
    if view.get("separated") is True:
        print(f"  => 완전 분리됨. 임계값 {view['suggested_threshold']:.4f} 로 노이즈 차단 가능")
    elif view.get("separated") is False:
        print("  => 분포가 겹침. 임계값만으로는 노이즈를 못 걷어냄 (하이브리드/재순위 필요)")

    # 실패 케이스 — 개선 실마리는 여기 있음
    stale = [r for r in rows if r["stale"]]
    # 합집합에서는 1위가 아니어도 모델에 넘어가면 답할 수 있으므로 '넘어갔는지'를 본다.
    misses = [r for r in rows if r["expected"] and not r["stale"] and not r["inServed"]]
    fps = [r for r in rows if not r["expected"] and not r["stale"] and r["returned"]]

    if stale:
        print(f"\n[STALE {len(stale)}건] 정답 문서가 코퍼스에 없음 — 채점에서 제외")
        for r in stale:
            print(f"  {r['id']}  {r['query']}  (미해결: {', '.join(r['stale'])})")

    if misses:
        print(f"\n[정답 미전달 {len(misses)}건] 상위 {SERVE_LIMIT}건 안에 정답이 없음")
        for r in misses:
            rank = f"{r['rank']}위" if r["rank"] else "미검출"
            print(f"  {r['id']} [{r['group']}] {r['query']}  -> {rank}")
            for i, hit in enumerate(r["top"], 1):
                mark = "*" if hit["id"] in r["expected"] else " "
                print(f"      {mark}{i}. {hit['score']:.4f} ({hit['confidence']})  {hit['title'][:50]}")

    hedged = [
        r for r in rows
        if r["expected"] and not r["stale"] and r["inServed"] and r["bestConfidence"] != "high"
    ]
    if hedged:
        print(f"\n[정답인데 low {len(hedged)}건] 답은 맞지만 '확인 필요'로 헤지하게 됨")
        for r in hedged:
            print(f"  {r['id']} [{r['group']}] {r['query']}  (1위 {r['top1Score']:.4f})")

    if fps:
        bad = [r for r in fps if r["bestConfidence"] == "high"]
        print(f"\n[정답 없는 질문 {len(fps)}건] 그중 high 로 잘못 표시한 것 {len(bad)}건")
        for r in fps:
            top = r["top"][0]
            mark = "!!" if r["bestConfidence"] == "high" else "ok"
            print(f"  [{mark}] {r['id']} [{r['group']}/{r['reason']}] {r['query']}")
            print(f"       1. {top['score']:.4f} ({top['confidence']})  {top['title'][:50]}")

    return {"groups": summaries, "threshold": view}


# --- 라우팅 평가 ------------------------------------------------------------


def run_routing(cases: list[dict]) -> int:
    """검색기가 아니라 도구 선택을 평가한다.

    negative 그룹의 오검출은 검색 품질 문제가 아니라 '애초에 search_knowledge 를
    부르지 말았어야 하는' 문제라 별도로 잰다. 폴백 경로의 규칙 기반 라우터만
    측정 가능하고, Bedrock 경로는 모델이 정하므로 여기서 다루지 않는다.
    """
    from app.services import coach_service

    scored = [case for case in cases if case.get("expectedTools")]
    if not scored:
        print("expectedTools 가 있는 케이스가 없습니다.")
        return 0

    print(f"\n{'=' * 78}")
    print("  라우팅 (coach_service._route_tools, 폴백 경로)")
    print("=" * 78)

    failures = []
    for case in scored:
        actual = coach_service._route_tools(case["query"])
        expected = case["expectedTools"]
        # 기대 도구가 선택 목록에 들어 있으면 통과. 부가 도구는 허용한다.
        ok = any(tool in actual for tool in expected)
        # 지식검색이 불필요하게 끼어들었는지는 따로 표시한다.
        intruded = "search_knowledge" in actual and "search_knowledge" not in expected
        if not ok or intruded:
            failures.append((case, actual, ok, intruded))

    passed = len(scored) - len(failures)
    print(f"통과 {passed}/{len(scored)}")
    for case, actual, ok, intruded in failures:
        reason = []
        if not ok:
            reason.append(f"기대 {case['expectedTools']} 미선택")
        if intruded:
            reason.append("search_knowledge 불필요 호출")
        print(f"  X {case['id']} {case['query']}")
        print(f"      실제={actual}  ({' / '.join(reason)})")

    return len(failures)


# --- entrypoint ------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description="지식 검색 품질 측정")
    parser.add_argument(
        "--mode", choices=["union", "vector", "keyword", "both"], default="union",
        help="union=서비스와 동일한 합집합(기본). both=벡터/키워드 개별 비교",
    )
    parser.add_argument(
        "--routing", action="store_true",
        help="검색기 대신 coach_service._route_tools 를 평가 (expectedTools 필드 사용)",
    )
    parser.add_argument("--k", default="1,3,5", help="recall@k 의 k 목록 (기본 1,3,5)")
    parser.add_argument("--save", help="결과 JSON 저장 경로 (data/eval 기준 상대경로 허용)")
    parser.add_argument("--baseline", help="비교할 이전 결과 JSON 경로")
    args = parser.parse_args()

    ks = sorted({int(part) for part in args.k.split(",") if part.strip()})
    if max(ks) > RANK_DEPTH:
        raise SystemExit(f"k 는 {RANK_DEPTH} 이하여야 합니다.")

    if not EVAL_FILE.exists():
        raise SystemExit(f"평가 세트가 없습니다: {EVAL_FILE}")

    cases = load_cases()

    if args.routing:
        return 1 if run_routing(cases) else 0

    knowledge_service.reset_cache()
    docs = knowledge_service._documents()
    if not docs:
        raise SystemExit("코퍼스가 비어 있습니다. data/knowledge/*.jsonl 을 확인하세요.")

    vectored = sum(1 for doc in docs if doc.vector)
    print(f"평가 세트 {len(cases)}건 | 코퍼스 {len(docs)}건 (벡터 {vectored}건)")

    baseline = None
    if args.baseline:
        path = Path(args.baseline)
        if not path.is_absolute():
            path = EVAL_DIR / path
        baseline = json.loads(path.read_text(encoding="utf-8"))
        print(f"기준선: {path}")

    modes = ["vector", "keyword"] if args.mode == "both" else [args.mode]
    if args.mode == "union":
        settings = get_settings()
        print(
            f"신뢰도 기준: 벡터 >= {settings.knowledge_min_vector_score} "
            f"또는 키워드 >= {settings.knowledge_min_keyword_score} 이면 high"
        )
    report: dict = {}
    for mode in modes:
        rows = run_mode(mode, cases, docs)
        report[mode] = print_report(mode, rows, ks, baseline)
        report[mode]["cases"] = rows

    if args.save:
        path = Path(args.save)
        if not path.is_absolute():
            path = EVAL_DIR / path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n저장: {path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
