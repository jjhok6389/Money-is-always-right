import { useEffect, useRef, useState } from 'react';
import AppHeader from '../components/AppHeader';
import ConsumptionBarChart from '../components/ConsumptionBarChart';
import EtfVolatilityChart from '../components/EtfVolatilityChart';
import PortfolioDonut from '../components/PortfolioDonut';
import PersonalRoadmapPanel from '../components/PersonalRoadmapPanel';
import ProductTour from '../components/ProductTour';
import TutorialProgressPanel from '../components/TutorialProgressPanel';
import { useAuth } from '../contexts/AuthContext';
import { computeDashboard } from '../services/dashboardService';
import { fetchEtfDetail } from '../services/etfService';
import { generatePersonalRoadmap } from '../services/roadmapService';

function formatDate(value) {
  if (!value) return '산출 불가';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function etfRiskCopy(etf) {
  if (etf?.reason && String(etf.reason).includes('\n')) {
    return etf.reason;
  }
  const vol =
    etf?.volatilityPct != null && Number.isFinite(Number(etf.volatilityPct))
      ? Number(etf.volatilityPct).toFixed(1)
      : '-';
  const universeSize = etf?.universeSize || 15;
  const percentile = etf?.volPercentile ?? '-';
  const label =
    etf?.riskLabel ||
    { low: '🟢 저변동 상품', mid: '🟡 중변동 상품', high: '🔴 고변동 상품' }[etf?.riskLevel] ||
    {
      ultra_low: '🟢 저변동 상품',
      low_mid: '🟢 저변동 상품',
      mid_high: '🟡 중변동 상품',
      high: '🔴 고변동 상품',
    }[etf?.volatilityBucket] ||
    '🟢 저변동 상품';
  return `최근 6개월 변동성 ${vol}%\n유니버스 ${universeSize}종 중 변동성 하위 ${percentile}%\n${label}`;
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [personalRoadmap, setPersonalRoadmap] = useState(null);
  const [roadmapLoading, setRoadmapLoading] = useState(false);
  const [roadmapError, setRoadmapError] = useState('');
  const loadRequestRef = useRef(0);
  const roadmapRequestRef = useRef(0);
  const [selectedEtf, setSelectedEtf] = useState(null);
  const [etfDetail, setEtfDetail] = useState(null);
  const [etfDetailLoading, setEtfDetailLoading] = useState(false);
  const [etfDetailError, setEtfDetailError] = useState('');
  const [holdingsOpen, setHoldingsOpen] = useState(false);

  const propensity = profile?.investmentPropensity || 'neutral';
  const showEtfSection = propensity !== 'stable';

  const createPayload = () => ({
    profile: {
      displayName: profile?.displayName,
      investmentPropensity: propensity,
      targetAssetAmount: Number(profile?.targetAssetAmount) || 0,
      targetYears: Number(profile?.targetYears) || 1,
      goalDescription: profile?.goalDescription || '',
      age: profile?.age,
      occupation: profile?.occupation,
    },
  });

  const loadRoadmap = async (payload, month) => {
    const requestId = ++roadmapRequestRef.current;
    setRoadmapLoading(true);
    setRoadmapError('');
    try {
      const result = await generatePersonalRoadmap({ ...payload, month, persist: true });
      if (requestId === roadmapRequestRef.current) setPersonalRoadmap(result);
    } catch (err) {
      if (requestId === roadmapRequestRef.current) {
        setRoadmapError(err.message || '개인 금융 로드맵을 불러오지 못했습니다.');
      }
    } finally {
      if (requestId === roadmapRequestRef.current) setRoadmapLoading(false);
    }
  };

  // Demo holdings provide assets/debt; profile only supplies goals & propensity.
  const load = async () => {
    const requestId = ++loadRequestRef.current;
    roadmapRequestRef.current += 1;
    if (!profile) {
      setError('온보딩 프로필이 필요합니다.');
      setLoading(false);
      setRoadmapLoading(false);
      setPersonalRoadmap(null);
      return;
    }

    setLoading(true);
    setError('');
    setPersonalRoadmap(null);
    setRoadmapError('');
    try {
      const payload = createPayload();
      const result = await computeDashboard(payload);
      if (requestId !== loadRequestRef.current) return;
      setData(result);
      await loadRoadmap(payload, result.month);
    } catch (err) {
      if (requestId === loadRequestRef.current) {
        setError(err.message || '대시보드를 불러오지 못했습니다.');
      }
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  };

  const openEtfDetail = async (etf) => {
    setSelectedEtf(etf);
    setEtfDetail(null);
    setEtfDetailError('');
    setEtfDetailLoading(true);
    try {
      const result = await fetchEtfDetail(etf.symbol, propensity);
      setEtfDetail(result);
    } catch (err) {
      setEtfDetailError(err.message || 'ETF 상세를 불러오지 못했습니다.');
    } finally {
      setEtfDetailLoading(false);
    }
  };

  const closeEtfDetail = () => {
    setSelectedEtf(null);
    setEtfDetail(null);
    setEtfDetailError('');
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    profile?.uid,
    profile?.targetAssetAmount,
    profile?.investmentPropensity,
  ]);

  return (
    <div className="page-shell">
      <AppHeader />
      <main className="page-content page-content-xl">
        <section className="hero-panel hero-panel-with-action">
          <div className="hero-panel-copy">
            <p className="eyebrow">맞춤 대시보드</p>
            <h1>자산 · 소비 · 목표 로드맵</h1>
            <p className="lead">
              포트폴리오와 월간 소비를 시각화하고, 
              <br/>
              목표 자산 갭·달성률·예상 달성일을 바탕으로 실행 로드맵을 제시합니다.
            </p>
          </div>
          <TutorialProgressPanel compact />
        </section>

        {error && <p className="alert alert-error" role="alert">{error}</p>}
        {loading && !data && <p className="muted">대시보드를 생성하는 중...</p>}

        {data && (
          <>
            <section className="stat-row" data-tour="goal-stats">
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

            <p
              className={`source-banner ${data.goal.onTrack ? 'live' : 'mock'}`}
              data-tour="track-banner"
            >
              {data.goal.onTrack
                ? `목표 기간(${data.goal.targetYears}년) 내 달성 궤도에 있습니다.`
                : `현재 저축 속도로는 목표 기간(${data.goal.targetYears}년) 내 달성이 어렵습니다.`}
              {data.goal.estimatedMonthsToGoal != null &&
                ` · 약 ${data.goal.estimatedMonthsToGoal}개월 소요 예상`}
            </p>

            <div className="dashboard-grid">
              <section className="panel chart-panel" data-tour="portfolio">
                <h2>현재 자산 포트폴리오</h2>
                <p className="muted">
                  Demo 보유 {Number(data.goal.currentAssets).toLocaleString('ko-KR')}원 · 계좌{' '}
                  {data.holdings?.accounts?.length || 0}개 합산
                  {data.holdings?.totals?.totalLiabilities
                    ? ` · 부채 ${Number(data.holdings.totals.totalLiabilities).toLocaleString('ko-KR')}원`
                    : ''}
                </p>
                <PortfolioDonut data={data.portfolio} />
              </section>

              <section className="panel chart-panel" data-tour="consumption">
                <h2>월간 소비 분석 ({data.month})</h2>
                <p className="muted">
                  생성된 Demo 거래 기준 · 총 생활비 {Number(data.financialSummary?.totalExpenses || 0).toLocaleString('ko-KR')}원
                </p>
                <ConsumptionBarChart
                  data={data.consumption}
                  totalExpenses={data.financialSummary?.totalExpenses || 0}
                />
              </section>
            </div>

            {data.holdings && (
              <section
                className={`panel panel-collapsible${holdingsOpen ? ' is-open' : ''}`}
                data-tour="holdings"
              >
                <button
                  type="button"
                  className="panel-collapse-toggle"
                  aria-expanded={holdingsOpen}
                  aria-controls="dashboard-holdings-body"
                  onClick={() => setHoldingsOpen((open) => !open)}
                >
                  <span className="panel-collapse-toggle-copy">
                    <h2>Demo 보유 원장</h2>
                    <p className="muted">
                      기준일 {data.holdings.asOf} · 순자산{' '}
                      {Number(data.holdings.totals.netWorth).toLocaleString('ko-KR')}원
                    </p>
                  </span>
                  <span className="panel-collapse-chevron" aria-hidden="true">
                    ⌄
                  </span>
                </button>
                {holdingsOpen && (
                  <div id="dashboard-holdings-body" className="holdings-lists holdings-lists-compact">
                    <div>
                      <h3>계좌 · 투자</h3>
                      <ul className="holdings-list">
                        {data.holdings.accounts.map((account) => (
                          <li key={account.id}>
                            <strong>
                              {account.institution} · {account.accountName}
                            </strong>
                            <span>{Number(account.balance).toLocaleString('ko-KR')}원</span>
                          </li>
                        ))}
                        {data.holdings.investments.map((item) => (
                          <li key={item.id}>
                            <strong>
                              {item.broker} · {item.name}
                            </strong>
                            <span>{Number(item.evalAmount).toLocaleString('ko-KR')}원</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <h3>부채 · 보험</h3>
                      <ul className="holdings-list">
                        {(data.holdings.loans || []).length === 0 && (
                          <li className="muted">등록된 부채 없음</li>
                        )}
                        {(data.holdings.loans || []).map((loan) => (
                          <li key={loan.id}>
                            <strong>
                              {loan.loanName} · 연 {loan.interestRate}%
                            </strong>
                            <span>{Number(loan.balance).toLocaleString('ko-KR')}원</span>
                          </li>
                        ))}
                        {data.holdings.insurances.map((item) => (
                          <li key={item.id}>
                            <strong>{item.productName}</strong>
                            <span>
                              월 {Number(item.monthlyPremium).toLocaleString('ko-KR')}원
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </section>
            )}

            <PersonalRoadmapPanel
              roadmap={personalRoadmap}
              loading={roadmapLoading}
              error={roadmapError}
              displayName={profile?.displayName}
              onRetry={() => loadRoadmap(createPayload(), data.month)}
            />

            <section className="panel" data-tour="products">
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
              <h2>ETF 추천</h2>
              <p className="disclaimer-inline">
                투자 권유 아님 · 과거 데이터 기반. 과거 변동 ≠ 미래 수익.
              </p>
              {!showEtfSection ? (
                <p className="muted">
                  {data.etfMessage ||
                    '안정형은 예·적금·연금 중심이라 ETF 추천을 생략합니다.'}
                </p>
              ) : (
                <>
                  <p className={`source-banner ${data.etfSource === 'krx' ? 'live' : 'mock'}`}>
                    {data.etfSource === 'krx'
                      ? `KRX 일별 공시 기반 · ${data.recommendedEtfs?.length || 0}개`
                      : data.etfMessage ||
                        `모의 ETF 데이터 · ${data.recommendedEtfs?.length || 0}개`}
                  </p>
                  <div className="product-grid">
                    {(data.recommendedEtfs || []).map((etf) => (
                      <button
                        type="button"
                        key={etf.symbol}
                        className="product-card etf-card"
                        onClick={() => openEtfDetail(etf)}
                      >
                        <p className="product-bank">{etf.symbol}</p>
                        <h2>{etf.name}</h2>
                        <p className="product-note etf-risk-lines">{etfRiskCopy(etf)}</p>
                      </button>
                    ))}
                  </div>
                  {(data.recommendedEtfs || []).length === 0 && (
                    <p className="muted">조건에 맞는 ETF가 없습니다.</p>
                  )}
                </>
              )}
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

      <ProductTour ready={Boolean(data) && !loading && Boolean(personalRoadmap || roadmapError)} />

      {selectedEtf && (
        <div className="modal-backdrop" role="presentation" onClick={closeEtfDetail}>
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="etf-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">{selectedEtf.symbol}</p>
                <h2 id="etf-detail-title">{selectedEtf.name}</h2>
              </div>
              <button type="button" className="btn btn-ghost" onClick={closeEtfDetail}>
                닫기
              </button>
            </div>

            {etfDetailLoading && <p className="muted">상세 시계열을 불러오는 중...</p>}
            {etfDetailError && (
              <p className="alert alert-error" role="alert">
                {etfDetailError}
              </p>
            )}

            {etfDetail?.etf && (
              <>
                <p className={`source-banner ${etfDetail.source === 'krx' ? 'live' : 'mock'}`}>
                  {etfDetail.source === 'krx'
                    ? 'KRX 일별 종가'
                    : etfDetail.message || '모의 시계열'}
                </p>
                <p className="product-note etf-risk-lines">{etfRiskCopy(etfDetail.etf)}</p>
                <dl className="etf-detail-stats">
                  <div>
                    <dt>최근 종가</dt>
                    <dd>
                      {etfDetail.etf.lastPrice != null
                        ? `${Number(etfDetail.etf.lastPrice).toLocaleString('ko-KR')}원`
                        : '-'}
                    </dd>
                  </div>
                  <div>
                    <dt>기준일</dt>
                    <dd>{etfDetail.etf.asOfDate ? formatDate(etfDetail.etf.asOfDate) : '-'}</dd>
                  </div>
                </dl>
                <EtfVolatilityChart series={etfDetail.etf.series} />
                <p className="disclaimer-inline">{etfDetail.etf.disclaimer}</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
