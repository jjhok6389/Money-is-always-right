import { useEffect, useState } from 'react';
import { fetchHoldingsPipeline } from '../services/holdingsService';

export default function useHoldingsSnapshot() {
  const [holdings, setHoldings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await fetchHoldingsPipeline();
        if (!cancelled) setHoldings(data);
      } catch (err) {
        if (!cancelled) setError(err.message || '보유 자산을 불러오지 못했습니다.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { holdings, loading, error };
}
