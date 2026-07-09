"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { ShieldCheck, Send } from "lucide-react";
import { sendSignupOtp, verifySignupOtp } from "@/lib/otpClient";
import { Button, Input } from "@/components/ui";

type Props = {
  /** Customer's registered phone — the code is sent here. */
  phone?: string | null;
  customerName: string;
  verified: boolean;
  onVerified: () => void;
};

/**
 * Customer authorisation gate: sends a one-time Africell code to the customer's
 * phone, the staff enters what the customer reads back, and only a verified code
 * unlocks the wallet action. Server re-checks the code, so this is not the only
 * guard — it also drives the UX.
 */
export function CustomerOtpGate({ phone, customerName, verified, onVerified }: Props) {
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");

  const cleanPhone = (phone ?? "").trim();

  async function send() {
    if (!cleanPhone) return toast.error("Customer has no phone number on file.");
    setSending(true);
    try {
      const res = await sendSignupOtp(cleanPhone);
      if (!res.ok) return toast.error(res.error || "Could not send the code. Try again.");
      setSent(true);
      toast.success(`Code sent to ${customerName || "the customer"}'s phone.`);
    } finally {
      setSending(false);
    }
  }

  async function verify() {
    if (code.trim().length < 4) return toast.error("Enter the code the customer received.");
    setVerifying(true);
    try {
      const res = await verifySignupOtp(cleanPhone, code.trim());
      if (!res.ok) return toast.error(res.error || "Invalid code.");
      toast.success("Customer authorised.");
      onVerified();
    } finally {
      setVerifying(false);
    }
  }

  if (verified) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
        <ShieldCheck size={16} /> Customer authorised by OTP.
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-sky-500/25 bg-sky-500/5 p-3">
      <p className="text-xs text-slate-300">
        The customer must approve this with a one-time code sent to their phone
        {cleanPhone ? (
          <>
            {" "}
            (<span className="font-mono">{cleanPhone}</span>)
          </>
        ) : null}
        .
      </p>
      {!sent ? (
        <Button
          variant="secondary"
          className="w-full"
          onClick={() => void send()}
          disabled={sending || !cleanPhone}
        >
          <span className="flex items-center justify-center gap-1.5">
            <Send size={14} /> {sending ? "Sending…" : "Send code to customer"}
          </span>
        </Button>
      ) : (
        <div className="space-y-2">
          <Input
            label="Code from customer"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => void verify()} disabled={verifying}>
              {verifying ? "Checking…" : "Verify code"}
            </Button>
            <Button variant="secondary" onClick={() => void send()} disabled={sending}>
              {sending ? "…" : "Resend"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
