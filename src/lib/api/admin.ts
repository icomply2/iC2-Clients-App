import type { ApiResult, LicenseeDto, PracticeDto, UpdateUserRequest } from "./types";

type AdminUserUpdateResponse = ApiResult<boolean>;

async function readResponse(response: Response) {
  const body = (await response.json().catch(() => null)) as
    | { message?: string | null; modelErrors?: { errorMessage?: string | null }[] | null }
    | null;

  if (!response.ok) {
    const modelErrorMessage = body?.modelErrors?.map((item) => item.errorMessage).filter(Boolean).join(", ");
    throw new Error(modelErrorMessage || body?.message || "Request failed.");
  }

  return body;
}

export async function updateAdminUser(userId: string, payload: UpdateUserRequest) {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return (await readResponse(response)) as AdminUserUpdateResponse | null;
}

export async function createAdminLicensee(payload: LicenseeDto) {
  const response = await fetch("/api/admin/licensees", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return (await readResponse(response)) as ApiResult<LicenseeDto> | null;
}

export async function updateAdminLicensee(licenseeId: string, payload: LicenseeDto) {
  const response = await fetch(`/api/admin/licensees/${encodeURIComponent(licenseeId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return (await readResponse(response)) as ApiResult<LicenseeDto> | null;
}

export async function createAdminPractice(payload: PracticeDto) {
  const response = await fetch("/api/admin/practices", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return (await readResponse(response)) as ApiResult<PracticeDto> | null;
}

export async function updateAdminPractice(practiceId: string, payload: PracticeDto) {
  const response = await fetch(`/api/admin/practices/${encodeURIComponent(practiceId)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  return (await readResponse(response)) as ApiResult<PracticeDto> | null;
}
