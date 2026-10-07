import assert from "node:assert/strict";
import { depositCreditLockIds, collectModemPayPaymentIds } from "../lib/depositCreditLock.js";

const ids = depositCreditLockIds({
  externalRef: "AVIATOR-1790008639118-SN991C",
  reusedFrom: "AVIATOR-1790008680125-YSR1N0",
  providerIds: ["50d526ce-b200-4566-94d1-60c0c21247c3", "AVIATOR-1790008639118-SN991C"],
});

assert.deepEqual(ids, [
  "AVIATOR-1790008639118-SN991C",
  "AVIATOR-1790008680125-YSR1N0",
  "pay:50d526ce-b200-4566-94d1-60c0c21247c3",
]);

const first = depositCreditLockIds({
  externalRef: "AVIATOR-A",
  providerIds: ["50d526ce-b200-4566-94d1-60c0c21247c3"],
});
const second = depositCreditLockIds({
  externalRef: "AVIATOR-B",
  providerIds: ["50d526ce-b200-4566-94d1-60c0c21247c3"],
});
assert.ok(first.some((id) => second.includes(id)), "two checkout refs must share the Wave payment lock");

const fromPayload = collectModemPayPaymentIds({
  id: "50d526ce-b200-4566-94d1-60c0c21247c3",
  payment_intent_id: "50d526ce-b200-4566-94d1-60c0c21247c3",
});
assert.deepEqual(fromPayload, ["50d526ce-b200-4566-94d1-60c0c21247c3"]);

console.log("depositCreditLock ok");
