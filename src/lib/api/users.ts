import { apiRequest } from "./client";
import type { ApiResult, LoginResponse, UserSummary } from "./types";

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
