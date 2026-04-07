import { AUTH_COOKIE_NAME, type CurrentUser, readCurrentUserFromCookies } from "@/lib/auth";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

export async function readBearerToken(request: Request) {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const authCookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${AUTH_COOKIE_NAME}=`));

  return authCookie ? decodeURIComponent(authCookie.slice(AUTH_COOKIE_NAME.length + 1)) : null;
}

async function resolveCurrentUser(token: string, currentUser: CurrentUser) {
  if (!API_BASE_URL || currentUser.id) {
    return currentUser;
  }

  try {
    const response = await fetch(new URL("/api/Users", API_BASE_URL), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const body = (await response.json().catch(() => null)) as
      | {
          data?: { id?: string | null; email?: string | null; name?: string | null }[] | null;
        }
      | null;

    if (!response.ok || !body?.data?.length) {
      return currentUser;
    }

    const email = currentUser.email?.trim().toLowerCase();
    const name = currentUser.name?.trim().toLowerCase();
    const matchedUser =
      body.data.find((user) => user.email?.trim().toLowerCase() === email) ??
      body.data.find((user) => user.name?.trim().toLowerCase() === name);

    if (!matchedUser?.id) {
      return currentUser;
    }

    return {
      id: matchedUser.id,
      name: currentUser.name ?? matchedUser.name ?? null,
      email: currentUser.email ?? matchedUser.email ?? null,
    };
  } catch {
    return currentUser;
  }
}

export async function requireCurrentUser(token: string) {
  const currentUser = await readCurrentUserFromCookies();

  if (!currentUser) {
    return { error: { message: "Unable to resolve the signed-in user for this request.", status: 401 } };
  }

  const resolvedCurrentUser = await resolveCurrentUser(token, currentUser);

  if (!resolvedCurrentUser.id) {
    return { error: { message: "Unable to resolve the signed-in user's id for this request.", status: 400 } };
  }

  return { currentUser: resolvedCurrentUser };
}
