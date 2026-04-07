export function buildRexTokenUrl(baseUrl: string, path = "") {
  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path, normalizedBaseUrl);
}
