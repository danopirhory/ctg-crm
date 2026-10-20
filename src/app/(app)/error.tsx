"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

// Caught by Next.js when a (app)-segment page or layout throws.
// In production, error.message is stripped to a generic string; only the
// `digest` is shown to the user - they share that with you to look up the
// real stack in Vercel logs.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <main className="p-6">
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Something went wrong</CardTitle>
          <CardDescription>
            The page hit an unexpected error. The recruiters team has been
            notified through the logs.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {error.digest ? (
            <p className="text-xs text-muted-foreground">
              Error ID:{" "}
              <code className="font-mono">{error.digest}</code>
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button onClick={reset}>Try again</Button>
            <Button variant="outline" asChild>
              <a href="/dashboard">Back to dashboard</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
