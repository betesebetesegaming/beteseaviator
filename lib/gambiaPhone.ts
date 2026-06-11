/** Copied from betesepmu/utils.ts — phone normalisation for ModemPay checkout. */
export const normalizeGambiaPhone = (input: string): string | null => {
  const raw = String(input || "").trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("220") && digits.length === 10) {
    const local = digits.slice(3);
    if (!/^\d{7}$/.test(local)) return null;
    return `+220${local}`;
  }

  if (digits.length === 7) {
    if (!/^\d{7}$/.test(digits)) return null;
    return `+220${digits}`;
  }

  if (digits.startsWith("221") && digits.length === 12) {
    const local = digits.slice(3);
    if (!/^\d{9}$/.test(local)) return null;
    return `+221${local}`;
  }

  if (digits.startsWith("245") && digits.length === 12) {
    const local = digits.slice(3);
    if (!/^\d{9}$/.test(local)) return null;
    return `+245${local}`;
  }

  return null;
};
