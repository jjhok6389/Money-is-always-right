import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

const COLOR_BY_KEY = {
  cash: '#041018',
  deposit: '#0c4a9c',
  saving: '#3b96e3',
  investment: '#9bc0e6',
};

const COLOR_FALLBACK = ['#041018', '#0c4a9c', '#3b96e3', '#9bc0e6'];

export default function PortfolioDonut({ data }) {
  const chartData = (data || []).map((item) => ({
    key: item.key,
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
            paddingAngle={4}
            stroke="#ffffff"
            strokeWidth={2}
          >
            {chartData.map((entry, index) => (
              <Cell
                key={entry.name}
                fill={COLOR_BY_KEY[entry.key] || COLOR_FALLBACK[index % COLOR_FALLBACK.length]}
              />
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
