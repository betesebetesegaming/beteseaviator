"use client";

import { ShieldAlert } from "lucide-react";
import { CustomerCareBar } from "@/components/CustomerCareBar";

type Props = {
  ageConfirmed: boolean;
  onAgeConfirmedChange: (value: boolean) => void;
  showCheckbox?: boolean;
};

export function SignupComplianceNotice({
  ageConfirmed,
  onAgeConfirmedChange,
  showCheckbox = true,
}: Props) {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-3 sm:px-4">
        <div className="flex items-start gap-2.5">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-rose-300" />
          <div className="text-left text-sm text-rose-50">
            <p className="font-semibold text-rose-100">18+ only — under 18 cannot register</p>
            <p className="mt-1 text-xs leading-relaxed text-rose-100/90">
              BETESE is for adults only. You must be 18 years or older to create an account, deposit,
              bet, or withdraw real money. Gambling can be addictive — play responsibly.
            </p>
          </div>
        </div>
      </div>

      <CustomerCareBar />

      {showCheckbox ? (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-3 text-left text-sm text-slate-200">
          <input
            type="checkbox"
            checked={ageConfirmed}
            onChange={(e) => onAgeConfirmedChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-slate-900 text-emerald-500 focus:ring-emerald-500/40"
          />
          <span>
            I confirm I am <strong>18 years or older</strong> and eligible to open a real-money
            betting account in The Gambia.
          </span>
        </label>
      ) : null}
    </div>
  );
}
