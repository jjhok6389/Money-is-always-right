/** Dashboard-only product tour. Separate from /tutorial financial chapters. */
export const PRODUCT_TOUR_STEPS = [
  {
    id: 'welcome',
    title: '내 금융생활에 오신 걸 환영해요',
    body: '목표·소비·추천을 한곳에서 볼 수 있어요. 핵심만 짧게 안내할게요.',
    target: null,
  },
  {
    id: 'nav',
    title: '상단 메뉴',
    body: '시뮬레이션, 소비 분석, 금융상품으로 이동할 수 있어요. 지금은 홈(대시보드)만 둘러보면 됩니다.',
    target: '[data-tour="nav"]',
  },
  {
    id: 'goal-stats',
    title: '목표 한눈에 보기',
    body: '달성률, 남은 금액, 월 저축 여력, 예상 달성일을 보여줍니다. 온보딩에서 정한 목표가 여기에 반영돼요.',
    target: '[data-tour="goal-stats"]',
  },
  {
    id: 'track-banner',
    title: '달성 궤도',
    body: '지금 저축 속도면 목표 기간 안에 되는지 바로 알려줍니다.',
    target: '[data-tour="track-banner"]',
  },
  {
    id: 'portfolio',
    title: '자산 포트폴리오',
    body: '투자 성향을 기준으로 자산이 어떻게 나뉘는지 보는 차트예요.',
    target: '[data-tour="portfolio"]',
  },
  {
    id: 'consumption',
    title: '월간 소비 분석',
    body: '어디에 쓰는지 파악하는 출발점이에요. 막대에 마우스를 올리면 금액과 전체 대비 비율을 볼 수 있어요.',
    target: '[data-tour="consumption"]',
  },
  {
    id: 'roadmap',
    title: '금융 로드맵',
    body: '앞으로 3개월 실행 계획입니다. 파란 테두리의 「현재 실행」카드부터 보면 돼요.',
    target: '[data-tour="roadmap-current"], [data-tour="roadmap"]',
  },
  {
    id: 'products',
    title: '추천 금융상품 · ETF',
    body: '성향과 목표에 맞춘 참고 후보예요. 투자 권유가 아니며, 아래에서 ETF도 함께 볼 수 있어요.',
    target: '[data-tour="products"]',
  },
  {
    id: 'coach',
    title: 'AI 금융 코치',
    body: '막히면 오른쪽 아래 버튼으로 물어보세요. 목표·소비·상품 관련 질문을 받을 수 있어요.',
    target: '[data-tour="coach-fab"]',
  },
];

/** First-time coaching for the historical portfolio settings modal. */
export const SIMULATION_TOUR_STEPS = [
  {
    id: 'portfolio-period',
    title: '기간 설정',
    body: '언제부터 투자했는지가 되짚어 볼 과거 시장 구간을 정합니다.',
    target: '[data-tour="portfolio-period"]',
  },
  {
    id: 'portfolio-goal',
    title: '목표 설정',
    body: '시작 자산과 목표 금액이 성과와 목표 도달 여부를 판단하는 기준이 됩니다.',
    target: '[data-tour="portfolio-goal"]',
  },
  {
    id: 'portfolio-investment',
    title: '투자 방식',
    body: '월 투자액과 선택한 상품·배분 비율에 따라 같은 기간의 결과가 달라집니다.',
    target: '[data-tour="portfolio-investment"]',
  },
];

export const SIMULATION_RESULT_TOUR_STEPS = [
  {
    id: 'portfolio-settings',
    title: '투자 설정',
    body: '왼쪽 설정 영역과 설정 변경 버튼에서 시작일·자산·월 투자액·배분·선택 상품을 확인하고 다시 조정할 수 있어요.',
    target: '[data-tour="simulation-settings"]',
  },
  {
    id: 'goal-result',
    title: '목표 달성 결과',
    body: '모의 총자산, 목표 대비 초과·부족, 부채·순자산과 첫 달성일을 확인하세요. 과거 데이터 결과이며 미래 보장이 아닙니다.',
    target: '[data-tour="simulation-goal-result"]',
  },
  {
    id: 'trajectory',
    title: '과거 포트폴리오 궤적',
    body: '월별 자산 변화와 목표선, 상품별 흐름을 비교해 보세요. 과거 흐름을 보여 주는 결과입니다.',
    target: '[data-tour="simulation-trajectory"]',
  },
  {
    id: 'details',
    title: '상세 정보',
    body: '데이터·계산 기준, 예·적금 자산, ETF 투자 자산을 펼쳐 잔액·이자·수익·매수 대기금을 확인할 수 있어요.',
    target: '[data-tour="simulation-details"]',
  },
];
