"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, homeFor } from "@/lib/auth-context";
import { useAuthModal } from "@/lib/auth-modal-context";
import { Spinner } from "@/components/ui";

export default function Home() {
  const { fbUser, profile, loading } = useAuth();
  const { openAuth } = useAuthModal();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!fbUser) {
      router.replace("/play");
    } else if (!profile) {
      router.replace("/play");
      openAuth("complete");
    } else {
      router.replace(homeFor(profile.role));
    }
  }, [loading, fbUser, profile, router, openAuth]);

  return <Spinner label="BETESE Aviator" />;
}
