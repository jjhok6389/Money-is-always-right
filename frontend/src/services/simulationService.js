import { apiRequest } from './api';

export function runSimulation(payload) {
  return apiRequest('/api/simulation/run', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function runSimulationFromProfile(payload) {
  return apiRequest('/api/simulation/from-profile', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
