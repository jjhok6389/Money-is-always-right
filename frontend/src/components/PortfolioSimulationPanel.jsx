import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ProductTour from './ProductTour';
import TrajectoryChart from './TrajectoryChart';
import { SIMULATION_RESULT_TOUR_STEPS, SIMULATION_TOUR_STEPS } from '../data/productTourSteps';
import { useAuth } from '../contexts/AuthContext';
import { DEFAULT_TOP_FIN_GRP_NO } from '../constants/fss';
import useFinancialSummary from '../hooks/useFinancialSummary';
import useHoldingsSnapshot from '../hooks/useHoldingsSnapshot';
import { fetchDashboard } from '../services/dashboardService';
import { fetchEtfDetail, fetchEtfRecommendations } from '../services/etfService';
import { fetchDepositProducts, fetchSavingProducts } from '../services/productService';
import { formatDataSource } from '../utils/formatSource';
import { summarizeLoans } from '../utils/debtSimulation';
import { ALLOCATION_PRESETS, simulatePortfolio } from '../utils/portfolioSimulator';
import {
  buildDefaultPortfolioSettings,
  dismissPortfolioResultTour as persistPortfolioResultTourDismissal,
  dismissPortfolioTour as persistPortfolioTourDismissal,
  loadPortfolioSettings,
  matchRecommendedProduct,
  productKey,
  savePortfolioSettings,
  shouldShowPortfolioResultTour,
  shouldShowPortfolioTour,
  todayIso,
  validatePortfolioSettingsStep,
  yearsBefore,
} from '../utils/portfolioSimulationSettings';

const PRESET_LABELS = {
  stable: '안정형',
  stable_seeking: '안정추구형',
  neutral: '위험중립형',
  aggressive: '적극투자형',
  very_aggressive: '공격투자형',
};

const START_DATE_PRESETS = [
  { years: 1, label: '1년' },
  { years: 3, label: '3년' },
  { years: 5, label: '5년' },
];

const won = (value) => `${Math.round(Number(value) || 0).toLocaleString('ko-KR')}원`;
const percent = (value) => (value == null
  ? '-'
  : `${Number(value) > 0 ? '+' : ''}${Number(value).toLocaleString('ko-KR')}%`);

function option(product) {
  return product?.options?.find((item) => Number(item.saveTermMonths) === Number(product.bestTermMonths))
    || product?.options?.[0]
    || { saveTermMonths: product?.bestTermMonths, interestRate: product?.bestRate };
}

function productLabel(product) {
  const selected = option(product);
  return `${product.companyName} · ${product.productName} (${selected.saveTermMonths || 12}개월, ${selected.interestRate ?? product.bestRate ?? 0}%)`;
}

function normalizeSettings(raw, { propensity }) {
  const preset = raw.preset === 'custom' ? 'custom' : (ALLOCATION_PRESETS[raw.preset] ? raw.preset : propensity);
  const etfRatio = propensity === 'stable'
    ? 0
    : Number(raw.etfRatio) || 0;
  return {
    ...raw,
    preset: preset === 'custom' ? 'custom' : preset,
    startingAssets: Number(raw.startingAssets) || 0,
    targetAssetAmount: Number(raw.targetAssetAmount) || 0,
    monthlyInvestable: Number(raw.monthlyInvestable) || 0,
    etfRatio,
    startingAssetsSource: raw.startingAssetsSource === 'manual' ? 'manual' : 'holdings',
  };
}

