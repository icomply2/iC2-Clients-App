import { apiRequest } from "./client";
import type { ApiResult, ClientProfile, ClientSummary } from "./types";

type ListClientsParams = {
  licenseeName?: string;
  practiceName?: string;
  searchKey?: string;
};

function toQueryString(params: Record<string, string | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  return query ? `?${query}` : "";
}

export async function listClients(params: ListClientsParams = {}) {
  const query = toQueryString(params);

  return apiRequest<ApiResult<ClientSummary[]>>(`/api/Advisers/Clients${query}`, {
    method: "GET",
  });
}

export async function getClientProfileId(clientId: string, token?: string) {
  const query = toQueryString({ clientId });

  return apiRequest<ApiResult<string>>(`/api/ClientProfiles/ProfileId${query}`, {
    method: "GET",
    token,
  });
}

export async function getClientProfile(clientProfileId: string, token?: string) {
  return apiRequest<ApiResult<ClientProfile>>(`/api/ClientProfiles/${clientProfileId}`, {
    method: "GET",
    token,
  });
}
