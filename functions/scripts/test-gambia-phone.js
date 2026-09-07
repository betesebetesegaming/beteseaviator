/**
 * Local cases for Gambia 7-digit / 9-digit registration + login keys.
 * Run: node scripts/test-gambia-phone.js   (from functions/)
 */
const {
  normalizePhone,
  phoneStorageKeys,
  phoneAuthEmails,
  phoneToEmail,
} = require("../lib/phone");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const NINE = "874176003";
const SEVEN = "4176003";

const cases = [
  ["9-digit canonical", NINE, NINE],
  ["7-digit expands to 9", SEVEN, NINE],
  ["+220 9-digit", "+220874176003", NINE],
  ["220 9-digit", "220874176003", NINE],
  ["220 7-digit", "2204176003", NINE],
];

for (const [label, input, expected] of cases) {
  const got = normalizePhone(input);
  assert(got === expected, `${label}: expected ${expected}, got ${got || "(empty)"}`);
}

const keysFromNine = phoneStorageKeys(NINE);
const keysFromSeven = phoneStorageKeys(SEVEN);
assert(keysFromNine.includes(NINE) && keysFromNine.includes(SEVEN), "9-digit keys must include both formats");
assert(keysFromSeven.includes(NINE) && keysFromSeven.includes(SEVEN), "7-digit keys must include both formats");

const emailsNine = phoneAuthEmails(NINE);
const emailsSeven = phoneAuthEmails(SEVEN);
assert(emailsNine.includes(phoneToEmail(NINE)), "canonical auth email present");
assert(emailsNine.includes(`p${SEVEN}@phone.beteseaviator.com`), "legacy auth email present");
assert(
  emailsNine.every((e) => emailsSeven.includes(e)) && emailsSeven.every((e) => emailsNine.includes(e)),
  "login emails for 7-digit and 9-digit must match (no duplicate accounts)",
);

assert(normalizePhone("7793854") === "877793854", "Africell 7-digit 7xxxxxx");
assert(normalizePhone("9123456") === "9123456", "Gamcel stays 7 digits");

console.log("ok", {
  canonical: NINE,
  fromSeven: normalizePhone(SEVEN),
  fromNine: normalizePhone(NINE),
  storageKeys: keysFromNine,
  loginEmails: emailsNine,
});
