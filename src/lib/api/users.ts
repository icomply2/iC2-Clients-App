import { apiRequest } from "./client";
import type { ApiResult, LoginResponse, UserPreferences, UserSummary } from "./types";

export type LoginRequest = {
  email: string;
  password: string;
};

export async function login(payload: LoginRequest, useNewSaraPage?: boolean) {
  const query = useNewSaraPage ? "?useNewSaraPage=true" : "";

  return apiRequest<ApiResult<LoginResponse>>(`/api/Users/Login${query}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getUsers(token: string) {
  return apiRequest<ApiResult<UserSummary[]>>("/api/Users", {
    method: "GET",
    token,
  });
}

export async function getUser(userId: string, token: string) {
  return apiRequest<ApiResult<UserSummary>>(`/api/Users/${encodeURIComponent(userId)}`, {
    method: "GET",
    token,
  });
}

export async function getUserPreferences(userId: string, token: string) {
  return apiRequest<ApiResult<UserPreferences>>(`/api/Users/${encodeURIComponent(userId)}/Preferences`, {
    method: "GET",
    token,
  });
}

export async function updateUserPreferences(userId: string, payload: UserPreferences, token: string) {
  return apiRequest<ApiResult<boolean>>(`/api/Users/${encodeURIComponent(userId)}/Preferences`, {
    method: "PATCH",
    body: JSON.stringify(payload),
    token,
  });
}

export async function verifyTwoFactorAuthentication(email: string, code: string) {
  return apiRequest<ApiResult<{ jwtToken?: string | null }>>("/api/Users/VerifyTwoFactorAuthentication", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
}

export async function forgotPassword(email: string) {
  const query = new URLSearchParams({ email }).toString();

  return apiRequest<ApiResult<string>>(`/api/Users/ForgotPassword?${query}`, {
    method: "GET",
  });
}
