"use client";

import { useEffect, useState } from "react";

type UserInitialsAvatarProps = {
  className?: string;
};

function getInitials(name?: string | null) {
  if (!name) {
    return "ME";
  }

  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) {
    return "ME";
  }

  return parts
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserInitialsAvatar({ className }: UserInitialsAvatarProps) {
  const [initials, setInitials] = useState("ME");

  useEffect(() => {
    let isMounted = true;

    async function loadCurrentUser() {
      try {
        const response = await fetch("/api/users/me", {
          method: "GET",
          cache: "no-store",
        });

        const body = (await response.json().catch(() => null)) as
          | {
              data?: {
                name?: string | null;
                email?: string | null;
              } | null;
            }
          | null;

        if (!response.ok || !body?.data) {
          return;
        }

        if (!isMounted) {
          return;
        }

        setInitials(getInitials(body.data.name ?? body.data.email));
      } catch {
        // Keep the fallback initials if the user lookup is unavailable.
      }
    }

    void loadCurrentUser();

    return () => {
      isMounted = false;
    };
  }, []);

  return <span className={className}>{initials}</span>;
}
