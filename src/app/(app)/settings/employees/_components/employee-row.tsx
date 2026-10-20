"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableCell, TableRow } from "@/components/ui/table";

import type { EmployeeRole } from "@/lib/db/types";

import { updateEmployee } from "../actions";

const ROLES: EmployeeRole[] = ["Admin", "Recruiter", "Viewer"];
const ACTIVE = "active";
const INACTIVE = "inactive";

export function EmployeeRow({
  employee,
  isSelf,
}: {
  employee: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: EmployeeRole;
    active: boolean;
  };
  isSelf: boolean;
}) {
  const router = useRouter();
  const [role, setRole] = useState<EmployeeRole>(employee.role);
  const [active, setActive] = useState<boolean>(employee.active);
  const [isPending, startTransition] = useTransition();

  function changeRole(next: string) {
    const nextRole = next as EmployeeRole;
    const prev = role;
    setRole(nextRole);
    startTransition(async () => {
      const r = await updateEmployee(employee.id, { role: nextRole });
      if (!r.ok) {
        toast.error(r.error);
        setRole(prev);
        return;
      }
      toast.success("Role updated.");
      router.refresh();
    });
  }

  function changeActive(next: string) {
    const nextActive = next === ACTIVE;
    const prev = active;
    setActive(nextActive);
    startTransition(async () => {
      const r = await updateEmployee(employee.id, { active: nextActive });
      if (!r.ok) {
        toast.error(r.error);
        setActive(prev);
        return;
      }
      toast.success(nextActive ? "Reactivated." : "Deactivated.");
      router.refresh();
    });
  }

  return (
    <TableRow>
      <TableCell className="font-medium">
        {employee.first_name} {employee.last_name}
        {isSelf ? (
          <span className="ml-2 text-xs text-muted-foreground">(you)</span>
        ) : null}
      </TableCell>
      <TableCell className="text-muted-foreground">{employee.email}</TableCell>
      <TableCell>
        <Select
          value={role}
          onValueChange={changeRole}
          // Self-role-change is forbidden server-side; disable here too.
          disabled={isPending || isSelf}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLES.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        <Select
          value={active ? ACTIVE : INACTIVE}
          onValueChange={changeActive}
          disabled={isPending || isSelf}
        >
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ACTIVE}>Active</SelectItem>
            <SelectItem value={INACTIVE}>Inactive</SelectItem>
          </SelectContent>
        </Select>
      </TableCell>
    </TableRow>
  );
}
