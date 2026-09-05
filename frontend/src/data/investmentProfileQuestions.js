export const INVESTMENT_PROFILE_DISCLAIMER =
  '본 진단은 금융투자협회 표준투자권유준칙의 투자자정보 확인 항목을 참고해 구성한 간이 진단이며, 금융회사의 공식 투자자정보확인 절차를 대체하지 않습니다.';

const BASE_QUESTIONS = [
  {
    id: 'purpose',
    dimension: 'preference',
    title: '투자로 가장 이루고 싶은 목표는 무엇인가요?',
    description: '가장 가까운 목적 하나를 선택해 주세요.',
    options: [
      { id: 'preserve', label: '원금을 지키면서 예금보다 조금 높은 수익을 얻고 싶어요.', preferenceScore: 0, reason: '원금 보전을 가장 우선하는 목적을 선택했어요.' },
      { id: 'income', label: '큰 변동 없이 이자나 배당 같은 꾸준한 수익을 원해요.', preferenceScore: 1, reason: '큰 가격 변동보다 꾸준한 수익을 선호했어요.' },
      { id: 'balanced', label: '안정성과 자산 성장 가능성을 비슷하게 고려하고 싶어요.', preferenceScore: 2, reason: '안정성과 성장 가능성의 균형을 선택했어요.' },
      { id: 'growth', label: '일정한 손실 위험을 감수하고 자산을 적극적으로 늘리고 싶어요.', preferenceScore: 3, reason: '손실 가능성을 감수한 자산 성장을 선호했어요.' },
      { id: 'high_growth', label: '큰 가격 변동을 감수하더라도 높은 장기 수익을 추구하고 싶어요.', preferenceScore: 4, reason: '높은 변동성을 감수하는 장기 성장을 선호했어요.' },
    ],
  },
  {
    id: 'experience',
    dimension: 'capacity',
    title: '지금까지 직접 경험한 금융투자는 어느 정도인가요?',
    description: '예·적금만 이용한 경우에는 첫 번째 항목을 선택해 주세요.',
    options: [
      { id: 'none', label: '예·적금 외 금융투자는 아직 경험이 없어요.', capacityScore: 0, reason: '투자 경험이 많지 않아 위험 감수능력을 보수적으로 반영했어요.' },
      { id: 'fund', label: '펀드나 ETF를 소액으로 짧게 경험해 봤어요.', capacityScore: 1, reason: '간접투자를 소액으로 경험한 단계예요.' },
      { id: 'regular', label: 'ETF나 주식을 1년 이상 꾸준히 운용해 봤어요.', capacityScore: 2, reason: '가격 변동이 있는 상품을 꾸준히 운용한 경험이 있어요.' },
      { id: 'varied', label: '주식·채권·ETF 등 여러 상품을 직접 운용해 봤어요.', capacityScore: 3, reason: '여러 금융상품의 가격 변동을 직접 경험했어요.' },
      { id: 'advanced', label: '높은 변동성 상품의 구조와 손실 가능성을 이해하고 운용해 봤어요.', capacityScore: 4, reason: '높은 변동성 상품을 이해하고 운용한 경험이 있어요.' },
    ],
  },
  {
    id: 'investable_share',
    dimension: 'capacity',
    title: '가까운 시일 안에 쓸 돈을 제외하면, 금융자산 중 어느 정도를 투자할 수 있나요?',
    description: '생활비와 비상자금처럼 꼭 필요한 돈은 제외해서 생각해 주세요.',
    options: [
      { id: 'under_10', label: '10% 미만', capacityScore: 0, reason: '당장 사용할 자금을 제외하면 투자 가능한 여유가 크지 않아요.' },
      { id: 'under_25', label: '10% 이상 25% 미만', capacityScore: 1, reason: '투자에 사용할 수 있는 자금 비중이 비교적 낮아요.' },
      { id: 'under_50', label: '25% 이상 50% 미만', capacityScore: 2, reason: '생활자금과 투자자금을 어느 정도 분리할 수 있어요.' },
      { id: 'under_75', label: '50% 이상 75% 미만', capacityScore: 3, reason: '중장기 투자에 활용할 수 있는 자금 여력이 있어요.' },
      { id: 'over_75', label: '75% 이상', capacityScore: 4, reason: '금융자산 중 장기 투자에 활용할 수 있는 비중이 높아요.' },
    ],
  },
  {
    id: 'financial_buffer',
    dimension: 'capacity',
    title: '예상하지 못한 지출이 생겨도 투자금을 유지할 수 있는 상태인가요?',
    description: '소득 중단이나 갑작스러운 큰 지출 상황을 떠올려 주세요.',
    options: [
      { id: 'withdraw_now', label: '투자금을 바로 꺼내 써야 할 가능성이 높아요.', capacityScore: 0, reason: '예상치 못한 지출이 생기면 투자금을 유지하기 어려울 수 있어요.' },
      { id: 'under_3m', label: '약 3개월 정도는 별도 자금으로 버틸 수 있어요.', capacityScore: 1, reason: '단기간의 지출 충격에 대응할 여유가 제한적이에요.' },
      { id: 'under_6m', label: '약 6개월 정도는 별도 자금으로 버틸 수 있어요.', capacityScore: 2, reason: '일정 기간 투자금을 유지할 수 있는 생활 여유자금이 있어요.' },
      { id: 'under_12m', label: '약 1년 정도는 투자금과 생활비를 분리할 수 있어요.', capacityScore: 3, reason: '장기간 투자금을 유지할 수 있는 완충자금이 있어요.' },
      { id: 'over_12m', label: '1년 이상 투자금을 쓰지 않아도 생활에 지장이 없어요.', capacityScore: 4, reason: '생활자금과 투자자금을 장기간 분리할 수 있어요.' },
    ],
  },
  {
    id: 'loss_tolerance',
    dimension: 'both',
    title: '투자 원금에 손실이 생길 수 있다면 어느 정도까지 감내할 수 있나요?',
    description: '기대수익이 아니라 실제 손실이 발생한 상황을 기준으로 선택해 주세요.',
    options: [
      { id: 'none', label: '원금 손실은 거의 받아들이기 어려워요.', preferenceScore: 0, capacityScore: 0, reason: '원금 손실을 받아들이기 어렵다고 답했어요.' },
      { id: 'under_5', label: '약 5% 미만의 일시적 손실', preferenceScore: 1, capacityScore: 1, reason: '작은 범위의 일시적 손실만 감내할 수 있어요.' },
      { id: 'under_10', label: '약 10% 미만의 손실', preferenceScore: 2, capacityScore: 2, reason: '제한적인 가격 하락은 감내할 수 있어요.' },
      { id: 'under_20', label: '약 20% 미만의 손실', preferenceScore: 3, capacityScore: 3, reason: '자산 성장을 위해 상당한 가격 변동을 감내할 수 있어요.' },
      { id: 'over_20', label: '20% 이상의 손실 가능성도 이해하고 감수할 수 있어요.', preferenceScore: 4, capacityScore: 4, reason: '큰 가격 변동과 원금 손실 가능성을 감수할 수 있다고 답했어요.' },
    ],
  },
  {
    id: 'return_preference',
    dimension: 'preference',
    title: '다음 중 더 마음이 가는 투자 방식은 무엇인가요?',
    description: '수익 가능성이 높을수록 손실 가능성도 커질 수 있어요.',
    options: [
      { id: 'very_low', label: '수익이 낮아도 손실 가능성이 매우 낮은 방식', preferenceScore: 0, reason: '수익보다 손실 가능성을 낮추는 방식을 우선했어요.' },
      { id: 'low', label: '낮은 변동 안에서 예금보다 조금 높은 수익을 기대하는 방식', preferenceScore: 1, reason: '낮은 변동 안에서 안정적인 수익을 선호했어요.' },
      { id: 'balanced', label: '손실과 수익 가능성이 중간 수준인 균형 방식', preferenceScore: 2, reason: '위험과 기대수익이 균형을 이루는 방식을 선호했어요.' },
      { id: 'high', label: '가격 변동을 감수하고 높은 장기 수익을 기대하는 방식', preferenceScore: 3, reason: '가격 변동을 감수한 장기 수익을 선호했어요.' },
      { id: 'very_high', label: '큰 손실 가능성을 감수하고 매우 높은 수익을 기대하는 방식', preferenceScore: 4, reason: '큰 손실 가능성보다 높은 기대수익을 우선했어요.' },
    ],
  },
  {
    id: 'market_drop',
    dimension: 'preference',
    title: '투자한 1,000만 원이 시장 하락으로 900만 원이 되었다면 어떻게 하시겠어요?',
    description: '실제로 100만 원의 평가손실이 생긴 상황을 생각해 주세요.',
    options: [
      { id: 'sell_most', label: '손실이 더 커지기 전에 대부분 매도해요.', preferenceScore: 0, reason: '시장 하락 시 손실 확대를 피하기 위해 대부분 매도하는 선택을 했어요.' },
      { id: 'sell_some', label: '일부를 매도하고 상황을 지켜봐요.', preferenceScore: 1, reason: '시장 하락 시 투자 규모를 줄이는 대응을 선호했어요.' },
      { id: 'hold', label: '현재 비중을 그대로 유지해요.', preferenceScore: 2, reason: '시장 하락에도 기존 투자 비중을 유지할 수 있어요.' },
      { id: 'wait_long', label: '장기적으로 회복할 것으로 보고 기다려요.', preferenceScore: 3, reason: '단기 하락보다 장기 회복 가능성을 중요하게 봤어요.' },
      { id: 'buy_more', label: '가격이 낮아졌다고 판단해 추가 투자해요.', preferenceScore: 4, reason: '시장 하락을 추가 투자 기회로 판단했어요.' },
    ],
  },
];

