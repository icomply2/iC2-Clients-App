import "server-only";

import { resolveCurrentUserFromApi } from "@/lib/current-user";

export async function isArchivedUserToken(token: string) {
  const currentUser = await resolveCurrentUserFromApi(token).catch(() => null);

  return currentUser?.userStatus?.trim().toLowerCase() === "archived";
}
