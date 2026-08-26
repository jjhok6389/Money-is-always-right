import { useCallback, useEffect, useState } from 'react';
import { fetchTransactionPipeline } from '../services/transactionService';

export default function useFinancialSummary() {
  const [financialSummary, setFinancialSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchTransactionPipeline({ count: 45 });
      setFinancialSummary(data.financialSummary);
      return data.financialSummary;
    } catch (err) {
      setError(err.message || 'Demo 금융 요약을 불러오지 못했습니다.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchTransactionPipeline({ count: 45 })
      .then((data) => {
        if (!cancelled) setFinancialSummary(data.financialSummary);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Demo 금융 요약을 불러오지 못했습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { financialSummary, loading, error, refresh };
}
