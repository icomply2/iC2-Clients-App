import { decodeJwtPayload, readStringClaim } from "@/lib/current-user";

export function getClientLoginRedirectUrl(token?: string | null) {
  if (!token) {
    return null;
  }

  const payload = decodeJwtPayload(token);

  if (!payload) {
    return null;
  }

  const userRole = readStringClaim(payload, ["UserRole", "userRole", "role"]);

  if (userRole?.trim().toLowerCase() !== "client") {
    return null;
  }

  const clientProfileId = readStringClaim(payload, ["ClientProfileId"]);
  const isClientLogin = readStringClaim(payload, ["IsClientLogin"]);
  const searchParams = new URLSearchParams();

  if (isClientLogin) {
    searchParams.set("IsClientLogin", isClientLogin);
  }

  const path = clientProfileId
    ? `/onboarding-process/${encodeURIComponent(clientProfileId)}`
    : "/onboarding-process";
  const queryString = searchParams.toString();

  return queryString ? `${path}?${queryString}` : path;
}
