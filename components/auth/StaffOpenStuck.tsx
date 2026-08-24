"use client";

import { Button } from "@/components/ui";

/** Shown when staff sign-in reaches /admin but the dashboard never opens. */
export function StaffOpenStuck({
  onRetry,
  onSignOut,
}: {
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-slate-950 px-5 text-center">
      <p className="text-lg font-semibold text-white">Dashboard is taking too long</p>
      <p className="max-w-sm text-sm text-slate-400">
        If Google showed a password warning, tap <span className="text-white">Close</span> — that
        message is from Google, not BETESE. Your login still worked. Then tap Retry.
      </p>
      <Button className="w-full max-w-xs" onClick={onRetry}>
        Retry
      </Button>
      <Button variant="secondary" className="w-full max-w-xs" onClick={onSignOut}>
        Sign out and try again
      </Button>
    </div>
  );
}
