"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, Briefcase, Search, Sparkles, UserPlus, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

import {
  globalSearch,
  type GlobalSearchResults,
} from "../search-actions";
import { aiCandidateSearch, type AiSearchHit } from "../ai-actions";

const EMPTY: GlobalSearchResults = {
  candidates: [],
  companies: [],
  jobs: [],
  leads: [],
};

// Header search button + Ctrl/Cmd+K palette. Queries run server-side
// (debounced 250ms) so the palette never ships record data to the
// client until asked.
export function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<GlobalSearchResults>(EMPTY);
  const [searching, setSearching] = React.useState(false);
  const [aiHits, setAiHits] = React.useState<AiSearchHit[] | null>(null);
  const [aiLoading, setAiLoading] = React.useState(false);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Debounced server fetch. The seq guard drops stale responses that
  // resolve after a newer query has been issued. All state updates
  // happen inside the timeout callback (an async boundary), never
  // synchronously in the effect body.
  const seqRef = React.useRef(0);
  React.useEffect(() => {
    if (!open) return;
    const q = query.trim();
    const seq = ++seqRef.current;
    const t = setTimeout(
      async () => {
        if (seqRef.current !== seq) return;
        if (q.length < 2) {
          setResults(EMPTY);
          setSearching(false);
          return;
        }
        setSearching(true);
        try {
          const r = await globalSearch(q);
          if (seqRef.current === seq) setResults(r);
        } finally {
          if (seqRef.current === seq) setSearching(false);
        }
      },
      q.length < 2 ? 0 : 250,
    );
    return () => clearTimeout(t);
  }, [query, open]);

  function go(href: string) {
    setOpen(false);
    setQuery("");
    setResults(EMPTY);
    setAiHits(null);
    router.push(href);
  }

  // "Ask AI" - translates a natural-language query ("navy officers in
  // texas with a clearance") into filters and searches candidates.
  // Explicit invocation only, so the per-keystroke path stays free.
  function runAiSearch() {
    const q = query.trim();
    if (q.length < 4) return;
    setAiLoading(true);
    setAiHits(null);
    void (async () => {
      try {
        const r = await aiCandidateSearch(q);
        if (r.ok) setAiHits(r.hits);
        else setAiHits([]);
      } finally {
        setAiLoading(false);
      }
    })();
  }

  // Looks like natural language rather than a name/email fragment?
  const aiEligible =
    query.trim().length >= 8 && query.trim().split(/\s+/).length >= 2;

  const hasAny =
    results.candidates.length > 0 ||
    results.companies.length > 0 ||
    results.jobs.length > 0 ||
    results.leads.length > 0;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-2 text-muted-foreground"
        onClick={() => setOpen(true)}
      >
        <Search className="size-4" aria-hidden />
        <span className="hidden sm:inline">Search…</span>
        <kbd className="pointer-events-none hidden rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:inline-block">
          Ctrl K
        </kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) {
            setQuery("");
            setResults(EMPTY);
            setAiHits(null);
          }
        }}
        title="Search"
        description="Search candidates, companies, jobs, and leads"
      >
        <CommandInput
          placeholder="Search candidates, companies, jobs, leads…"
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {query.trim().length < 2 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Type at least 2 characters.
            </p>
          ) : searching && !hasAny ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Searching…
            </p>
          ) : !hasAny && !aiEligible ? (
            <CommandEmpty>No matches.</CommandEmpty>
          ) : null}

          {aiEligible ? (
            <CommandGroup heading="AI search">
              <CommandItem value="__ask_ai" onSelect={runAiSearch}>
                <Sparkles aria-hidden />
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {aiLoading
                      ? "Searching with AI…"
                      : `Ask AI: “${query.trim()}”`}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    Natural-language candidate search
                  </div>
                </div>
              </CommandItem>
              {aiHits !== null && aiHits.length === 0 && !aiLoading ? (
                <CommandItem value="__ai_empty" disabled>
                  <div className="text-xs text-muted-foreground">
                    AI search found no matching candidates.
                  </div>
                </CommandItem>
              ) : null}
              {(aiHits ?? []).map((h) => (
                <CommandItem
                  key={`ai-${h.id}`}
                  value={`ai-${h.id}`}
                  onSelect={() => go(`/candidates/${h.id}`)}
                >
                  <Users aria-hidden />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{h.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {h.subtitle}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {results.candidates.length > 0 ? (
            <CommandGroup heading="Candidates">
              {results.candidates.map((h) => (
                <CommandItem
                  key={`c-${h.id}`}
                  value={`candidate-${h.id}`}
                  onSelect={() => go(h.href)}
                >
                  <Users aria-hidden />
                  <HitBody hit={h} />
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {results.leads.length > 0 ? (
            <CommandGroup heading="Leads">
              {results.leads.map((h) => (
                <CommandItem
                  key={`l-${h.id}`}
                  value={`lead-${h.id}`}
                  onSelect={() => go(h.href)}
                >
                  <UserPlus aria-hidden />
                  <HitBody hit={h} />
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {results.companies.length > 0 ? (
            <CommandGroup heading="Companies">
              {results.companies.map((h) => (
                <CommandItem
                  key={`co-${h.id}`}
                  value={`company-${h.id}`}
                  onSelect={() => go(h.href)}
                >
                  <Building2 aria-hidden />
                  <HitBody hit={h} />
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
          {results.jobs.length > 0 ? (
            <CommandGroup heading="Jobs">
              {results.jobs.map((h) => (
                <CommandItem
                  key={`j-${h.id}`}
                  value={`job-${h.id}`}
                  onSelect={() => go(h.href)}
                >
                  <Briefcase aria-hidden />
                  <HitBody hit={h} />
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}

function HitBody({
  hit,
}: {
  hit: { title: string; subtitle: string | null };
}) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium">{hit.title}</div>
      {hit.subtitle ? (
        <div className="truncate text-xs text-muted-foreground">
          {hit.subtitle}
        </div>
      ) : null}
    </div>
  );
}
