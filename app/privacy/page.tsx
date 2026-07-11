import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — BETESE Aviator",
  description:
    "How BETESE Aviator collects, uses, and protects your personal and device data.",
};

/**
 * Public privacy policy — paste this URL into Google Play / App Store listings:
 * https://www.beteseaviator.com/privacy
 */
export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <article className="prose-invert space-y-6 text-slate-200">
        <header className="space-y-2 border-b border-white/10 pb-6">
          <p className="text-sm">
            <Link href="/play" className="text-emerald-400 hover:underline">
              ← Back to BETESE Aviator
            </Link>
          </p>
          <h1 className="text-2xl font-bold text-white sm:text-3xl">Privacy Policy</h1>
          <p className="text-sm text-slate-400">BETESE Aviator · Last updated: 11 July 2026</p>
        </header>

        <Section title="1. Who we are">
          <p>
            BETESE Aviator (&ldquo;BETESE&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;,
            &ldquo;our&rdquo;) operates the real-money gaming website and app at{" "}
            <strong>beteseaviator.com</strong> and related domains.
          </p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Operator: BETESE Aviator</li>
            <li>Website: https://www.beteseaviator.com</li>
            <li>
              Customer Care: WhatsApp and phone{" "}
              <a className="text-emerald-400 hover:underline" href="https://wa.me/2204176003">
                +220 417 6003
              </a>
            </li>
            <li>
              Privacy / support email:{" "}
              <a className="text-emerald-400 hover:underline" href="mailto:admin@beteseaviator.com">
                admin@beteseaviator.com
              </a>
            </li>
          </ul>
          <p>
            This policy explains what personal data we collect, why, how we use and share it, and
            the rights you have. It applies to customers (players), agents, and marketers who use
            our service.
          </p>
        </Section>

        <Section title="2. Who can use BETESE (18+ only)">
          <p>
            BETESE is for adults only. You must be <strong>18 years or older</strong> to register,
            deposit, bet, or withdraw real money in The Gambia. If we learn that an account belongs
            to someone under 18, we will close it and handle any funds in line with our terms and
            applicable law. Gambling can be addictive — please play responsibly.
          </p>
        </Section>

        <Section title="3. What personal data we collect">
          <h3 className="font-semibold text-white">a) Information you give us</h3>
          <ul className="ml-5 list-disc space-y-1">
            <li>Full name</li>
            <li>Mobile phone number (used to sign in and to receive one-time codes)</li>
            <li>
              Password (stored only in hashed/encrypted form — we never store it in plain text and
              cannot see it)
            </li>
            <li>Your confirmation that you are 18 or older and eligible to play in The Gambia</li>
            <li>Any information you give us when you contact Customer Care</li>
          </ul>
          <h3 className="font-semibold text-white">b) Account and gameplay information we generate</h3>
          <ul className="ml-5 list-disc space-y-1">
            <li>Your Player ID and account status</li>
            <li>Wallet balance and transaction history (deposits, withdrawals, bets, wins, bonuses)</li>
            <li>Game activity (games played, stakes, results, session times)</li>
            <li>Referral relationships and any agent or marketer linked to your account</li>
          </ul>
          <h3 className="font-semibold text-white">c) Payment information</h3>
          <p>
            Deposits and withdrawals are processed by our payment partner <strong>ModemPay</strong>.
            Payment details you enter are handled by the payment provider; we receive transaction
            records (amount, status, reference) but not your full payment credentials. For
            over-the-counter (cash desk) transactions handled by an agent, we record the amount, the
            agent involved, and a withdrawal code.
          </p>
          <h3 className="font-semibold text-white">d) Verification data</h3>
          <p>
            One-time passcodes (OTPs) sent by SMS to your registered phone number to verify your
            identity and to authorise cash transactions.
          </p>
          <h3 className="font-semibold text-white">e) Technical and device data</h3>
          <ul className="ml-5 list-disc space-y-1">
            <li>IP address, device and browser type, and similar technical identifiers</li>
            <li>App / device identifiers used to keep you signed in and operate the service</li>
            <li>Cookies and local storage used to keep you signed in and operate the site</li>
          </ul>
        </Section>

        <Section title="4. How we use your data">
          <ul className="ml-5 list-disc space-y-1">
            <li>Create and manage your account and verify your identity and age</li>
            <li>Let you deposit, place bets, play games, and withdraw winnings</li>
            <li>Send one-time codes and authorise sensitive actions such as cash deposits and withdrawals</li>
            <li>Keep records of transactions and prevent fraud, money laundering, and abuse</li>
            <li>Provide Customer Care and respond to your requests</li>
            <li>Operate our agent/marketer and referral programmes and calculate commissions</li>
            <li>Improve the service and, where enabled, offer personalised bonuses and promotions</li>
            <li>Meet our legal, regulatory, tax, and responsible-gambling obligations</li>
          </ul>
        </Section>

        <Section title="5. Automated processing and personalised offers (“Smart Bonus”)">
          <p>
            Where enabled, we use an automated system that analyses your account activity (such as
            how often and how much you play and deposit) to decide which bonuses, rewards, or
            promotions to offer you. This is used only to tailor offers and retention rewards — it
            does <strong>not</strong> decide whether you can withdraw your money or close your
            account. If you would like a human to review an offer decision, contact Customer Care.
          </p>
        </Section>

        <Section title="6. When we share your data">
          <p>We do not sell your personal data. We share it only as needed to run the service:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li><strong>Payment provider (ModemPay)</strong> — to process deposits and withdrawals.</li>
            <li>
              <strong>Game provider / aggregator (QTech Games and its game studios)</strong> — to
              launch games and record bets, wins, and game sessions.
            </li>
            <li><strong>SMS / OTP provider</strong> — to deliver one-time codes to your phone.</li>
            <li>
              <strong>Hosting and infrastructure (Vercel; Google Firebase / Google Cloud)</strong> —
              who host the app and store account records on our behalf.
            </li>
            <li>
              <strong>Agents and marketers</strong> — an agent or marketer linked to your account
              can see limited account information (Player ID, name, phone, balance, and cash
              transactions they handle) to serve you at the shop.
            </li>
            <li>
              <strong>Authorities and regulators</strong> — where required by law, licence
              conditions, fraud prevention, or anti-money-laundering rules.
            </li>
            <li>
              <strong>Professional advisers or in a business transfer</strong> — e.g. auditors, or if
              the business is reorganised or sold.
            </li>
          </ul>
        </Section>

        <Section title="7. International transfers">
          <p>
            Some of our service providers (for example hosting and database services) may store or
            process data on servers <strong>outside The Gambia</strong>. Where this happens, we take
            reasonable steps to ensure your data remains protected to a comparable standard.
          </p>
        </Section>

        <Section title="8. How long we keep your data">
          <p>
            We keep your account and transaction data for as long as your account is active and for
            as long afterwards as we are required to by law, tax, licensing, and
            anti-money-laundering rules, and to resolve disputes and prevent fraud. When data is no
            longer needed, we delete or anonymise it.
          </p>
        </Section>

        <Section title="9. Cookies and local storage">
          <p>
            We use cookies and browser local storage to keep you signed in, remember your session,
            operate core features, and keep the service secure. Essential cookies are required for
            the site to work. You can control cookies in your browser settings, but disabling
            essential cookies may stop you from signing in or playing.
          </p>
        </Section>

        <Section title="10. How we protect your data">
          <ul className="ml-5 list-disc space-y-1">
            <li>Passwords are stored hashed — never in plain text.</li>
            <li>Sensitive actions (cash deposits and withdrawals) require a one-time code sent to your phone.</li>
            <li>Access to customer data is restricted by role (customer, agent, admin).</li>
            <li>Data is transmitted over encrypted connections (HTTPS).</li>
          </ul>
          <p>
            No system is 100% secure. Keep your password and one-time codes private — BETESE staff
            and agents will <strong>never</strong> ask you for your password, and you should only
            share a one-time code to authorise a transaction you have requested.
          </p>
        </Section>

        <Section title="11. Your rights">
          <p>Subject to applicable law, you may:</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Ask for a copy of the personal data we hold about you</li>
            <li>Ask us to correct inaccurate information</li>
            <li>Ask us to delete your data (where we are not legally required to keep it)</li>
            <li>Object to or ask us to limit certain uses of your data</li>
            <li>Withdraw consent to marketing at any time</li>
          </ul>
          <p>
            To make a request, email{" "}
            <a className="text-emerald-400 hover:underline" href="mailto:admin@beteseaviator.com">
              admin@beteseaviator.com
            </a>{" "}
            or contact Customer Care on WhatsApp/phone +220 417 6003. We may need to verify your
            identity before acting on a request.
          </p>
        </Section>

        <Section title="12. Marketing">
          <p>
            We may send you promotional messages about bonuses and offers. You can opt out at any
            time by contacting Customer Care. We will still send you essential service messages
            (such as one-time codes and transaction confirmations).
          </p>
        </Section>

        <Section title="13. Responsible gambling">
          <p>
            We are committed to responsible gambling. If you feel you are losing control, contact
            Customer Care to ask about limits or self-exclusion, and consider seeking support.
            Gambling is for entertainment and can be addictive — never bet more than you can afford
            to lose.
          </p>
        </Section>

        <Section title="14. Children">
          <p>
            The service is strictly 18+. We do not knowingly collect data from anyone under 18.
          </p>
        </Section>

        <Section title="15. Changes to this policy">
          <p>
            We may update this policy from time to time. We will post the updated version here with
            a new &ldquo;Last updated&rdquo; date, and where changes are significant we will notify
            you in the app.
          </p>
        </Section>

        <Section title="16. Contact us">
          <ul className="ml-5 list-disc space-y-1">
            <li>
              Email:{" "}
              <a className="text-emerald-400 hover:underline" href="mailto:admin@beteseaviator.com">
                admin@beteseaviator.com
              </a>
            </li>
            <li>
              Customer Care:{" "}
              <a className="text-emerald-400 hover:underline" href="https://wa.me/2204176003">
                WhatsApp +220 417 6003
              </a>{" "}
              /{" "}
              <a className="text-emerald-400 hover:underline" href="tel:+2204176003">
                Call +220 417 6003
              </a>
            </li>
            <li>Website: https://www.beteseaviator.com</li>
          </ul>
        </Section>

        <footer className="border-t border-white/10 pt-6 text-xs text-slate-500">
          BETESE Aviator is intended for use only where real-money gaming is legal and only by
          persons aged 18 or over.
        </footer>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      {children}
    </section>
  );
}
