import { apiRequest } from './api';

export function fetchProducts({ productType = 'saving', topFinGrpNo, pageNo = 1 } = {}) {
  const params = new URLSearchParams({
    productType,
    pageNo: String(pageNo),
  });
  if (topFinGrpNo) params.set('topFinGrpNo', topFinGrpNo);
  return apiRequest(`/api/products?${params.toString()}`);
}

export function fetchDepositProducts(options = {}) {
  return fetchProducts({ ...options, productType: 'deposit' });
}

export function fetchSavingProducts(options = {}) {
  return fetchProducts({ ...options, productType: 'saving' });
}
