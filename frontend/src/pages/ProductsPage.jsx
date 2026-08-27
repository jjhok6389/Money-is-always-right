import { useEffect, useState } from 'react';
import AppHeader from '../components/AppHeader';
import { fetchProducts } from '../services/productService';

const GROUP_OPTIONS_BY_TYPE = {
  deposit: [
    { value: '020000', label: '은행' },
    { value: '030300', label: '저축은행' },
  ],
  saving: [
    { value: '020000', label: '은행' },
    { value: '030300', label: '저축은행' },
  ],
  annuity: [
    { value: '050000', label: '보험' },
    { value: '060000', label: '금융투자' },
    { value: '020000', label: '은행' },
  ],
};

const DEFAULT_GROUP_BY_TYPE = {
  deposit: '020000',
  saving: '020000',
  annuity: '050000',
};

const PRODUCT_TYPE_LABEL = {
  deposit: '예금',
  saving: '적금',
  annuity: '연금저축',
};

export default function ProductsPage() {
  const [productType, setProductType] = useState('saving');
  const [topFinGrpNo, setTopFinGrpNo] = useState('020000');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const groupOptions = GROUP_OPTIONS_BY_TYPE[productType] || GROUP_OPTIONS_BY_TYPE.saving;

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

  const onSelectProductType = (nextType) => {
    setProductType(nextType);
    setTopFinGrpNo(DEFAULT_GROUP_BY_TYPE[nextType] || '020000');
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
          <p className="eyebrow">금융상품</p>
          <h1>예금 · 적금 · 연금저축</h1>
          <p className="lead">
            금융감독원 금융상품한눈에 API로 예금·적금·연금저축 공시 정보를 조회합니다.
            API 키가 없으면 모의 상품 목록이 표시됩니다.
          </p>
        </section>

        <div className="toolbar">
          <div className="filter-tabs">
            <button
              type="button"
              className={productType === 'saving' ? 'tab active' : 'tab'}
              onClick={() => onSelectProductType('saving')}
            >
              적금
            </button>
            <button
              type="button"
              className={productType === 'deposit' ? 'tab active' : 'tab'}
              onClick={() => onSelectProductType('deposit')}
            >
              예금
            </button>
            <button
              type="button"
              className={productType === 'annuity' ? 'tab active' : 'tab'}
              onClick={() => onSelectProductType('annuity')}
            >
              연금저축
            </button>
          </div>

          <label>
            금융권역
            <select value={topFinGrpNo} onChange={(event) => setTopFinGrpNo(event.target.value)}>
              {groupOptions.map((option) => (
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
                ? `금감원 실시간 공시 · ${PRODUCT_TYPE_LABEL[productType] || '상품'} ${data.count}개`
                : data.message || `모의 데이터 · ${data.count}개 상품`}
            </p>

            <div className="product-grid">
              {data.products.map((product) => (
                <article key={`${product.companyCode}-${product.productCode}`} className="product-card">
                  <p className="product-bank">{product.companyName}</p>
                  <h2>{product.productName}</h2>
                  <dl>
                    <div>
                      <dt>{productType === 'annuity' ? '공시수익률' : '최고금리'}</dt>
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
