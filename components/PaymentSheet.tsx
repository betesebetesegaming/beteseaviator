'use client';

import React, { useEffect, useRef, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firestore';
import { PHONE_HINT, normalizeGambiaPhone } from "@/lib/gambiaPhone";
import { apiUrl } from "@/lib/apiUrl";
import { subscribeDepositById } from "@/lib/payments/rtdbClient";
import { isTerminalDepositStatus, startDepositReconcilePolling } from "@/lib/payments/reconcileDeposits";
import { NumericKeypad } from "@/components/ui/NumericKeypad";

type Method = 'AfriMoney' | 'Wave' | 'APS' | 'QMoney' | 'Card';

interface PaymentUser {
  id: string;
  name: string;
  phone?: string;
  walletBalance?: number;
}

interface PaymentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  user: PaymentUser;
  /** Optional prefilled amount (e.g. shortfall when funding a bet) */
  initialAmount?: number;
  minDeposit?: number;
  frozen?: boolean;
  /** Show bottom numeric keypad on mobile (game deposit). */
  floatingKeypad?: boolean;
  /** Records a pending deposit — wallet is credited only after ModemPay webhook confirmation. */
  onDepositRequest: (amount: number, method: Method, phone: string, externalRef: string) => void | Promise<void>;
}

const generateRef = () => `BETESE-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

function isMobileCheckout(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

const methodMeta: Record<Method, { logo: string; label: string; sub: string; tint: string; border: string; bg: string; powered: boolean }> = {
  AfriMoney: {
    logo: '/payment-logos/afrimoney.png',
    label: 'AfriMoney',
    sub: 'Pay from your Africell AfriMoney wallet',
    tint: 'text-purple-800',
    border: 'border-purple-400',
    bg: 'bg-purple-50',
    powered: true,
  },
  Wave: {
    logo: '/payment-logos/wave.png',
    label: 'Wave',
    sub: 'Mobile money via Wave',
    tint: 'text-blue-700',
    border: 'border-blue-400',
    bg: 'bg-blue-50',
    powered: true,
  },
  APS: {
    logo: '/payment-logos/aps.svg',
    label: 'APS Wallet',
    sub: 'Endless Possibilities wallet',
    tint: 'text-indigo-800',
    border: 'border-indigo-400',
    bg: 'bg-indigo-50',
    powered: true,
  },
  QMoney: {
    logo: '/payment-logos/qmoney.svg',
    label: 'QMoney',
    sub: 'Pay from your Qcell QMoney wallet',
    tint: 'text-emerald-800',
    border: 'border-emerald-400',
    bg: 'bg-emerald-50',
    powered: true,
  },
  Card: {
    logo: '/payment-logos/card.png',
    label: 'Debit / Credit Card',
    sub: 'Visa, Mastercard and local cards',
    tint: 'text-slate-800',
    border: 'border-slate-400',
    bg: 'bg-slate-50',
    powered: true,
  },
};

export const PaymentSheet: React.FC<PaymentSheetProps> = ({
  isOpen,
  onClose,
  user,
  initialAmount,
  minDeposit = 25,
  frozen = false,
  floatingKeypad = false,
  onDepositRequest,
}) => {
  type Stage = 'choose' | 'enter-amount' | 'paying' | 'confirm';
  const [stage, setStage] = useState<Stage>('choose');
  const [method, setMethod] = useState<Method | null>(null);
  const [amount, setAmount] = useState<number | ''>('');
  const [amountText, setAmountText] = useState('');
  const [keypadOpen, setKeypadOpen] = useState(false);
  const [phone, setPhone] = useState<string>(user.phone || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [trackingRef, setTrackingRef] = useState<string | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState<'Pending' | 'Approved' | 'Rejected' | null>(null);

  const dragStartY = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    if (!isOpen) return;
    setStage('choose');
    setMethod(null);
    setAmount(initialAmount && initialAmount > 0 ? Math.ceil(initialAmount) : '');
    setAmountText(initialAmount && initialAmount > 0 ? String(Math.ceil(initialAmount)) : '');
    setKeypadOpen(false);
    setPhone(user.phone || '');
    setBusy(false);
    setMessage(null);
    setTrackingRef(null);
    setCheckoutUrl(null);
    setLiveStatus(null);
    setDragY(0);
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, initialAmount, user.phone]);

  useEffect(() => {
    if (!trackingRef || stage !== 'confirm') return;
    setLiveStatus('Pending');
    let settled = false;

    const applyStatus = (status: string) => {
      if (status === 'Approved' || status === 'Rejected') {
        settled = true;
        setLiveStatus(status);
      }
    };

    const unsubRtdb = subscribeDepositById(trackingRef, (record) => {
      if (!record) return;
      applyStatus(String(record.status || 'Pending'));
    });

    const unsubFs = onSnapshot(doc(db, 'deposit_requests', trackingRef), (snap) => {
      if (!snap.exists()) return;
      applyStatus(String(snap.data()?.status || 'Pending'));
    });

    const stopPolling = startDepositReconcilePolling(trackingRef, () => settled, (status) => {
      if (isTerminalDepositStatus(status)) applyStatus(status);
    });

    return () => {
      settled = true;
      stopPolling();
      unsubRtdb();
      unsubFs();
    };
  }, [trackingRef, stage]);

  const handleTouchStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragStartY.current == null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy > 0) setDragY(dy);
  };
  const handleTouchEnd = () => {
    if (dragY > 120) onClose();
    setDragY(0);
    dragStartY.current = null;
  };

  const pickMethod = (m: Method) => {
    setMethod(m);
    setStage('enter-amount');
    setMessage(null);
    if (floatingKeypad) setKeypadOpen(true);
  };

  const syncAmountFromText = (text: string) => {
    setAmountText(text);
    const n = Number(text);
    setAmount(text === '' || !Number.isFinite(n) ? '' : n);
  };

  const handleModemPay = async (
    provider: 'wave' | 'aps' | 'afrimoney' | 'qmoney' | 'card',
    numAmount: number,
    cleanPhone: string,
    externalRef: string,
  ) => {
    const res = await fetch(apiUrl('/modempay-checkout'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        method: provider,
        amount: numAmount,
        customerId: user.id,
        customerName: user.name,
        customerPhone: cleanPhone,
        externalRef,
        returnUrl:
          typeof window !== 'undefined'
            ? floatingKeypad
              ? `${window.location.origin}${window.location.pathname}?deposit=${externalRef}`
              : `${window.location.origin}/play/wallet?deposit=${externalRef}`
            : undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.checkoutUrl) {
      throw new Error(data.error || 'Could not start checkout');
    }
    const labelByProvider: Record<typeof provider, Method> = {
      wave: 'Wave',
      aps: 'APS',
      afrimoney: 'AfriMoney',
      qmoney: 'QMoney',
      card: 'Card',
    };
    await onDepositRequest(numAmount, labelByProvider[provider], cleanPhone, externalRef);
    return { transactionId: externalRef, checkoutUrl: data.checkoutUrl as string };
  };

  const handlePay = async () => {
    if (!method) return;
    if (frozen) {
      setMessage({ ok: false, text: 'Contact customer service — your wallet is restricted.' });
      return;
    }
    setMessage(null);
    const numAmount = typeof amount === 'number' ? amount : Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      setMessage({ ok: false, text: 'Enter a valid amount.' });
      return;
    }
    if (numAmount < minDeposit) {
      setMessage({ ok: false, text: `Minimum deposit is ${minDeposit} GMD.` });
      return;
    }
    const normalizedPhone = normalizeGambiaPhone(phone);
    if (!normalizedPhone) {
      setMessage({ ok: false, text: PHONE_HINT });
      return;
    }

    setBusy(true);
    setStage('paying');
    const externalRef = generateRef();
    const cleanPhone = normalizedPhone.replace(/^\+220/, '').replace(/\D/g, '');

    try {
      const providerKey: 'wave' | 'aps' | 'afrimoney' | 'qmoney' | 'card' =
        method === 'Wave' ? 'wave'
        : method === 'APS' ? 'aps'
        : method === 'QMoney' ? 'qmoney'
        : method === 'Card' ? 'card'
        : 'afrimoney';
      const { checkoutUrl: url } = await handleModemPay(providerKey, numAmount, cleanPhone, externalRef);
      setCheckoutUrl(url);

      if (isMobileCheckout()) {
        try {
          sessionStorage.setItem('betese_pending_deposit', externalRef);
        } catch {
          /* ignore */
        }
        window.location.href = url;
        return;
      }

      window.open(url, '_blank', 'noopener,noreferrer');
      setTrackingRef(externalRef);
      setLiveStatus('Pending');
      setMessage({
        ok: true,
        text: `${method} checkout opened. Approve the prompt on your phone — status updates here instantly.`,
      });
      setStage('confirm');
    } catch (err: any) {
      setMessage({ ok: false, text: err?.message || 'Payment failed. Please try again.' });
      setStage('enter-amount');
    } finally {
      setBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={`fixed inset-0 ${floatingKeypad ? 'z-[90]' : 'z-[70]'} flex items-end justify-center`} role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />

      <div
        className="payment-surface relative w-full sm:max-w-lg bg-white rounded-t-3xl shadow-2xl overflow-hidden flex flex-col max-h-[min(92dvh,720px)] text-slate-900"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: dragStartY.current == null ? 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          animation: dragStartY.current == null ? 'sheet-up 320ms cubic-bezier(0.22, 1, 0.36, 1)' : undefined,
        }}
      >
        <div
          className="pt-2 pb-1 flex justify-center cursor-grab active:cursor-grabbing touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="w-10 h-1.5 rounded-full bg-gray-300" />
        </div>

        <div className="px-5 pt-2 pb-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (stage === 'choose' || stage === 'confirm') {
                  onClose();
                } else {
                  setStage('choose');
                  setMethod(null);
                  setMessage(null);
                }
              }}
              className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-slate-700"
              aria-label="Back"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.4}>
                <path strokeLinecap="round" strokeLinejoin="round" d={stage === 'choose' || stage === 'confirm' ? 'M6 6l12 12M18 6L6 18' : 'M15 18l-6-6 6-6'} />
              </svg>
            </button>
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Top up wallet</p>
              <h3 className="text-lg font-black text-slate-900 leading-tight">
                {stage === 'choose' && 'Choose payment'}
                {stage === 'enter-amount' && (method ? `Pay with ${methodMeta[method].label}` : 'Pay')}
                {stage === 'paying' && 'Processing…'}
                {stage === 'confirm' && 'Payment started'}
              </h3>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase text-slate-500">Wallet</p>
            <p className="text-sm font-black text-green-700">{(user.walletBalance ?? 0).toFixed(0)} GMD</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-3">
          {stage === 'choose' && (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">Pick how you want to pay. All payments open a secure ModemPay checkout — finish payment there and return to Betese.</p>
              {(Object.keys(methodMeta) as Method[]).map((m) => {
                const meta = methodMeta[m];
                return (
                  <button
                    key={m}
                    onClick={() => pickMethod(m)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 ${meta.border} ${meta.bg} active:scale-[0.99] transition-all shadow-sm`}
                  >
                    <div className="w-20 h-12 flex items-center justify-center bg-white rounded-xl shadow-inner overflow-hidden flex-shrink-0">
                      <img src={meta.logo} alt={meta.label} className="max-w-full max-h-full object-contain" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`text-base font-black ${meta.tint}`}>{meta.label}</p>
                      <p className="text-xs font-bold text-slate-600">{meta.sub}</p>
                      {meta.powered && (
                        <p className="mt-1 inline-block text-[9px] font-black uppercase tracking-widest text-slate-600 bg-white rounded px-1.5 py-0.5 border border-slate-200">
                          Powered by ModemPay
                        </p>
                      )}
                    </div>
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2.4}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                    </svg>
                  </button>
                );
              })}
            </div>
          )}

          {stage === 'enter-amount' && method && (
            <div className="space-y-4">
              <div className={`rounded-2xl p-4 border-2 ${methodMeta[method].border} ${methodMeta[method].bg} flex items-center gap-3`}>
                <div className="w-20 h-12 flex items-center justify-center bg-white rounded-xl shadow-inner overflow-hidden flex-shrink-0">
                  <img src={methodMeta[method].logo} alt={methodMeta[method].label} className="max-w-full max-h-full object-contain" />
                </div>
                <div>
                  <p className={`text-base font-black ${methodMeta[method].tint}`}>{methodMeta[method].label}</p>
                  <p className="text-xs font-bold text-slate-600">{methodMeta[method].sub}</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-600 mb-1">Amount (GMD)</label>
                <input
                  type="text"
                  inputMode={floatingKeypad ? "none" : "decimal"}
                  readOnly={floatingKeypad}
                  value={floatingKeypad ? amountText : amount}
                  onChange={(e) => {
                    if (floatingKeypad) return;
                    const raw = e.target.value;
                    if (raw === '') {
                      setAmount('');
                      return;
                    }
                    const n = Number(raw);
                    setAmount(Number.isFinite(n) ? n : '');
                  }}
                  onFocus={() => floatingKeypad && setKeypadOpen(true)}
                  placeholder={`Min ${minDeposit}`}
                  className="w-full p-3 border-2 border-slate-300 rounded-xl text-lg font-black text-slate-900 bg-white placeholder:text-slate-400 focus:border-betese-green focus:ring-2 focus:ring-green-600/25 focus:outline-none"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  {[25, 50, 100, 200, 500].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setAmount(preset);
                        setAmountText(String(preset));
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-black text-slate-800 border border-slate-200"
                    >
                      {preset} GMD
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-slate-600 mb-1">
                  {method === 'AfriMoney' ? 'AfriMoney phone'
                    : method === 'QMoney' ? 'QMoney phone'
                    : method === 'Card' ? 'Phone (for receipt)'
                    : 'Phone (for receipt)'}
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. 7701234"
                  className="w-full p-3 border-2 border-slate-300 rounded-xl text-lg font-bold text-slate-900 bg-white placeholder:text-slate-400 focus:border-betese-green focus:ring-2 focus:ring-green-600/25 focus:outline-none"
                />
              </div>

              {message && (
                <div className={`p-3 rounded-xl text-sm font-bold ${message.ok ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {message.text}
                </div>
              )}

              <button
                onClick={handlePay}
                disabled={busy}
                className="w-full py-4 bg-betese-green hover:bg-green-700 text-white font-black rounded-2xl shadow-xl disabled:opacity-50 active:scale-95 transition-all text-lg uppercase tracking-widest"
              >
                {busy ? 'Processing…' : `Pay with ${methodMeta[method].label}`}
              </button>
            </div>
          )}

          {stage === 'paying' && (
            <div className="py-10 text-center">
              <div className="mx-auto w-16 h-16 rounded-full border-4 border-green-600 border-t-transparent animate-spin" />
              <p className="mt-4 font-black text-slate-900">Sending your payment…</p>
              <p className="text-xs text-slate-500 mt-1">Don’t close this window.</p>
            </div>
          )}

          {stage === 'confirm' && (
            <div className="space-y-4">
              <div className={`rounded-2xl border-2 p-4 ${
                liveStatus === 'Approved' ? 'border-green-400 bg-green-50'
                : liveStatus === 'Rejected' ? 'border-red-300 bg-red-50'
                : 'border-amber-300 bg-amber-50'
              }`}>
                <div className="flex items-center gap-3">
                  {liveStatus === 'Pending' && (
                    <div className="w-10 h-10 rounded-full border-4 border-amber-500 border-t-transparent animate-spin flex-shrink-0" />
                  )}
                  {liveStatus === 'Approved' && (
                    <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                  {liveStatus === 'Rejected' && (
                    <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 text-white font-black">✕</div>
                  )}
                  <div>
                    <p className={`text-sm font-black ${
                      liveStatus === 'Approved' ? 'text-green-800'
                      : liveStatus === 'Rejected' ? 'text-red-800'
                      : 'text-amber-800'
                    }`}>
                      {liveStatus === 'Approved' ? 'Payment confirmed!'
                      : liveStatus === 'Rejected' ? 'Payment failed'
                      : 'Waiting for payment…'}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">{message?.text}</p>
                  </div>
                </div>
                {liveStatus === 'Pending' && (
                  <p className="mt-3 text-xs font-bold text-amber-700 animate-pulse">
                    Live via Firebase — no refresh needed. If payment stalls, we recheck with ModemPay every 10 seconds.
                  </p>
                )}
                {liveStatus === 'Pending' && checkoutUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isMobileCheckout()) {
                        window.location.href = checkoutUrl;
                      } else {
                        window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
                      }
                    }}
                    className="mt-3 w-full py-3 rounded-xl border-2 border-amber-400 bg-white text-amber-900 font-black text-sm uppercase tracking-wide"
                  >
                    Open checkout again
                  </button>
                )}
                {liveStatus === 'Approved' && (
                  <p className="mt-3 text-xs text-green-700 font-bold">Wallet credited. You can close this screen.</p>
                )}
              </div>
              <button
                onClick={onClose}
                className="w-full py-4 bg-betese-green hover:bg-green-700 text-white font-black rounded-2xl shadow-xl active:scale-95 transition-all text-lg uppercase tracking-widest"
              >
                {liveStatus === 'Approved' ? 'Done' : liveStatus === 'Rejected' ? 'Close' : 'Continue in background'}
              </button>
            </div>
          )}
        </div>

        {floatingKeypad && keypadOpen && stage === 'enter-amount' ? (
          <NumericKeypad
            value={amountText}
            onChange={syncAmountFromText}
            onDone={() => setKeypadOpen(false)}
          />
        ) : null}
      </div>

      <style>{`
        @keyframes sheet-up {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};
