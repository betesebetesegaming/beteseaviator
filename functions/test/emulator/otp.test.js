/**
 * Public sendOtp must not relay caller-supplied text: it always sends its own code with the
 * standard template, stores that code's hash, and the code in the SMS verifies. Africell is
 * a local HTTP server; Firestore is the emulator.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const sent = [];
const gateway = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    sent.push({ url: req.url, body });
    res.end("200\nSuccess\nmsg-1");
  });
});

let otp;
let db;
test.before(async () => {
  await new Promise((r) => gateway.listen(0, "127.0.0.1", r));
  process.env.AFRICELL_SMS_URL = `http://127.0.0.1:${gateway.address().port}`;
  process.env.AFRICELL_SMS_USERNAME = "u";
  process.env.AFRICELL_SMS_PASSWORD = "p";
  process.env.OTP_HASH_SALT = "test-salt";
  delete process.env.OTP_MESSAGE_TEMPLATE;
  otp = require("../../lib/routes/otp");
  db = require("../../lib/helpers").db;
});

test.after(async () => {
  gateway.close();
  await require("firebase-admin").app().delete();
});

function call(handler, body) {
  return new Promise((resolve) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(data) { resolve({ status: this.statusCode, data }); },
    };
    handler({ body, headers: {}, socket: { remoteAddress: `10.0.0.${Math.floor(Math.random() * 250)}` } }, res);
  });
}

test("caller-supplied message and code are ignored; the sent code verifies", async () => {
  const phone = "3123456";
  const r = await call(otp.sendOtpHandler, {
    phone,
    code: "111111",
    message: "Your account is locked, call 9999999 {{code}}",
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(sent.length, 1);
  const sms = sent[0].body;
  assert.doesNotMatch(sms, /locked|9999999|111111/);
  const m = sms.match(/^Your BETESE verification code is: (\d{6})\./);
  assert.ok(m, sms);

  const stored = await db.collection("otp_codes").doc(require("../../lib/phone").toOtpMsisdn(phone)).get();
  assert.ok(stored.exists, "otp hash stored");

  await assert.rejects(otp.verifySmsOtp(phone, "111111"), /Invalid OTP/);
  const msisdn = await otp.verifySmsOtp(phone, m[1]);
  assert.ok((await db.collection("otp_verified").doc(msisdn).get()).exists);
});
