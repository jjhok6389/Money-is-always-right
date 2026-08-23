import { useEffect, useState } from 'react';
import AppHeader from '../components/AppHeader';
import ConsumptionBarChart from '../components/ConsumptionBarChart';
import PortfolioDonut from '../components/PortfolioDonut';
import { useAuth } from '../contexts/AuthContext';
import { computeDashboard } from '../services/dashboardService';

function formatDate(value) {
  if (!value) return '산출 불가';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [debtBalance, setDebtBalance] = useState(0);
  const [currentAssets, setCurrentAssets] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    if (!profile) {
      setError('온보딩 프로필이 필요합니다.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = {
        profile: {
          displayName: profile.displayName,
          monthlyIncome: Number(profile.monthlyIncome) || 0,
          fixedExpenses: Number(profile.fixedExpenses) || 0,
          estimatedMonthlySavings: Number(profile.estimatedMonthlySavings) || 0,
          investmentPropensity: profile.investmentPropensity || 'neutral',
          targetAssetAmount: Number(profile.targetAssetAmount) || 0,
          targetYears: Number(profile.targetYears) || 1,
          goalDescription: profile.goalDescription || '',
          age: profile.age,
          occupation: profile.occupation,
        },
        debtBalance: Number(debtBalance) || 0,
      };
      if (currentAssets !== '' && currentAssets != null) {
        payload.currentAssets = Number(currentAssets);
      }
      const result = await computeDashboard(payload);
      setData(result);
    } catch (err) {
      setError(err.message || '대시보드를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.uid, profile?.targetAssetAmount]);

  return (
    <div className="page-shell">
      <AppHeader />
      <main className="page-content page-content-xl">
        <section className="hero-panel">
          <p className="eyebrow">Phase 3 · 맞춤 대시보드</p>
          <h1>자산 · 소비 · 목표 로드맵</h1>
          <p className="lead">
            포트폴리오와 월간 소비를 시각화하고, 목표 자산 갭·달성률·예상 달성일을
            바탕으로 실행 로드맵을 제시합니다.
          </p>
        </section>

        <div className="toolbar">
          <label>
            현재 자산 (원, 선택)
            <input
              type="number"
              min="0"
              step="100000"
              value={currentAssets}
              onChange={(event) => setCurrentAssets(event.target.value)}
              placeholder="비우면 자동 추정"
            />
          </label>
          <label>
            부채 잔액 (원)
            <input
              type="number"
              min="0"
              step="100000"
              value={debtBalance}
              onChange={(event) => setDebtBalance(event.target.value)}
              placeholder="0"
            />
          </label>
          <button type="button" className="btn btn-primary" onClick={load} disabled={loading}>
            {loading ? '계산 중...' : '다시 계산'}
          </button>
        </div>

        {error && <p className="alert alert-error" role="alert">{error}</p>}
        {loading && !data && <p className="muted">대시보드를 생성하는 중...</p>}

        {data && (
          <>
            <section className="stat-row">
              <article>
                <h3>목표 달성률</h3>
                <p>{data.goal.achievementRate}%</p>
              </article>
              <article>
                <h3>목표까지 남은 금액</h3>
                <p>{Number(data.goal.gapAmount).toLocaleString('ko-KR')}원</p>
              </article>
              <article>
                <h3>월 저축 여력</h3>
                <p>{Number(data.goal.monthlySavingsCapacity).toLocaleString('ko-KR')}원</p>
              </article>
              <article>
                <h3>예상 달성일</h3>
                <p className="stat-date">{formatDate(data.goal.estimatedAchievementDate)}</p>
              </article>
            </section>

            <p className={`source-banner ${data.goal.onTrack ? 'live' : 'mock'}`}>
              {data.goal.onTrack
                ? `목표 기간(${data.goal.targetYears}년) 내 달성 궤도에 있습니다.`
                : `현재 저축 속도로는 목표 기간(${data.goal.targetYears}년) 내 달성이 어렵습니다.`}
              {data.goal.estimatedMonthsToGoal != null &&
                ` · 약 ${data.goal.estimatedMonthsToGoal}개월 소요 예상`}
            </p>

            <div className="dashboard-grid">
              <section className="panel chart-panel">
                <h2>현재 자산 포트폴리오</h2>
                <p className="muted">
                  추정 자산 {Number(data.goal.currentAssets).toLocaleString('ko-KR')}원 · 투자 성향 기반 배분
                </p>
                <PortfolioDonut data={data.portfolio} />
              </section>

              <section className="panel chart-panel">
                <h2>월간 소비 분석 ({data.month})</h2>
                <p className="muted">
                  총 지출 {Number(data.consumptionTotals.totalExpenses || 0).toLocaleString('ko-KR')}원
                </p>
                <ConsumptionBarChart data={data.consumption} />
              </section>
            </div>

            <section className="panel">
              <h2>금융 로드맵</h2>
              <ol className="roadmap-list">
                {data.roadmap.map((item) => (
                  <li key={`${item.priority}-${item.title}`}>
                    <span className="roadmap-priority">{item.priority}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="panel">
              <h2>추천 금융상품</h2>
              <div className="product-grid">
                {data.recommendedProducts.map((product) => (
                  <article
                    key={`${product.companyName}-${product.productName}`}
                    className="product-card"
                  >
                    <p className="product-bank">
                      {product.companyName} ·{' '}
                      {product.productType === 'saving'
                        ? '적금'
                        : product.productType === 'annuity'
                          ? '연금저축'
                          : '예금'}
                    </p>
                    <h2>{product.productName}</h2>
                    <dl>
                      <div>
                        <dt>{product.productType === 'annuity' ? '공시수익률' : '최고금리'}</dt>
                        <dd>
                          {product.bestRate != null ? `${product.bestRate.toFixed(2)}%` : '-'}
                        </dd>
                      </div>
                      <div>
                        <dt>기간</dt>
                        <dd>
                          {product.bestTermMonths != null ? `${product.bestTermMonths}개월` : '-'}
                        </dd>
                      </div>
                    </dl>
                    <p className="product-note">{product.reason}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel">
              <h2>부채 상환 우선순위</h2>
              <ol className="roadmap-list">
                {data.debtRepaymentPriority.map((item) => (
                  <li key={`debt-${item.priority}-${item.title}`}>
                    <span className="roadmap-priority">{item.priority}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
