import { doc, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db } from "@/lib/firestore";
import { storage } from "@/lib/storage";
import {
  PROMO_SLIDES,
  PROMO_TICKER,
  type LobbyPromoConfig,
  type PromoSlide,
} from "@/lib/games/promotions";

const DOC_PATH = ["settings", "lobbyPromos"] as const;

export function subscribeLobbyPromos(onConfig: (config: LobbyPromoConfig | null) => void): Unsubscribe {
  return onSnapshot(
    doc(db, ...DOC_PATH),
    (snap) => {
      if (!snap.exists()) {
        onConfig(null);
        return;
      }
      onConfig(snap.data() as LobbyPromoConfig);
    },
    () => {
      // Permission/network errors — fall back to built-in default slides.
      onConfig(null);
    },
  );
}

export function activeLobbySlides(config: LobbyPromoConfig | null): PromoSlide[] {
  const fromDb = config?.slides
    ?.filter((s) => s.active !== false)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  if (fromDb?.length) return fromDb;
  return PROMO_SLIDES;
}

export function lobbyTicker(config: LobbyPromoConfig | null): string[] {
  if (config?.ticker?.length) return config.ticker;
  return PROMO_TICKER;
}

export async function uploadPromoBannerImage(file: File, promoId: string): Promise<string> {
  const safeId = promoId.replace(/[^a-zA-Z0-9-_]/g, "").slice(0, 48) || `promo-${Date.now()}`;
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `promotions/${safeId}/banner.${ext}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: file.type || "image/jpeg" });
  return getDownloadURL(storageRef);
}
