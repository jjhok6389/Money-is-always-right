import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

const REVEAL_DURATION_MS = 1000;
const REVEAL_STAGGER_MS = 260;
const COUNT_DURATION_MS = 1350;
const BAR_STAGGER_MS = 220;
const BASELINE_DRAW_MS = 2100;
const PREPARE_EFFECT_MS = 1120;
const FLASH_EFFECT_MS = 440;
const SCENARIO_DRAW_MS = 2200;
const RESULT_REVEAL_MS = 900;
const SIM_GRAPH_ORDER = 3;

function revealStyle(order) {
  return {
    '--reveal-order': order,
    '--reveal-delay': `${order * REVEAL_STAGGER_MS}ms`,
  };
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return reduced;
}

function formatWon(value) {
  return `${Number(value || 0).toLocaleString('ko-KR')}원`;
}

function formatMan(value) {
  const man = Math.round(Number(value || 0) / 10000);
  return `${man.toLocaleString('ko-KR')}만원`;
}

function useCountUp(target, startDelay, resetKey, reducedMotion, duration = COUNT_DURATION_MS) {
  const [value, setValue] = useState(() => (reducedMotion ? Number(target) || 0 : 0));

  useEffect(() => {
    const end = Number(target) || 0;
    if (reducedMotion) {
      const reducedFrame = requestAnimationFrame(() => setValue(end));
      return () => cancelAnimationFrame(reducedFrame);
    }

    let frame;
    const timer = window.setTimeout(() => {
      const startAt = performance.now();
      const tick = (now) => {
        const progress = Math.min(1, (now - startAt) / duration);
        const eased = 1 - Math.pow(1 - progress, 5);
        setValue(Math.round(end * eased));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, startDelay);

    return () => {
      window.clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [target, startDelay, resetKey, reducedMotion, duration]);

  return value;
}

function CountStat({ label, value, order, sceneKey, reducedMotion }) {
  const countDelay = REVEAL_DURATION_MS + order * REVEAL_STAGGER_MS;
  const shown = useCountUp(value, countDelay, sceneKey, reducedMotion);
  return (
    <div className="report-stat report-reveal" style={revealStyle(order)}>
      <dt>{label}</dt>
      <dd>{formatWon(shown)}</dd>
    </div>
  );
}

function GapBar({ current, target, animate, order }) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <div className="report-gap report-reveal" style={revealStyle(order)}>
      <div className="report-gap-progress-meta">
        <span>목표 대비 현재 위치</span>
        <strong>{pct}%</strong>
      </div>
      <div
        className="report-gap-track"
        role="progressbar"
        aria-label="목표 자산 대비 현재 자산"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={pct}
      >
        <div className="report-gap-fill" style={{ width: animate ? `${pct}%` : 0 }} />
      </div>
    </div>
  );
}

function SpendBars({ items, animate, startOrder = 2 }) {
  const max = Math.max(...items.map((i) => i.amount), 1);
  return (
    <ul className={`report-bars ${animate ? 'is-animate' : ''}`}>
      {items.map((item, itemIndex) => (
        <li
          key={item.categoryLabel}
          className={`report-reveal ${itemIndex === 0 ? 'is-primary' : ''}`}
          style={{
            ...revealStyle(startOrder + itemIndex),
            '--bar-delay': `${itemIndex * BAR_STAGGER_MS}ms`,
          }}
        >
          <span className="report-bar-rank" aria-hidden="true">{String(itemIndex + 1).padStart(2, '0')}</span>
          <div className="report-bar-main">
            <span className="report-bar-label">{item.categoryLabel}</span>
            <div className="report-bar-track">
              <div
                className="report-bar-fill"
                style={{ width: `${Math.round((item.amount / max) * 100)}%` }}
              />
            </div>
          </div>
          <span className="report-bar-amt">{formatMan(item.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

function smoothPath(coordinates) {
  if (coordinates.length < 2) return '';
  const tension = 0.18;
  let path = `M ${coordinates[0].x} ${coordinates[0].y}`;
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const previous = coordinates[Math.max(0, index - 1)];
    const current = coordinates[index];
    const next = coordinates[index + 1];
    const following = coordinates[Math.min(coordinates.length - 1, index + 2)];
    const control1 = {
      x: current.x + (next.x - previous.x) * tension,
      y: current.y + (next.y - previous.y) * tension,
    };
    const control2 = {
      x: next.x - (following.x - current.x) * tension,
      y: next.y - (following.y - current.y) * tension,
    };
    path += ` C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${next.x} ${next.y}`;
  }
  return path;
}

function timeTickLabel(month) {
  if (month === 0) return '현재';
  if (month < 12) return `${month}개월`;
  const years = month / 12;
  return Number.isInteger(years) ? `${years}년` : `${years.toFixed(1)}년`;
}

function buildTimeTicks(durationMonths) {
  const interval = durationMonths <= 24
    ? Math.max(3, Math.ceil(durationMonths / 6))
    : durationMonths <= 60
      ? 12
      : Math.max(12, Math.ceil(durationMonths / 60) * 12);
  const ticks = [0];
  for (let month = interval; month < durationMonths; month += interval) ticks.push(month);
  if (durationMonths > 0) ticks.push(durationMonths);
  return [...new Set(ticks)];
}

function TrajectoryChart({ points, phase, onSkip, canSkip, skipped }) {
  const width = 720;
  const height = 330;
  const pad = { top: 28, right: 28, bottom: 48, left: 70 };
  if (!points?.length) {
    return <p className="muted">시뮬레이션 궤적이 없습니다.</p>;
  }

  const last = points[points.length - 1];
  const durationMonths = Math.max(Number(last.monthIndex) || 0, 1);
  const allValues = points.flatMap((point) => [
    Number(point.baselineAssets) || 0,
    Number(point.scenarioAssets) || 0,
    Number(point.targetAssetAmount) || 0,
  ]);
  const rawMin = Math.min(...allValues);
  const rawMax = Math.max(...allValues, 1);
  const padding = Math.max((rawMax - rawMin) * 0.12, rawMax * 0.04, 1);
  const minY = Math.max(0, rawMin - padding);
  const maxY = rawMax + padding;
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const toX = (month) => pad.left + (month / durationMonths) * plotWidth;
  const toY = (value) => pad.top + (1 - (value - minY) / Math.max(maxY - minY, 1)) * plotHeight;
  const baselineCoordinates = points.map((point) => ({
    x: toX(point.monthIndex),
    y: toY(point.baselineAssets),
  }));
  const scenarioCoordinates = points.map((point) => ({
    x: toX(point.monthIndex),
    y: toY(point.scenarioAssets),
  }));
  const baselinePath = smoothPath(baselineCoordinates);
  const scenarioPath = smoothPath(scenarioCoordinates);
  const differenceArea = [
    `M ${baselineCoordinates[0].x} ${baselineCoordinates[0].y}`,
    ...baselineCoordinates.slice(1).map((point) => `L ${point.x} ${point.y}`),
    ...scenarioCoordinates.slice().reverse().map((point) => `L ${point.x} ${point.y}`),
    'Z',
  ].join(' ');
  const timeTicks = buildTimeTicks(durationMonths);
  const yTicks = [minY, minY + (maxY - minY) / 2, maxY];
  const showBaseline = ['baseline', 'hold', 'transition', 'scenario', 'result', 'completed'].includes(phase);
  const showScenario = ['scenario', 'result', 'completed'].includes(phase);
  const showResult = ['result', 'completed'].includes(phase);
  const improvement = Number(last.scenarioAssets || 0) - Number(last.baselineAssets || 0);
  return (
    <div
      className={[
        'report-chart',
        `phase-${phase}`,
        showBaseline ? 'show-baseline' : '',
        showScenario ? 'show-scenario' : '',
        showResult ? 'show-result' : '',
        skipped ? 'is-skipped' : '',
      ].filter(Boolean).join(' ')}
      role={canSkip ? 'button' : undefined}
      tabIndex={canSkip ? 0 : undefined}
      aria-label={canSkip ? '그래프 애니메이션 건너뛰고 최종 결과 보기' : undefined}
      onClick={canSkip ? onSkip : undefined}
      onKeyDown={canSkip ? (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSkip();
        }
      } : undefined}
    >
      <div className="report-chart-stage">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="목표 기간까지의 현재 전략과 개선 전략 자산 궤적">
          <defs>
            <linearGradient id="report-difference-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {yTicks.map((value) => (
            <g key={value} className="report-axis-mark">
              <line x1={pad.left} x2={width - pad.right} y1={toY(value)} y2={toY(value)} />
              <text x={pad.left - 10} y={toY(value) + 4} textAnchor="end">{formatMan(value)}</text>
            </g>
          ))}
          {timeTicks.map((month) => (
            <g key={month} className="report-time-mark">
              <line x1={toX(month)} x2={toX(month)} y1={pad.top} y2={height - pad.bottom} />
              <text x={toX(month)} y={height - 17} textAnchor="middle">{timeTickLabel(month)}</text>
            </g>
          ))}
          <line
            className="report-target"
            x1={pad.left}
            x2={width - pad.right}
            y1={toY(last.targetAssetAmount)}
            y2={toY(last.targetAssetAmount)}
          />
          <text className="report-target-label" x={width - pad.right} y={toY(last.targetAssetAmount) - 8} textAnchor="end">
            목표 {formatMan(last.targetAssetAmount)}
          </text>
          <path className="report-difference-area" d={differenceArea} />
          <path className="report-line baseline" d={baselinePath} fill="none" />
          <path className="report-line scenario" d={scenarioPath} fill="none" />
          <circle className="report-endpoint baseline" cx={baselineCoordinates.at(-1).x} cy={baselineCoordinates.at(-1).y} r="5" />
          <circle className="report-endpoint scenario" cx={scenarioCoordinates.at(-1).x} cy={scenarioCoordinates.at(-1).y} r="5" />
        </svg>
      </div>
      {canSkip && <p className="report-chart-skip">클릭하여 결과 바로 보기</p>}
      <div className="report-chart-legend">
        <span><i className="baseline" aria-hidden="true" />현재 전략 · {formatMan(last.baselineAssets)}</span>
        <span className="report-scenario-legend"><i className="scenario" aria-hidden="true" />개선 전략 · {formatMan(last.scenarioAssets)}</span>
      </div>
      <div className="report-chart-result-slot" aria-live="polite">
        {showResult && (
          <p className="report-chart-result">
            같은 기간 동안 예상 자산이 <strong>{formatWon(Math.max(0, improvement))}</strong> 더 늘어나는 흐름이에요.
          </p>
        )}
      </div>
    </div>
  );
}

function StrategyScene({ report, sceneKey, reducedMotion }) {
  const deposit = Number(report.allocation?.deposit) || 0;
  const etf = Number(report.allocation?.etf) || 0;
  const total = deposit + etf;
  const depositPct = total > 0 ? Math.round((deposit / total) * 100) : 0;
  const etfPct = total > 0 ? 100 - depositPct : 0;
  const amount = useCountUp(
    report.scenarioMonthlyDeposit,
    REVEAL_DURATION_MS + 2 * REVEAL_STAGGER_MS,
    sceneKey,
    reducedMotion,
  );

  return (
    <div className="report-strategy">
      <div className="report-strategy-focus report-reveal" style={revealStyle(2)}>
        <span>월 자산형성 여력</span>
        <strong>{formatWon(amount)}</strong>
        <p>매달 이 금액을 목표 자산에 먼저 배분해보세요.</p>
      </div>

      <div className="report-allocation report-reveal" style={revealStyle(3)}>
        <p className="report-section-label">자산 배분</p>
        <div
          className="report-allocation-track"
          role="img"
          aria-label={`예적금 ${depositPct}%, ETF ${etfPct}%`}
        >
          {depositPct > 0 && <span className="deposit" style={{ width: `${depositPct}%` }} />}
          {etfPct > 0 && <span className="etf" style={{ width: `${etfPct}%` }} />}
        </div>
        <div className="report-allocation-details">
          <div>
            <span><i className="deposit" aria-hidden="true" />안정 자산 · {depositPct}%</span>
            <strong>{formatWon(deposit)}</strong>
            <small>예·적금으로 변동성을 낮춰요.</small>
          </div>
          {etf > 0 && (
            <div>
              <span><i className="etf" aria-hidden="true" />성장 자산 · {etfPct}%</span>
              <strong>{formatWon(etf)}</strong>
              <small>ETF로 장기 성장 가능성을 더해요.</small>
            </div>
          )}
        </div>
      </div>

      <p className="report-achievement report-reveal" style={revealStyle(4)}>
        <span>현재 조건이 유지되는 경우</span>
        {report.monthsScenarioLabel
          ? <strong>약 {report.monthsScenarioLabel} 후 목표에 도달할 것으로 예상돼요.</strong>
          : <strong>설정한 기간 안에 목표 도달이 어려울 수 있어요.</strong>}
      </p>

      <div className="report-strategy-reasons report-reveal" style={revealStyle(5)}>
        <p className="report-section-label">왜 이런 전략인가요?</p>
        {(report.roadmapWhy || []).slice(0, 2).map((line) => <p key={line}>{line}</p>)}
      </div>

      <p className="disclaimer-inline report-strategy-disclaimer report-reveal" style={revealStyle(6)}>
        {report.disclaimer}
      </p>
    </div>
  );
}

function buildScenes(report) {
  const scenes = [
    {
      id: 'status',
      title: '현재 당신의 금융상태',
      lead: '소득·소비·여력을 한눈에 정리했습니다.',
    },
  ];
  if (report.type === 'monthly' && report.comparison) {
    scenes.push({
      id: 'compare',
      title: '지난 리포트와 비교하면',
      lead: report.comparison.summaryText || '변화를 확인해 보세요.',
    });
  }
  scenes.push(
    {
      id: 'gap',
      title: report.onTrack
        ? '목표는 현재 궤적 안에 있어요'
        : '그런데 목표를 달성하기에는 조금 부족합니다',
      lead: report.goalDescription || '설정한 목표와 현재 계획을 비교합니다.',
    },
    {
      id: 'spend',
      title: '어디에서 개선할 수 있을까요?',
      lead: report.hasLinkedConsumption
        ? '소비 카테고리 비중을 살펴봤습니다.'
        : '연동된 소비가 없어 프로필 고정지출 기준으로 안내합니다.',
    },
    {
      id: 'insight',
      title: '코치의 한 줄 진단',
      lead: '숫자 근거로 짧게 정리했습니다.',
    },
    {
      id: 'sim',
      title: `${formatMan(report.delta)}을 바꾸면 미래는?`,
      lead: '현재 전략과 개선 전략의 자산 궤적입니다.',
    },
    {
      id: 'strategy',
      title: '당신에게 제안하는 금융전략',
      lead: '월 자산형성 배분과 예상 달성 시점입니다.',
    },
    {
      id: 'done',
      title: '분석이 완료되었습니다',
      lead: '이제 금융 현황을 지속적으로 관리하고 다른 전략도 직접 시뮬레이션해볼 수 있습니다.',
    },
  );
  return scenes;
}

export default function CoachReportPlayer({
  report,
  onDashboardStart,
  dashboardStartPending = false,
}) {
  const scenes = useMemo(() => buildScenes(report), [report]);
  const [index, setIndex] = useState(0);
  const [sceneRun, setSceneRun] = useState(0);
  const [readySceneKey, setReadySceneKey] = useState(null);
  const [simulationState, setSimulationState] = useState({ key: null, phase: 'idle' });
  const [skippedSceneKey, setSkippedSceneKey] = useState(null);
  const simulationTimersRef = useRef([]);
  const simulationRunTokenRef = useRef(0);
  const playerRef = useRef(null);
  const reducedMotion = useReducedMotion();
  const scene = scenes[index];
  const isFirst = index === 0;
  const isLast = index === scenes.length - 1;
  const sceneKey = `${report.reportId}-${scene.id}-${sceneRun}`;
  const visualsReady = reducedMotion || readySceneKey === sceneKey;
  const simulationPhase = reducedMotion
    ? 'completed'
    : simulationState.key === sceneKey
      ? simulationState.phase
      : 'idle';

  const bodyLastOrder = (() => {
    switch (scene.id) {
      case 'status': return 4;
      case 'compare': return 3;
      case 'gap': return 6;
      case 'spend': return Math.max(2, 1 + (report.consumptionTop || []).length);
      case 'sim': return 4;
      case 'strategy': return 6;
      case 'insight': return 4;
      case 'done': return 4;
      default: return 2;
    }
  })();
  const navOrder = bodyLastOrder + 1;

  useEffect(() => {
    setIndex(0);
  }, [report.reportId]);

  const moveScene = (nextIndex) => {
    simulationRunTokenRef.current += 1;
    simulationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    simulationTimersRef.current = [];
    setSceneRun((run) => run + 1);
    setIndex(nextIndex);
  };

  const skipSimulation = () => {
    if (scene.id !== 'sim' || simulationPhase === 'completed') return;
    simulationRunTokenRef.current += 1;
    simulationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    simulationTimersRef.current = [];
    setSkippedSceneKey(sceneKey);
    setSimulationState({ key: sceneKey, phase: 'completed' });
  };

  useEffect(() => {
    if (reducedMotion) return undefined;

    const visualOrder = scene.id === 'gap'
        ? 4
        : scene.id === 'spend'
          ? 2
          : null;
    if (visualOrder == null) return undefined;

    const timer = window.setTimeout(
      () => setReadySceneKey(sceneKey),
      REVEAL_DURATION_MS + visualOrder * REVEAL_STAGGER_MS,
    );
    return () => window.clearTimeout(timer);
  }, [sceneKey, scene.id, bodyLastOrder, reducedMotion]);

  useEffect(() => {
    if (scene.id !== 'sim' || reducedMotion) return undefined;

    simulationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    simulationTimersRef.current = [];
    const runToken = simulationRunTokenRef.current + 1;
    simulationRunTokenRef.current = runToken;
    const schedule = (phase, delay, next) => {
      const timer = window.setTimeout(() => {
        if (simulationRunTokenRef.current !== runToken) return;
        setSimulationState({ key: sceneKey, phase });
        if (next) next();
      }, delay);
      simulationTimersRef.current = [timer];
    };
    const graphEnteredAt = REVEAL_DURATION_MS + SIM_GRAPH_ORDER * REVEAL_STAGGER_MS;

    schedule('baseline', graphEnteredAt, () => {
      schedule('hold', BASELINE_DRAW_MS, () => {
        schedule('transition', PREPARE_EFFECT_MS, () => {
          schedule('scenario', FLASH_EFFECT_MS, () => {
            schedule('result', SCENARIO_DRAW_MS, () => {
              schedule('completed', RESULT_REVEAL_MS);
            });
          });
        });
      });
    });

    return () => {
      if (simulationRunTokenRef.current === runToken) {
        simulationRunTokenRef.current += 1;
      }
      simulationTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      simulationTimersRef.current = [];
    };
  }, [scene.id, sceneKey, reducedMotion]);

  useEffect(() => {
    const shell = playerRef.current?.closest('.report-shell');
    if (!shell || scene.id !== 'sim' || simulationPhase !== 'hold' || reducedMotion) {
      return undefined;
    }

    shell.style.setProperty('--report-drumroll-duration', `${PREPARE_EFFECT_MS}ms`);
    shell.classList.add('is-simulation-drumroll');

    return () => {
      shell.classList.remove('is-simulation-drumroll');
      shell.style.removeProperty('--report-drumroll-duration');
    };
  }, [scene.id, sceneKey, simulationPhase, reducedMotion]);

  const renderBody = () => {
    switch (scene.id) {
      case 'status':
        return (
          <dl className="report-stats">
            <CountStat label="월평균 소득" value={report.income} order={2} sceneKey={sceneKey} reducedMotion={reducedMotion} />
            <CountStat label="월평균 소비" value={report.spend} order={3} sceneKey={sceneKey} reducedMotion={reducedMotion} />
            <CountStat label="월 자산형성 여력" value={report.capacity} order={4} sceneKey={sceneKey} reducedMotion={reducedMotion} />
          </dl>
        );
      case 'compare':
        return (
          <div className="report-compare">
            <dl className="report-compare-rows">
              <div className="report-reveal" style={revealStyle(2)}>
                <dt>월 자산형성 여력</dt>
                <dd>
                  <span><small>지난 리포트</small>{formatWon(report.comparison?.previousCapacity)}</span>
                  <i aria-hidden="true">→</i>
                  <strong><small>이번 리포트</small>{formatWon(report.capacity)}</strong>
                </dd>
              </div>
              <div className="report-reveal" style={revealStyle(3)}>
                <dt>예상 목표 달성</dt>
                <dd>
                  <span><small>지난 리포트</small>{report.comparison?.previousMonthsScenarioLabel || '-'}</span>
                  <i aria-hidden="true">→</i>
                  <strong><small>이번 리포트</small>{report.monthsScenarioLabel || '-'}</strong>
                </dd>
              </div>
            </dl>
          </div>
        );
      case 'gap':
        return (
          <div className="report-gap-block">
            <div className="report-gap-values">
              <div className="report-reveal" style={revealStyle(2)}>
                <span>현재 자산</span>
                <strong>{formatWon(report.currentAssets)}</strong>
              </div>
              <div className="report-reveal" style={revealStyle(3)}>
                <span>목표 자산</span>
                <strong>{formatWon(report.targetAssets)}</strong>
              </div>
            </div>
            <GapBar current={report.currentAssets} target={report.targetAssets} animate={visualsReady} order={4} />
            <dl className="report-gap-timing">
              <div className="report-reveal" style={revealStyle(5)}>
                <dt>현재 계획 예상 달성</dt>
                <dd>{report.monthsBaselineLabel || '산출 불가'}</dd>
              </div>
              <div className="report-reveal" style={revealStyle(6)}>
                <dt>설정한 목표 기간</dt>
                <dd>{report.targetYears}년</dd>
              </div>
            </dl>
          </div>
        );
      case 'spend':
        return <SpendBars items={report.consumptionTop || []} animate={visualsReady} />;
      case 'insight':
        return (
          <div className="report-insight">
            <p className="report-insight-label report-reveal" style={revealStyle(2)}>코치 진단</p>
            <blockquote className="report-insight-quote report-reveal" style={revealStyle(3)}>
              {report.insightText}
            </blockquote>
            <div className="report-insight-action report-reveal" style={revealStyle(4)}>
              <span>이번 달 실천 제안</span>
              <p><strong>{formatWon(report.delta)}</strong>을 자산형성에 먼저 옮겨보세요.</p>
            </div>
          </div>
        );
      case 'sim':
        return (
          <div>
            <div className="report-sim-heads">
              <span className="report-reveal" style={revealStyle(2)}>현재 전략 · {formatMan(report.baselineFinalAssets)}</span>
            </div>
            <div className="report-reveal" style={revealStyle(SIM_GRAPH_ORDER)}>
              <TrajectoryChart
                points={report.trajectory}
                phase={simulationPhase}
                onSkip={skipSimulation}
                canSkip={!reducedMotion && simulationPhase !== 'completed'}
                skipped={skippedSceneKey === sceneKey}
              />
            </div>
          </div>
        );
      case 'strategy':
        return <StrategyScene report={report} sceneKey={sceneKey} reducedMotion={reducedMotion} />;
      case 'done':
        return (
          <div className="report-done">
            <p className="report-reveal" style={revealStyle(2)}>이 보고서는 리포트 보관함에 저장되어 언제든 다시 볼 수 있습니다.</p>
            {onDashboardStart ? (
              <button
                type="button"
                className="btn btn-primary report-reveal"
                style={revealStyle(3)}
                disabled={dashboardStartPending}
                onClick={onDashboardStart}
              >
                {dashboardStartPending ? '완료 상태 저장 중...' : '내 금융생활 시작하기'}
              </button>
            ) : (
              <Link to="/dashboard" className="btn btn-primary report-reveal" style={revealStyle(3)}>
                내 금융생활 시작하기
              </Link>
            )}
            {!onDashboardStart && (
              <Link to="/reports" className="btn btn-ghost report-reveal" style={revealStyle(4)}>
                리포트 목록 보기
              </Link>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <section className="report-player" ref={playerRef}>
      {scene.id === 'sim' && simulationPhase === 'transition' && (
        <div
          className="report-page-flash"
          style={{ '--page-flash-duration': `${FLASH_EFFECT_MS}ms` }}
          aria-hidden="true"
        />
      )}
      <div className="report-progress">
        <span>
          {index + 1}/{scenes.length}
        </span>
        <div className="report-progress-track">
          <div
            className="report-progress-fill"
            style={{ width: `${((index + 1) / scenes.length) * 100}%` }}
          />
        </div>
      </div>
      <header className="report-scene-head" key={`head-${sceneKey}`}>
        <h1 className="report-reveal" style={revealStyle(0)}>{scene.title}</h1>
        <p className="lead report-reveal" style={revealStyle(1)}>{scene.lead}</p>
      </header>
      <div className="report-scene-body" key={sceneKey}>
        {renderBody()}
      </div>
      {(scene.id !== 'sim' || simulationPhase === 'completed') && <div
        className="report-nav report-reveal"
        key={`nav-${sceneKey}`}
        style={scene.id === 'sim' ? { '--reveal-delay': '0ms' } : revealStyle(navOrder)}
      >
        <button
          type="button"
          className="report-arrow report-arrow-back"
          aria-label="이전 장면"
          disabled={isFirst}
          onClick={() => moveScene(Math.max(0, index - 1))}
        >
          <span aria-hidden="true">←</span>
        </button>
        {!isLast ? (
          <button
            type="button"
            className="report-arrow"
            aria-label="다음 장면"
            onClick={() => moveScene(Math.min(scenes.length - 1, index + 1))}
          >
            <span aria-hidden="true">→</span>
          </button>
        ) : (
          onDashboardStart ? (
            <button
              type="button"
              className="report-arrow"
              aria-label="내 금융생활로 이동"
              disabled={dashboardStartPending}
              onClick={onDashboardStart}
            >
              <span aria-hidden="true">→</span>
            </button>
          ) : (
            <Link to="/dashboard" className="report-arrow" aria-label="대시보드로 이동">
              <span aria-hidden="true">→</span>
            </Link>
          )
        )}
      </div>}
    </section>
  );
}
