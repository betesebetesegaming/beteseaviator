"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  const detail = error?.message?.trim();
  const serverSide = Boolean(error?.digest);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fff", color: "#111" }}>
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>This page couldn&apos;t load</h1>
            <p style={{ color: "#555", marginBottom: 16 }}>
              {serverSide
                ? "A server error occurred. Reload to try again."
                : "Reload to try again, or go back."}
            </p>
            {detail ? (
              <p
                style={{
                  fontSize: 13,
                  color: "#b91c1c",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  padding: "10px 12px",
                  marginBottom: 16,
                  wordBreak: "break-word",
                }}
              >
                {detail}
              </p>
            ) : null}
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => reset()}
                style={{
                  background: "#111",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "10px 18px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Reload
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.history.length > 1) window.history.back();
                  else window.location.href = "/play";
                }}
                style={{
                  background: "#fff",
                  color: "#111",
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  padding: "10px 18px",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Back
              </button>
            </div>
            {error.digest ? (
              <p style={{ marginTop: 20, fontSize: 11, color: "#888" }}>ERROR {error.digest}</p>
            ) : null}
          </div>
        </div>
      </body>
    </html>
  );
}
