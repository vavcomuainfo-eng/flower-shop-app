const KEY = 'flowerShopLocationId';

export function getCurrentLocationId() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(KEY) || null;
}

export function setCurrentLocationId(id) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, id);
}
