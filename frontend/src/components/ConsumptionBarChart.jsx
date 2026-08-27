import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function formatWon(value) {
  return `${Number(value).toLocaleString('ko-KR')}원`;
}

function formatRatio(amount, total) {
  if (!total || total <= 0) return null;
  const pct = (Number(amount) / Number(total)) * 100;
  return `${pct.toFixed(1)}%`;
}

function ConsumptionTooltip({ active, payload, totalExpenses }) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const amount = item.value;
  const ratio = formatRatio(amount, totalExpenses);

  return (
    <div className="consumption-tooltip">
      <p className="consumption-tooltip-title">{item.payload?.name}</p>
      <p>지출 : {formatWon(amount)}</p>
      {ratio != null && <p>비율 : {ratio}</p>}
    </div>
  );
}

export default function ConsumptionBarChart({ data, totalExpenses = 0 }) {
  const chartData = (data || []).map((item) => ({
    name: item.categoryLabel,
    amount: item.amount,
  }));

  if (!chartData.length) {
    return <p className="muted">소비 데이터가 없습니다.</p>;
  }

  const total =
    Number(totalExpenses) > 0
      ? Number(totalExpenses)
      : chartData.reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return (
    <div className="chart-box">
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#dce3ee" />
          <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} angle={-20} textAnchor="end" height={60} />
          <YAxis tickFormatter={(value) => `${Math.round(value / 10000)}만`} width={48} />
          <Tooltip content={<ConsumptionTooltip totalExpenses={total} />} />
          <Bar dataKey="amount" name="지출" fill="#1b3a5f" radius={[8, 8, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
