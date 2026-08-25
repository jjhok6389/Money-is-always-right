import { apiRequest } from './api';

export function generateReport(payload = {}) {
  return apiRequest('/api/reports/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function listReports() {
  return apiRequest('/api/reports');
}

export function getReport(reportId) {
  return apiRequest(`/api/reports/${reportId}`);
}

export function getReportSchedule() {
  return apiRequest('/api/reports/schedule/me');
}

export function updateReportSchedule(monthlyReportDay) {
  return apiRequest('/api/reports/schedule', {
    method: 'PUT',
    body: JSON.stringify({ monthlyReportDay }),
  });
}
