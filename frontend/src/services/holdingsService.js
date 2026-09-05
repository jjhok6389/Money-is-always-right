import { apiRequest } from './api';

export function fetchHoldingsPipeline(asOf) {
  const params = new URLSearchParams();
  if (asOf) params.set('asOf', asOf);
  const query = params.toString();
  return apiRequest(`/api/holdings/pipeline${query ? `?${query}` : ''}`);
}
