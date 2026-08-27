import { useState } from 'react';

function hasNumber(value) {
  if (value === null || value === undefined || value === '') return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return Number.isFinite(Number(value));
}

function formatEffectAmount(value) {
  if (!hasNumber(value)) return null;
  const amount = Number(value);
  if (Number.isInteger(amount) && amount % 10_000 === 0) {
    return `${(amount / 10_000).toLocaleString('ko-KR')}만원`;
  }
  return `${amount.toLocaleString('ko-KR')}원`;
}

function monthLabel(value) {
  const [year, month] = String(value || '').split('-');
  return year && month ? `${year}년 ${Number(month)}월` : value;
}

function formatTargetMonth(value) {
  const matched = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
  if (!matched) return '목표 시점을 확인 중이에요';
  const month = Number(matched[2]);
  if (month < 1 || month > 12) return '목표 시점을 확인 중이에요';
  return `${matched[1]}년 ${month}월까지`;
}

function formatRemainingPeriod(value, targetReviewRequired) {
  if (targetReviewRequired) return '목표 시점 점검이 필요해요';
  if (!hasNumber(value)) return '남은 기간을 확인 중이에요';

  const totalMonths = Number(value);
  if (!Number.isInteger(totalMonths) || totalMonths < 0) {
    return '남은 기간을 확인 중이에요';
  }
  if (totalMonths === 0) return '이번 달이 목표 시점이에요';

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const parts = [];
  if (years > 0) parts.push(`${years}년`);
  if (months > 0) parts.push(`${months}개월`);
  return `${parts.join(' ')} 남음`;
}

const ROADMAP_PHASES = [
  { label: '교정', question: '' },
  { label: '자동화', question: '' },
  { label: '확장', question: '' },
];

const STATUS_LABELS = {
  CURRENT: '현재 실행',
  PLANNED: '다음 실행',
  EXPECTED: '예정',
  PROVISIONAL: '예정 계획',
  CHECKPOINT: '재점검',
};

