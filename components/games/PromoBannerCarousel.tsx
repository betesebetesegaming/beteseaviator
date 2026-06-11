"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PROMO_SLIDES, PROMO_TICKER } from "@/lib/games/promotions";

export function PromoBannerCarousel() {
  const [index, setIndex] = useState(0);
  const slides = PROMO_SLIDES;

  useEffect(() => {
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, 5500);
    return () => clearInterval(id);
  }, [slides.length]);

  const slide = slides[index];

  return (
    <section className="space-y-0 overflow-hidden rounded-2xl border border-white/10">
      {/* main hero banner */}
      <div className="relative h-36 sm:h-44 md:h-52">
        {slides.map((s, i) => (
          <div
            key={s.id}
            className={`absolute inset-0 bg-gradient-to-r ${s.gradient} transition-opacity duration-700 ${
              i === index ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_50%,rgba(255,255,0,0.12),transparent_55%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_10%_80%,rgba(0,128,0,0.2),transparent_50%)]" />
            <div className="relative flex h-full flex-col justify-center px-5 sm:px-8 md:px-10">
              <p className={`text-[10px] font-black uppercase tracking-[0.25em] ${s.accent} opacity-90`}>
                Promotion
              </p>
              <h2 className="mt-1 max-w-lg text-xl font-black text-white sm:text-2xl md:text-3xl">
                {s.title}
              </h2>
              <p className="mt-1 max-w-md text-xs text-white/75 sm:text-sm">{s.subtitle}</p>
              {s.href && s.cta && (
                <Link
                  href={s.href}
                  className="mt-3 inline-flex w-fit rounded-lg bg-betese-yellow px-4 py-1.5 text-xs font-black uppercase tracking-wide text-black transition hover:bg-yellow-300"
                >
                  {s.cta}
                </Link>
              )}
            </div>
          </div>
        ))}

        <button
          type="button"
          aria-label="Previous promotion"
          onClick={() => setIndex((i) => (i - 1 + slides.length) % slides.length)}
          className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white/80 backdrop-blur hover:bg-black/60"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          aria-label="Next promotion"
          onClick={() => setIndex((i) => (i + 1) % slides.length)}
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white/80 backdrop-blur hover:bg-black/60"
        >
          <ChevronRight size={18} />
        </button>

        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.id}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-6 bg-betese-yellow" : "w-1.5 bg-white/40"
              }`}
            />
          ))}
        </div>
      </div>

      {/* scrolling ticker */}
      <div className="relative overflow-hidden border-t border-white/10 bg-black py-2">
        <div className="animate-promo-marquee flex w-max gap-8 whitespace-nowrap px-4">
          {[...PROMO_TICKER, ...PROMO_TICKER].map((text, i) => (
            <span key={i} className="text-xs font-semibold text-betese-yellow/90">
              {text}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
