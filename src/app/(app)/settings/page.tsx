import Link from "next/link";
import { Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { getCurrentEmployee } from "@/lib/db/queries";
import { PageHeader } from "../_components/page-header";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const me = await getCurrentEmployee();
  const isAdmin = !("error" in me) && me.role === "Admin";

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your account and workspace settings."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account</CardTitle>
            <CardDescription>Signed in as {user?.email ?? "-"}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-[120px_1fr] gap-2">
              <span className="text-muted-foreground">Email</span>
              <span>{user?.email ?? "-"}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-2">
              <span className="text-muted-foreground">Role</span>
              <span>{"error" in me ? "-" : me.role}</span>
            </div>
            <div className="grid grid-cols-[120px_1fr] gap-2">
              <span className="text-muted-foreground">User ID</span>
              <span className="font-mono text-xs">{user?.id ?? "-"}</span>
            </div>
          </CardContent>
        </Card>

        {isAdmin ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="size-4" aria-hidden />
                Team
              </CardTitle>
              <CardDescription>
                Invite employees and assign roles.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild>
                <Link href="/settings/employees">Manage team</Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
