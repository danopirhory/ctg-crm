import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Toaster } from "@/components/ui/sonner";

import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/db/queries";

import { AppShell } from "./_components/app-shell";
import { RoleProvider } from "./_components/role-context";
import { logout } from "./actions";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Defense in depth: middleware already redirects unauthenticated users,
  // but never render the app shell without a verified user.
  if (!user) {
    redirect("/login");
  }

  // Every (app) request must belong to an ACTIVE employee.
  // If not, render a self-contained Access Denied page with a Sign-out
  // button - we can't redirect back to /login here without looping (the
  // proxy would send the signed-in user straight back to /dashboard).
  const employee = await getCurrentEmployee();
  if ("error" in employee) {
    return (
      <>
        <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Access denied</CardTitle>
              <CardDescription>
                Your account isn&apos;t registered as an active employee. If
                that&apos;s a mistake, ask an admin to re-activate you. Sign
                out below to return to the login screen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-xs text-muted-foreground">{employee.error}</p>
              <form action={logout}>
                <Button type="submit" variant="outline">
                  Sign out
                </Button>
              </form>
            </CardContent>
          </Card>
        </main>
        <Toaster richColors position="top-right" />
      </>
    );
  }

  return (
    <RoleProvider role={employee.role}>
      <AppShell user={{ email: user.email ?? "" }}>{children}</AppShell>
      <Toaster richColors position="top-right" />
    </RoleProvider>
  );
}
