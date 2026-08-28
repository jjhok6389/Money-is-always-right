import { useEffect, useMemo, useState } from 'react';
import AppHeader from '../components/AppHeader';
import { DEFAULT_GROUP_BY_TYPE, DEFAULT_TOP_FIN_GRP_NO } from '../constants/fss';
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

const PRODUCT_TYPE_LABEL = {
  deposit: '예금',
  saving: '적금',
  annuity: '연금저축',
};

const MAX_COMPARE = 3;

function productId(product) {
  return `${product.companyCode || product.companyName}-${product.productCode || product.productName}`;
}

function matchesSearch(product, query) {
  if (!query.trim()) return true;
  const needle = query.trim().toLowerCase();
  return (
    String(product.productName || '').toLowerCase().includes(needle)
    || String(product.companyName || '').toLowerCase().includes(needle)
    || String(product.spclCnd || '').toLowerCase().includes(needle)
  );
}

function sortProducts(products, sortBy) {
  const list = [...products];
  if (sortBy === 'term') {
    return list.sort((a, b) => (Number(b.bestTermMonths) || 0) - (Number(a.bestTermMonths) || 0));
  }
  if (sortBy === 'name') {
    return list.sort((a, b) => String(a.productName).localeCompare(String(b.productName), 'ko'));
  }
  return list.sort((a, b) => (Number(b.bestRate) || 0) - (Number(a.bestRate) || 0));
}

