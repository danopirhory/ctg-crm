"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Paperclip, Send, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import {
  createCampaignFromSelection,
  quickSendEmail,
  removeCampaignAttachment,
  uploadCampaignAttachment,
  type CampaignAttachment,
} from "../../../campaigns/actions";

// One-off mass email to the checked leads - compose in a dialog, hit
// send, done. No draft/composer roundtrip. The send still runs through
// the full campaign pipeline (consent, suppression, unsubscribe,
// tracking) and shows up under Campaigns as "Quick: <subject>" for
// stats.
export function QuickSendDialog({
  listId,
  prospectIds,
  onSent,
}: {
  listId: string;
  prospectIds: string[];
  onSent: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [replyTo, setReplyTo] = React.useState("");
  const [attachments, setAttachments] = React.useState<CampaignAttachment[]>([]);
  const [uploading, setUploading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const n = prospectIds.length;

  function reset() {
    setSubject("");
    setBody("");
    setReplyTo("");
    setAttachments([]);
  }

  async function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    if (attachments.length + files.length > 5) {
      toast.error("Max 5 attachments.");
      return;
    }
    setUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        const r = await uploadCampaignAttachment(fd);
        if (!r.ok) {
          toast.error(`${file.name}: ${r.error}`);
          continue;
        }
        setAttachments((prev) => [...prev, r.attachment]);
      }
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(att: CampaignAttachment) {
    setAttachments((prev) => prev.filter((a) => a.path !== att.path));
    void removeCampaignAttachment(att.path);
  }

  function send() {
    if (!subject.trim() || body.trim().length < 10) {
      toast.error("Write a subject and a message first.");
      return;
    }
    if (
      !confirm(
        `Send this email to up to ${n} selected lead${n === 1 ? "" : "s"} now? Consent and unsubscribes are applied automatically. This cannot be recalled.`,
      )
    ) {
      return;
    }
    setSending(true);
    void (async () => {
      try {
        const r = await quickSendEmail({
          prospectIds,
          subject,
          body,
          reply_to: replyTo,
          attachments,
        });
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        const parts = [`Sent to ${r.sent}`];
        if (r.skipped > 0) parts.push(`${r.skipped} skipped (consent/unsubscribed)`);
        if (r.failed > 0) parts.push(`${r.failed} failed`);
        toast[r.failed > 0 ? "warning" : "success"](parts.join(" · "));
        reset();
        setOpen(false);
        onSent();
        router.refresh();
      } finally {
        setSending(false);
      }
    })();
  }

  // Escape hatch: same selection, but as a full campaign draft (for
  // templates / saving for later).
  function openAsCampaign() {
    setSending(true);
    void (async () => {
      try {
        const r = await createCampaignFromSelection(listId, prospectIds);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        onSent();
        router.push(`/campaigns/${r.id}`);
      } finally {
        setSending(false);
      }
    })();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-8">
          <Mail className="size-3.5" aria-hidden />
          Email selected
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Email {n} selected lead{n === 1 ? "" : "s"}
          </DialogTitle>
          <DialogDescription>
            One-time send. Merge fields work here too -{" "}
            <code className="rounded bg-muted px-1 text-xs">
              {"{{first_name}}"}
            </code>{" "}
            etc. An unsubscribe footer is added automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="qs-subject">Subject</Label>
            <Input
              id="qs-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              autoFocus
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="qs-body">Message</Label>
            <Textarea
              id="qs-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={9}
              placeholder={"Hi {{first_name}},\n\n…"}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="qs-reply">Reply-to (optional)</Label>
            <Input
              id="qs-reply"
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {attachments.map((att) => (
              <span
                key={att.path}
                className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 py-1 pl-2 pr-1 text-xs"
              >
                <Paperclip className="size-3 text-muted-foreground" aria-hidden />
                <span className="max-w-40 truncate">{att.filename}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(att)}
                  className="grid size-4 place-items-center rounded hover:bg-destructive hover:text-destructive-foreground"
                  aria-label={`Remove ${att.filename}`}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              disabled={uploading || attachments.length >= 5}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <Paperclip className="size-3.5" aria-hidden />
              )}
              {uploading ? "Uploading…" : "Attach"}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.txt,.csv"
              onChange={onFilesPicked}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={sending}
            onClick={openAsCampaign}
            className="text-muted-foreground"
          >
            Open as campaign instead
          </Button>
          <Button type="button" onClick={send} disabled={sending || uploading}>
            <Send className="size-4" aria-hidden />
            {sending ? "Sending…" : `Send to ${n}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
