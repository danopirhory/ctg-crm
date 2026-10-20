"use client";

import { useEffect } from "react";

// Last-resort boundary: catches errors in the root layout. Must render its
// own <html> / <body> because the root layout failed to render.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 16,
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          backgroundColor: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <div
          style={{
            maxWidth: 480,
            padding: 24,
            backgroundColor: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
          }}
        >
          <h1 style={{ marginTop: 0, fontSize: 20 }}>
            The application couldn&apos;t load
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.5 }}>
            Something went wrong while starting the CRM. Try again, and if it
            keeps happening, share the error ID below with your admin.
          </p>
          {error.digest ? (
            <p style={{ fontSize: 12, color: "#475569" }}>
              Error ID: <code>{error.digest}</code>
            </p>
          ) : null}
          <button
            onClick={reset}
            style={{
              marginTop: 8,
              padding: "8px 12px",
              backgroundColor: "#0f172a",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
