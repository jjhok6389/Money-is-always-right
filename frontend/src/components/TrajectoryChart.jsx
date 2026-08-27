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
  if (!data?.length) {
    return <p className="muted">시뮬레이션 궤적이 없습니다.</p>;
  }

  // Downsample long horizons for readability while keeping endpoints.
  const step = data.length > 96 ? 3 : data.length > 48 ? 2 : 1;
  const chartData = data.filter((_, index) => index % step === 0 || index === data.length - 1);

  return (
    <div className="chart-box chart-box-lg">
      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dce3ee" />
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
          <Line
            type="monotone"
            dataKey="baselineAssets"
            name="기본 로드맵"
            stroke="#0f2744"
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="scenarioAssets"
            name="변경 시나리오"
            stroke="#3d5a80"
            strokeWidth={2.5}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="targetAssetAmount"
            name="목표 자산"
            stroke="#8a97ab"
            strokeDasharray="6 6"
            strokeWidth={1.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
