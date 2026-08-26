import { useCallback, useEffect, useState } from 'react';
import {
  claimFinalTutorialReward,
  claimMidpointTutorialReward,
  completeTutorialChapter,
  fetchTutorialProgress,
} from '../services/tutorialService';

export default function useTutorialProgress() {
  const [progress, setProgress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchTutorialProgress();
      setProgress(data);
      return data;
    } catch (err) {
      setError(err.message || '튜토리얼 진행 상태를 불러오지 못했습니다.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetchTutorialProgress()
      .then((data) => {
        if (!cancelled) setProgress(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || '튜토리얼 진행 상태를 불러오지 못했습니다.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const runMutation = async (operation) => {
    setSaving(true);
    setError('');
    try {
      const data = await operation();
      setProgress(data);
      return data;
    } catch (err) {
      setError(err.message || '튜토리얼 상태를 저장하지 못했습니다.');
      throw err;
    } finally {
      setSaving(false);
    }
  };

  return {
    progress,
    loading,
    saving,
    error,
    refresh,
    completeChapter: (chapterId) => runMutation(() => completeTutorialChapter(chapterId)),
    claimMidpoint: (rewardId) => runMutation(() => claimMidpointTutorialReward(rewardId)),
    claimFinal: () => runMutation(claimFinalTutorialReward),
  };
}
