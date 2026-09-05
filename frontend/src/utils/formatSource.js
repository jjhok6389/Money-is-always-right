const SOURCE_LABELS = {
  yfinance: 'Yahoo Finance 실시간',
  krx: 'KRX 저장 시계열',
  mock: '저장 시계열(모의)',
  stored: '저장 시계열',
};

export function formatDataSource(source) {
  if (!source) return '알 수 없음';
  return SOURCE_LABELS[source] || source;
}
