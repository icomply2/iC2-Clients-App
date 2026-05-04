import { promises as fs } from "fs";
import path from "path";
import type { UserProfileOverride } from "@/lib/user-profile-overrides-shared";

const STORE_DIR = path.join(process.cwd(), ".codex-temp", "user-profile-overrides");

function safeUserId(userId: string) {
  return userId.replace(/[^a-z0-9_-]/gi, "_");
}

function overridePath(userId: string) {
  return path.join(STORE_DIR, `${safeUserId(userId)}.json`);
}

export async function readUserProfileOverride(userId?: string | null): Promise<UserProfileOverride | null> {
  if (!userId) {
    return null;
  }

  try {
    const raw = await fs.readFile(overridePath(userId), "utf8");
    return JSON.parse(raw) as UserProfileOverride;
  } catch {
    return null;
  }
}

export async function writeUserProfileOverride(userId: string, profile: UserProfileOverride) {
  await fs.mkdir(STORE_DIR, { recursive: true });
  await fs.writeFile(overridePath(userId), JSON.stringify(profile, null, 2), "utf8");
}
