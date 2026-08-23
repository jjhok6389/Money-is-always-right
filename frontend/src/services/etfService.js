import { apiRequest } from './api';

export function fetchEtfRecommendations(propensity = 'neutral') {
  const params = new URLSearchParams({ propensity });
  return apiRequest(`/api/etf/recommendations?${params.toString()}`);
}

export function fetchEtfDetail(symbol, propensity = 'neutral') {
  const params = new URLSearchParams({ propensity });
  return apiRequest(`/api/etf/${encodeURIComponent(symbol)}?${params.toString()}`);
}
