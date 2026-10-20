import { getPublicEnvForInjection } from "@/lib/env/publicConfig";

const PRODUCTION_PROJECT = "beteseaviator-a05ae";

/** True only in builds that set NEXT_PUBLIC_TEST_ENV=1 (the marketer test preview). Production never sets it. */
export function isTestEnv(): boolean {
  return process.env.NEXT_PUBLIC_TEST_ENV === "1";
}

/**
 * Fixed "TEST — NO REAL PAYMENTS" label on every page of a test build. If a test build is ever
 * pointed at the production Firebase project, it says so in red instead.
 */
export function TestEnvBanner() {
  if (!isTestEnv()) return null;
  const projectId = getPublicEnvForInjection().NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const misconfigured = projectId === PRODUCTION_PROJECT;
  return (
    <div
      role="status"
      className={`pointer-events-none fixed inset-x-0 top-0 z-[1000] py-0.5 text-center text-[11px] font-bold tracking-wide ${misconfigured ? "bg-red-600 text-white" : "bg-yellow-300 text-black"}`}
    >
      {misconfigured ? `MISCONFIGURED TEST BUILD — POINTS AT PRODUCTION (${projectId})` : `TEST — NO REAL PAYMENTS · ${projectId}`}
    </div>
  );
}
