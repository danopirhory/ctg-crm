"use client";

import * as React from "react";
import { Copy, MessageSquareText } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

import { draftOutreach } from "../../../ai-actions";

const NO_JOB = "none";

// AI-drafted first-touch outreach. Generates into editable fields;
// Copy puts the final text on the clipboard so the recruiter sends it
// from their own email or LinkedIn.
export function DraftOutreachButton({
  candidateId,
  jobs,
}: {
  candidateId: string;
  jobs: { id: string; label: string }[];
}) {
  const [open, setOpen] = React.useState(false);
  const [channel, setChannel] = React.useState<"email" | "linkedin">("email");
  const [jobId, setJobId] = React.useState(NO_JOB);
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [isPending, startTransition] = React.useTransition();

  function generate() {
    startTransition(async () => {
      const r = await draftOutreach({
        candidateId,
        jobId: jobId === NO_JOB ? null : jobId,
        channel,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setSubject(r.draft.subject);
      setBody(r.draft.body);
    });
  }

  async function copy() {
    const text =
      channel === "email" && subject ? `Subject: ${subject}\n\n${body}` : body;
    await navigator.clipboard.writeText(text);
    toast.success("Copied to clipboard.");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <MessageSquareText className="size-4" aria-hidden />
          Draft outreach
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Draft outreach</DialogTitle>
          <DialogDescription>
            AI writes a personalized first-touch from this candidate&apos;s
            background. Edit freely, then copy into your email or LinkedIn.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label>Channel</Label>
              <Select
                value={channel}
                onValueChange={(v) => setChannel(v as "email" | "linkedin")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="linkedin">LinkedIn message</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>About a role</Label>
              <Select value={jobId} onValueChange={setJobId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_JOB}>
                    No specific role (network touch)
                  </SelectItem>
                  {jobs.map((j) => (
                    <SelectItem key={j.id} value={j.id}>
                      {j.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button type="button" onClick={generate} disabled={isPending}>
            {isPending
              ? "Drafting…"
              : body
                ? "Regenerate"
                : "Generate draft"}
          </Button>

          {body ? (
            <>
              {channel === "email" ? (
                <div className="grid gap-2">
                  <Label htmlFor="outreach-subject">Subject</Label>
                  <Input
                    id="outreach-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="outreach-body">Message</Label>
                <Textarea
                  id="outreach-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                />
              </div>
              <Button type="button" variant="outline" onClick={copy}>
                <Copy className="size-4" aria-hidden />
                Copy to clipboard
              </Button>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
