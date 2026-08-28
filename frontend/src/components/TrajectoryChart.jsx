import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const GRID_COLOR = '#dce3ee';
const TWIN_COLORS = {
  baseline: '#0f2744',
  scenario: '#3d5a80',
  target: '#8a97ab',
  debt: '#b42318',
  netWorth: '#067647',
};
const PORTFOLIO_COLORS = {
  total: '#0f2744',
  saving: '#3d5a80',
  deposit: '#5c6b8a',
  etf: '#1b3a5f',
  debt: '#b42318',
  netWorth: '#067647',
};

export function formatWon(value) {
  return `${Math.round(Number(value) || 0).toLocaleString('ko-KR')}원`;
}

function formatAxisValue(value) {
  const amount = Math.round(Number(value) || 0);
  if (Math.abs(amount) >= 100000000) {
    const eok = amount / 100000000;
    return Number.isInteger(eok) ? `${eok}억` : `${eok.toFixed(1)}억`;
  }
  if (Math.abs(amount) >= 10000) {
    return `${Math.round(amount / 10000)}만`;
  }
  return amount.toLocaleString('ko-KR');
}

function downsample(data) {
  const step = data.length > 96 ? 3 : data.length > 48 ? 2 : 1;
  return data.filter((_, index) => index % step === 0 || index === data.length - 1);
}

function yDomain(data, keys) {
  let min = Infinity;
  let max = -Infinity;
  data.forEach((point) => {
    keys.forEach((key) => {
      const value = Number(point[key]);
      if (Number.isFinite(value)) {
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
    });
  });
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return [0, 1];
  }
  if (min === max) {
    const pad = Math.max(min * 0.1, 10000);
    return [Math.max(0, min - pad), max + pad];
  }
  const pad = (max - min) * 0.08;
  return [Math.max(0, min - pad), max + pad];
}

