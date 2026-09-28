"use client";

import Link from "next/link";
import { MessageCircle, Phone } from "lucide-react";
import {
  customerCareTelUrl,
  customerCareWhatsAppUrl,
  formatCustomerCarePhone,
} from "@/lib/customerCare";
import { qtechCdnLobbyImage } from "@/lib/games/qtechImages";
import { useCustomerCare } from "@/lib/useCustomerCare";

const CLAIM_MESSAGE =
  "Hello BETESE, I want my free spin on Spin My Drink and my Aviator free spin. I also want to play Chicken Road 2.";

const OFFERS = [
  {
    id: "spin-my-drink",
    kicker: "Free spin",
    name: "Spin My Drink",
    detail: "New game. Tap the bottle and pick UP or DOWN. Claim your free spin, then play.",
    href: "/play/game/qt-wso-spinmydrink",
    qtechId: "WSO-spinmydrink",
    playLabel: "Play Spin My Drink",
  },
  {
    id: "aviator",
    kicker: "Free spin",
    name: "Aviator",
    detail: "Claim your Aviator free spin, then cash out before the crash.",
    href: "/play/game/qt-spb-aviator",
    qtechId: "",
    playLabel: "Play Aviator",
  },
] as const;

const NEW_GAMES = [
  { name: "Spin My Drink", href: "/play/game/qt-wso-spinmydrink", qtechId: "WSO-spinmydrink" },
  { name: "New Aviator", href: "/play/game/qt-avr-aviator", qtechId: "AVR-aviator" },
  { name: "Chicken Royal", href: "/play/game/qt-iog-chickenroyal", qtechId: "IOG-chickenroyal" },
  { name: "Chicken Road 2", href: "/play/game/qt-iog-chickenroad2", qtechId: "IOG-chickenroad2" },
] as const;

export function NewGamesPromo() {
  const care = useCustomerCare();
  const phoneLabel = formatCustomerCarePhone(care.whatsapp || care.phone);
  const telUrl = customerCareTelUrl(care.phone);
  const waUrl = customerCareWhatsAppUrl(care.whatsapp || care.phone, CLAIM_MESSAGE);

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80">
      <div className="border-b border-white/10 bg-gradient-to-r from-red-800 via-rose-950 to-blue-950 px-4 py-4 sm:px-5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-betese-yellow">
          New games promo
        </p>
        <h2 className="mt-1 text-lg font-black text-white sm:text-xl">
          Free spin on Spin My Drink and Aviator
        </h2>
        <p className="mt-1 max-w-2xl text-xs text-white/80 sm:text-sm">
          Spin My Drink, Aviator, Chicken Royal and Chicken Road 2 are live. WhatsApp or call
          {phoneLabel ? ` ${phoneLabel}` : ""} to claim, then open the game.
        </p>
      </div>

      <div className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
        {OFFERS.map((offer) => (
          <article
            key={offer.id}
            className="overflow-hidden rounded-xl border border-white/10 bg-black/40"
          >
            <div className="flex gap-3 p-3">
              {offer.qtechId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={qtechCdnLobbyImage(offer.qtechId)}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-lg bg-gradient-to-br from-red-600 via-rose-800 to-black text-center">
                  <span className="text-[8px] font-black uppercase tracking-wide text-betese-yellow">Free</span>
                  <span className="text-[11px] font-black leading-none text-white">SPIN</span>
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-wide text-betese-yellow">
                  {offer.kicker}
                </p>
                <h3 className="text-sm font-black text-white">{offer.name}</h3>
                <p className="mt-0.5 text-xs leading-snug text-white/70">{offer.detail}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 px-3 pb-3">
              <Link
                href={offer.href}
                className="inline-flex items-center justify-center rounded-lg bg-[var(--lobby-accent)] px-3 py-2 text-center text-xs font-black uppercase tracking-wide text-black hover:brightness-110"
              >
                {offer.playLabel}
              </Link>
              {waUrl ? (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25"
                >
                  <MessageCircle size={14} />
                  WhatsApp
                </a>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 px-4 py-3">
        <p className="text-xs text-white/70">
          Claim on WhatsApp or by phone
          {phoneLabel ? <span className="font-semibold text-white"> {phoneLabel}</span> : null}
        </p>
        <div className="flex gap-2">
          {waUrl ? (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25"
            >
              <MessageCircle size={14} />
              WhatsApp
            </a>
          ) : null}
          {telUrl ? (
            <a
              href={telUrl}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/15 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-sky-500/25"
            >
              <Phone size={14} />
              Call
            </a>
          ) : null}
        </div>
      </div>

      <div className="border-t border-white/10 px-4 py-3">
        <p className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
          Start playing the new games
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {NEW_GAMES.map((game) => (
            <Link
              key={game.href}
              href={game.href}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2 py-2 hover:bg-white/10"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qtechCdnLobbyImage(game.qtechId)}
                alt=""
                className="h-9 w-9 shrink-0 rounded-md object-cover"
              />
              <span className="text-xs font-bold text-white">{game.name}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
