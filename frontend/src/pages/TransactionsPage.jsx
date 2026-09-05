import { useEffect, useMemo, useState } from 'react';
import AppHeader from '../components/AppHeader';
import { fetchTransactionPipeline, regenerateTransactionPipeline } from '../services/transactionService';

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export default function TransactionsPage() {
  const [month, setMonth] = useState(currentMonth);
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (targetMonth = month) => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchTransactionPipeline({ month: targetMonth, count: 45 });
      setData(result);
    } catch (err) {
      setError(err.message || '거래 데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(month);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredTransactions = useMemo(() => {
    if (!data?.transactions) return [];
    if (filter === 'fixed') {
      return data.transactions.filter((tx) => !tx.isIncome && tx.expenseType === 'fixed');
    }
    if (filter === 'variable') {
      return data.transactions.filter((tx) => !tx.isIncome && tx.expenseType === 'variable');
    }
    if (filter === 'income') {
      return data.transactions.filter((tx) => tx.isIncome);
    }
    if (filter === 'savings') {
      return data.transactions.filter((tx) => tx.expenseType === 'savings');
    }
    return data.transactions;
  }, [data, filter]);

  const onRegenerate = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await regenerateTransactionPipeline({
        month,
        count: 45,
      });
      setData(result);
    } catch (err) {
      setError(err.message || '거래 데이터 재생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-shell">
      <AppHeader />
      <main className="page-content page-content-xl transactions-page">
        <section className="hero-panel">
          <p className="eyebrow">데이터 관리</p>
          <h1>소비 거래 분류</h1>
          <p className="lead">
            Demo 거래를 생성하고 소득·생활비·변동 소비·저축 이체로 자동 분류합니다.
          </p>
        </section>

        <div className="toolbar">
          <label>
            조회 월
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
          <button type="button" className="btn btn-ghost" onClick={() => load(month)} disabled={loading}>
            불러오기
          </button>
          <button type="button" className="btn btn-primary" onClick={onRegenerate} disabled={loading}>
            Demo 데이터 새로고침
          </button>
        </div>

        {error && <p className="alert alert-error" role="alert">{error}</p>}
        {loading && <p className="muted">거래 파이프라인을 처리하는 중...</p>}

        {data && !loading && (
          <>
            <section className="stat-row">
              <article>
                <h3>총소득</h3>
                <p>{Number(data.financialSummary.totalIncome).toLocaleString('ko-KR')}원</p>
              </article>
              <article>
                <h3>고정 생활비</h3>
                <p>{Number(data.financialSummary.fixedLivingExpenses).toLocaleString('ko-KR')}원</p>
              </article>
              <article>
                <h3>저축·투자 이체</h3>
                <p>{Number(data.financialSummary.savingsAndInvestments).toLocaleString('ko-KR')}원</p>
              </article>
              <article>
                <h3>순현금흐름</h3>
                <p>{Number(data.financialSummary.netCashflow).toLocaleString('ko-KR')}원</p>
              </article>
            </section>
            <p className="source-banner mock">생성된 월간 Demo 금융 데이터 · 급여 1회와 선택적 추가 소득을 분리 집계합니다.</p>

            <section className="panel">
              <h2>카테고리 요약</h2>
              <div className="chip-row">
                {data.categorySummaries.map((item) => (
                  <div key={item.category} className="chip">
                    <strong>{item.categoryLabel}</strong>
                    <span>{Number(item.totalAmount).toLocaleString('ko-KR')}원</span>
                    <small>
                      {item.count}건 · {item.expenseType === 'fixed' ? '고정 생활비' : item.expenseType === 'savings' ? '저축·투자' : '변동 소비'}
                    </small>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="panel-header">
                <h2>거래 내역</h2>
                <div className="filter-tabs">
                  {[
                    ['all', '전체'],
                    ['income', '소득'],
                    ['fixed', '고정 생활비'],
                    ['variable', '변동 소비'],
                    ['savings', '저축·투자'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      className={filter === value ? 'tab active' : 'tab'}
                      onClick={() => setFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>날짜</th>
                      <th>가맹점</th>
                      <th>카테고리</th>
                      <th>유형</th>
                      <th>금액</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>{tx.date}</td>
                        <td>{tx.merchant}</td>
                        <td>{tx.categoryLabel}</td>
                        <td>{tx.isIncome ? '소득' : tx.expenseTypeLabel}</td>
                        <td className={tx.isIncome ? 'amount-plus' : 'amount-minus'}>
                          {tx.isIncome ? '+' : '-'}
                          {Number(tx.amount).toLocaleString('ko-KR')}원
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
