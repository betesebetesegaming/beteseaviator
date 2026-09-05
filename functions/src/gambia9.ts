/**
 * Official Gambia9 / PURA phase-1 mapping.
 * Source: https://gambia9.com/ and PURA public notice.
 *
 *   Africell  87 + old 7 digits (starts 2, 4, 7)
 *   QCell     83 + old 7 digits (starts 3, 5)
 *   Comium    86 + old 7 digits (starts 6, 8)
 *   Gamcel / Ycell stay 7 digits
 *   Already-9-digit numbers are never changed
 *   Unknown / invalid numbers are never given a prefix
 */

export type Gambia9Network = "Africell" | "QCell" | "Comium" | "Gamcel" | "unknown";
export type Gambia9Status = "convert" | "already_converted" | "gamcel_unchanged" | "unsafe" | "empty";

export type Gambia9Plan = {
  oldNumber: string;
  newNumber: string;
  network: Gambia9Network;
  status: Gambia9Status;
  alreadyConverted: boolean;
  reason: string;
};

const PREFIX_BY_START: Record<string, { network: Exclude<Gambia9Network, "Gamcel" | "unknown">; prefix: string }> = {
  "2": { network: "Africell", prefix: "87" },
  "4": { network: "Africell", prefix: "87" },
  "7": { network: "Africell", prefix: "87" },
  "3": { network: "QCell", prefix: "83" },
  "5": { network: "QCell", prefix: "83" },
  "6": { network: "Comium", prefix: "86" },
  "8": { network: "Comium", prefix: "86" },
};

const NETWORK_BY_NINE_PREFIX: Record<string, Gambia9Network> = {
  "87": "Africell",
  "83": "QCell",
  "86": "Comium",
  "89": "Gamcel",
};

export function extractGambiaLocal(input: string): string {
  let digits = String(input || "").replace(/\D/g, "");
  if (!digits) return "";
  digits = digits.replace(/^0+/, "");
  if (digits.startsWith("220") && digits.length > 3) {
    return digits.slice(3).replace(/^0+/, "");
  }
  return digits;
}

export function classifyGambia9(input: string): Gambia9Plan {
  const local = extractGambiaLocal(input);
  if (!local) {
    return {
      oldNumber: "",
      newNumber: "",
      network: "unknown",
      status: "empty",
      alreadyConverted: false,
      reason: "No phone number",
    };
  }

  if (local.length === 7) {
    if (local.startsWith("9")) {
      return {
        oldNumber: local,
        newNumber: local,
        network: "Gamcel",
        status: "gamcel_unchanged",
        alreadyConverted: false,
        reason: "Gamcel / Ycell stay 7 digits",
      };
    }
    const mapped = PREFIX_BY_START[local[0] ?? ""];
    if (!mapped) {
      return {
        oldNumber: local,
        newNumber: local,
        network: "unknown",
        status: "unsafe",
        alreadyConverted: false,
        reason: "Unknown 7-digit start — prefix not added",
      };
    }
    return {
      oldNumber: local,
      newNumber: `${mapped.prefix}${local}`,
      network: mapped.network,
      status: "convert",
      alreadyConverted: false,
      reason: `${mapped.network}: add ${mapped.prefix}`,
    };
  }

  if (local.length === 9) {
    const prefix = local.slice(0, 2);
    const network = NETWORK_BY_NINE_PREFIX[prefix] ?? "unknown";
    if (network === "unknown") {
      return {
        oldNumber: local,
        newNumber: local,
        network: "unknown",
        status: "unsafe",
        alreadyConverted: false,
        reason: "9-digit number with an unknown prefix",
      };
    }
    return {
      oldNumber: local,
      newNumber: local,
      network,
      status: "already_converted",
      alreadyConverted: true,
      reason: "Already 9 digits — left unchanged",
    };
  }

  return {
    oldNumber: local,
    newNumber: local,
    network: "unknown",
    status: "unsafe",
    alreadyConverted: false,
    reason: `Unsupported length (${local.length} digits)`,
  };
}

export function gambia9Canonical(input: string): string {
  const plan = classifyGambia9(input);
  if (plan.status === "empty" || plan.status === "unsafe") return "";
  return plan.newNumber;
}

export function gambia9WaveNumber(input: string): string {
  const plan = classifyGambia9(input);
  if (plan.network === "Africell" || plan.network === "QCell" || plan.network === "Comium") {
    return plan.newNumber.length === 9 ? plan.newNumber : "";
  }
  return "";
}
