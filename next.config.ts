import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root so Next.js doesn't get confused by stray lockfiles
  // higher up the filesystem (e.g. a package-lock.json in a parent folder).
  turbopack: {
    root: path.resolve(__dirname),
  },

  // Keep pdf-parse (and its pdfjs-dist worker) out of the server bundle.
  // pdf-parse loads its worker via a path relative to its own module file;
  // when the bundler inlines it into .next/chunks the worker .mjs isn't
  // emitted alongside, so resume parsing dies with "Cannot find module
  // …/pdf.worker.mjs". Externalizing makes Node load it straight from
  // node_modules, where the worker file resolves correctly.
  //
  // @napi-rs/canvas is an optional native (.node) dependency of pdfjs.
  // Turbopack can't place a native binary in an ESM chunk ("non-ecmascript
  // placeable asset"), which fails the production build. Next auto-
  // externalizes plain `canvas` but not `@napi-rs/canvas`, so list it here.
  // mammoth (DOCX text extraction) is likewise a Node-only library.
  serverExternalPackages: [
    "pdf-parse",
    "pdfjs-dist",
    "@napi-rs/canvas",
    "mammoth",
  ],

  // NOTE - deliberately NOT using outputFileTracingIncludes to ship
  // pdfjs's worker (pdf.worker.mjs). pdfjs loads it via a runtime-computed
  // dynamic import that the tracer can't see, so it's absent in the
  // deployed function and pdf-parse throws:
  //   Setting up fake worker failed: "Cannot find module .../pdf.worker.mjs"
  //
  // Forcing it into the trace was tried and made things worse: the worker
  // is 2 MB, pnpm exposes it under three paths, and the tracer also drags
  // in its 5.1 MB source map - ~21 MB per route. Scoped to all routes that
  // was ~1 GB of packaging and the Vercel builder died with a bare
  // "unexpected error" (build compiled fine, then the process was killed
  // mid-output). Narrowing to five routes still crashed it.
  //
  // It isn't needed anyway: extractResumeText() catches the parser failure
  // and transcribes the PDF with the vision model instead, so resumes are
  // still read - just via an AI call rather than the local fast path.
  // Keep it that way unless you can verify a fix against a real deploy.

  // Strip the framework-fingerprint response header.
  poweredByHeader: false,

  // Security headers. HSTS is added automatically by Vercel
  // for HTTPS domains. CSP is intentionally not set here yet; adding a
  // strict CSP needs an allowlist of every origin the app loads from
  // (Supabase project URL, fonts, etc.) and a report-only rollout. The
  // three headers below are universally safe.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
