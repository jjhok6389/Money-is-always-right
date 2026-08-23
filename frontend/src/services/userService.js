/**
 * User profile CRUD against Firestore (client) and FastAPI (server sync).
 * Onboarding data is written to both for resilience and future Bedrock context.
 */
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { apiRequest } from './api';

const USERS_COLLECTION = 'users';

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

export async function saveUserProfile(uid, profile) {
  const payload = {
    ...profile,
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, USERS_COLLECTION, uid), payload, { merge: true });

  // Sync to Python backend so later phases can query a single REST surface.
  try {
    await apiRequest('/api/users/me', {
      method: 'PUT',
      body: JSON.stringify(profile),
    });
  } catch (error) {
    // Firestore remains source of truth for Phase 1 if backend is offline.
    console.warn('Backend profile sync skipped:', error.message);
  }

  return getUserProfile(uid);
}

export async function fetchProfileFromBackend() {
  return apiRequest('/api/users/me');
}
