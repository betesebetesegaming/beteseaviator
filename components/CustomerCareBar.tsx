"use client";

import { MessageCircle, Phone } from "lucide-react";
import {
  customerCareTelUrl,
  customerCareWhatsAppUrl,
  formatCustomerCarePhone,
} from "@/lib/customerCare";
import { useCustomerCare } from "@/lib/useCustomerCare";

type Props = {
  compact?: boolean;
  className?: string;
};

export function CustomerCareBar({ compact = false, className = "" }: Props) {
  const care = useCustomerCare();
  const phoneLabel = formatCustomerCarePhone(care.phone);
  const telUrl = customerCareTelUrl(care.phone);
  const waUrl = customerCareWhatsAppUrl(
    care.whatsapp,
    "Hello BETESE Customer Care, I need help with my account."
  );

  if (!phoneLabel) return null;

  if (compact) {
    return (
      <div className={`flex flex-wrap items-center justify-center gap-2 text-xs ${className}`}>
        <span className="text-slate-500">{care.label}:</span>
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-medium text-emerald-300 hover:bg-emerald-500/20"
        >
          <MessageCircle size={12} /> WhatsApp
        </a>
        <a
          href={telUrl}
          className="inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1 font-medium text-sky-300 hover:bg-sky-500/20"
        >
          <Phone size={12} /> Call
        </a>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-center sm:px-4 ${className}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{care.label}</p>
      <p className="mt-1 text-sm font-medium text-white">{phoneLabel}</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <a
          href={waUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/25"
        >
          <MessageCircle size={16} /> WhatsApp
        </a>
        <a
          href={telUrl}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-500/35 bg-sky-500/15 px-3 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-500/25"
        >
          <Phone size={16} /> Call
        </a>
      </div>
    </div>
  );
}
