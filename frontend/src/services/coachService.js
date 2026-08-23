import { apiRequest } from './api';

export function sendCoachMessage(payload) {
  return apiRequest('/api/coach/chat', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function fetchCoachSuggestions() {
  return apiRequest('/api/coach/suggestions');
}
