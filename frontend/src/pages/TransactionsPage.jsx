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
    return data.transactions;
  }, [data, filter]);

  const onRegenerate = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await regenerateTransactionPipeline({
        month,
        count: 45,
        seed: Date.now() % 100000,
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
      <main className="page-content page-content-xl">
        <section className="hero-panel">
          <p className="eyebrow">Phase 2 · 데이터 관리</p>
          <h1>소비 거래 분류</h1>
          <p className="lead">
            더미 거래 데이터를 생성하고 소비 카테고리·고정/변동비로 자동 분류합니다.
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
            더미 데이터 재생성
          </button>
        </div>

        {error && <p className="alert alert-error" role="alert">{error}</p>}
        {loading && <p className="muted">거래 파이프라인을 처리하는 중...</p>}

        {data && !loading && (
          <>
            <section className="stat-row">
              <article>
                <h3>소득</h3>
                <p>{Number(data.totals.income).toLocaleString('ko-KR')}원</p>
              </article>
              <article>
                <h3>고정비</h3>
                <p>{Number(data.totals.fixedExpenses).toLocaleString('ko-KR')}원</p>
              </article>
              <article>
                <h3>변동비</h3>
                <p>{Number(data.totals.variableExpenses).toLocaleString('ko-KR')}원</p>
              </article>
              <article>
                <h3>순현금흐름</h3>
                <p>{Number(data.totals.netCashflow).toLocaleString('ko-KR')}원</p>
              </article>
            </section>

            <section className="panel">
              <h2>카테고리 요약</h2>
              <div className="chip-row">
                {data.categorySummaries.map((item) => (
                  <div key={item.category} className="chip">
                    <strong>{item.categoryLabel}</strong>
                    <span>{Number(item.totalAmount).toLocaleString('ko-KR')}원</span>
                    <small>
                      {item.count}건 · {item.expenseType === 'fixed' ? '고정비' : '변동비'}
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
                    ['fixed', '고정비'],
                    ['variable', '변동비'],
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
