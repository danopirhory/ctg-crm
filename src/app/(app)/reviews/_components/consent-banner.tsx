"use client";

import * as React from "react";
import { Info, X } from "lucide-react";

const STORAGE_KEY = "ctg.ai-consent.v1";

// useSyncExternalStore lets us read localStorage without tripping the
// react-hooks/set-state-in-effect lint - and gives correct SSR fallback
// (treat as "dismissed" on the server so the banner only ever appears
// after we've actually checked the client-side preference).
function subscribe(notify: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) notify();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
function getSnapshot(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}
function getServerSnapshot(): boolean {
  return true; // never render the banner during SSR
}

// One-time banner shown the first time a recruiter opens any AI page.
// Storage-keyed so dismissal persists; we keep it in localStorage rather
// than the DB on purpose - it's a per-browser preference, not a
// permission we enforce server-side.
export function AIConsentBanner() {
  const dismissed = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const [, setTick] = React.useState(0);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // localStorage blocked → also fall through to hide via tick.
    }
    // Force a re-read; we can't rely on the storage event firing for
    // same-tab writes in every browser.
    setTick((n) => n + 1);
  }

  if (dismissed) return null;

  return (
    <aside className="mb-4 grid gap-2 rounded-md border border-amber-200/60 bg-amber-50/40 p-3 text-xs text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-200">
      <div className="flex items-start gap-2">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="grid gap-1">
          <p className="font-medium">Heads up - AI review uses OpenAI</p>
          <p>
            When you click Generate / Regenerate / Update all, the
            candidate&apos;s resume text plus the job description are sent to
            OpenAI&apos;s API to produce the structured review. OpenAI&apos;s
            standard API policy does not train on customer inputs, but the
            data does leave our infrastructure for the duration of the call.
            Make sure your client agreements permit this before generating
            for sensitive roles.
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="rounded p-1 hover:bg-amber-100/60 dark:hover:bg-amber-900/40"
          aria-label="Dismiss"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </aside>
  );
}
