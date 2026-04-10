"use client";

import { useEffect, useState } from "react";

export type CurrentUserScope = {
  id?: string | null;
  email?: string | null;
  name?: string | null;
  userRole?: string | null;
  appAdmin?: string | boolean | number | null;
  appAccess?: string | null;
  userStatus?: string | null;
  practice?: {
    id?: string | null;
    name?: string | null;
  } | null;
  licensee?: {
    id?: string | null;
    name?: string | null;
  } | null;
};

export function useCurrentUserScope() {
  const [data, setData] = useState<CurrentUserScope | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentUserScope() {
      try {
        const response = await fetch("/api/users/me", {
          method: "GET",
          cache: "no-store",
        });

        const body = (await response.json().catch(() => null)) as
          | {
              data?: CurrentUserScope | null;
            }
          | null;

        if (!response.ok || cancelled) {
          return;
        }

        setData(body?.data ?? null);
      } catch {
        // Leave scope empty if the current user cannot be resolved.
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCurrentUserScope();

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, loading };
}
