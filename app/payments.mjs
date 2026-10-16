// What has to be true before COLLECTION_LIVE may be flipped.
//
// Run: npm run payments
//
// A checklist in a document does not fail a build and does not get read on the
// afternoon somebody decides to turn payments on. This one lives next to the
// code that refuses, and prints the current state of the flag alongside it.
import { READINESS, blockers, paymentsUsable, getProcessor } from "./src/payments/processor.js";
import { COLLECTION_LIVE } from "./src/data/fees.js";

console.log("\n\x1b[1mBEFORE PAYMENTS CAN BE SWITCHED ON\x1b[0m");
console.log("\x1b[2mThe flag is one line. Everything below is what has to be true first.\x1b[0m\n");

READINESS.forEach((r, i) => {
  console.log(`  \x1b[1m${i + 1}. ${r.what}\x1b[0m`);
  console.log(`     \x1b[2m${r.why}\x1b[0m\n`);
});

console.log("\x1b[1mWhere it stands\x1b[0m");
console.log(`  COLLECTION_LIVE  ${COLLECTION_LIVE ? "\x1b[33mtrue\x1b[0m" : "\x1b[32mfalse\x1b[0m"}`);
console.log(`  processor        ${getProcessor() ? getProcessor().name : "\x1b[2mnone registered\x1b[0m"}`);
console.log(`  money can move   ${paymentsUsable() ? "\x1b[33myes\x1b[0m" : "\x1b[32mno\x1b[0m"}`);
for (const b of blockers()) console.log(`  \x1b[2m· ${b}\x1b[0m`);

console.log("\n\x1b[2mThe three red lines, because they decide whether this is a marketplace");
console.log("or an unlicensed money transmitter: buyer funds never enter a lili account;");
console.log("lili never pays a seller from its own balance; a refund goes back against");
console.log("the original payment and is never netted off a future payout.\x1b[0m\n");

process.exit(COLLECTION_LIVE && !getProcessor() ? 1 : 0);
