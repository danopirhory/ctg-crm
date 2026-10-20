import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getCurrentEmployee, listEmployees } from "@/lib/db/queries";

import { PageHeader } from "../../_components/page-header";
import { ErrorState } from "../../_components/states";
import { InviteEmployeeDialog } from "./_components/invite-employee-dialog";
import { EmployeeRow } from "./_components/employee-row";

export default async function EmployeesSettingsPage() {
  const me = await getCurrentEmployee();
  if ("error" in me) redirect("/login");
  if (me.role !== "Admin") {
    // Send non-admins back to the main settings page; they shouldn't have
    // been able to navigate here, but enforce server-side.
    redirect("/settings");
  }

  const { data: employees, error } = await listEmployees();

  return (
    <>
      <PageHeader
        title="Team"
        description="Manage who can sign into the CRM and what they can do."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/settings">Back</Link>
            </Button>
            <InviteEmployeeDialog />
          </>
        }
      />

      {error ? (
        <ErrorState message={error} />
      ) : employees.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No employees yet. Use <strong>Invite employee</strong> to add one.
        </p>
      ) : (
        <Card className="overflow-hidden p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
                <EmployeeRow
                  key={e.id}
                  employee={e}
                  isSelf={e.id === me.id}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
