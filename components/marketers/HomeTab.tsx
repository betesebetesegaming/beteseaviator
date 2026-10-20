"use client";

import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import { dateTime, mk, mkError, money, type Dashboard, type MkState, type Product, type ProductTotals } from "@/lib/marketersApi";
import { TargetCard } from "./TargetCard";
import { Btn, Choice, ErrorLine, Field, H2, Loading, Notice, Panel, Tag, TextInput } from "./ui";

const RANGES = [
  { id: "today", label: "Today" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

function ProductCard({ product, t }: { product: Product; t: ProductTotals }) {
  const label = product === "aviator" ? "Aviator" : "Football";
  return (
    <Panel className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="font-bold text-[#0b2a5b]">{label}</p>
        {t.connected ? <Tag tone="green">Connected</Tag> : <Tag tone="amber">Not connected</Tag>}
      </div>
      <p>
        <span className="text-3xl font-extrabold text-slate-900">{t.verified}</span>{" "}
        <span className="text-sm text-slate-600">verified customers</span>
      </p>
      <p className="text-xs text-slate-500">{t.recorded} recorded by marketers</p>
      {t.connected ? (
        <dl className="space-y-1 border-t border-slate-100 pt-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-600">Verified deposits</dt>
            <dd className="font-bold text-emerald-700">{money(t.depositsMinor, t.currency)}</dd>
          </div>
          <div className="flex justify-between text-xs text-slate-600">
            <dt>First deposits ({t.firstDepositCount})</dt>
            <dd>{money(t.firstDepositsMinor, t.currency)}</dd>
          </div>
          <div className="flex justify-between text-xs text-slate-600">
            <dt>Later deposits</dt>
            <dd>{money(t.subsequentDepositsMinor, t.currency)}</dd>
          </div>
          {t.reversalsMinor > 0 && (
            <div className="flex justify-between text-xs text-red-700">
              <dt>Reversals</dt>
              <dd>−{money(t.reversalsMinor, t.currency)}</dd>
            </div>
          )}
          <p className="text-xs text-slate-400">Currency: {t.currency}</p>
        </dl>
      ) : (
        <p className="border-t border-slate-100 pt-2 text-sm text-amber-800">Deposits: not connected — nothing verified yet.</p>
      )}
    </Panel>
  );
}

export function HomeTab({ state, onAddCustomer }: { state: MkState; onAddCustomer: () => void }) {
  const owner = state.me.role === "owner";
  const [range, setRange] = useState("month");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [marketerId, setMarketerId] = useState("");
  const [marketers, setMarketers] = useState<{ uid: string; name: string }[]>([]);
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestKey = JSON.stringify([range, from, to, marketerId]);
  const [loadedKey, setLoadedKey] = useState("");
  const busy = loadedKey !== requestKey;

  useEffect(() => {
    if (range === "custom" && (!from || !to)) return;
    let live = true;
    mk<Dashboard>("dashboard", { range, from, to, marketerId: marketerId || undefined, byMarketer: owner && !marketerId }).then(
      (d) => {
        if (!live) return;
        setData(d);
        setError(null);
        setLoadedKey(requestKey);
      },
      (e) => live && setError(mkError(e)),
    );
    return () => {
      live = false;
    };
  }, [range, from, to, marketerId, owner, requestKey]);

  useEffect(() => {
    if (!owner) return;
    void mk<{ rows: { uid: string; name: string }[] }>("listMarketers").then((r) => setMarketers(r.rows)).catch(() => undefined);
  }, [owner]);

  const sync = state.integrations.aviator.lastSync;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#0b2a5b]">Hello, {state.me.name.split(" ")[0]}</h1>
          <p className="text-sm text-slate-600">{owner ? "All marketers" : "Your customers"} · {data?.range.label ?? ""}</p>
        </div>
        <Btn onClick={onAddCustomer}>
          <UserPlus className="h-4 w-4" aria-hidden /> Add customer
        </Btn>
      </div>

      {!owner && <TargetCard owner={false} />}

      <Panel className="space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              aria-pressed={range === r.id}
              className={`min-h-9 rounded-full border px-3 text-sm ${range === r.id ? "border-[#0b2a5b] bg-[#0b2a5b] text-white" : "border-slate-300 bg-white text-slate-700"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="From">
              <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="To">
              <TextInput type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
        )}
        {owner && (
          <Field label="Marketer">
            <Choice value={marketerId} onChange={(e) => setMarketerId(e.target.value)}>
              <option value="">All marketers</option>
              {marketers.map((m) => (
                <option key={m.uid} value={m.uid}>
                  {m.name}
                </option>
              ))}
            </Choice>
          </Field>
        )}
        <p className="text-xs text-slate-500">Date filters apply to deposits (provider transaction time). Customer counts are all-time.</p>
      </Panel>

      <ErrorLine message={error} />
      {!data ? (
        <Loading />
      ) : (
        <div className={`space-y-4 ${busy ? "opacity-60" : ""}`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <ProductCard product="football" t={data.totals.products.football} />
            <ProductCard product="aviator" t={data.totals.products.aviator} />
          </div>
          <Panel className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-2xl font-extrabold">{data.totals.uniqueVerified}</p>
              <p className="text-xs text-slate-600">Verified customers (unique)</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold">{data.totals.both}</p>
              <p className="text-xs text-slate-600">Play both</p>
            </div>
            <div>
              <p className="text-2xl font-extrabold">{data.totals.recorded}</p>
              <p className="text-xs text-slate-600">Recorded referrals</p>
            </div>
          </Panel>
          {owner && !!data.pendingDisputes && (
            <Notice tone="amber">{data.pendingDisputes} existing-customer match(es) need your decision — see Owner → Registration reviews.</Notice>
          )}
          {data.byMarketer && (
            <Panel>
              <H2>By marketer</H2>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="text-xs text-slate-500">
                    <tr>
                      <th className="py-2">Marketer</th>
                      <th>Recorded</th>
                      <th>Verified</th>
                      <th>Both</th>
                      <th>Aviator deposits</th>
                      <th>Football deposits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byMarketer.map((m) => (
                      <tr key={m.id} className="border-t border-slate-100">
                        <td className="py-2 font-medium">
                          {m.name} {m.status !== "active" && <Tag tone="red">disabled</Tag>}
                        </td>
                        <td>{m.totals.recorded}</td>
                        <td>{m.totals.uniqueVerified}</td>
                        <td>{m.totals.both}</td>
                        <td className="text-emerald-700">{money(m.totals.products.aviator.depositsMinor)}</td>
                        <td className="text-slate-500">
                          {m.totals.products.football.connected ? money(m.totals.products.football.depositsMinor) : "Not connected"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
          <details className="text-xs text-slate-600">
            <summary className="cursor-pointer font-medium">What counts as a verified deposit?</summary>
            <p className="mt-1">{data.definition}</p>
          </details>
          <p className="text-xs text-slate-500">
            Aviator last synced: {sync ? `${dateTime(sync.lastRunAtMs)}${sync.complete ? "" : " (partial)"}` : "not yet — runs daily at 03:00"}
          </p>
        </div>
      )}
    </div>
  );
}
