import { apiRequest } from './api';

export function fetchEtfRecommendations(propensity = 'neutral') {
  const params = new URLSearchParams({ propensity });
  return apiRequest(`/api/etf/recommendations?${params.toString()}`);
}

export function fetchEtfDetail(symbol, propensity = 'neutral', dates = {}) {
  const params = new URLSearchParams({ propensity });
  if (dates.startDate) params.set('startDate', dates.startDate);
  if (dates.endDate) params.set('endDate', dates.endDate);
  return apiRequest(`/api/etf/${encodeURIComponent(symbol)}?${params.toString()}`, {
    cache: 'no-store',
  });
}
