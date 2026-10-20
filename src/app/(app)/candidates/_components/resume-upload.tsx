"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import {
  RESUME_ALLOWED_EXTENSIONS,
  RESUME_BUCKET,
  RESUME_MAX_BYTES,
  resumeExtensionFor,
  validateResumeFile,
} from "../_lib/resume";

const ACCEPT = RESUME_ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");

function fileBasename(path: string) {
  const last = path.split("/").pop() ?? path;
  return last.length > 40 ? `…${last.slice(-37)}` : last;
}

export function ResumeUpload({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // Track the human-readable name of the file the user just picked, so we can
  // display "MyResume.pdf" instead of the UUID storage path.
  const [pickedName, setPickedName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const busy = disabled || uploading;

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    void handleFiles(e.dataTransfer.files?.[0] ?? null);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!busy) setDragOver(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  async function handleFiles(file: File | null) {
    if (!file) return;

    const validation = validateResumeFile(file);
    if (!validation.ok) {
      toast.error(validation.error);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setUploading(true);
    try {
      const supabase = createClient();
      const ext = resumeExtensionFor(file);
      const path = `${crypto.randomUUID()}.${ext}`;

      const { error } = await supabase.storage
        .from(RESUME_BUCKET)
        .upload(path, file, {
          cacheControl: "3600",
          upsert: false,
          contentType: file.type || undefined,
        });

      if (error) {
        // Common upload errors mapped to friendly messages.
        const msg = /payload too large|exceed/i.test(error.message)
          ? `File is too large. Max ${RESUME_MAX_BYTES / 1024 / 1024} MB.`
          : /mime type/i.test(error.message)
            ? "Only PDF, DOC, or DOCX files are allowed."
            : /permission|policy|unauthor/i.test(error.message)
              ? "You don't have permission to upload resumes."
              : error.message;
        toast.error(msg);
        return;
      }

      setPickedName(file.name);
      onChange(path);
      toast.success("Resume uploaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove() {
    if (!value) return;
    // Best-effort: delete the orphan file. RLS allows active employees to
    // delete; if it fails (network blip, race), we still clear the form
    // field so the candidate ends up with no resume on save.
    try {
      const supabase = createClient();
      await supabase.storage.from(RESUME_BUCKET).remove([value]);
    } catch {
      /* swallow - clearing the field is the important part */
    }
    onChange("");
    setPickedName(null);
  }

  const hasFile = Boolean(value);

  return (
    <div
      className="grid gap-2"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        disabled={busy}
        onChange={(e) => handleFiles(e.target.files?.[0] ?? null)}
      />

      {hasFile ? (
        <div
          className={cn(
            "flex items-center gap-3 rounded-md border bg-muted/30 px-3 py-2 text-sm transition-colors",
            dragOver && "border-primary bg-primary/5",
          )}
        >
          <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="flex-1 truncate">
            {dragOver
              ? "Drop to replace…"
              : (pickedName ?? fileBasename(value))}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Replace
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={handleRemove}
            aria-label="Remove resume"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed px-4 py-7 text-sm transition-colors",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-input hover:border-primary/50 hover:bg-muted/40",
            busy && "cursor-not-allowed opacity-60",
          )}
        >
          {uploading ? (
            <>
              <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden />
              <span>Uploading…</span>
            </>
          ) : (
            <>
              <Upload className="size-5 text-muted-foreground" aria-hidden />
              <span className="font-medium">Upload resume</span>
              <span className="text-xs text-muted-foreground">
                {dragOver
                  ? "Drop the file to upload"
                  : "Click to browse or drag & drop a file here"}
              </span>
            </>
          )}
        </button>
      )}

      <p className="text-xs text-muted-foreground">
        PDF, DOC, or DOCX. Max {RESUME_MAX_BYTES / 1024 / 1024} MB.
      </p>
    </div>
  );
}
