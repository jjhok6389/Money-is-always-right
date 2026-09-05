import { apiRequest } from './api';

export function fetchTutorialProgress() {
  return apiRequest('/api/tutorial/progress');
}

export function completeTutorialChapter(chapterId) {
  return apiRequest(`/api/tutorial/chapters/${encodeURIComponent(chapterId)}/complete`, {
    method: 'POST',
  });
}

export function claimMidpointTutorialReward(rewardId) {
  return apiRequest('/api/tutorial/rewards/midpoint/claim', {
    method: 'POST',
    body: JSON.stringify({ rewardId }),
  });
}

export function claimFinalTutorialReward() {
  return apiRequest('/api/tutorial/rewards/final/claim', {
    method: 'POST',
  });
}
