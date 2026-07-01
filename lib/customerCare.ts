export type CustomerCareConfig = {
  phone: string;
  whatsapp: string;
  label: string;
};

const DEFAULT_PHONE = "2204176003";
const DEFAULT_WHATSAPP = "2204176003";

function readCareEnv(name: "NEXT_PUBLIC_CUSTOMER_CARE_PHONE" | "NEXT_PUBLIC_CUSTOMER_CARE_WHATSAPP"): string {
  if (typeof window !== "undefined") {
    const fromWindow = (window as Window & { __BETESE_ENV__?: Record<string, string> }).__BETESE_ENV__?.[name];
    if (fromWindow?.trim()) return fromWindow.trim();
  }
  const fromProcess = String(process.env[name] || "").trim();
  if (fromProcess) return fromProcess;
  return "";
}

/** Fallback when Firestore settings are not loaded yet. */
export function getDefaultCustomerCare(): CustomerCareConfig {
  const phone = digitsOnly(readCareEnv("NEXT_PUBLIC_CUSTOMER_CARE_PHONE") || DEFAULT_PHONE);
  const whatsapp = digitsOnly(
    readCareEnv("NEXT_PUBLIC_CUSTOMER_CARE_WHATSAPP") || phone || DEFAULT_WHATSAPP
  );
  return {
    phone,
    whatsapp,
    label: "BETESE Customer Care",
  };
}

export function digitsOnly(value: string): string {
  return String(value || "").replace(/\D/g, "");
}

export function formatCustomerCarePhone(digits: string): string {
  const d = digitsOnly(digits);
  if (d.startsWith("220") && d.length === 10) {
    const local = d.slice(3);
    return `+220 ${local.slice(0, 3)} ${local.slice(3)}`;
  }
  if (d.length === 7) {
    return `+220 ${d.slice(0, 3)} ${d.slice(3)}`;
  }
  return d ? `+${d}` : "";
}

export function customerCareTelUrl(digits: string): string {
  const d = digitsOnly(digits);
  return d ? `tel:+${d}` : "";
}

export function customerCareWhatsAppUrl(digits: string, message?: string): string {
  const d = digitsOnly(digits);
  if (!d) return "";
  const base = `https://wa.me/${d}`;
  if (!message?.trim()) return base;
  return `${base}?text=${encodeURIComponent(message.trim())}`;
}