const HORIZON_QUESTION = {
  id: 'investment_horizon',
  dimension: 'capacity',
  title: '이 투자금을 사용하지 않고 유지할 수 있는 기간은 어느 정도인가요?',
  description: '생활비나 예정된 큰 지출에 사용할 시점까지 고려해 주세요.',
  options: [
    { id: 'under_1y', label: '1년 미만', capacityScore: 0, reason: '투자 가능 기간이 짧아 손실을 회복할 시간이 제한적이에요.' },
    { id: 'under_3y', label: '1년 이상 3년 미만', capacityScore: 1, reason: '투자 가능 기간이 비교적 짧아요.' },
    { id: 'under_5y', label: '3년 이상 5년 미만', capacityScore: 2, reason: '중기적인 투자 기간을 고려하고 있어요.' },
    { id: 'under_10y', label: '5년 이상 10년 미만', capacityScore: 3, reason: '단기 변동을 견딜 수 있는 중장기 투자 기간을 고려하고 있어요.' },
    { id: 'over_10y', label: '10년 이상', capacityScore: 4, reason: '장기간 투자금을 유지할 수 있다고 답했어요.' },
  ],
};

function validTargetYears(value) {
  const years = Number(value);
  return Number.isFinite(years) && years > 0;
}

export function getInvestmentProfileQuestions(userFinancialData = {}) {
  if (validTargetYears(userFinancialData.targetYears)) return BASE_QUESTIONS;
  return [...BASE_QUESTIONS, HORIZON_QUESTION];
}

