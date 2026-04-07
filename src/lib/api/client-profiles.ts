import { apiRequest } from "./client";
import type { ApiResult, ClientSummary } from "./types";

export type SearchClientProfilesRequest = {
  searchKey?: string;
  adviserName?: string;
  practiceName?: string;
  licenseeName?: string;
  pageNumber?: number;
  pageSize?: number;
};

export async function searchClientSummaries(token: string, payload: SearchClientProfilesRequest) {
  return apiRequest<ApiResult<ClientSummary[]>>("/api/ClientProfiles/ClientSummary/Search", {
    method: "POST",
    token,
    body: JSON.stringify(payload),
  });
}
