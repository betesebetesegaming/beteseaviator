"use client";

import QRCode from "react-qr-code";

type Props = {
  value: string;
  label?: string;
  size?: number;
};

/** Scannable QR for agent / player signup links. */
export function ReferralQrCode({ value, label, size = 148 }: Props) {
  if (!value.trim()) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="rounded-xl border border-white/10 bg-white p-2.5 shadow-lg">
        <QRCode value={value} size={size} level="M" bgColor="#ffffff" fgColor="#0f172a" />
      </div>
      {label ? (
        <p className="max-w-[180px] text-center text-[10px] leading-snug text-slate-500">{label}</p>
      ) : null}
    </div>
  );
}
