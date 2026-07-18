"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { activeLobbySlides, lobbyTicker, subscribeLobbyPromos } from "@/lib/promotions/lobbyPromos";
import { type LobbyPromoConfig, type PromoSlide } from "@/lib/games/promotions";

function SlideLayer({ slide }: { slide: PromoSlide }) {
  const [imageFailed, setImageFailed] = useState(false);
  const imageUrl = slide.imageUrl?.trim() || "";
  const showImage = Boolean(imageUrl) && !imageFailed;
  const showCopy = !showImage;

  const inner = (
    <>
      {/* Always paint a gradient so a broken/missing banner never leaves a blank gap */}
      <div className={`absolute inset-0 bg-gradient-to-r ${slide.gradient || "from-slate-800 via-slate-900 to-black"}`} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_50%,rgba(255,255,0,0.12),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_10%_80%,rgba(0,128,0,0.2),transparent_50%)]" />

      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={slide.title || "Promotion"}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          onError={() => setImageFailed(true)}
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
      ) : null}

      {showCopy ? (
        <div className="relative flex h-full flex-col justify-center px-5 sm:px-8 md:px-10">
          <p className={`text-[10px] font-black uppercase tracking-[0.25em] ${slide.accent || "text-betese-yellow"} opacity-90`}>
            Promotion
          </p>
          <h2 className="mt-1 max-w-lg text-xl font-black text-white drop-shadow sm:text-2xl md:text-3xl">
            {slide.title || "Welcome to BETESE"}
          </h2>
          <p className="mt-1 max-w-md text-xs text-white/90 drop-shadow sm:text-sm">
            {slide.subtitle || "Top up with Wave & AfriMoney — play QTech games"}
          </p>
          {slide.href && slide.cta ? (
            <Link
              href={slide.href}
              className="mt-3 inline-flex w-fit rounded-lg bg-[var(--lobby-accent)] px-4 py-1.5 text-xs font-black uppercase tracking-wide text-black transition hover:brightness-110"
            >
              {slide.cta}
            </Link>
          ) : (
            <Link
              href="/play/wallet"
              className="mt-3 inline-flex w-fit rounded-lg bg-[var(--lobby-accent)] px-4 py-1.5 text-xs font-black uppercase tracking-wide text-black transition hover:brightness-110"
            >
              Top up wallet
            </Link>
          )}
        </div>
      ) : null}
    </>
  );

  if (showImage && slide.href) {
    return (
      <Link href={slide.href} className="absolute inset-0 block" aria-label={slide.title || "Promotion"}>
        {inner}
      </Link>
    );
  }

  return <div className="absolute inset-0">{inner}</div>;
}

export function PromoBannerCarousel() {
  const [index, setIndex] = useState(0);
  /** null until Firestore responds — defaults still render so the lobby never shows an empty banner gap. */
  const [config, setConfig] = useState<LobbyPromoConfig | null>(null);

  useEffect(() => subscribeLobbyPromos((next) => setConfig(next)), []);

  const slides = useMemo(() => activeLobbySlides(config), [config]);
  const ticker = useMemo(() => lobbyTicker(config), [config]);

  const slideKey = useMemo(() => slides.map((s) => s.id).join("|"), [slides]);

  useEffect(() => {
    setIndex(0);
  }, [slideKey]);

  useEffect(() => {
    slides.forEach((slide) => {
      if (!slide.imageUrl?.trim()) return;
      const img = new Image();
      img.src = slide.imageUrl;
    });
  }, [slides]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, 5500);
    return () => clearInterval(id);
  }, [slides.length]);

  if (slides.length === 0) return null;

  const activeSlide = slides[index];
  if (!activeSlide) return null;

  return (
    <section className="space-y-0 overflow-hidden rounded-2xl border border-white/10">
      <div className="relative w-full aspect-[1920/360] max-h-[360px] bg-slate-900">
        <SlideLayer key={activeSlide.id} slide={activeSlide} />

        {slides.length > 1 ? (
          <>
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
                    i === index ? "w-6 bg-[var(--lobby-accent)]" : "w-1.5 bg-white/40"
                  }`}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>

      <div className="relative overflow-hidden border-t border-white/10 bg-black py-2">
        <div className="animate-promo-marquee flex w-max gap-8 whitespace-nowrap px-4">
          {[...ticker, ...ticker].map((text, i) => (
            <span key={i} className="text-xs font-semibold text-[color-mix(in_srgb,var(--lobby-accent)_90%,white)]">
              {text}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
