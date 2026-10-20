"use client";

import { useEffect, useState } from "react";
import { mk, mkError, money, pct, PRODUCT_LABEL, termText, type TargetCard as Card } from "@/lib/marketersApi";
import { Btn, ErrorLine, H2, Loading, Notice, Panel, Tag } from "./ui";

const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function Bar({ value, target }: { value: number; target: number }) {
  const p = target ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div className="h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-2 rounded-full ${p >= 100 ? "bg-emerald-600" : "bg-[#0b2a5b]"}`} style={{ width: `${p}%` }} />
    </div>
  );
}

/** Permanent "My Approved Target & Commission" card. Accepting an offer happens here, never automatically. */
export function TargetCard({ marketerId, owner }: { marketerId?: string; owner: boolean }) {
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    mk<Card>("myTargetCard", marketerId ? { marketerId } : {}).then(
      (c) => live && setCard(c),
      (e) => live && setError(mkError(e)),
    );
    return () => {
      live = false;
    };
  }, [marketerId, version]);

  const act = async (action: string, data: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await mk(action, data);
      setVersion((v) => v + 1);
    } catch (e) {
      setError(mkError(e));
    } finally {
      setBusy(false);
    }
  };

  if (!card) return error ? <ErrorLine message={error} /> : <Loading />;
  const t = card.target;
  const s = card.summary;

  return (
    <Panel className="space-y-3 border-[#0b2a5b]/30">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <H2>{owner ? "Approved target & commission" : "My Approved Target & Commission"}</H2>
        {t ? <Tag tone="green">active</Tag> : <Tag tone="slate">no active agreement</Tag>}
      </div>

      {card.awaiting.map((a) => (
        <div key={a.id} className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
          <p className="font-semibold text-amber-900">{owner ? "Offer waiting for the marketer to accept" : "New agreement waiting for your acceptance"}</p>
          <ul className="ml-5 list-disc">
            {a.terms.map((term, i) => (
              <li key={i}>{termText(term)}</li>
            ))}
          </ul>
          {a.terms.map((term, i) =>
            term.type === "target_commission" && term.conditions ? (
              <ul key={`c${i}`} className="ml-5 list-disc text-slate-700">
                {term.conditions.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : null,
          )}
          <p className="text-slate-600">
            Starts {day(a.effectiveFromMs)} (or when accepted, if later) · {a.effectiveToMs ? `ends ${day(a.effectiveToMs - 1)}` : "no end date"}
          </p>
          {!owner && (
            <div className="grid grid-cols-2 gap-2">
              <Btn
                disabled={busy}
                onClick={() =>
                  window.confirm("Accept these exact terms? Earning starts now. Any later change needs a new agreement that you accept again.") &&
                  void act("acceptAgreement", { id: a.id, termsHash: a.termsHash })
                }
              >
                Accept terms
              </Btn>
              <Btn
                variant="danger"
                disabled={busy}
                onClick={() => {
                  const note = window.prompt("Why are you declining? (optional)") ?? "";
                  void act("declineAgreement", { id: a.id, note });
                }}
              >
                Decline
              </Btn>
            </div>
          )}
        </div>
      ))}

      {t ? (
        <div className="space-y-3 text-sm">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
            <dt className="text-slate-500">Products</dt>
            <dd className="font-medium">{t.products.map((p) => PRODUCT_LABEL[p]).join(" + ")}</dd>
            <dt className="text-slate-500">Period</dt>
            <dd>{t.period === "weekly" ? "Weekly (Mon–Sun)" : "Monthly"}</dd>
            <dt className="text-slate-500">Customer target</dt>
            <dd>{t.customerTarget || "—"}</dd>
            <dt className="text-slate-500">Deposit target</dt>
            <dd>{t.depositTargetMinor ? money(t.depositTargetMinor) : "—"}</dd>
            <dt className="text-slate-500">Commission</dt>
            <dd className="font-semibold text-emerald-700">
              {pct(t.rateBp)} if met · {t.missedRateBp ? pct(t.missedRateBp) : "0%"} if missed
            </dd>
            <dt className="text-slate-500">Dates</dt>
            <dd>
              {day(t.startMs)} → {t.endMs ? day(t.endMs - 1) : "open-ended"}
            </dd>
          </dl>
          {t.current && (
            <div className="space-y-2 rounded-lg bg-slate-50 p-3">
              <p className="font-semibold">
                This {t.period === "weekly" ? "week" : "month"} ({day(t.current.startMs)} – {day(t.current.endMs - 1)})
                {t.current.met ? " · target reached" : ""}
              </p>
              {t.customerTarget > 0 && (
                <div>
                  <p>
                    Customers: {t.current.newCustomers} of {t.customerTarget} · {t.current.customersRemaining} to go
                  </p>
                  <Bar value={t.current.newCustomers} target={t.customerTarget} />
                </div>
              )}
              {t.depositTargetMinor > 0 && (
                <div>
                  <p>
                    Qualifying deposits: {money(t.current.qualifyingMinor)} of {money(t.depositTargetMinor)} · {money(t.current.depositsRemainingMinor)} to go
                  </p>
                  <Bar value={t.current.qualifyingMinor} target={t.depositTargetMinor} />
                  <p className="text-xs text-slate-500">
                    {t.products.map((p) => `${PRODUCT_LABEL[p]} ${money(t.current?.qualifyingByProduct[p] ?? 0)}`).join(" · ")}
                  </p>
                </div>
              )}
            </div>
          )}
          {t.history.length > 0 && (
            <p className="text-xs text-slate-600">
              Recent periods: {t.history.map((h) => `${h.key} ${h.met ? "✓ met" : "✗ missed"}`).join(" · ")}
            </p>
          )}
          <details>
            <summary className="cursor-pointer font-medium">Qualifying conditions</summary>
            <ul className="ml-5 mt-1 list-disc text-slate-700">
              {t.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </details>
        </div>
      ) : (
        !card.awaiting.length && <Notice>No active target yet. Propose one under Business; it starts only after the owner approves and you accept.</Notice>
      )}

      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <div>
          <p className="font-bold text-amber-700">{money(s.pendingMinor)}</p>
          <p className="text-xs text-slate-600">Pending</p>
        </div>
        <div>
          <p className="font-bold text-[#0b2a5b]">{money(s.approvedMinor)}</p>
          <p className="text-xs text-slate-600">Approved</p>
        </div>
        <div>
          <p className="font-bold text-emerald-700">{money(s.paidMinor)}</p>
          <p className="text-xs text-slate-600">Paid</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1" aria-label="Badges">
        {card.badges.map((b) => (
          <span
            key={b.id}
            title={b.earned ? "Earned" : "Not yet"}
            className={`rounded-full border px-2 py-0.5 text-xs ${b.earned ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 text-slate-400"}`}
          >
            {b.earned ? "★ " : ""}
            {b.label}
          </span>
        ))}
      </div>
      <p className="text-xs text-slate-400">Earnings are bookkeeping, separate from wallets and agent commission.</p>
      <ErrorLine message={error} />
    </Panel>
  );
}
