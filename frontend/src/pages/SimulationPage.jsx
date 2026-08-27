import { useEffect, useMemo, useState } from 'react';
import AppHeader from '../components/AppHeader';
import TrajectoryChart from '../components/TrajectoryChart';
import { useAuth } from '../contexts/AuthContext';
import useFinancialSummary from '../hooks/useFinancialSummary';
import { fetchEtfDetail, fetchEtfRecommendations } from '../services/etfService';
import { fetchDepositProducts, fetchSavingProducts } from '../services/productService';
import { ALLOCATION_PRESETS, simulatePortfolio } from '../utils/portfolioSimulator';

const SESSION_KEY = 'simulation-portfolio-settings';
const PRESET_LABELS = {
  stable: '안정형',
  stable_seeking: '안정추구형',
  neutral: '위험중립형',
  aggressive: '적극투자형',
  very_aggressive: '공격투자형',
};
const today = new Date().toISOString().slice(0, 10);
const oneYearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
const won = (value) => `${Math.round(Number(value) || 0).toLocaleString('ko-KR')}원`;
const percent = (value) => value == null
  ? '-'
  : `${Number(value) > 0 ? '+' : ''}${Number(value).toLocaleString('ko-KR')}%`;
const productKey = (product) => `${product.companyCode || ''}:${product.productCode || product.productName}`;

function option(product) {
  return product?.options?.find((item) => Number(item.saveTermMonths) === Number(product.bestTermMonths))
    || product?.options?.[0]
    || { saveTermMonths: product?.bestTermMonths, interestRate: product?.bestRate };
}

function productLabel(product) {
  const selected = option(product);
  return `${product.companyName} · ${product.productName} (${selected.saveTermMonths || 12}개월, ${selected.interestRate ?? product.bestRate ?? 0}%)`;
}

