import Image from "next/image";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login } from "./actions";

type SearchParams = Promise<{ error?: string; redirectTo?: string }>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { error, redirectTo } = await searchParams;

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Image
            src="/Photos/logo-mark.png"
            alt="Command Talent Group"
            width={1168}
            height={574}
            priority
            className="mx-auto h-16 w-auto"
          />
          <CardTitle className="sr-only">Command Talent Group</CardTitle>
          <CardDescription>Employee sign-in</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={login} className="grid gap-4">
            <input
              type="hidden"
              name="redirectTo"
              value={redirectTo ?? "/dashboard"}
            />
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
