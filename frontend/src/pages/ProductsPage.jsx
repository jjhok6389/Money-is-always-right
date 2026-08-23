import { useEffect, useState } from 'react';
import AppHeader from '../components/AppHeader';
import { fetchProducts } from '../services/productService';

const GROUP_OPTIONS = [
  { value: '020000', label: '은행' },
  { value: '030300', label: '저축은행' },
];

export default function ProductsPage() {
  const [productType, setProductType] = useState('saving');
  const [topFinGrpNo, setTopFinGrpNo] = useState('020000');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchProducts({ productType, topFinGrpNo });
      setData(result);
    } catch (err) {
      setError(err.message || '금융상품을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productType, topFinGrpNo]);

  return (
    <div className="page-shell">
      <AppHeader />
      <main className="page-content page-content-xl">
        <section className="hero-panel">
          <p className="eyebrow">Phase 2 · 금감원 Open API</p>
          <h1>예금 · 적금 상품</h1>
          <p className="lead">
            금융감독원 금융상품한눈에 API로 예금·적금 공시 정보를 조회합니다.
            API 키가 없으면 모의 상품 목록이 표시됩니다.
          </p>
        </section>

        <div className="toolbar">
          <div className="filter-tabs">
            <button
              type="button"
              className={productType === 'saving' ? 'tab active' : 'tab'}
              onClick={() => setProductType('saving')}
            >
              적금
            </button>
            <button
              type="button"
              className={productType === 'deposit' ? 'tab active' : 'tab'}
              onClick={() => setProductType('deposit')}
            >
              예금
            </button>
          </div>

          <label>
            금융권역
            <select value={topFinGrpNo} onChange={(event) => setTopFinGrpNo(event.target.value)}>
              {GROUP_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="btn btn-ghost" onClick={load} disabled={loading}>
            새로고침
          </button>
        </div>

        {error && <p className="alert alert-error" role="alert">{error}</p>}
        {loading && <p className="muted">상품 정보를 불러오는 중...</p>}

        {data && !loading && (
          <>
            <p className={`source-banner ${data.source === 'fss' ? 'live' : 'mock'}`}>
              {data.source === 'fss'
                ? `금감원 실시간 공시 · ${data.count}개 상품`
                : data.message || `모의 데이터 · ${data.count}개 상품`}
            </p>

            <div className="product-grid">
              {data.products.map((product) => (
                <article key={`${product.companyCode}-${product.productCode}`} className="product-card">
                  <p className="product-bank">{product.companyName}</p>
                  <h2>{product.productName}</h2>
                  <dl>
                    <div>
                      <dt>최고금리</dt>
                      <dd>
                        {product.bestRate != null ? `${product.bestRate.toFixed(2)}%` : '-'}
                      </dd>
                    </div>
                    <div>
                      <dt>저축기간</dt>
                      <dd>
                        {product.bestTermMonths != null ? `${product.bestTermMonths}개월` : '-'}
                      </dd>
                    </div>
                    <div>
                      <dt>가입방법</dt>
                      <dd>{product.joinWay || '-'}</dd>
                    </div>
                    <div>
                      <dt>가입대상</dt>
                      <dd>{product.joinMember || '-'}</dd>
                    </div>
                  </dl>
                  {product.spclCnd && <p className="product-note">{product.spclCnd}</p>}
                </article>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
