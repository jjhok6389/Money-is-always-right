/**
 * Shows a Korean setup notice when Firebase env placeholders are still present.
 */
export function isFirebaseConfigured() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;
  if (!apiKey || !appId) return false;
  const invalid = (value) =>
    value.includes('your_') || value.includes('여기에') || value.includes('붙여넣기');
  return !invalid(apiKey) && !invalid(appId);
}
