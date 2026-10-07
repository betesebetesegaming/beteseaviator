"use client";

import Link from "next/link";
import { formatCustomerCarePhone } from "@/lib/customerCare";
import { qtechCdnLobbyImage } from "@/lib/games/qtechImages";
import { useCustomerCare } from "@/lib/useCustomerCare";

const NEW_GAMES = [
  { name: "Spin My Drink", href: "/play/game/qt-wso-spinmydrink", qtechId: "WSO-spinmydrink" },
  { name: "New Aviator", href: "/play/game/qt-avr-aviator", qtechId: "AVR-aviator" },
  { name: "Chicken Royal", href: "/play/game/qt-iog-chickenroyal", qtechId: "IOG-chickenroyal" },
  { name: "Chicken Road 2", href: "/play/game/qt-iog-chickenroad2", qtechId: "IOG-chickenroad2" },
] as const;

export function NewGamesPromo() {
  const care = useCustomerCare();
  const phoneLabel = formatCustomerCarePhone(care.phone);

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
          Spin My Drink, Aviator, Chicken Royal and Chicken Road 2 are live. Call
          {phoneLabel ? ` ${phoneLabel}` : ""} to claim, then open the game.
        </p>
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
