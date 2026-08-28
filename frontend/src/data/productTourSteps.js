/** Dashboard-only product tour. Separate from /tutorial financial chapters. */
export const PRODUCT_TOUR_STEPS = [
  {
    id: 'welcome',
    title: '맞춤 대시보드에 오신 걸 환영해요',
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

/** Simulation page tour — separate from dashboard PRODUCT_TOUR_STEPS */
export const SIMULATION_TOUR_STEPS = [
  {
    id: 'sim-modes',
    title: '미래 vs 과거 시뮬레이션',
    body: '미래 시나리오는 저축·금리 가정을 바꿔 목표 달성 시점을 비교하고, 과거 포트폴리오는 실제 시장 데이터로 예·적금·ETF를 되돌려 봅니다.',
    target: '.simulation-mode-tabs',
  },
];
