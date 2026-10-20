"use client";

import { createContext, useContext } from "react";
import type { EmployeeRole } from "@/lib/db/types";

const RoleContext = createContext<EmployeeRole | null>(null);

export function RoleProvider({
  role,
  children,
}: {
  role: EmployeeRole;
  children: React.ReactNode;
}) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useRole(): EmployeeRole | null {
  return useContext(RoleContext);
}

export function useCanWrite(): boolean {
  const role = useContext(RoleContext);
  return role === "Admin" || role === "Recruiter";
}

export function useCanDelete(): boolean {
  return useContext(RoleContext) === "Admin";
}

export function useIsAdmin(): boolean {
  return useContext(RoleContext) === "Admin";
}