export default function SimulationPage() {
  const { profile } = useAuth();
  const { financialSummary, loading: financialLoading, error: financialError } = useFinancialSummary();
  const propensity = ALLOCATION_PRESETS[profile?.investmentPropensity] ? profile.investmentPropensity : 'neutral';
  const [products, setProducts] = useState({ deposits: [], savings: [], etfs: [] });
  const [selected, setSelected] = useState({ deposit: '', saving: '', etf: '' });
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState(null);
  const [modalOpen, setModalOpen] = useState(() => !sessionStorage.getItem(SESSION_KEY));
  const [etfData, setEtfData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [calculationRun, setCalculationRun] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!financialSummary) return;
    const monthly = Math.max(Number(financialSummary.monthlySavingsCapacity)
      || Number(financialSummary.totalIncome) - Number(financialSummary.totalExpenses), 0);
    const saved = sessionStorage.getItem(SESSION_KEY);
    const initial = saved ? JSON.parse(saved) : {
      startDate: oneYearAgo,
      startingAssets: Number(profile?.currentAssets) || 0,
      targetAssetAmount: Number(profile?.targetAssetAmount) || 0,
      monthlyInvestable: monthly,
      preset: propensity,
      etfRatio: ALLOCATION_PRESETS[propensity].etf,
    };
    setSettings(initial);
    setDraft(initial);
  }, [financialSummary, profile, propensity]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchDepositProducts({ topFinGrpNo: '020000' }),
      fetchSavingProducts({ topFinGrpNo: '020000' }),
      fetchEtfRecommendations(propensity),
    ]).then(([depositData, savingData, etfResponse]) => {
      if (!active) return;
      const deposits = depositData.products || [];
      const savings = savingData.products || [];
      const etfs = etfResponse.etfs || [];
      setProducts({ deposits, savings, etfs });
      setSelected({
        deposit: deposits[0] ? productKey(deposits[0]) : '',
        saving: savings[0] ? productKey(savings[0]) : '',
        etf: etfs[0]?.symbol || '',
      });
    }).catch((reason) => setError(reason.message || '상품 정보를 불러오지 못했습니다.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [propensity]);

  useEffect(() => {
    if (!selected.etf || !settings?.startDate || settings.etfRatio === 0) {
      setEtfData(null);
      setCalculating(false);
      return;
    }
    let active = true;
    setCalculating(true);
    setEtfData(null);
    setError('');
    fetchEtfDetail(selected.etf, propensity, { startDate: settings.startDate, endDate: today })
      .then((response) => {
        if (active) setEtfData(response);
      })
      .catch((reason) => {
        if (active) setError(reason.message || 'ETF 과거 데이터를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (active) setCalculating(false);
      });
    return () => { active = false; };
  }, [selected.etf, propensity, settings?.startDate, settings?.etfRatio, calculationRun]);

  const deposit = products.deposits.find((item) => productKey(item) === selected.deposit);
  const saving = products.savings.find((item) => productKey(item) === selected.saving);
  const result = useMemo(() => {
    if (!settings || !deposit || !saving || (settings.etfRatio > 0 && !etfData?.etf?.series?.length)) return null;
    return simulatePortfolio({
      ...settings,
      endDate: today,
      savingOption: option(saving),
      depositOption: option(deposit),
      prices: etfData?.etf?.series || [],
      dividends: etfData?.etf?.dividends || [],
      source: etfData?.source || 'stored',
    });
  }, [settings, deposit, saving, etfData]);

  const saveSettings = (event) => {
    event.preventDefault();
    const next = {
      ...draft,
      startingAssets: Number(draft.startingAssets) || 0,
      targetAssetAmount: Number(draft.targetAssetAmount) || 0,
      monthlyInvestable: Number(draft.monthlyInvestable) || 0,
      etfRatio: Number(draft.etfRatio) || 0,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setCalculating(true);
    setCalculationRun((current) => current + 1);
    setSettings(next);
    setModalOpen(false);
  };

  const closeModal = () => {
    if (settings) setModalOpen(false);
  };
  const setField = (name, value) => setDraft((current) => ({ ...current, [name]: value }));
  const applyPreset = (preset) => setDraft((current) => ({
    ...current,
    preset,
    etfRatio: preset === 'custom' ? current.etfRatio : ALLOCATION_PRESETS[preset].etf,
  }));

  const etf = products.etfs.find((item) => item.symbol === selected.etf);
  const savingsAssets = result ? result.depositBalance + result.savingBalance : 0;
  const etfAssets = result ? result.etfBalance + result.dividendCash : 0;

  return (
    <div className="page-shell">
      <AppHeader />
      <main className="page-content page-content-xl simulation-page">
        <section className="hero-panel">
          <p className="eyebrow">과거 데이터 기반</p>
          <h1>그때 시작했다면, 지금 얼마였을까요?</h1>
          <p className="lead">선택한 예금·적금·ETF에 같은 월 잔여자금을 과거부터 투자한 결과를 계산합니다.</p>
        </section>

        {modalOpen && draft && (
          <div className="sim-modal-backdrop" role="presentation">
            <section className="sim-modal" role="dialog" aria-modal="true" aria-labelledby="sim-settings-title">
              <div className="sim-modal-header">
                <h2 id="sim-settings-title">과거 시뮬레이션 설정</h2>
                <button type="button" className="sim-modal-close" onClick={closeModal} aria-label="설정 닫기">×</button>
              </div>
              <form onSubmit={saveSettings} className="sim-modal-form">
                <label>과거 시작일<input type="date" max={today} value={draft.startDate} onChange={(event) => setField('startDate', event.target.value)} required /></label>
                <label>시작 자산<input type="number" min="0" value={draft.startingAssets} onChange={(event) => setField('startingAssets', event.target.value)} required /></label>
                <label>목표 자산<input type="number" min="0" value={draft.targetAssetAmount} onChange={(event) => setField('targetAssetAmount', event.target.value)} required /></label>
                <label>월 투자 가능액<input type="number" min="0" value={draft.monthlyInvestable} onChange={(event) => setField('monthlyInvestable', event.target.value)} required /></label>
                <label>배분 방식<select value={draft.preset} onChange={(event) => applyPreset(event.target.value)}>{Object.keys(ALLOCATION_PRESETS).map((key) => <option key={key} value={key}>{PRESET_LABELS[key]} · ETF {ALLOCATION_PRESETS[key].etf}%</option>)}<option value="custom">직접 설정</option></select></label>
                <label>ETF 비중 ({draft.etfRatio}%)<input type="range" min="0" max="100" value={draft.etfRatio} onChange={(event) => { setField('etfRatio', event.target.value); setField('preset', 'custom'); }} /></label>
                <div className="toolbar">
                  <button type="button" className="btn btn-ghost" onClick={closeModal}>취소</button>
                  <button type="submit" className="btn btn-primary">계산 시작</button>
                </div>
              </form>
            </section>
          </div>
        )}

        <div className="simulation-workspace">
          <aside className="sim-settings-panel" aria-label="시뮬레이션 설정">
            <div className="sim-settings-sticky">
              <div className="sim-settings-header">
                <div>
                  <p className="eyebrow">내 포트폴리오</p>
                  <h2>투자 설정</h2>
                </div>
                <button type="button" className="btn btn-ghost" disabled={calculating} onClick={() => { setDraft(settings); setModalOpen(true); }}>설정 변경</button>
              </div>

              {settings && (
                <dl className="sim-settings-summary">
                  <div><dt>시작일</dt><dd>{settings.startDate}</dd></div>
                  <div><dt>시작 자산</dt><dd>{won(settings.startingAssets)}</dd></div>
                  <div><dt>월 투자</dt><dd>{won(settings.monthlyInvestable)}</dd></div>
                  <div><dt>배분</dt><dd>적금 {100 - settings.etfRatio}% · ETF {settings.etfRatio}%</dd></div>
                </dl>
              )}

              <section className="sim-controls" aria-label="포트폴리오 상품 선택">
                <label>예금<select value={selected.deposit} disabled={calculating} onChange={(event) => setSelected((current) => ({ ...current, deposit: event.target.value }))}>{products.deposits.map((item) => <option key={productKey(item)} value={productKey(item)}>{productLabel(item)}</option>)}</select></label>
                <label>적금<select value={selected.saving} disabled={calculating} onChange={(event) => setSelected((current) => ({ ...current, saving: event.target.value }))}>{products.savings.map((item) => <option key={productKey(item)} value={productKey(item)}>{productLabel(item)}</option>)}</select></label>
                <label>ETF<select value={selected.etf} disabled={calculating || !settings?.etfRatio} onChange={(event) => setSelected((current) => ({ ...current, etf: event.target.value }))}>{!settings?.etfRatio && <option value="">ETF 없음</option>}{products.etfs.map((item) => <option key={item.symbol} value={item.symbol}>{item.name} ({item.symbol})</option>)}</select></label>
              </section>
            </div>
          </aside>

          <section className="sim-results" aria-label="시뮬레이션 결과">
            {(loading || financialLoading) && <p className="muted">금융·상품·시세 데이터를 불러오는 중...</p>}
            {calculating && <p className="muted sim-calculating" role="status">새 설정으로 다시 계산하는 중...</p>}
            {(error || financialError) && <p className="alert alert-error" role="alert">{error || financialError}</p>}

            {!calculating && result && (
              <>
                <section className={`sim-goal-result ${result.targetMet ? 'is-achieved' : 'is-pending'}`}>
                  <p className="sim-goal-status">{result.targetMet ? '✓ 목표 달성!' : '○ 목표까지 조금 더 필요해요'}</p>
                  <h2>{won(result.totalAssets)}</h2>
                  <p>현재 모의 총자산</p>
                  <div className="sim-goal-meta">
                    <span>목표 {won(settings.targetAssetAmount)}</span>
                    <strong>{result.targetMet ? '초과' : '부족'} {won(Math.abs(result.goalDifference))}</strong>
                    {result.targetMet && <span>첫 달성일 {result.firstCrossingDate}</span>}
                  </div>
                </section>

                <section className="panel chart-panel">
                  <h2>과거 포트폴리오 궤적</h2>
                  <TrajectoryChart data={result.trajectory} />
                </section>

                <div className="sim-detail-list">
                  <details className="sim-detail-card">
                    <summary>
                      <span>데이터 및 계산 기준</span>
                      <strong>{result.source} · {result.startDate} ~ {result.endDate}</strong>
                    </summary>
                    <div className="sim-detail-body">
                      <p className={`source-banner ${result.source === 'yfinance' ? 'live' : 'mock'}`}>데이터 출처: {result.source}{etfData?.message ? ` · ${etfData.message}` : ''}</p>
                      <dl className="sim-metric-grid">
                        <div><dt>총 납입 원금</dt><dd>{won(result.totalPrincipal)}</dd></div>
                        <div><dt>월 투자 가능액</dt><dd>{won(result.monthlyInvestable)}</dd></div>
                        <div><dt>적금 / ETF 배분</dt><dd>{100 - settings.etfRatio}% / {settings.etfRatio}%</dd></div>
                        <div><dt>조회 기간</dt><dd>{result.startDate} ~ {result.endDate}</dd></div>
                      </dl>
                      <ul className="sim-product-summary">
                        <li><span>예금</span><strong>{deposit?.productName || '선택 없음'}</strong></li>
                        <li><span>적금</span><strong>{saving?.productName || '선택 없음'}</strong></li>
                        <li><span>ETF</span><strong>{etf ? `${etf.name} (${etf.symbol})` : '선택 없음'}</strong></li>
                      </ul>
                    </div>
                  </details>

                  <details className="sim-detail-card">
                    <summary>
                      <span>예·적금 자산</span>
                      <strong>{won(savingsAssets)}</strong>
                    </summary>
                    <div className="sim-detail-body">
                      <dl className="sim-metric-grid">
                        <div><dt>예금 잔액</dt><dd>{won(result.depositBalance)}</dd></div>
                        <div><dt>현재 적금 잔액</dt><dd>{won(result.savingBalance)}</dd></div>
                        <div><dt>예금 이자</dt><dd>{won(result.depositInterest)}</dd></div>
                        <div><dt>적금 이자</dt><dd>{won(result.savingInterest)}</dd></div>
                      </dl>
                    </div>
                  </details>

                  <details className="sim-detail-card">
                    <summary>
                      <span>ETF 투자 자산</span>
                      <strong>{won(etfAssets)}</strong>
                    </summary>
                    <div className="sim-detail-body">
                      <div className={`sim-return ${result.etfTotalReturn >= 0 ? 'is-positive' : 'is-negative'}`}>
                        <span>투자 대비 총수익률</span>
                        <strong>{percent(result.etfReturnRate)}</strong>
                        <small>총수익 {won(result.etfTotalReturn)}</small>
                      </div>
                      <dl className="sim-metric-grid">
                        <div><dt>ETF 배정 원금</dt><dd>{won(result.etfAllocatedPrincipal)}</dd></div>
                        <div><dt>실제 매수금</dt><dd>{won(result.etfExternalInvested)}</dd></div>
                        <div><dt>현재 평가액</dt><dd>{won(result.etfValue)}</dd></div>
                        <div><dt>보유 수량</dt><dd>{result.etfShares.toLocaleString('ko-KR')}주</dd></div>
                        <div><dt>매수 대기금</dt><dd>{won(result.etfCashRemainder)}</dd></div>
                        <div><dt>평가손익</dt><dd>{won(result.etfProfitLoss)}</dd></div>
                        <div><dt>배당 현금</dt><dd>{won(result.dividendCash)}</dd></div>
                      </dl>
                    </div>
                  </details>
                </div>
              </>
            )}
          </section>
        </div>

        {!calculating && result && (
          <section className="panel sim-assumptions">
            <h2>계산 가정</h2>
            <ul className="insight-list">
              <li>매월 해당 월의 마지막 거래일 종가로 정수 주를 매수하고 남은 돈은 ETF 전용 현금으로 이월해 다음 매수에 사용합니다.</li>
              <li>실제 배당 이벤트만 현금으로 반영하며, 세금·수수료·중도해지는 제외합니다.</li>
              <li>적금 만기금은 선택한 예금으로 이전하고 동일 조건으로 재시작합니다.</li>
              <li>종료일은 오늘 또는 백엔드에서 제공한 마지막 거래일입니다. 미래 수익을 예측하지 않습니다.</li>
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