function FullRoadmap({ roadmap }) {
  const plan = roadmap.longTermPlan;
  if (!plan) {
    return <p className="personal-roadmap-empty">전체 계획을 보려면 로드맵을 다시 생성해 주세요.</p>;
  }

  const targetMonth = roadmap.goal.targetMonth;
  const detailedMonths = (roadmap.months || []).filter((item) => item.month <= targetMonth);
  const entries = [];
  if (detailedMonths.length > 0) {
    entries.push({
      key: 'current-window',
      month: detailedMonths[0].month,
      endMonth: detailedMonths[detailedMonths.length - 1].month,
      type: 'CURRENT_WINDOW',
      status: 'CURRENT',
      title: '현재 3개월 상세 실행 계획',
      description: '교정 → 자동화 → 확장 순서로 지금 실행할 행동을 구체화합니다.',
      actions: detailedMonths,
    });
  }
  (plan.segments || []).forEach((segment, index) => {
    entries.push({ ...segment, key: `segment-${index}`, month: segment.startMonth });
  });
  (plan.checkpoints || []).forEach((checkpoint, index) => {
    entries.push({ ...checkpoint, key: `checkpoint-${index}` });
  });
  entries.sort((left, right) => (
    left.month.localeCompare(right.month)
    || (left.type === 'TARGET_REVIEW' ? 1 : -1)
  ));

  const grouped = entries.reduce((result, entry) => {
    const year = String(entry.month).slice(0, 4);
    if (!result[year]) result[year] = [];
    result[year].push(entry);
    return result;
  }, {});

  return (
    <div className="personal-roadmap-full">
      <div className="personal-roadmap-full-summary">
        <div><small>고정 목표 월</small><strong>{monthLabel(targetMonth)}</strong></div>
        <div><small>남은 기간</small><strong>{plan.remainingMonths}개월</strong></div>
      </div>
      <p className="personal-roadmap-rolling-note">
        가까운 3개월은 상세 행동으로 보여드리고, 이후 계획은 3개월마다 최신 금융데이터를 반영해 다시 계산해요.
      </p>
      <div className="personal-roadmap-years">
        {Object.entries(grouped).map(([year, yearEntries]) => (
          <section key={year} className="personal-roadmap-year" aria-labelledby={`roadmap-year-${year}`}>
            <h3 id={`roadmap-year-${year}`}>{year}년</h3>
            <ol>
              {yearEntries.map((entry) => (
                <li key={entry.key} className={entry.type?.includes('REVIEW') || entry.type === 'RECALCULATE' ? 'is-checkpoint' : ''}>
                  <details>
                    <summary>
                      <span>
                        {monthLabel(entry.month)}
                        {entry.endMonth && entry.endMonth !== entry.month ? ` — ${monthLabel(entry.endMonth)}` : ''}
                      </span>
                      <strong>{entry.title}</strong>
                      <small>{STATUS_LABELS[entry.status] || (entry.type === 'TARGET_REVIEW' ? '목표 점검' : '재점검')}</small>
                    </summary>
                    <div className="personal-roadmap-timeline-detail">
                      <p>{entry.description}</p>
                      {entry.actions && (
                        <ul>
                          {entry.actions.map((item, index) => (
                            <li key={item.month}>
                              <b>{ROADMAP_PHASES[index]?.label || '실행'}</b> · {item.primaryAction.title}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </details>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

function getEffectDetails(effect) {
  if (!effect) return null;

  const amountChange = hasNumber(effect.expectedAmountChange)
    ? Number(effect.expectedAmountChange)
    : null;
  const shortfallBefore = hasNumber(effect.shortfallBefore)
    ? Number(effect.shortfallBefore)
    : null;
  const shortfallAfter = hasNumber(effect.shortfallAfter)
    ? Number(effect.shortfallAfter)
    : null;
  const monthsSaved = hasNumber(effect.estimatedMonthsSaved)
    ? Number(effect.estimatedMonthsSaved)
    : null;
  const showAmountChange = amountChange !== null && amountChange > 0;
  const showShortfallChange =
    shortfallBefore !== null &&
    shortfallAfter !== null &&
    shortfallAfter < shortfallBefore;
  const showMonthsSaved = monthsSaved !== null && monthsSaved > 0;

  if (!showAmountChange && !showShortfallChange && !showMonthsSaved) return null;

  let summary;
  if (showShortfallChange) {
    summary = `부족액 약 ${formatEffectAmount(shortfallBefore)} → ${formatEffectAmount(shortfallAfter)}`;
  } else if (showAmountChange) {
    summary = `목표 시점 자산 약 ${formatEffectAmount(amountChange)} 증가 가능`;
  } else {
    summary = `목표 도달 약 ${monthsSaved}개월 단축 가능`;
  }

  return {
    amountChange,
    shortfallBefore,
    shortfallAfter,
    monthsSaved,
    showAmountChange,
    showShortfallChange,
    showMonthsSaved,
    assumptionBased: effect.assumptionBased,
    summary,
  };
}

function Effect({ details }) {
  if (!details) return null;
  return (
    <div className="personal-roadmap-effect">
      <strong>예상 효과</strong>
      {details.showAmountChange && (
        <p>
          이 행동을 매달 유지하면 목표 시점의 자산이 지금 예상보다 약{' '}
          {formatEffectAmount(details.amountChange)} 늘어날 수 있어요.
        </p>
      )}
      {details.showShortfallChange && (
        <p>
          목표금액까지 부족한 금액을 약 {formatEffectAmount(details.shortfallBefore)}에서{' '}
          {formatEffectAmount(details.shortfallAfter)}으로 줄일 수 있어요.
        </p>
      )}
      {details.showMonthsSaved && (
        <p>현재 계획보다 목표에 약 {details.monthsSaved}개월 더 빠르게 도달할 수 있어요.</p>
      )}
      {details.assumptionBased && (
        <small>현재 금융데이터와 계산 가정을 바탕으로 한 예상 결과예요.</small>
      )}
    </div>
  );
}

function CalculationBasis({ basis }) {
  if (!basis) return null;
  const expenseReduction = hasNumber(basis.scenarioChanges?.monthlyExpensesDelta)
    ? Number(basis.scenarioChanges.monthlyExpensesDelta)
    : null;

  return (
    <details className="personal-roadmap-basis">
      <summary>어떻게 계산했나요?</summary>
      <p>
        {expenseReduction !== null && expenseReduction < 0
          ? '현재 월 소득과 생활비를 기준으로, 매달 소비를 줄인 금액을 목표 시점까지 계속 저축한다고 가정했어요.'
          : '현재 금융데이터에 제공된 계산 조건을 적용해 행동 전후의 결과를 비교했어요.'}
      </p>
      {basis.note && <p>{basis.note}</p>}
      {hasNumber(basis.annualInterestRate) && hasNumber(basis.horizonMonths) && (
        <p>연 {basis.annualInterestRate}% · {basis.horizonMonths}개월 기준</p>
      )}
    </details>
  );
}

function ExecutionMeans({ means }) {
  if (!means?.length) return null;
  return (
    <div className="personal-roadmap-means">
      <strong>실행 수단 후보</strong>
      <ul>
        {means.map((item) => (
          <li key={`${item.type}-${item.identifier || item.title}`}>{item.title}</li>
        ))}
      </ul>
    </div>
  );
}

export default function PersonalRoadmapPanel({ roadmap, loading, error, onRetry, displayName }) {
  const roadmapKey = roadmap ? `${roadmap.roadmapId}:${roadmap.generatedAt}` : 'empty';
  const [expanded, setExpanded] = useState({ roadmapKey, index: 0 });
  const [view, setView] = useState({ roadmapKey, mode: 'short' });
  const expandedIndex = expanded.roadmapKey === roadmapKey ? expanded.index : 0;
  const activeView = view.roadmapKey === roadmapKey ? view.mode : 'short';
  const normalizedName = typeof displayName === 'string' ? displayName.trim() : '';
  const journeyTitle = normalizedName ? `${normalizedName}님의 목표 여정` : '목표를 향한 여정';
  const targetMonthText = formatTargetMonth(roadmap?.goal?.targetMonth);
  const remainingPeriodText = formatRemainingPeriod(
    roadmap?.longTermPlan?.remainingMonths,
    roadmap?.longTermPlan?.targetReviewRequired === true,
  );

  const toggleCard = (index) => {
    setExpanded((previous) => {
      const activeIndex = previous.roadmapKey === roadmapKey ? previous.index : 0;
      return {
        roadmapKey,
        index: activeIndex === index ? null : index,
      };
    });
  };

  return (
    <section className="panel personal-roadmap-panel" aria-busy={loading}>
      <div className="personal-roadmap-heading">
        <div>
          <h2>금융 로드맵</h2>
          {roadmap && (
            <div className="personal-roadmap-heading-row">
              <div className="personal-roadmap-journey">
                <p className="personal-roadmap-journey-owner">{journeyTitle}</p>
                <p className="personal-roadmap-journey-target">
                  <span>{targetMonthText}</span>
                  <span className="personal-roadmap-journey-separator" aria-hidden="true">·</span>
                  <span>{remainingPeriodText}</span>
                </p>
              </div>
              <div
                className="personal-roadmap-view-tabs"
                role="tablist"
                aria-label="금융 로드맵 보기 방식"
                data-active-view={activeView}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeView === 'short'}
                  onClick={() => setView({ roadmapKey, mode: 'short' })}
                >
                  3개월 보기
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeView === 'full'}
                  onClick={() => setView({ roadmapKey, mode: 'full' })}
                >
                  전체 보기
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {loading && !roadmap && (
        <p className="muted" role="status" aria-live="polite">
          개인 금융 로드맵을 계산하는 중...
        </p>
      )}
      {error && (
        <div className="personal-roadmap-error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-ghost" onClick={onRetry}>다시 시도</button>
        </div>
      )}

      {roadmap && (
        <div aria-live="polite">
          {roadmap.longTermPlan?.targetReviewRequired && (
            <p className="personal-roadmap-target-alert" role="alert">
              설정한 목표 월이 지났어요. 달성 여부를 확인한 뒤 목표 기간을 다시 설정해 주세요.
            </p>
          )}

          {activeView === 'short' ? <ol className="personal-roadmap-cards">
            {(roadmap.months || []).map((item, index) => {
              const action = item.primaryAction;
              const phase = ROADMAP_PHASES[index] || ROADMAP_PHASES[ROADMAP_PHASES.length - 1];
              const effectDetails = getEffectDetails(action.expectedEffect);
              const isExpanded = expandedIndex === index;
              const detailId = `personal-roadmap-detail-${index}`;
              return (
                <li
                  key={`${item.month}-${action.actionType}`}
                  className={`${item.status === 'CURRENT' ? 'is-current' : ''} ${isExpanded ? 'is-expanded' : ''}`}
                >
                  <article className="personal-roadmap-card">
                    <button
                      type="button"
                      className="personal-roadmap-card-toggle"
                      aria-expanded={isExpanded}
                      aria-controls={detailId}
                      onClick={() => toggleCard(index)}
                    >
                      <span className="personal-roadmap-card-topline">
                        <span className="personal-roadmap-card-month">{monthLabel(item.month)}</span>
                        <span className="personal-roadmap-status">{item.status}</span>
                      </span>
                      <span className="personal-roadmap-card-phase">{index + 1}개월 차 · {phase.label}</span>
                      <strong className="personal-roadmap-card-title">{action.title}</strong>
                      <span className="personal-roadmap-card-reason">{action.reason}</span>
                      {effectDetails && (
                        <span className="personal-roadmap-card-effect">
                          <small>예상 변화</small>
                          <strong>{effectDetails.summary}</strong>
                        </span>
                      )}
                      <span className="personal-roadmap-card-more">
                        {isExpanded ? '간단히 보기' : '자세히 보기'}
                        <span aria-hidden="true" className="personal-roadmap-card-chevron">⌄</span>
                      </span>
                    </button>

                    <div
                      id={detailId}
                      className="personal-roadmap-card-detail"
                      hidden={!isExpanded}
                    >
                      {isExpanded && (
                        <>
                        <p className="personal-roadmap-phase-question">{phase.question}</p>
                        <div className="personal-roadmap-detail-reason">
                          <strong>왜 필요한가요?</strong>
                          <p>{action.reason}</p>
                        </div>
                        <Effect details={effectDetails} />
                        {effectDetails && <CalculationBasis basis={action.basis} />}
                        <ExecutionMeans means={action.executionMeans} />
                        {action.investmentDisclaimer && (
                          <p className="disclaimer-inline">{action.investmentDisclaimer}</p>
                        )}
                        {item.secondaryAction && (
                          <div className="personal-roadmap-secondary">
                            <p className="personal-roadmap-label">함께 검토할 일</p>
                            <h4>{item.secondaryAction.title}</h4>
                            <p>{item.secondaryAction.reason}</p>
                            <ExecutionMeans means={item.secondaryAction.executionMeans} />
                            {item.secondaryAction.investmentDisclaimer && (
                              <p className="disclaimer-inline">
                                {item.secondaryAction.investmentDisclaimer}
                              </p>
                            )}
                          </div>
                        )}
                        </>
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ol> : <FullRoadmap roadmap={roadmap} />}

          <details className="personal-roadmap-warnings">
            <summary>로드맵 이용 안내</summary>
            <p>
              이 로드맵은 현재 확인 가능한 금융데이터와 계산 가정을 바탕으로 만든 참고용 계획이며,
              정답이나 확정된 결과가 아니에요. 실제 소득·지출·자산·부채와 시장 상황에 따라
              계획과 예상 결과가 달라질 수 있어요.
            </p>
            <p>
              저축, 투자, 부채 상환 및 금융상품 이용에 관한 최종 선택은 사용자 본인의 판단에
              따라 결정해 주세요.
            </p>
          </details>
        </div>
      )}
    </section>
  );
}
