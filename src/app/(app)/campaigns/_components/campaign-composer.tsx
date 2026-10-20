"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Paperclip, Save, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  createCampaign,
  removeCampaignAttachment,
  saveTemplate,
  updateCampaign,
  uploadCampaignAttachment,
  type CampaignAttachment,
  type CampaignInput,
} from "../actions";

const NO_TEMPLATE = "none";

export type ComposerListOption = { id: string; name: string; count: number };
export type ComposerTemplate = {
  id: string;
  name: string;
  subject: string;
  body: string;
};

export function CampaignComposer({
  mode,
  campaignId,
  initial,
  lists,
  templates,
  selectionCount,
}: {
  mode: "create" | "edit";
  campaignId?: string;
  initial?: Partial<CampaignInput>;
  lists: ComposerListOption[];
  templates: ComposerTemplate[];
  // When set, this draft targets hand-picked leads ("Email selected") -
  // the list picker locks and we show the count instead.
  selectionCount?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  const [name, setName] = React.useState(initial?.name ?? "");
  const [listId, setListId] = React.useState(initial?.list_id ?? "");
  const [subject, setSubject] = React.useState(initial?.subject ?? "");
  const [body, setBody] = React.useState(initial?.body ?? "");
  const [fromName, setFromName] = React.useState(
    initial?.from_name ?? "Command Talent Group",
  );
  // Placeholder default reply-to; point it at a monitored inbox.
  const [replyTo, setReplyTo] = React.useState(
    initial?.reply_to ?? "careers@example.com",
  );
  const [templateId, setTemplateId] = React.useState(NO_TEMPLATE);
  const [attachments, setAttachments] = React.useState<CampaignAttachment[]>(
    initial?.attachments ?? [],
  );
  const [uploading, setUploading] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  async function onFilesPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    if (attachments.length + files.length > 5) {
      toast.error("Max 5 attachments per campaign.");
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
    // Fire-and-forget storage cleanup; the draft save persists the list.
    void removeCampaignAttachment(att.path);
  }

  function formatBytes(n: number): string {
    if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
  }

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (!subject.trim() || confirm("Replace the current subject and body with this template?")) {
      setSubject(t.subject);
      setBody(t.body);
    }
  }

  function save() {
    const input: CampaignInput = {
      name,
      list_id: listId,
      subject,
      body,
      from_name: fromName,
      reply_to: replyTo,
      attachments,
    };
    startTransition(async () => {
      if (mode === "create") {
        const r = await createCampaign(input);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("Draft saved.");
        router.push(`/campaigns/${r.id}`);
        router.refresh();
      } else {
        const r = await updateCampaign(campaignId!, input);
        if (!r.ok) {
          toast.error(r.error);
          return;
        }
        toast.success("Draft updated.");
        router.refresh();
      }
    });
  }

  function saveAsTemplate() {
    const templateName = prompt(
      "Template name:",
      name || subject || "Untitled template",
    );
    if (!templateName) return;
    startTransition(async () => {
      const r = await saveTemplate({ name: templateName, subject, body });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Template saved.");
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {mode === "create" ? "Compose campaign" : "Edit draft"}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="c-name">Campaign name (internal)</Label>
            <Input
              id="c-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="June check-in - Talent Network"
              maxLength={200}
            />
          </div>
          <div className="grid gap-2">
            <Label>Send to</Label>
            {selectionCount ? (
              <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                {selectionCount} hand-picked lead{selectionCount === 1 ? "" : "s"}
              </div>
            ) : (
              <Select value={listId || undefined} onValueChange={setListId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a lead list…" />
                </SelectTrigger>
                <SelectContent>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name} ({l.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {templates.length > 0 ? (
          <div className="grid gap-2">
            <Label>Start from template</Label>
            <Select value={templateId} onValueChange={applyTemplate}>
              <SelectTrigger className="sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEMPLATE}>Blank</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="grid gap-2">
          <Label htmlFor="c-subject">Subject</Label>
          <Input
            id="c-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="New roles for {{first_name}} this month"
            maxLength={200}
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="c-body">Message</Label>
          <Textarea
            id="c-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={14}
            placeholder={"Hi {{first_name}},\n\nWe've got a few new roles that match your background…"}
          />
          <p className="text-xs text-muted-foreground">
            Merge fields:{" "}
            <code className="rounded bg-muted px-1">{"{{first_name}}"}</code>{" "}
            <code className="rounded bg-muted px-1">{"{{last_name}}"}</code>{" "}
            <code className="rounded bg-muted px-1">{"{{full_name}}"}</code>{" "}
            <code className="rounded bg-muted px-1">{"{{company_name}}"}</code>{" "}
            <code className="rounded bg-muted px-1">{"{{location}}"}</code>
            {" - "}an unsubscribe footer is added to every send automatically.
          </p>
        </div>

        <div className="grid gap-2">
          <Label>Attachments</Label>
          <div className="flex flex-wrap items-center gap-2">
            {attachments.map((att) => (
              <span
                key={att.path}
                className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 py-1 pl-2 pr-1 text-xs"
              >
                <Paperclip className="size-3 text-muted-foreground" aria-hidden />
                <span className="max-w-48 truncate">{att.filename}</span>
                <span className="text-muted-foreground">
                  {formatBytes(att.size)}
                </span>
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
              {uploading ? "Uploading…" : "Attach file"}
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
          <p className="text-xs text-muted-foreground">
            Up to 5 files, 8MB each, 15MB total. Heads up: attached campaigns
            send one email at a time instead of in batches, so large lists
            take a few extra minutes.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="c-from">From name</Label>
            <Input
              id="c-from"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              maxLength={100}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="c-reply">Reply-to</Label>
            <Input
              id="c-reply"
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="careers@example.com"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={save} disabled={isPending}>
            <Save className="size-4" aria-hidden />
            {isPending
              ? "Saving…"
              : mode === "create"
                ? "Save draft"
                : "Update draft"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={saveAsTemplate}
            disabled={isPending || !subject.trim() || !body.trim()}
          >
            Save as template
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
