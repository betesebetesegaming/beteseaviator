"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firestore";
import {
  digitsOnly,
  getDefaultCustomerCare,
  type CustomerCareConfig,
} from "@/lib/customerCare";

/** Legacy placeholder — replaced by live BETESE support line. */
const LEGACY_PLACEHOLDER_PHONE = "2205000000";

function resolveCareDigits(stored: string | undefined, fallback: string): string {
  const digits = digitsOnly(stored || "");
  if (!digits || digits === LEGACY_PLACEHOLDER_PHONE) return fallback;
  return digits;
}

export function useCustomerCare(): CustomerCareConfig {
  const [care, setCare] = useState<CustomerCareConfig>(getDefaultCustomerCare);

  useEffect(() => {
    return onSnapshot(doc(db, "settings", "platform"), (snap) => {
      const fallback = getDefaultCustomerCare();
      if (!snap.exists()) {
        setCare(fallback);
        return;
      }
      const data = snap.data() as {
        customerCare?: { phone?: string; whatsapp?: string; label?: string };
      };
      const phone = resolveCareDigits(data.customerCare?.phone, fallback.phone);
      const whatsapp = resolveCareDigits(
        data.customerCare?.whatsapp,
        phone || fallback.whatsapp
      );
      setCare({
        phone,
        whatsapp,
        label: data.customerCare?.label?.trim() || fallback.label,
      });
    });
  }, []);

  return care;
}
