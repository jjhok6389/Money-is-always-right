import { apiRequest } from './api';

export function computeDashboard(payload) {
  return apiRequest('/api/dashboard/compute', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchDashboard() {
  return apiRequest('/api/dashboard');
}
