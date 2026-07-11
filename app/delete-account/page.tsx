import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Delete Account — BETESE Aviator",
  description:
    "How to request deletion of your BETESE Aviator account and associated personal data.",
};

/**
 * Public account-deletion instructions for Google Play Console.
 * Paste this URL: https://www.beteseaviator.com/delete-account
 */
export default function DeleteAccountPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <article className="prose-invert space-y-6 text-slate-200">
        <header className="space-y-2 border-b border-white/10 pb-6">
          <p className="text-sm">
            <Link href="/play" className="text-emerald-400 hover:underline">
              ← Back to BETESE Aviator
            </Link>
          </p>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">
            Delete your BETESE Aviator account
          </h1>
          <p className="text-sm text-slate-400">
            BETESE Aviator · Last updated: 11 July 2026
          </p>
        </header>

        <section className="space-y-3">
          <p>
            This page explains how players of <strong>BETESE Aviator</strong>{" "}
            (beteseaviator.com) can request that their account and associated data
            are deleted.
          </p>
        </section>

        <section className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-5">
          <h2 className="text-lg font-semibold text-white">
            Steps to request account deletion
          </h2>
          <ol className="ml-5 list-decimal space-y-2">
            <li>
              Contact BETESE Customer Care using one of these channels:
              <ul className="ml-5 mt-2 list-disc space-y-1">
                <li>
                  WhatsApp:{" "}
                  <a
                    className="text-emerald-400 hover:underline"
                    href="https://wa.me/2204176003?text=Hello%20BETESE%2C%20I%20want%20to%20delete%20my%20account."
                  >
                    +220 417 6003
                  </a>
                </li>
                <li>
                  Phone:{" "}
                  <a className="text-emerald-400 hover:underline" href="tel:+2204176003">
                    +220 417 6003
                  </a>
                </li>
                <li>
                  Email:{" "}
                  <a
                    className="text-emerald-400 hover:underline"
                    href="mailto:admin@beteseaviator.com?subject=Delete%20my%20BETESE%20Aviator%20account"
                  >
                    admin@beteseaviator.com
                  </a>
                </li>
              </ul>
            </li>
            <li>
              Say clearly that you want to <strong>delete your BETESE Aviator account</strong>.
            </li>
            <li>
              Provide your registered <strong>phone number</strong> and{" "}
              <strong>Player ID</strong> (if you know it) so we can verify it is your
              account.
            </li>
            <li>
              We will confirm your identity (for example with a one-time code to your
              phone) and process the deletion request.
            </li>
            <li>
              You will receive confirmation when the account has been closed and
              personal data has been deleted or anonymised where required.
            </li>
          </ol>
          <p className="text-sm text-slate-300">
            Please withdraw any remaining wallet balance before requesting deletion,
            where possible. If a balance remains, we will explain how it will be
            handled when we process your request.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">
            What data is deleted
          </h2>
          <p>When your deletion request is completed, we delete or anonymise:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Your account profile (name, phone number, Player ID linkage)</li>
            <li>Sign-in credentials</li>
            <li>Wallet balance records tied to your account (after any required settlement)</li>
            <li>Marketing / bonus preference data linked to your account</li>
            <li>App session and device identifiers linked to your account, where stored by us</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">
            What data may be kept (and for how long)
          </h2>
          <p>
            Some records may be kept after account deletion where we are legally
            required to retain them (for example gambling, tax, anti-money-laundering,
            fraud prevention, or dispute resolution). This typically includes:
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Transaction and payment history (deposits, withdrawals, bets, wins)</li>
            <li>Records needed to investigate fraud or comply with regulators</li>
          </ul>
          <p>
            These retained records are kept only as long as required by applicable law
            and our compliance obligations, then deleted or anonymised. They are not
            used to keep your account active or to market to you.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Timing</h2>
          <p>
            We aim to complete verified deletion requests within{" "}
            <strong>30 days</strong>. Complex cases (open disputes, pending
            withdrawals, or legal holds) may take longer; we will tell you if that
            applies.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-white">More information</h2>
          <p>
            See our{" "}
            <Link href="/privacy" className="text-emerald-400 hover:underline">
              Privacy Policy
            </Link>{" "}
            for full details on how BETESE Aviator handles personal data.
          </p>
        </section>

        <footer className="border-t border-white/10 pt-6 text-xs text-slate-500">
          BETESE Aviator · 18+ only · https://www.beteseaviator.com
        </footer>
      </article>
    </main>
  );
}
