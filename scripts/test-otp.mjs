/**
 * Test Africell SMS OTP Cloud Functions: probe → send → verify.
 *
 * Usage:
 *   node scripts/test-otp.mjs probe
 *   node scripts/test-otp.mjs send 4176003
 *   node scripts/test-otp.mjs verify 4176003 123456
 *
 * Base URL defaults to beteseaviator production; override with OTP_BASE_URL env var.
 */

const BASE = (
  process.env.OTP_BASE_URL || "https://us-central1-beteseaviator-a05ae.cloudfunctions.net"
).replace(/\/+$/, "");

async function post(path, body) {
  const res = await fetch(`${BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

async function probe() {
  const { status, data } = await post("sendOtp", { probe: true });
  console.log("PROBE", status, data);
  if (status !== 200 || data.probe !== true) process.exit(1);
}

async function send(phone) {
  const { status, data } = await post("sendOtp", { phone });
  console.log("SEND", status, data);
  if (status !== 200 || !data.ok) process.exit(1);
}

async function verify(phone, code) {
  const { status, data } = await post("verifyOtp", { phone, code });
  console.log("VERIFY", status, data);
  if (status !== 200 || !data.verified) process.exit(1);
}

const [cmd, phone, code] = process.argv.slice(2);

if (cmd === "probe") await probe();
else if (cmd === "send") {
  if (!phone) {
    console.error("Usage: node scripts/test-otp.mjs send <phone>");
    process.exit(1);
  }
  await send(phone);
} else if (cmd === "verify") {
  if (!phone || !code) {
    console.error("Usage: node scripts/test-otp.mjs verify <phone> <code>");
    process.exit(1);
  }
  await verify(phone, code);
} else {
  console.log("Usage: node scripts/test-otp.mjs probe|send|verify [phone] [code]");
  process.exit(1);
}
