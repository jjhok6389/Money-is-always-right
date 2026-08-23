import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

const COLORS = ['#0f766e', '#1d4e89', '#c2410c', '#7c3aed'];

export default function PortfolioDonut({ data }) {
  const chartData = (data || []).map((item) => ({
    name: item.label,
    value: item.amount,
  }));

  if (!chartData.length) {
    return <p className="muted">포트폴리오 데이터가 없습니다.</p>;
  }

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="name"
            innerRadius={68}
            outerRadius={100}
            paddingAngle={3}
          >
            {chartData.map((entry, index) => (
              <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value) => `${Number(value).toLocaleString('ko-KR')}원`}
          />
          <Legend />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
