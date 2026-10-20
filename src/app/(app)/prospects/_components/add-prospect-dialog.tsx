"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import type { ProspectListKind } from "@/lib/db/constants";

import { useCanWrite } from "../../_components/role-context";
import { addProspectToList } from "../actions";
import { ResumeUpload } from "../../candidates/_components/resume-upload";

export function AddProspectDialog({
  listId,
  listKind,
}: {
  listId: string;
  listKind: ProspectListKind;
}) {
  const router = useRouter();
  const canWrite = useCanWrite();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Shared individual + contact fields.
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(true);
  // Candidate-only: resume uploaded straight from this dialog (drag &
  // drop or click). Stored as a storage path; carries over when the
  // lead is later promoted to a candidate.
  const [resumeUrl, setResumeUrl] = useState("");

  // Company-only fields.
  const [industry, setIndustry] = useState("");
  const [hiringNeeds, setHiringNeeds] = useState("");

  function reset() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPhone("");
    setTitle("");
    setCompanyName("");
    setLocation("");
    setNotes("");
    setConsent(true);
    setResumeUrl("");
    setIndustry("");
    setHiringNeeds("");
  }

  if (!canWrite) return null;

  const isCompany = listKind === "Company";

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (isCompany) {
      if (!companyName.trim()) {
        toast.error("Company name is required.");
        return;
      }
    } else {
      if (!firstName.trim() && !lastName.trim()) {
        toast.error("First and last name are required.");
        return;
      }
    }

    startTransition(async () => {
      const input = {
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        title,
        company_name: companyName,
        industry,
        location,
        hiring_needs: hiringNeeds,
        notes,
        // Resumes only apply to people, not company records.
        resume_url: isCompany ? "" : resumeUrl,
        marketing_consent: consent,
      };
      let r = await addProspectToList(listId, input);
      // Duplicate email - show who it collides with, allow override.
      if (!r.ok && r.duplicates?.length) {
        const lines = r.duplicates
          .map(
            (d) => `• ${d.name} (${d.kind}${d.detail ? ` - ${d.detail}` : ""})`,
          )
          .join("\n");
        const proceed = confirm(
          `This email is already in the CRM:\n\n${lines}\n\nAdd anyway?`,
        );
        if (!proceed) return;
        r = await addProspectToList(listId, input, { allowDuplicate: true });
      }
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${isCompany ? "Company" : "Prospect"} added.`);
      reset();
      setOpen(false);
      router.refresh();
    });
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
        <Button variant="outline">
          <Plus className="size-4" aria-hidden />
          Add {isCompany ? "company" : "prospect"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Add a {isCompany ? "company" : "prospect"} to this list
          </DialogTitle>
          <DialogDescription>
            {isCompany
              ? "Company name is required. The contact person is optional."
              : "First and last name are required."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-3">
          {isCompany ? (
            // ============================================================
            // Company-kind layout
            // ============================================================
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">
                    Company name
                  </label>
                  <Input
                    required
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    disabled={isPending}
                    autoComplete="organization"
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">
                    Industry
                  </label>
                  <Input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    disabled={isPending}
                    placeholder="e.g. Aerospace & Defense"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">
                    Contact first name
                  </label>
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">
                    Contact last name
                  </label>
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={isPending}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">
                    Contact email
                  </label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">
                    Contact phone
                  </label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isPending}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">
                    Contact title
                  </label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={isPending}
                    placeholder="e.g. Head of TA"
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">
                    Location
                  </label>
                  <Input
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={isPending}
                    placeholder="e.g. Denver, CO"
                  />
                </div>
              </div>
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">
                  Hiring needs
                </label>
                <Textarea
                  rows={2}
                  value={hiringNeeds}
                  onChange={(e) => setHiringNeeds(e.target.value)}
                  disabled={isPending}
                  maxLength={2000}
                  placeholder="What are they hiring for?"
                />
              </div>
            </>
          ) : (
            // ============================================================
            // Candidate-kind layout
            // ============================================================
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">
                    First name
                  </label>
                  <Input
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    disabled={isPending}
                    autoComplete="given-name"
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">
                    Last name
                  </label>
                  <Input
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    disabled={isPending}
                    autoComplete="family-name"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">Email</label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isPending}
                    autoComplete="email"
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">Phone</label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isPending}
                    autoComplete="tel"
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">Title</label>
                  <Input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    disabled={isPending}
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-xs text-muted-foreground">
                    Company
                  </label>
                  <Input
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    disabled={isPending}
                  />
                </div>
              </div>
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">Location</label>
                <Input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={isPending}
                  placeholder="e.g. Austin, TX"
                />
              </div>
              <div className="grid gap-1">
                <label className="text-xs text-muted-foreground">
                  Resume (optional)
                </label>
                <ResumeUpload
                  value={resumeUrl}
                  onChange={setResumeUrl}
                  disabled={isPending}
                />
              </div>
            </>
          )}

          <div className="grid gap-1">
            <label className="text-xs text-muted-foreground">
              Notes (optional)
            </label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isPending}
              maxLength={2000}
            />
          </div>

          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5 size-3.5 rounded border-input"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              disabled={isPending}
            />
            <span>
              Marketing consent: include in email campaigns when the list is
              synced.
            </span>
          </label>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Adding…" : `Add ${isCompany ? "company" : "prospect"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
