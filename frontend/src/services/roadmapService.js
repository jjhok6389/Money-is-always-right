import { apiRequest } from './api';

export function generatePersonalRoadmap(payload) {
  return apiRequest('/api/personal-roadmap/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchCurrentPersonalRoadmap(month) {
  const query = month ? `?month=${encodeURIComponent(month)}` : '';
  return apiRequest(`/api/personal-roadmap/current${query}`);
}
