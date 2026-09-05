import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export default function EtfVolatilityChart({ series }) {
  if (!series?.length) {
    return <p className="muted">표시할 가격 시계열이 없습니다.</p>;
  }

  const step = series.length > 96 ? 3 : series.length > 48 ? 2 : 1;
  const chartData = series
    .filter((_, index) => index % step === 0 || index === series.length - 1)
    .map((point) => ({
      date: point.date.slice(5),
      close: point.close,
    }));

  return (
    <div className="chart-box chart-box-lg">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dce3ee" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis
            domain={['auto', 'auto']}
            tickFormatter={(value) => `${Math.round(value / 1000)}천`}
            width={48}
          />
          <Tooltip
            formatter={(value) => [`${Number(value).toLocaleString('ko-KR')}원`, '종가']}
            labelFormatter={(label) => `일자 ${label}`}
          />
          <Line
            type="monotone"
            dataKey="close"
            name="종가"
            stroke="#1b3a5f"
            strokeWidth={2.5}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
