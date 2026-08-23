import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export default function ConsumptionBarChart({ data }) {
  const chartData = (data || []).map((item) => ({
    name: item.categoryLabel,
    amount: item.amount,
  }));

  if (!chartData.length) {
    return <p className="muted">소비 데이터가 없습니다.</p>;
  }

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d5e0db" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={60} />
          <YAxis tickFormatter={(value) => `${Math.round(value / 10000)}만`} width={48} />
          <Tooltip formatter={(value) => `${Number(value).toLocaleString('ko-KR')}원`} />
          <Bar dataKey="amount" name="지출" fill="#0f766e" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
