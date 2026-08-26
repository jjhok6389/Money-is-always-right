import { apiRequest } from './api';

export function fetchTransactionPipeline({ month, count = 45 } = {}) {
  const params = new URLSearchParams();
  if (month) params.set('month', month);
  params.set('count', String(count));
  return apiRequest(`/api/transactions/pipeline?${params.toString()}`);
}

export function regenerateTransactionPipeline(payload) {
  return apiRequest('/api/transactions/pipeline', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
