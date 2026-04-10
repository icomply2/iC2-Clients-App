"use client";

import { isAppAdminValue } from "@/lib/app-admin";
import { useCurrentUserScope } from "@/hooks/use-current-user-scope";

type AdminOnlyProps = {
  children: React.ReactNode;
  fallback?: React.ReactNode;
};

export function AdminOnly({ children, fallback = null }: AdminOnlyProps) {
  const { data } = useCurrentUserScope();

  if (!isAppAdminValue(data?.appAdmin)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
