import { useState } from 'react';
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

export default function TrajectoryChart({ data }) {
  const [view, setView] = useState('overview');

  if (!data?.length) {
    return <p className="muted">시뮬레이션 궤적이 없습니다.</p>;
  }

  const overview = view === 'overview';

  return (
    <div className="trajectory-chart">
      <div className="chart-view-toggle" role="group" aria-label="그래프 보기 선택">
        <button type="button" aria-pressed={overview} onClick={() => setView('overview')}>
          전체 자산·목표
        </button>
        <button type="button" aria-pressed={!overview} onClick={() => setView('products')}>
          상품별 자산
        </button>
      </div>
      <div className="chart-box chart-box-lg">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#d5e0db" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
              <YAxis
                tickFormatter={(value) => `${Math.round(value / 10000)}만`}
                width={52}
              />
              <Tooltip
                formatter={(value, name) => [
                  `${Number(value).toLocaleString('ko-KR')}원`,
                  name,
                ]}
              />
              <Legend />
              {overview && <Line type="linear" dataKey="totalAssets" name="총 자산" stroke="#1d4e89" strokeWidth={2.5} dot={false} />}
              {overview && <Line type="linear" dataKey="targetAssetAmount" name="목표 자산" stroke="#c2410c" strokeDasharray="6 6" strokeWidth={1.5} dot={false} />}
              {!overview && <Line type="stepAfter" dataKey="savingBalance" name="진행 중 적금 (이자 포함)" stroke="#0f766e" strokeWidth={2.5} dot={false} />}
              {!overview && <Line type="linear" dataKey="depositBalance" name="예금" stroke="#7c3aed" dot={false} />}
              {!overview && <Line type="linear" dataKey="etfBalance" name="ETF (평가액+매수 대기금)" stroke="#b45309" dot={false} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
  );
}
