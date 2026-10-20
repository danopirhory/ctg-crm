"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Send, FlaskConical, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { deleteCampaign, sendCampaign, sendTestEmail } from "../actions";

export function SendCampaignPanel({
  campaignId,
  mailable,
  suppressed,
  noConsent,
  configured,
  configError,
}: {
  campaignId: string;
  mailable: number;
  suppressed: number;
  noConsent: number;
  configured: boolean;
  configError: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [sending, setSending] = React.useState(false);

  function test() {
    startTransition(async () => {
      const r = await sendTestEmail(campaignId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Test email sent to your inbox.");
    });
  }

  function send() {
    if (
      !confirm(
        `Send this campaign to ${mailable} recipient${mailable === 1 ? "" : "s"} now? This cannot be recalled once it leaves.`,
      )
    ) {
      return;
    }
    setSending(true);
    startTransition(async () => {
      const r = await sendCampaign(campaignId);
      setSending(false);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `Sent to ${r.sent} recipient${r.sent === 1 ? "" : "s"}${r.failed ? ` · ${r.failed} failed` : ""}.`,
      );
      router.refresh();
    });
  }

  function remove() {
    if (!confirm("Delete this draft campaign?")) return;
    startTransition(async () => {
      const r = await deleteCampaign(campaignId);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Draft deleted.");
      router.push("/campaigns");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Send</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <dl className="grid gap-1 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Mailable recipients</dt>
            <dd className="font-semibold tabular-nums">{mailable}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Skipped - no consent</dt>
            <dd className="tabular-nums">{noConsent}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              Skipped - unsubscribed / bounced
            </dt>
            <dd className="tabular-nums">{suppressed}</dd>
          </div>
        </dl>

        {!configured ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
            {configError}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={test}
            disabled={isPending || !configured}
          >
            <FlaskConical className="size-4" aria-hidden />
            Send test to me
          </Button>
          <Button
            type="button"
            onClick={send}
            disabled={isPending || sending || !configured || mailable === 0}
          >
            <Send className="size-4" aria-hidden />
            {sending ? "Sending…" : `Send to ${mailable}`}
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="ml-auto text-muted-foreground hover:text-destructive"
            onClick={remove}
            disabled={isPending}
          >
            <Trash2 className="size-4" aria-hidden />
            Delete draft
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
