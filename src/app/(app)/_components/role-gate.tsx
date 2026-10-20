"use client";

import { useRole } from "./role-context";
import type { EmployeeRole } from "@/lib/db/types";

/**
 * Renders children only if the current role is in `allow`. Defaults to
 * rendering nothing otherwise; pass `fallback` for a different empty state.
 *
 * Cosmetic only - server actions enforce the real check via RLS and explicit
 * role gating. Hiding the trigger keeps the UI honest.
 */
export function RoleGate({
  allow,
  children,
  fallback = null,
}: {
  allow: readonly EmployeeRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const role = useRole();
  if (!role || !allow.includes(role)) return <>{fallback}</>;
  return <>{children}</>;
}
