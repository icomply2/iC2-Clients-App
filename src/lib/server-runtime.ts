import "server-only";

export function getApiBaseUrl() {
  return process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || null;
}

export function isMockAuthEnabled() {
  return process.env.NEXT_PUBLIC_ENABLE_MOCK_AUTH === "true";
}

export function hasLiveApiBaseUrl() {
  return Boolean(getApiBaseUrl());
}

export function shouldUseMockDataWithoutAuth() {
  return isMockAuthEnabled() || !hasLiveApiBaseUrl();
}
