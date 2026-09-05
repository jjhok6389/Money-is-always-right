const PROFILE_ORDER = [
  'stable',
  'stable_seeking',
  'neutral',
  'aggressive',
  'very_aggressive',
];

export const INVESTMENT_PROFILE_RESULTS = {
  stable: {
    label: '안정형',
    description: '원금 보전과 예측 가능한 흐름을 가장 중요하게 생각하는 성향입니다.',
  },
  stable_seeking: {
    label: '안정추구형',
    description: '손실 위험을 낮게 유지하면서 예·적금보다 조금 높은 수익 기회를 살펴보는 성향입니다.',
  },
  neutral: {
    label: '위험중립형',
    description: '안정성과 자산 성장 가능성을 함께 고려하며 제한적인 가격 변동을 감수하는 성향입니다.',
  },
  aggressive: {
    label: '적극투자형',
    description: '중장기 자산 성장을 위해 일정 수준의 원금 손실과 가격 변동을 감수하는 성향입니다.',
  },
  very_aggressive: {
    label: '공격투자형',
    description: '높은 장기 수익을 추구하며 큰 가격 변동과 원금 손실 가능성까지 감수하는 성향입니다.',
  },
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalize(score, maximum) {
  return maximum > 0 ? (score / maximum) * 100 : 0;
}

function scoreToLevel(score) {
  return clamp(Math.round(score / 25) + 1, 1, 5);
}

function targetYearsCapacity(targetYears) {
  const years = Number(targetYears);
  if (!Number.isFinite(years) || years <= 0) return null;
  if (years < 1) return 0;
  if (years < 3) return 1;
  if (years < 5) return 2;
  if (years < 10) return 3;
  return 4;
}

function ageCapacity(age) {
  const numericAge = Number(age);
  if (!Number.isFinite(numericAge) || numericAge <= 0) return null;
  if (numericAge >= 65) return 0;
  if (numericAge >= 50) return 1;
  return 2;
}

function typeIndexFromScore(score) {
  if (score < 20) return 0;
  if (score < 40) return 1;
  if (score < 60) return 2;
  if (score < 80) return 3;
  return 4;
}

function capacityLimitIndex(capacityScore) {
  if (capacityScore < 30) return 1;
  if (capacityScore < 45) return 2;
  if (capacityScore < 60) return 3;
  return 4;
}

function selectedOption(question, answers) {
  return question.options.find((option) => option.id === answers[question.id]);
}

function contextReason(userFinancialData) {
  const years = Number(userFinancialData?.targetYears);
  if (!Number.isFinite(years) || years <= 0) return null;
  if (years < 3) return '설정한 목표 기간이 짧아 손실을 회복할 시간이 제한적인 점을 반영했어요.';
  if (years >= 5) return '설정한 목표 기간이 중장기라 단기 가격 변동을 견딜 시간을 반영했어요.';
  return '설정한 목표 기간을 위험 감수능력 판단에 함께 반영했어요.';
}

function buildReasons(questions, answers, userFinancialData, wasCapacityLimited) {
  const priorityIds = [
    'loss_tolerance',
    'market_drop',
    'experience',
    'financial_buffer',
    'purpose',
    'return_preference',
    'investable_share',
    'investment_horizon',
  ];
  const reasons = [];
  const profileReason = contextReason(userFinancialData);
  if (profileReason) reasons.push(profileReason);
  if (wasCapacityLimited) {
    reasons.unshift('원하는 수익 수준보다 실제 손실 감수능력을 우선해 결과를 보수적으로 조정했어요.');
  }
  for (const id of priorityIds) {
    const question = questions.find((item) => item.id === id);
    const option = question ? selectedOption(question, answers) : null;
    if (option?.reason && !reasons.includes(option.reason)) reasons.push(option.reason);
    if (reasons.length >= 3) break;
  }
  return reasons.slice(0, 3);
}

function metricScore(questions, answers, questionId, scoreKey) {
  const question = questions.find((item) => item.id === questionId);
  const option = question ? selectedOption(question, answers) : null;
  const score = option?.[scoreKey];
  return Number.isFinite(score) ? score : 0;
}

export function assessInvestmentProfile({ questions, answers, userFinancialData = {} }) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error('투자성향 진단 문항이 필요합니다.');
  }

  let preferenceTotal = 0;
  let preferenceMaximum = 0;
  let capacityTotal = 0;
  let capacityMaximum = 0;

  questions.forEach((question) => {
    const option = selectedOption(question, answers);
    if (!option) throw new Error('모든 투자성향 문항에 응답해 주세요.');
    if (Number.isFinite(option.preferenceScore)) {
      preferenceTotal += option.preferenceScore;
      preferenceMaximum += 4;
    }
    if (Number.isFinite(option.capacityScore)) {
      capacityTotal += option.capacityScore;
      capacityMaximum += 4;
    }
  });

  const yearsScore = targetYearsCapacity(userFinancialData.targetYears);
  if (yearsScore !== null && !questions.some((question) => question.id === 'investment_horizon')) {
    capacityTotal += yearsScore;
    capacityMaximum += 4;
  }
  const ageScore = ageCapacity(userFinancialData.age);
  if (ageScore !== null) {
    capacityTotal += ageScore;
    capacityMaximum += 2;
  }

  const preferenceScore = normalize(preferenceTotal, preferenceMaximum);
  const capacityScore = normalize(capacityTotal, capacityMaximum);
  const combinedScore = preferenceScore * 0.55 + capacityScore * 0.45;
  const rawIndex = typeIndexFromScore(combinedScore);
  const limitIndex = capacityLimitIndex(capacityScore);
  const resultIndex = Math.min(rawIndex, limitIndex);
  const key = PROFILE_ORDER[resultIndex];

  const returnPreference = metricScore(
    questions,
    answers,
    'return_preference',
    'preferenceScore',
  );
  const lossTolerancePreference = metricScore(
    questions,
    answers,
    'loss_tolerance',
    'preferenceScore',
  );
  const lossToleranceCapacity = metricScore(
    questions,
    answers,
    'loss_tolerance',
    'capacityScore',
  );
  const experience = metricScore(questions, answers, 'experience', 'capacityScore');

  return {
    key,
    ...INVESTMENT_PROFILE_RESULTS[key],
    preferenceScore: Math.round(preferenceScore),
    capacityScore: Math.round(capacityScore),
    reasons: buildReasons(
      questions,
      answers,
      userFinancialData,
      resultIndex < rawIndex,
    ),
    metrics: [
      { key: 'stability', label: '안정성 선호', level: 6 - scoreToLevel(preferenceScore) },
      { key: 'return', label: '수익 추구', level: returnPreference + 1 },
      {
        key: 'loss',
        label: '손실 감내',
        level: Math.round((lossTolerancePreference + lossToleranceCapacity) / 2) + 1,
      },
      { key: 'experience', label: '투자 경험', level: experience + 1 },
    ],
  };
}

