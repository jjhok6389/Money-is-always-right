/**
 * Authenticated fetch helper for the Python FastAPI backend.
 * Attaches the Firebase ID token so the backend can verify the user.
 */
import { getIdToken } from './authService';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

export async function apiRequest(path, options = {}) {
  const token = await getIdToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = payload.detail || payload.message || '요청 처리 중 오류가 발생했습니다.';
    throw new Error(typeof message === 'string' ? message : JSON.stringify(message));
  }

  return payload;
}