export default function PortfolioSimulationPanel({ onSwitchMode }) {
  const endDate = todayIso();
  const { user, profile } = useAuth();
  const { financialSummary, loading: financialLoading, error: financialError } = useFinancialSummary();
  const { holdings, loading: holdingsLoading, error: holdingsError } = useHoldingsSnapshot();
  const propensity = ALLOCATION_PRESETS[profile?.investmentPropensity] ? profile.investmentPropensity : 'neutral';
  const holdingsTotalAssets = Number(holdings?.totals?.totalAssets) || 0;
  const hasSavedSettings = Boolean(loadPortfolioSettings(user?.uid));

  const [products, setProducts] = useState({ deposits: [], savings: [], etfs: [] });
  const [dashboardRecs, setDashboardRecs] = useState(null);
  const [selected, setSelected] = useState({ deposit: '', saving: '', etf: '' });
  const [draftSelected, setDraftSelected] = useState({ deposit: '', saving: '', etf: '' });
  const [settings, setSettings] = useState(null);
  const [draft, setDraft] = useState(null);
  const [modalOpen, setModalOpen] = useState(() => !hasSavedSettings);
  const [settingsStep, setSettingsStep] = useState(1);
  const [settingsError, setSettingsError] = useState('');
  const [showPortfolioTour, setShowPortfolioTour] = useState(() => shouldShowPortfolioTour({
    modalOpen: !hasSavedSettings,
    hasSavedSettings,
  }));
  const [showPortfolioResultTour, setShowPortfolioResultTour] = useState(false);
  const [firstVisitHint, setFirstVisitHint] = useState(false);
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const [etfData, setEtfData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [calculationRun, setCalculationRun] = useState(0);
  const [error, setError] = useState('');

  const applyHoldingsStartingAssets = useCallback((base, assets = holdingsTotalAssets) => {
    if (assets <= 0) return base;
    return { ...base, startingAssets: assets, startingAssetsSource: 'holdings' };
  }, [holdingsTotalAssets]);

  useEffect(() => {
    if (!modalOpen) return undefined;
    const previouslyFocused = document.activeElement;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!showPortfolioTour) closeButtonRef.current?.focus();

    const handleKeyDown = (event) => {
      if (showPortfolioTour) return;
      if (event.key === 'Escape' && settings) {
        setSettingsError('');
        setModalOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus?.();
    };
  }, [modalOpen, settings, showPortfolioTour]);

  useEffect(() => {
    if (!financialSummary || holdingsLoading) return;
    const saved = loadPortfolioSettings(user?.uid);
    let initial;
    if (saved) {
      initial = normalizeSettings(saved, { startingAssets: holdingsTotalAssets, propensity });
      if (initial.startingAssetsSource !== 'manual') {
        initial = applyHoldingsStartingAssets(initial);
      } else if (initial.startingAssets === 0 && holdingsTotalAssets > 0) {
        initial = applyHoldingsStartingAssets(initial);
      }
    } else {
      initial = buildDefaultPortfolioSettings({
        endDate,
        startingAssets: holdingsTotalAssets,
        profile,
        propensity,
        financialSummary,
        startingAssetsSource: 'holdings',
      });
    }
    setSettings(initial);
    setDraft(initial);
  }, [
    applyHoldingsStartingAssets,
    endDate,
    financialSummary,
    holdingsLoading,
    holdingsTotalAssets,
    profile,
    propensity,
    user?.uid,
  ]);

  useEffect(() => {
    if (!settings || settings.startingAssetsSource === 'manual' || holdingsTotalAssets <= 0) return;
    if (settings.startingAssets === holdingsTotalAssets) return;
    const next = applyHoldingsStartingAssets(settings);
    setSettings(next);
    setDraft((current) => (current ? applyHoldingsStartingAssets(current) : current));
    savePortfolioSettings(next, user?.uid);
    setCalculationRun((current) => current + 1);
  }, [applyHoldingsStartingAssets, holdingsTotalAssets, settings, user?.uid]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchDepositProducts({ topFinGrpNo: DEFAULT_TOP_FIN_GRP_NO }),
      fetchSavingProducts({ topFinGrpNo: DEFAULT_TOP_FIN_GRP_NO }),
      fetchEtfRecommendations(propensity),
      fetchDashboard().catch(() => null),
    ]).then(([depositData, savingData, etfResponse, dashboardData]) => {
      if (!active) return;
      const deposits = depositData.products || [];
      const savings = savingData.products || [];
      const etfs = etfResponse.etfs || [];
      setProducts({ deposits, savings, etfs });
      setDashboardRecs(dashboardData);

      const recDeposit = dashboardData?.recommendedProducts?.find((item) => item.productType === 'deposit');
      const recSaving = dashboardData?.recommendedProducts?.find((item) => item.productType === 'saving');
      const recEtf = dashboardData?.recommendedEtfs?.[0]?.symbol
        || etfs[0]?.symbol
        || '';

      const nextSelected = {
        deposit: matchRecommendedProduct(deposits, recDeposit),
        saving: matchRecommendedProduct(savings, recSaving),
        etf: recEtf,
      };
      setSelected(nextSelected);
      setDraftSelected(nextSelected);
    }).catch((reason) => setError(reason.message || '상품 정보를 불러오지 못했습니다.'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [propensity]);

  useEffect(() => {
    if (!selected.etf || !settings?.startDate || settings.etfRatio === 0) {
      setEtfData(null);
      setCalculating(false);
      return undefined;
    }
    let active = true;
    setCalculating(true);
    setEtfData(null);
    setError('');
    fetchEtfDetail(selected.etf, propensity, { startDate: settings.startDate, endDate })
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
  }, [selected.etf, propensity, settings?.startDate, settings?.etfRatio, calculationRun, endDate]);

  const monthlyCapacity = useMemo(() => Math.max(
    Number(financialSummary?.totalIncome) - Number(financialSummary?.totalExpenses),
    Number(financialSummary?.monthlySavingsCapacity) || 0,
    0,
  ), [financialSummary]);

  const debtSummary = useMemo(
    () => summarizeLoans(holdings?.loans, monthlyCapacity),
    [holdings?.loans, monthlyCapacity],
  );

  const deposit = products.deposits.find((item) => productKey(item) === selected.deposit);
  const saving = products.savings.find((item) => productKey(item) === selected.saving);
  const result = useMemo(() => {
    if (!settings || !deposit || !saving || (settings.etfRatio > 0 && !etfData?.etf?.series?.length)) {
      return null;
    }
    return simulatePortfolio({
      ...settings,
      endDate,
      loans: holdings?.loans || [],
      monthlyCapacity,
      savingOption: option(saving),
      depositOption: option(deposit),
      prices: etfData?.etf?.series || [],
      dividends: etfData?.etf?.dividends || [],
      source: etfData?.source || 'stored',
    });
  }, [settings, deposit, saving, etfData, endDate, holdings?.loans, monthlyCapacity]);

  useEffect(() => {
    if (!result || calculating || modalOpen) return;
    setShowPortfolioResultTour(shouldShowPortfolioResultTour({
      hasResult: true,
      calculating,
      modalOpen,
    }));
  }, [result, calculating, modalOpen]);

  const persistSettings = (rawDraft) => {
    const next = normalizeSettings(rawDraft, { startingAssets: holdingsTotalAssets, propensity });
    savePortfolioSettings(next, user?.uid);
    setCalculating(true);
    setCalculationRun((current) => current + 1);
    setSettings(next);
    setDraft(next);
    return next;
  };

  const dismissPortfolioTour = () => {
    setShowPortfolioTour(false);
    persistPortfolioTourDismissal();
  };

  const dismissPortfolioResultTour = () => {
    setShowPortfolioResultTour(false);
    persistPortfolioResultTourDismissal();
  };

  const goSettingsNext = () => {
    setSettingsError('');
    setSettingsStep((current) => Math.min(current + 1, 3));
  };

  const saveSettings = (event) => {
    event.preventDefault();
    const firstError = [1, 2, 3]
      .map((step) => ({ step, message: validatePortfolioSettingsStep(step, draft, endDate) }))
      .find(({ message }) => message);
    if (firstError) {
      setSettingsStep(firstError.step);
      setSettingsError(firstError.message);
      return;
    }
    setSelected(draftSelected);
    persistSettings(draft);
    setSettingsError('');
    setModalOpen(false);
    setFirstVisitHint(false);
  };

  const deferModal = () => {
    const base = settings || buildDefaultPortfolioSettings({
      endDate,
      startingAssets: holdingsTotalAssets,
      profile,
      propensity,
      financialSummary,
      startingAssetsSource: 'holdings',
    });
    persistSettings(base);
    setSettingsError('');
    setModalOpen(false);
    setFirstVisitHint(true);
  };

  const closeModal = () => {
    if (settings) {
      setSettingsError('');
      setModalOpen(false);
    }
  };

  const openSettings = () => {
    setDraft(settings);
    setDraftSelected(selected);
    setSettingsStep(1);
    setSettingsError('');
    setModalOpen(true);
  };

  const selectSettingsStep = (nextStep) => {
    setSettingsError('');
    setSettingsStep(nextStep);
  };

  const setField = (name, value) => {
    setDraft((current) => {
      const next = { ...current, [name]: value };
      if (name === 'startingAssets') {
        const numeric = Number(value) || 0;
        next.startingAssetsSource = numeric !== holdingsTotalAssets ? 'manual' : 'holdings';
      }
      return next;
    });
  };

  const applyPreset = (preset) => setDraft((current) => ({
    ...current,
    preset,
    etfRatio: preset === 'custom'
      ? (propensity === 'stable' ? 0 : current.etfRatio)
      : ALLOCATION_PRESETS[preset].etf,
  }));

  const applyStartPreset = (years) => {
    setField('startDate', yearsBefore(years, endDate));
  };

  const applyRecommendedProducts = () => {
    const recDeposit = dashboardRecs?.recommendedProducts?.find((item) => item.productType === 'deposit');
    const recSaving = dashboardRecs?.recommendedProducts?.find((item) => item.productType === 'saving');
    const recEtf = dashboardRecs?.recommendedEtfs?.[0]?.symbol
      || products.etfs[0]?.symbol
      || '';
    setSelected({
      deposit: matchRecommendedProduct(products.deposits, recDeposit),
      saving: matchRecommendedProduct(products.savings, recSaving),
      etf: recEtf,
    });
    setCalculationRun((current) => current + 1);
  };

  const syncStartingAssets = () => {
    if (!settings || holdingsTotalAssets <= 0) return;
    const next = applyHoldingsStartingAssets(settings);
    setSettings(next);
    setDraft(next);
    savePortfolioSettings(next, user?.uid);
    setCalculationRun((current) => current + 1);
  };

  const etf = products.etfs.find((item) => item.symbol === selected.etf);
  const savingsAssets = result ? result.depositBalance + result.savingBalance : 0;
  const etfAssets = result ? result.etfBalance + result.dividendCash : 0;
  const dataLoading = loading || financialLoading || holdingsLoading;
  const dataError = error || financialError || holdingsError;
  const isStable = propensity === 'stable';

  const emptyReason = useMemo(() => {
    if (dataLoading || calculating) return null;
    if (!settings) return '시뮬레이션 설정을 완료해 주세요.';
    if (!products.deposits.length || !products.savings.length) {
      return '예금·적금 상품을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    }
    if (isStable && settings.etfRatio > 0) {
      return '안정형은 ETF 배분 0%가 기본입니다. 설정에서 ETF 비중을 조정해 주세요.';
    }
    if (settings.etfRatio > 0 && !selected.etf) {
      return '투자 성향에 맞는 ETF가 없습니다. ETF 비중을 0%로 하거나 성향을 변경해 보세요.';
    }
    if (settings.etfRatio > 0 && !etfData?.etf?.series?.length) {
      return '선택한 ETF의 과거 시세를 불러오지 못했습니다. 다른 ETF를 선택하거나 잠시 후 다시 시도해 주세요.';
    }
    if (!deposit || !saving) return '예금·적금 상품을 선택해 주세요.';
    return null;
  }, [
    calculating,
    dataLoading,
    deposit,
    etfData,
    isStable,
    products.deposits.length,
    products.savings.length,
    saving,
    selected.etf,
    settings,
  ]);

  return (
    <>
      {modalOpen && draft && createPortal(
        <div className="sim-modal-backdrop" role="presentation" onMouseDown={closeModal}>
          <section
            ref={dialogRef}
            className="sim-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sim-settings-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="sim-modal-header">
              <div>
                <p className="sim-modal-kicker">과거 포트폴리오</p>
                <h2 id="sim-settings-title">과거 시뮬레이션 설정</h2>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                className="sim-modal-close"
                onClick={closeModal}
                aria-label="설정 닫기"
              >
                ×
              </button>
            </div>
            <ol className="sim-settings-steps" aria-label="설정 단계">
              {[{ step: 1, label: '기간 설정' }, { step: 2, label: '목표 설정' }, { step: 3, label: '투자 방식' }].map(({ step: itemStep, label }) => {
                const current = settingsStep === itemStep;
                return (
                  <li
                    key={itemStep}
                    className={current ? ' is-current' : ''}
                    aria-current={current ? 'step' : undefined}
                    aria-label={`${label} ${current ? '현재 단계' : ''}`}
                  >
                    <button type="button" onClick={() => selectSettingsStep(itemStep)}>
                      <strong>{itemStep}</strong><span>{label}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <form onSubmit={saveSettings} className="sim-modal-form">
              {settingsStep === 1 && (
                <div className="sim-settings-stage" data-tour="portfolio-period">
                  <div className="sim-settings-copy">
                    <h3>기간 설정</h3>
                    <p>어느 시점부터 투자했는지 알아야 같은 시장 흐름을 되짚어 볼 수 있어요.</p>
                  </div>
                  <fieldset className="sim-date-presets">
                    <legend>과거 시작일 빠른 선택</legend>
                    <div className="toolbar">
                      {START_DATE_PRESETS.map(({ years, label }) => (
                        <button
                          key={years}
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => applyStartPreset(years)}
                        >
                          {label} 전
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label>
                    과거 시작일
                    <input
                      type="date"
                      max={endDate}
                      value={draft.startDate}
                      onChange={(event) => setField('startDate', event.target.value)}
                    />
                  </label>
                </div>
              )}
              {settingsStep === 2 && (
                <div className="sim-settings-stage" data-tour="portfolio-goal">
                  <div className="sim-settings-copy">
                    <h3>목표 설정</h3>
                    <p>시작 자산과 목표 금액을 알면 당시 선택이 목표에 얼마나 가까워졌는지 비교할 수 있어요.</p>
                  </div>
                  <label>
                    시작 자산
                    <input
                      type="number"
                      min="0"
                      value={draft.startingAssets}
                      onChange={(event) => setField('startingAssets', event.target.value)}
                    />
                  </label>
                  <p className="muted sim-holdings-policy">
                    시작 자산의 기준은 Demo 보유 합산(holdings.totals.totalAssets)입니다.
                    직접 수정하면 수동 모드로 유지되며, 「Demo 기준으로 맞추기」로 다시 동기화할 수 있습니다.
                  </p>
                  <label>
                    목표 자산
                    <input
                      type="number"
                      min="0"
                      value={draft.targetAssetAmount}
                      onChange={(event) => setField('targetAssetAmount', event.target.value)}
                    />
                  </label>
                </div>
              )}
              {settingsStep === 3 && (
                <div className="sim-settings-stage" data-tour="portfolio-investment">
                  <div className="sim-settings-copy">
                    <h3>투자 방식</h3>
                    <p>매달 넣을 금액과 예·적금·ETF의 비중을 정하면 같은 기간에 어떤 선택이었는지 비교할 수 있어요.</p>
                  </div>
                  <label>
                    월 투자 가능액
                    <input
                      type="number"
                      min="0"
                      value={draft.monthlyInvestable}
                      onChange={(event) => setField('monthlyInvestable', event.target.value)}
                    />
                  </label>
                  <label>
                    배분 방식
                    <select value={draft.preset} onChange={(event) => applyPreset(event.target.value)}>
                      {Object.keys(ALLOCATION_PRESETS).map((key) => (
                        <option key={key} value={key}>
                          {PRESET_LABELS[key]} · ETF {ALLOCATION_PRESETS[key].etf}%
                        </option>
                      ))}
                      <option value="custom">직접 설정</option>
                    </select>
                  </label>
                  <label>
                    ETF 비중 ({draft.etfRatio}%)
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={draft.etfRatio}
                      disabled={isStable}
                      onChange={(event) => {
                        setField('etfRatio', event.target.value);
                        setField('preset', 'custom');
                      }}
                    />
                  </label>
                  {isStable && (
                    <p className="info-box sim-stable-note">안정형은 ETF 비중을 조정할 수 없습니다.</p>
                  )}
                  <p className="muted sim-etf-ratio-note">
                    월 투자 가능액 중 ETF에 배분하는 비율이며, 나머지는 적금에 배분됩니다.
                  </p>
                  <section className="sim-controls" aria-label="모달 포트폴리오 상품 선택">
                    <div className="sim-settings-copy">
                      <h3>종목 선택</h3>
                      <p>
                        선택한 상품의 실제 금리와 과거 가격을 적용해 자산 흐름을 계산합니다.
                        각 도움말에서 상품별 운용 방식을 확인하세요.
                      </p>
                    </div>
                    <div className="sim-product-field">
                      <span className="sim-product-label">
                        <label htmlFor="sim-modal-deposit">예금</label>
                        <span className="sim-product-help">
                          <button type="button" aria-label="예금 운용 방식 설명" aria-describedby="sim-deposit-help">?</button>
                          <span id="sim-deposit-help" role="tooltip">
                            적금 만기금이 합쳐지는 예금 상품입니다. 이후 선택한 예금의 금리로 운용합니다.
                          </span>
                        </span>
                      </span>
                      <select
                        id="sim-modal-deposit"
                        value={draftSelected.deposit}
                        disabled={calculating}
                        onChange={(event) => setDraftSelected((current) => ({ ...current, deposit: event.target.value }))}
                      >
                        {products.deposits.map((item) => (
                          <option key={productKey(item)} value={productKey(item)}>{productLabel(item)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sim-product-field">
                      <span className="sim-product-label">
                        <label htmlFor="sim-modal-saving">적금</label>
                        <span className="sim-product-help">
                          <button type="button" aria-label="적금 운용 방식 설명" aria-describedby="sim-saving-help">?</button>
                          <span id="sim-saving-help" role="tooltip">
                            매달 선택한 적금에 납입합니다. 만기금은 예금으로 옮기고 같은 적금에 다시 가입합니다.
                          </span>
                        </span>
                      </span>
                      <select
                        id="sim-modal-saving"
                        value={draftSelected.saving}
                        disabled={calculating}
                        onChange={(event) => setDraftSelected((current) => ({ ...current, saving: event.target.value }))}
                      >
                        {products.savings.map((item) => (
                          <option key={productKey(item)} value={productKey(item)}>{productLabel(item)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="sim-product-field">
                      <span className="sim-product-label">
                        <label htmlFor="sim-modal-etf">ETF</label>
                        <span className="sim-product-help">
                          <button type="button" aria-label="ETF 운용 방식 설명" aria-describedby="sim-etf-help">?</button>
                          <span id="sim-etf-help" role="tooltip">
                            ETF 배정액으로 선택 종목을 집중 매수합니다. 한 주를 사기에 부족한 금액은 ETF 전용 현금으로 이월합니다.
                          </span>
                        </span>
                      </span>
                      <select
                        id="sim-modal-etf"
                        value={draftSelected.etf}
                        disabled={calculating || isStable || !draft.etfRatio}
                        onChange={(event) => setDraftSelected((current) => ({ ...current, etf: event.target.value }))}
                      >
                        {(isStable || !draft.etfRatio) && <option value="">ETF 없음</option>}
                        {products.etfs.map((item) => (
                          <option key={item.symbol} value={item.symbol}>{item.name} ({item.symbol})</option>
                        ))}
                      </select>
                    </div>
                  </section>
                </div>
              )}
              {settingsError && <p className="alert alert-error" role="alert">{settingsError}</p>}
              <div className="sim-settings-actions">
                <div>
                  <button type="button" className="btn btn-ghost" onClick={deferModal}>나중에</button>
                  <button type="button" className="btn btn-ghost" onClick={closeModal}>취소</button>
                </div>
                <div>
                  {settingsStep > 1 && (
                    <button type="button" className="btn btn-ghost" onClick={() => {
                      setSettingsError('');
                      setSettingsStep((current) => current - 1);
                    }}>
                      이전
                    </button>
                  )}
                  {settingsStep < 3 ? (
                    <button type="button" className="btn btn-primary" onClick={goSettingsNext}>다음</button>
                  ) : (
                    <button type="submit" className="btn btn-primary">계산 시작</button>
                  )}
                </div>
              </div>
            </form>
          </section>
        </div>,
        document.body,
      )}

      <ProductTour
        ready={Boolean(draft)}
        steps={SIMULATION_TOUR_STEPS}
        active={showPortfolioTour && modalOpen && !hasSavedSettings && Boolean(draft)}
        stepIndex={settingsStep - 1}
        onDismiss={dismissPortfolioTour}
        onStepChange={(stepIndex) => selectSettingsStep(stepIndex + 1)}
        modifier="portfolio-settings"
      />

      <ProductTour
        ready={Boolean(result)}
        steps={SIMULATION_RESULT_TOUR_STEPS}
        active={showPortfolioResultTour && !showPortfolioTour && Boolean(result) && !calculating && !modalOpen}
        onDismiss={dismissPortfolioResultTour}
        modifier="portfolio-result"
      />

      {firstVisitHint && (
        <p className="info-box sim-first-visit-hint" role="status">
          기본 설정으로 미리보기를 계산했습니다. 사이드바에서 상품을 바꾸거나 「설정 변경」으로 기간·금액을 조정해 보세요.
        </p>
      )}

      <div className="simulation-workspace">
        <aside className="sim-settings-panel" data-tour="simulation-settings" aria-label="시뮬레이션 설정">
          <div className="sim-settings-sticky">
            <div className="sim-settings-header">
              <div>
                <p className="eyebrow">내 포트폴리오</p>
                <h2>투자 설정</h2>
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={calculating}
                onClick={openSettings}
              >
                설정 변경
              </button>
            </div>

            {settings && (
              <dl className="sim-settings-summary">
                <div><dt>시작일</dt><dd>{settings.startDate}</dd></div>
                <div>
                  <dt>시작 자산</dt>
                  <dd>
                    {won(settings.startingAssets)}
                    <span className="muted sim-source-tag">
                      {settings.startingAssetsSource === 'manual' ? '수동' : 'Demo 보유'}
                    </span>
                  </dd>
                </div>
                <div><dt>월 투자</dt><dd>{won(settings.monthlyInvestable)}</dd></div>
                <div><dt>배분</dt><dd>적금 {100 - settings.etfRatio}% · ETF {settings.etfRatio}%</dd></div>
              </dl>
            )}

            <p className="muted sim-holdings-policy">
              Demo 보유 합산이 시작 자산의 기준입니다.
              {settings?.startingAssetsSource === 'manual' && ' (현재 수동 입력)'}
            </p>

            {holdingsTotalAssets > 0 && settings?.startingAssetsSource === 'manual'
              && settings?.startingAssets !== holdingsTotalAssets && (
              <p className="sim-holdings-sync muted">
                Demo 보유 합산 {won(holdingsTotalAssets)}과 다릅니다.{' '}
                <button type="button" className="btn-link" onClick={syncStartingAssets}>
                  Demo 기준으로 맞추기
                </button>
              </p>
            )}

            {debtSummary.count > 0 && (
              <p className="info-box sim-debt-note">
                Demo 부채 {debtSummary.count}건 · 잔액 {won(debtSummary.totalBalance)}
                <br />
                월 상환 우선 {won(debtSummary.monthlyObligation)} → 투자 가능{' '}
                {won(Math.max((settings?.monthlyInvestable || 0) - debtSummary.monthlyObligation, 0))}
              </p>
            )}

            {isStable && (
              <p className="info-box sim-stable-note">안정형 — ETF 배분 없이 예·적금만 시뮬레이션합니다.</p>
            )}

            <div className="toolbar">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={calculating || !products.deposits.length}
                onClick={applyRecommendedProducts}
              >
                추천 상품으로 채우기
              </button>
            </div>

            <section className="sim-controls" aria-label="포트폴리오 상품 선택">
              <label>
                예금
                <select
                  value={selected.deposit}
                  disabled={calculating}
                  onChange={(event) => setSelected((current) => ({ ...current, deposit: event.target.value }))}
                >
                  {products.deposits.map((item) => (
                    <option key={productKey(item)} value={productKey(item)}>{productLabel(item)}</option>
                  ))}
                </select>
              </label>
              <label>
                적금
                <select
                  value={selected.saving}
                  disabled={calculating}
                  onChange={(event) => setSelected((current) => ({ ...current, saving: event.target.value }))}
                >
                  {products.savings.map((item) => (
                    <option key={productKey(item)} value={productKey(item)}>{productLabel(item)}</option>
                  ))}
                </select>
              </label>
              <label>
                ETF
                <select
                  value={selected.etf}
                  disabled={calculating || isStable || !settings?.etfRatio}
                  onChange={(event) => setSelected((current) => ({ ...current, etf: event.target.value }))}
                >
                  {(isStable || !settings?.etfRatio) && <option value="">ETF 없음</option>}
                  {products.etfs.map((item) => (
                    <option key={item.symbol} value={item.symbol}>{item.name} ({item.symbol})</option>
                  ))}
                </select>
              </label>
            </section>
          </div>
        </aside>

        <section className="sim-results" aria-label="시뮬레이션 결과">
          {dataLoading && <p className="muted">금융·상품·시세 데이터를 불러오는 중...</p>}
          {calculating && <p className="muted sim-calculating" role="status">새 설정으로 다시 계산하는 중...</p>}
          {dataError && <p className="alert alert-error" role="alert">{dataError}</p>}
          {!dataLoading && !calculating && emptyReason && !result && (
            <div className="info-box sim-empty-state" role="status">
              {emptyReason}
            </div>
          )}

          {!calculating && result && (
            <>
              <section className={`sim-goal-result ${result.targetMet ? 'is-achieved' : 'is-pending'}`} data-tour="simulation-goal-result">
                <p className="sim-goal-status">{result.targetMet ? '✓ 목표 달성!' : '○ 목표까지 조금 더 필요해요'}</p>
                <h2>{won(result.totalAssets)}</h2>
                <p>현재 모의 총자산</p>
                <div className="sim-goal-meta">
                  <span>목표 {won(settings.targetAssetAmount)}</span>
                  <strong>{result.targetMet ? '초과' : '부족'} {won(Math.abs(result.goalDifference))}</strong>
                  {result.finalDebtBalance > 0 && <span>부채 잔액 {won(result.finalDebtBalance)}</span>}
                  {result.netWorth != null && <span>순자산 {won(result.netWorth)}</span>}
                  {result.targetMet && <span>첫 달성일 {result.firstCrossingDate}</span>}
                </div>
              </section>

              <section className="panel chart-panel" data-tour="simulation-trajectory">
                <h2>과거 포트폴리오 궤적</h2>
                {settings.etfRatio > 0 && etfData?.source === 'yfinance' && (
                  <p className="source-banner live sim-chart-source-note">
                    Yahoo Finance 일별 종가 기반 — 각 월 마지막 거래일 종가로 매수·평가합니다.
                  </p>
                )}
                {settings.etfRatio > 0 && etfData?.source !== 'yfinance' && (
                  <p className="source-banner mock sim-chart-source-note" role="status">
                    실시간 시세(yfinance)를 쓰지 못해 변동이 단순할 수 있습니다.
                  </p>
                )}
                <TrajectoryChart
                  data={result.trajectory}
                  variant="portfolio"
                  targetAmount={Number(settings.targetAssetAmount) || 0}
                />
              </section>

              <div className="sim-detail-list" data-tour="simulation-details">
                <details className="sim-detail-card">
                  <summary>
                    <span>데이터 및 계산 기준</span>
                    <strong>{formatDataSource(etfData?.source || result.source)} · {result.startDate} ~ {result.endDate}</strong>
                  </summary>
                  <div className="sim-detail-body">
                    <p className={`source-banner ${etfData?.source === 'yfinance' ? 'live' : 'mock'}`}>
                      데이터 출처: {formatDataSource(etfData?.source || result.source)}
                      {etfData?.message ? ` · ${etfData.message}` : ''}
                    </p>
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

              <section className="panel sim-cross-cta">
                <p className="muted">미래 시나리오에서 목표 달성 시점을 비교해 볼 수 있어요.</p>
                <button type="button" className="btn btn-ghost" onClick={() => onSwitchMode?.('future')}>
                  미래 시나리오에서 목표 달성 시점 보기
                </button>
              </section>
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
    </>
  );
}
