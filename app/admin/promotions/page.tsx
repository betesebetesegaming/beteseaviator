"use client";

import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { ImagePlus, Plus, Trash2, Upload } from "lucide-react";
import { db } from "@/lib/firebase";
import { adminSaveLobbyPromos, errorMessage } from "@/lib/api";
import { gamePlayPath } from "@/lib/games/api";
import { filterLobbyGames } from "@/lib/games/catalog";
import { PROMO_TICKER, type LobbyPromoConfig, type PromoSlide } from "@/lib/games/promotions";
import { subscribeLobbyPromos, uploadPromoBannerImage } from "@/lib/promotions/lobbyPromos";
import type { Game } from "@/lib/types";
import { Button, Card, Input } from "@/components/ui";

const EMPTY_SLIDE = (): PromoSlide => ({
  id: `promo-${Date.now()}`,
  title: "",
  subtitle: "",
  cta: "Play now",
  href: "/play",
  gradient: "from-emerald-700 via-emerald-900 to-black",
  accent: "text-betese-yellow",
  active: true,
  sortOrder: 0,
});

export default function AdminPromotionsPage() {
  const [config, setConfig] = useState<LobbyPromoConfig | null>(null);
  const [slides, setSlides] = useState<PromoSlide[]>([]);
  const [tickerText, setTickerText] = useState("");
  const [games, setGames] = useState<Game[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  useEffect(() => subscribeLobbyPromos(setConfig), []);

  useEffect(() => {
    if (config) {
      setSlides(config.slides?.length ? config.slides : [EMPTY_SLIDE()]);
      setTickerText((config.ticker ?? PROMO_TICKER).join("\n"));
    } else {
      setSlides([
        {
          id: "aviator-launch",
          title: "Fly high with Aviator",
          subtitle: "Cash out before the crash — win real GMD on BETESE",
          cta: "Play now",
          href: "/play/game/aviator",
          imageUrl: "/promotions/aviator-ad.png",
          gradient: "from-red-700 via-rose-900 to-black",
          accent: "text-betese-yellow",
          active: true,
          sortOrder: 0,
        },
      ]);
      setTickerText(PROMO_TICKER.join("\n"));
    }
  }, [config]);

  useEffect(() => {
    const q = query(collection(db, "games"), where("status", "==", "active"));
    return onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Game);
      setGames(filterLobbyGames(all));
    });
  }, []);

  const previewSlides = useMemo(
    () => slides.filter((s) => s.active !== false).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [slides]
  );

  function updateSlide(id: string, patch: Partial<PromoSlide>) {
    setSlides((rows) => rows.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function removeSlide(id: string) {
    setSlides((rows) => rows.filter((s) => s.id !== id));
  }

  function addSlide() {
    setSlides((rows) => [...rows, { ...EMPTY_SLIDE(), sortOrder: rows.length }]);
  }

  async function onUploadImage(slideId: string, file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file (JPG, PNG, WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5 MB.");
      return;
    }
    setUploadingId(slideId);
    try {
      const url = await uploadPromoBannerImage(file, slideId);
      updateSlide(slideId, { imageUrl: url });
      toast.success("Banner image uploaded.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploadingId(null);
    }
  }

  async function save() {
    const cleaned = slides
      .map((s, i) => ({
        ...s,
        title: s.title.trim(),
        subtitle: s.subtitle.trim(),
        sortOrder: i,
      }))
      .filter((s) => s.title || s.imageUrl);

    if (cleaned.length === 0) {
      toast.error("Add at least one promotion with a title or image.");
      return;
    }

    const ticker = tickerText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    setBusy(true);
    try {
      await adminSaveLobbyPromos({ slides: cleaned, ticker });
      toast.success("Lobby promotions saved — visible on /play immediately.");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="mb-1 text-xl font-bold">Lobby promotions</h1>
        <p className="text-sm text-slate-400">
          Upload banner photos and text for the scrolling display on the game lobby. Use a game
          screenshot or any advert image — it appears on the top carousel at{" "}
          <strong className="text-white">/play</strong>.
        </p>
      </div>

      {/* live preview */}
      {previewSlides[0] && (
        <Card>
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-500">Preview</p>
          <div className="relative h-40 overflow-hidden rounded-xl border border-white/10 sm:h-48">
            {previewSlides[0].imageUrl ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewSlides[0].imageUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-transparent" />
              </>
            ) : (
              <div
                className={`absolute inset-0 bg-gradient-to-r ${previewSlides[0].gradient}`}
              />
            )}
            <div className="relative flex h-full flex-col justify-center px-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-betese-yellow">
                Promotion
              </p>
              <p className="mt-1 text-xl font-black text-white">{previewSlides[0].title || "Title"}</p>
              <p className="mt-1 text-sm text-white/75">{previewSlides[0].subtitle}</p>
            </div>
          </div>
        </Card>
      )}

      {slides.map((slide, index) => (
        <Card key={slide.id} className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Banner #{index + 1}</h2>
            <div className="flex items-center gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={slide.active !== false}
                  onChange={(e) => updateSlide(slide.id, { active: e.target.checked })}
                  className="accent-emerald-500"
                />
                Active
              </label>
              {slides.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSlide(slide.id)}
                  className="rounded-lg p-2 text-red-400 hover:bg-red-500/10"
                  aria-label="Remove banner"
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>

          {/* image upload */}
          <div className="rounded-xl border border-dashed border-white/15 bg-slate-950/50 p-4">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
              Banner image (screenshot / advert)
            </p>
            {slide.imageUrl ? (
              <div className="relative mb-3 h-32 overflow-hidden rounded-lg sm:h-40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={slide.imageUrl} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => updateSlide(slide.id, { imageUrl: undefined })}
                  className="absolute right-2 top-2 rounded bg-black/60 px-2 py-1 text-xs text-white hover:bg-black/80"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="mb-3 flex h-32 items-center justify-center rounded-lg bg-slate-900 text-slate-500 sm:h-40">
                <ImagePlus size={32} strokeWidth={1.25} />
              </div>
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold hover:bg-slate-700">
              <Upload size={16} />
              {uploadingId === slide.id ? "Uploading…" : "Upload photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={uploadingId === slide.id}
                onChange={(e) => {
                  void onUploadImage(slide.id, e.target.files?.[0] ?? null);
                  e.target.value = "";
                }}
              />
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Headline"
              value={slide.title}
              onChange={(e) => updateSlide(slide.id, { title: e.target.value })}
              placeholder="e.g. Aviator — fly & win"
            />
            <Input
              label="Subtext"
              value={slide.subtitle}
              onChange={(e) => updateSlide(slide.id, { subtitle: e.target.value })}
              placeholder="Short promo line"
            />
            <Input
              label="Button text"
              value={slide.cta ?? ""}
              onChange={(e) => updateSlide(slide.id, { cta: e.target.value })}
            />
            <Input
              label="Link URL"
              value={slide.href ?? ""}
              onChange={(e) => updateSlide(slide.id, { href: e.target.value })}
              placeholder="/play/game/aviator"
            />
          </div>

          {games.length > 0 && (
            <label className="block text-sm">
              <span className="mb-1 block text-slate-300">Quick link to game</span>
              <select
                className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white"
                value=""
                onChange={(e) => {
                  const game = games.find((g) => g.id === e.target.value);
                  if (game) {
                    updateSlide(slide.id, {
                      href: gamePlayPath(game),
                      title: slide.title || game.name,
                    });
                  }
                }}
              >
                <option value="">Select a game…</option>
                {games.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </Card>
      ))}

      <Button variant="secondary" onClick={addSlide} className="w-full sm:w-auto">
        <Plus size={16} className="mr-1 inline" /> Add another banner
      </Button>

      <Card>
        <h2 className="mb-2 font-semibold">Scrolling ticker lines</h2>
        <p className="mb-3 text-xs text-slate-500">One promotion per line — runs under the main banner.</p>
        <textarea
          value={tickerText}
          onChange={(e) => setTickerText(e.target.value)}
          rows={5}
          className="w-full rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-white"
        />
      </Card>

      <Button className="w-full sm:w-auto" onClick={save} disabled={busy}>
        {busy ? "Saving…" : "Save & publish to lobby"}
      </Button>
    </div>
  );
}