function ProductsCompareTable({ products, rateLabel = '최고금리' }) {
  if (!products.length) return null;

  return (
    <div className="products-compare-scroll">
      <table
        className="products-compare-table"
        style={{ '--compare-product-cols': products.length }}
      >
        <colgroup>
          <col className="products-compare-label-col" />
          {products.map((product) => (
            <col key={productId(product)} className="products-compare-data-col" />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">항목</th>
            {products.map((product) => (
              <th key={productId(product)} scope="col" className="products-compare-product-col">
                <span className="compare-col-bank">{product.companyName}</span>
                <strong className="compare-col-name">{product.productName}</strong>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{rateLabel}</th>
            {products.map((product) => (
              <td key={`${productId(product)}-rate`}>
                {product.bestRate != null ? `${product.bestRate.toFixed(2)}%` : '-'}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">기간</th>
            {products.map((product) => (
              <td key={`${productId(product)}-term`}>
                {product.bestTermMonths != null ? `${product.bestTermMonths}개월` : '-'}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">가입방법</th>
            {products.map((product) => (
              <td key={`${productId(product)}-join`}>{product.joinWay || '-'}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">가입대상</th>
            {products.map((product) => (
              <td key={`${productId(product)}-member`} className="products-compare-text-cell">
                {product.joinMember || '-'}
              </td>
            ))}
          </tr>
          <tr>
            <th scope="row">우대조건</th>
            {products.map((product) => (
              <td key={`${productId(product)}-cnd`} className="products-compare-text-cell products-compare-text-cell--muted">
                {product.spclCnd || '-'}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function ProductsPage() {
  const [productType, setProductType] = useState('saving');
  const [topFinGrpNo, setTopFinGrpNo] = useState(DEFAULT_TOP_FIN_GRP_NO);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('rate');
  const [compareIds, setCompareIds] = useState([]);
  const [compareModalOpen, setCompareModalOpen] = useState(false);

  const groupOptions = GROUP_OPTIONS_BY_TYPE[productType] || GROUP_OPTIONS_BY_TYPE.saving;
  const rateLabel = productType === 'annuity' ? '공시수익률' : '최고금리';

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await fetchProducts({ productType, topFinGrpNo });
      setData(result);
      setCompareIds([]);
      setCompareModalOpen(false);
    } catch (err) {
      setError(err.message || '금융상품을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const onSelectProductType = (nextType) => {
    setProductType(nextType);
    setTopFinGrpNo(DEFAULT_GROUP_BY_TYPE[nextType] || DEFAULT_TOP_FIN_GRP_NO);
    setSearchQuery('');
    setCompareIds([]);
    setCompareModalOpen(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productType, topFinGrpNo]);

  useEffect(() => {
    if (!compareModalOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setCompareModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [compareModalOpen]);

  useEffect(() => {
    if (!compareIds.length) setCompareModalOpen(false);
  }, [compareIds.length]);

  const filteredProducts = useMemo(() => {
    const products = data?.products || [];
    return sortProducts(products.filter((item) => matchesSearch(item, searchQuery)), sortBy);
  }, [data?.products, searchQuery, sortBy]);

  const compareProducts = useMemo(
    () => (data?.products || []).filter((item) => compareIds.includes(productId(item))),
    [data?.products, compareIds],
  );

  const toggleCompare = (id) => {
    setCompareIds((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= MAX_COMPARE) return current;
      return [...current, id];
    });
  };

  const clearCompare = () => {
    setCompareIds([]);
    setCompareModalOpen(false);
  };

  return (
    <div className="page-shell">
      <AppHeader />
      <main className={`page-content page-content-xl products-page${compareIds.length ? ' has-compare-bar' : ''}`}>
        <section className="hero-panel">
          <p className="eyebrow">금융상품</p>
          <h1>예금 · 적금 · 연금저축</h1>
          <p className="lead">
            금융감독원 공시 정보를 검색·정렬하고, 최대 {MAX_COMPARE}개까지 나란히 비교할 수 있습니다.
          </p>
        </section>

        <div className="products-toolbar sticky-toolbar">
          <div className="filter-tabs" role="tablist" aria-label="상품 유형">
            {['saving', 'deposit', 'annuity'].map((type) => (
              <button
                key={type}
                type="button"
                role="tab"
                aria-selected={productType === type}
                className={productType === type ? 'tab active' : 'tab'}
                onClick={() => onSelectProductType(type)}
              >
                {PRODUCT_TYPE_LABEL[type]}
              </button>
            ))}
          </div>

          <div className="products-toolbar-row">
            <label className="products-search">
              검색
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="상품명·은행·우대조건"
              />
            </label>
            <label>
              정렬
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
                <option value="rate">최고금리순</option>
                <option value="term">기간순</option>
                <option value="name">이름순</option>
              </select>
            </label>
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
        </div>

        {error && <p className="alert alert-error" role="alert">{error}</p>}
        {loading && <p className="muted">상품 정보를 불러오는 중...</p>}

        {data && !loading && (
          <>
            <p className={`source-banner ${data.source === 'fss' ? 'live' : 'mock'}`}>
              {data.source === 'fss'
                ? `금감원 실시간 공시 · ${PRODUCT_TYPE_LABEL[productType] || '상품'} ${filteredProducts.length}개 표시`
                : data.message || `모의 데이터 · ${filteredProducts.length}개 표시`}
            </p>

            {!filteredProducts.length && (
              <p className="muted products-empty">검색 조건에 맞는 상품이 없습니다.</p>
            )}

            <div className="product-grid">
              {filteredProducts.map((product) => {
                const id = productId(product);
                const checked = compareIds.includes(id);
                const compareFull = !checked && compareIds.length >= MAX_COMPARE;
                return (
                  <article key={id} className={`product-card${checked ? ' is-compare-selected' : ''}`}>
                    <div className="product-card-top">
                      <p className="product-bank">{product.companyName}</p>
                      <label className="product-compare-check">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={compareFull}
                          onChange={() => toggleCompare(id)}
                        />
                        비교
                      </label>
                    </div>
                    <h2>{product.productName}</h2>
                    <dl className="product-card-metrics">
                      <div>
                        <dt>{rateLabel}</dt>
                        <dd className="product-rate">
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
                    {product.spclCnd ? (
                      <details className="product-note-details">
                        <summary>우대조건 보기</summary>
                        <p className="product-note">{product.spclCnd}</p>
                      </details>
                    ) : (
                      <div className="product-note-details product-note-details--empty" aria-hidden="true">
                        우대조건 보기
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}
      </main>

      {compareIds.length > 0 && (
        <div className="products-compare-bar" role="region" aria-label="선택한 상품 비교">
          <p className="products-compare-bar-summary">
            <strong>{compareIds.length}/{MAX_COMPARE}</strong>개 선택됨
            {compareIds.length < 2 && (
              <span className="muted"> · 2개 이상 선택하면 비교가 더 편해요</span>
            )}
          </p>
          <div className="products-compare-bar-actions">
            <button type="button" className="btn btn-ghost" onClick={clearCompare}>
              초기화
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setCompareModalOpen(true)}
            >
              비교 보기
            </button>
          </div>
        </div>
      )}

      {compareModalOpen && compareProducts.length > 0 && (
        <div
          className="modal-backdrop products-compare-modal-backdrop"
          role="presentation"
          onClick={() => setCompareModalOpen(false)}
        >
          <section
            className="modal-panel modal-panel-wide products-compare-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="products-compare-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">상품 비교</p>
                <h2 id="products-compare-title">
                  {compareProducts.length}개 상품 ({PRODUCT_TYPE_LABEL[productType]})
                </h2>
              </div>
              <button
                type="button"
                className="sim-modal-close"
                onClick={() => setCompareModalOpen(false)}
                aria-label="비교 창 닫기"
              >
                ×
              </button>
            </div>
            <ProductsCompareTable products={compareProducts} rateLabel={rateLabel} />
          </section>
        </div>
      )}
    </div>
  );
}