function TwinTrajectoryChart({ data, targetAmount = 0 }) {
  const chartData = downsample(data);
  const hasDebt = chartData.some((point) => Number(point.scenarioDebtBalance) > 0);
  const domain = useMemo(() => {
    const keys = ['baselineAssets', 'scenarioAssets'];
    if (hasDebt) keys.push('scenarioDebtBalance', 'scenarioNetWorth');
    return yDomain(chartData, keys);
  }, [chartData, hasDebt]);

  return (
    <div className="trajectory-chart">
      {targetAmount > 0 && (
        <p className="chart-target-note muted">
          목표 자산 {formatWon(targetAmount)} — 총자산 궤적은 부채 상환 후 적립분을 반영합니다.
        </p>
      )}
      {hasDebt && (
        <p className="chart-target-note muted">
          부채 잔액·순자산(총자산−부채) 선은 시나리오 기준입니다.
        </p>
      )}
      <div className="chart-box chart-box-lg">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis
              domain={domain}
              tickFormatter={formatAxisValue}
              width={64}
            />
            <Tooltip
              formatter={(value, name) => [formatWon(value), name]}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="baselineAssets"
              name="기본 로드맵"
              stroke={TWIN_COLORS.baseline}
              strokeWidth={2.5}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="scenarioAssets"
              name="변경 시나리오"
              stroke={TWIN_COLORS.scenario}
              strokeWidth={2.5}
              dot={false}
            />
            {hasDebt && (
              <Line
                type="monotone"
                dataKey="scenarioDebtBalance"
                name="부채 잔액"
                stroke={TWIN_COLORS.debt}
                strokeDasharray="4 4"
                dot={false}
              />
            )}
            {hasDebt && (
              <Line
                type="monotone"
                dataKey="scenarioNetWorth"
                name="순자산"
                stroke={TWIN_COLORS.netWorth}
                strokeWidth={2}
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PortfolioTrajectoryChart({ data, targetAmount = 0 }) {
  const [view, setView] = useState('overview');
  const [showTargetLine, setShowTargetLine] = useState(false);
  const overview = view === 'overview';
  const hasDebt = data.some((point) => Number(point.debtBalance) > 0);
  const overviewChartData = useMemo(() => downsample(data), [data]);
  const productsChartData = useMemo(() => data, [data]);
  const chartData = overview ? overviewChartData : productsChartData;
  const canShowTarget = overview && targetAmount > 0;
  const domain = useMemo(() => {
    if (!overview) {
      return yDomain(productsChartData, ['savingBalance', 'depositBalance', 'etfBalance']);
    }
    const keys = ['totalAssets'];
    if (hasDebt) keys.push('debtBalance', 'netWorth');
    if (showTargetLine && targetAmount > 0) keys.push('targetAssetAmount');
    return yDomain(overviewChartData, keys);
  }, [overviewChartData, productsChartData, overview, showTargetLine, targetAmount, hasDebt]);

  return (
    <div className="trajectory-chart">
      <div className="trajectory-chart-toolbar">
        <div className="chart-view-toggle" role="group" aria-label="그래프 보기 선택">
          <button type="button" aria-pressed={overview} onClick={() => setView('overview')}>
            전체 자산·목표
          </button>
          <button type="button" aria-pressed={!overview} onClick={() => setView('products')}>
            상품별 자산
          </button>
        </div>
        {canShowTarget && (
          <label className="chart-target-toggle">
            <input
              type="checkbox"
              checked={showTargetLine}
              onChange={(event) => setShowTargetLine(event.target.checked)}
            />
            <span>목표선 표시</span>
          </label>
        )}
      </div>
      {canShowTarget && showTargetLine && (
        <p className="chart-target-note muted">
          목표 {formatWon(targetAmount)} · 목표가 크면 총자산 추이가 납작해 보일 수 있습니다.
        </p>
      )}
      {overview && hasDebt && (
        <p className="chart-target-note muted">
          월 저축 여력은 부채 상환 후 남는 금액만 투자·적립에 사용합니다.
        </p>
      )}
      <div className="chart-box chart-box-lg">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={chartData} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_COLOR} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
            <YAxis domain={domain} tickFormatter={formatAxisValue} width={64} />
            <Tooltip formatter={(value, name) => [formatWon(value), name]} />
            <Legend />
            {overview && (
              <Line
                type="linear"
                dataKey="totalAssets"
                name="총 자산"
                stroke={PORTFOLIO_COLORS.total}
                strokeWidth={2.5}
                dot={false}
              />
            )}
            {overview && hasDebt && (
              <Line
                type="linear"
                dataKey="debtBalance"
                name="부채 잔액"
                stroke={PORTFOLIO_COLORS.debt}
                strokeDasharray="4 4"
                dot={false}
              />
            )}
            {overview && hasDebt && (
              <Line
                type="linear"
                dataKey="netWorth"
                name="순자산"
                stroke={PORTFOLIO_COLORS.netWorth}
                strokeWidth={2}
                dot={false}
              />
            )}
            {canShowTarget && showTargetLine && (
              <Line
                type="linear"
                dataKey="targetAssetAmount"
                name="목표 자산"
                stroke={PORTFOLIO_COLORS.target}
                strokeDasharray="6 6"
                strokeWidth={1.5}
                dot={false}
              />
            )}
            {!overview && (
              <Line
                type="stepAfter"
                dataKey="savingBalance"
                name="진행 중 적금 (이자 포함)"
                stroke={PORTFOLIO_COLORS.saving}
                strokeWidth={2.5}
                dot={false}
              />
            )}
            {!overview && (
              <Line
                type="linear"
                dataKey="depositBalance"
                name="예금"
                stroke={PORTFOLIO_COLORS.deposit}
                dot={false}
              />
            )}
            {!overview && (
              <Line
                type="linear"
                dataKey="etfBalance"
                name="ETF (평가액+매수 대기금)"
                stroke={PORTFOLIO_COLORS.etf}
                dot={false}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function TrajectoryChart({ data, variant = 'twin', targetAmount = 0 }) {
  if (!data?.length) {
    return <p className="muted">시뮬레이션 궤적이 없습니다.</p>;
  }

  if (variant === 'portfolio') {
    return <PortfolioTrajectoryChart data={data} targetAmount={targetAmount} />;
  }

  return <TwinTrajectoryChart data={data} targetAmount={targetAmount} />;
}
