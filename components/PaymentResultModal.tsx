'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { XCircle } from 'lucide-react';
import type { PaymentResultPayload } from "@/lib/paymentResultPayload";

// Re-export so existing callers that import these from PaymentResultModal
// keep working without changes.
export type { PaymentResultKind, PaymentResultPayload } from "@/lib/paymentResultPayload";
export { buildDepositResult, buildWithdrawalResult } from "@/lib/paymentResultPayload";

const Lottie = dynamic(() => import('lottie-react'), { ssr: false });

interface PaymentResultModalProps {
  result: PaymentResultPayload | null;
  onClose: () => void;
}

export const PaymentResultModal: React.FC<PaymentResultModalProps> = ({ result, onClose }) => {
  const [animationData, setAnimationData] = useState<object | null>(null);

  useEffect(() => {
    if (result?.kind !== 'success') return;
    let cancelled = false;
    fetch('/animations/payment-success.json')
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setAnimationData(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [result?.kind]);

  useEffect(() => {
    if (!result) return;
    const timer = window.setTimeout(onClose, result.kind === 'success' ? 6000 : 7000);
    return () => window.clearTimeout(timer);
  }, [result, onClose]);

  return (
    <AnimatePresence>
      {result && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="payment-result-title"
        >
          <div className="absolute inset-0 bg-black/65 backdrop-blur-sm" onClick={onClose} />

          <motion.div
            className="relative w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden"
            initial={{ scale: 0.85, y: 24, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.9, y: 12, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          >
            <div className={`px-6 pt-8 pb-6 text-center ${result.kind === 'success' ? 'bg-gradient-to-b from-green-50 to-white' : 'bg-gradient-to-b from-red-50 to-white'}`}>
              <div className="mx-auto w-40 h-40 flex items-center justify-center">
                {result.kind === 'success' && animationData ? (
                  <Lottie animationData={animationData} loop={false} className="w-full h-full" />
                ) : result.kind === 'success' ? (
                  <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center">
                    <svg viewBox="0 0 24 24" className="w-10 h-10 text-white" fill="none" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                ) : (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                    className="w-24 h-24 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-200"
                  >
                    <XCircle className="w-14 h-14 text-white" strokeWidth={2.2} />
                  </motion.div>
                )}
              </div>

              <h2
                id="payment-result-title"
                className={`mt-2 text-2xl font-black tracking-tight ${result.kind === 'success' ? 'text-green-800' : 'text-red-800'}`}
              >
                {result.title}
              </h2>
              <p className="mt-2 text-sm font-medium text-gray-600 leading-relaxed">{result.message}</p>

              {(result.amount != null || result.method) && (
                <div className="mt-4 inline-flex flex-col gap-1 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-left min-w-[220px]">
                  {result.method && (
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Method</p>
                  )}
                  {result.method && <p className="text-sm font-black text-betese-dark">{result.method}</p>}
                  {result.amount != null && (
                    <>
                      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mt-1">Amount</p>
                      <p className="text-xl font-black text-betese-dark">{result.amount.toFixed(0)} GMD</p>
                    </>
                  )}
                  {result.reference && (
                    <p className="text-[10px] text-gray-400 mt-1 truncate">Ref: {result.reference}</p>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 pb-6">
              <button
                type="button"
                onClick={onClose}
                className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-white shadow-xl active:scale-[0.98] transition-transform ${
                  result.kind === 'success' ? 'bg-betese-green' : 'bg-red-600'
                }`}
              >
                {result.kind === 'success' ? 'Great!' : 'Close'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

