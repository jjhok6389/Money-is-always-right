import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

function formatWon(value) {
  return `${Number(value || 0).toLocaleString('ko-KR')}원`;
}

function formatMan(value) {
  const man = Math.round(Number(value || 0) / 10000);
  return `${man.toLocaleString('ko-KR')}만원`;
}

function useCountUp(target, active, duration = 900) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!active) {
      setValue(Number(target) || 0);
      return undefined;
    }
    const end = Number(target) || 0;
    const startAt = performance.now();
    let frame;
    const tick = (now) => {
      const t = Math.min(1, (now - startAt) / duration);
      const eased = 1 - (1 - t) * (1 - t);
      setValue(Math.round(end * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, active, duration]);
  return value;
}

function CountStat({ label, value, active }) {
  const shown = useCountUp(value, active);
  return (
    <div className="report-stat">
      <dt>{label}</dt>
      <dd>{formatWon(shown)}</dd>
    </div>
  );
}

function GapBar({ current, target }) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  return (
    <div className="report-gap">
      <div className="report-gap-track">
        <div className="report-gap-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="report-gap-labels">
        <span>현재 {formatMan(current)}</span>
        <span>목표 {formatMan(target)}</span>
      </div>
    </div>
  );
}

function SpendBars({ items, animate }) {
  const max = Math.max(...items.map((i) => i.amount), 1);
  return (
    <ul className={`report-bars ${animate ? 'is-animate' : ''}`}>
      {items.map((item) => (
        <li key={item.categoryLabel}>
          <span className="report-bar-label">{item.categoryLabel}</span>
          <div className="report-bar-track">
            <div
              className="report-bar-fill"
              style={{ width: `${Math.round((item.amount / max) * 100)}%` }}
            />
          </div>
          <span className="report-bar-amt">{formatMan(item.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

function TrajectoryChart({ points, animate }) {
  const width = 320;
  const height = 160;
  const pad = 12;
  if (!points?.length) {
    return <p className="muted">시뮬레이션 궤적이 없습니다.</p>;
  }
  const maxY = Math.max(
    ...points.flatMap((p) => [p.baselineAssets, p.scenarioAssets, p.targetAssetAmount]),
    1,
  );
  const toX = (i) => pad + (i / Math.max(points.length - 1, 1)) * (width - pad * 2);
  const toY = (v) => height - pad - (v / maxY) * (height - pad * 2);
  const baseline = points.map((p, i) => `${toX(i)},${toY(p.baselineAssets)}`).join(' ');
  const scenario = points.map((p, i) => `${toX(i)},${toY(p.scenarioAssets)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <div className={`report-chart ${animate ? 'is-animate' : ''}`}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="자산 궤적 비교">
        <polyline className="report-line baseline" points={baseline} fill="none" />
        <polyline className="report-line scenario" points={scenario} fill="none" />
        <line
          className="report-target"
          x1={pad}
          x2={width - pad}
          y1={toY(last.targetAssetAmount)}
          y2={toY(last.targetAssetAmount)}
        />
      </svg>
      <div className="report-chart-legend">
        <span>현재 전략 · {formatMan(last.baselineAssets)}</span>
        <span>개선 전략 · {formatMan(last.scenarioAssets)}</span>
      </div>
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

export default function CoachReportPlayer({ report }) {
  const scenes = useMemo(() => buildScenes(report), [report]);
  const [index, setIndex] = useState(0);
  const scene = scenes[index];
  const isFirst = index === 0;
  const isLast = index === scenes.length - 1;

  useEffect(() => {
    setIndex(0);
  }, [report.reportId]);

  const renderBody = () => {
    switch (scene.id) {
      case 'status':
        return (
          <dl className="report-stats">
            <CountStat label="월평균 소득" value={report.income} active />
            <CountStat label="월평균 소비" value={report.spend} active />
            <CountStat label="월 자산형성 여력" value={report.capacity} active />
          </dl>
        );
      case 'compare':
        return (
          <div className="report-compare">
            <p className="report-compare-text">{report.comparison?.summaryText}</p>
            <dl className="summary-grid">
              <div>
                <dt>지난 여력</dt>
                <dd>{formatWon(report.comparison?.previousCapacity)}</dd>
              </div>
              <div>
                <dt>이번 여력</dt>
                <dd>{formatWon(report.capacity)}</dd>
              </div>
              <div>
                <dt>지난 예상 달성</dt>
                <dd>{report.comparison?.previousMonthsScenarioLabel || '-'}</dd>
              </div>
              <div>
                <dt>이번 예상 달성</dt>
                <dd>{report.monthsScenarioLabel || '-'}</dd>
              </div>
            </dl>
          </div>
        );
      case 'gap':
        return (
          <div className="report-gap-block">
            <GapBar current={report.currentAssets} target={report.targetAssets} />
            <dl className="summary-grid">
              <div>
                <dt>현재 계획</dt>
                <dd>예상 달성 {report.monthsBaselineLabel || '산출 불가'}</dd>
              </div>
              <div>
                <dt>설정한 목표</dt>
                <dd>{report.targetYears}년</dd>
              </div>
            </dl>
          </div>
        );
      case 'spend':
        return <SpendBars items={report.consumptionTop || []} animate />;
      case 'insight':
        return <p className="report-insight">{report.insightText}</p>;
      case 'sim':
        return (
          <div>
            <div className="report-sim-heads">
              <span>현재 전략 · {formatMan(report.baselineFinalAssets)}</span>
              <span>개선 전략 · {formatMan(report.scenarioFinalAssets)}</span>
            </div>
            <TrajectoryChart points={report.trajectory} animate />
          </div>
        );
      case 'strategy':
        return (
          <div className="report-strategy">
            <p className="report-strategy-hero">
              월 자산형성 <strong>{formatWon(report.scenarioMonthlyDeposit)}</strong>
            </p>
            <ul className="report-alloc">
              <li>
                <span>예·적금</span>
                <strong>{formatWon(report.allocation?.deposit)}</strong>
              </li>
              {report.propensity !== 'stable' && (report.allocation?.etf || 0) > 0 ? (
                <li>
                  <span>ETF</span>
                  <strong>{formatWon(report.allocation?.etf)}</strong>
                </li>
              ) : null}
            </ul>
            <p>
              예상 목표달성 <strong>{report.monthsScenarioLabel || '기간 내 미도달'}</strong>
            </p>
            <ul className="report-why">
              {(report.roadmapWhy || []).slice(0, 2).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="disclaimer-inline">{report.disclaimer}</p>
          </div>
        );
      case 'done':
        return (
          <div className="report-done">
            <p>이 보고서는 리포트 보관함에 저장되어 언제든 다시 볼 수 있습니다.</p>
            <Link to="/dashboard" className="btn btn-primary">
              내 금융 대시보드 시작하기
            </Link>
            <Link to="/reports" className="btn btn-ghost">
              리포트 목록 보기
            </Link>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <section className="report-player">
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
      <header className="report-scene-head">
        <h1>{scene.title}</h1>
        <p className="lead">{scene.lead}</p>
      </header>
      <div className="report-scene-body" key={`${report.reportId}-${scene.id}`}>
        {renderBody()}
      </div>
      <div className="report-nav">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={isFirst}
          onClick={() => setIndex((v) => Math.max(0, v - 1))}
        >
          이전
        </button>
        {!isLast ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setIndex((v) => Math.min(scenes.length - 1, v + 1))}
          >
            다음
          </button>
        ) : (
          <Link to="/dashboard" className="btn btn-primary">
            대시보드로
          </Link>
        )}
      </div>
    </section>
  );
}
