"use client";

import { Ban } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button, Card } from "@/components/ui";

export default function SuspendedPage() {
  const { logout } = useAuth();
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-md text-center">
        <Ban className="mx-auto mb-3 text-red-400" size={40} />
        <h1 className="text-xl font-semibold">Account suspended</h1>
        <p className="mt-2 text-sm text-slate-400">
          Your account has been suspended. Please contact BETESE support if you believe this is a
          mistake.
        </p>
        <Button variant="secondary" className="mt-5" onClick={logout}>
          Sign out
        </Button>
      </Card>
    </main>
  );
}
