import { buildWhatsAppDemoJourney } from "../packages/domain/src/demo-journey";

const labels = { merchant: "MERCHANT", axcas: "AXCAS", system: "DEMO NOTE" };

console.log("AXCAS WHATSAPP JOURNEY — DETERMINISTIC REHEARSAL (NOT LIVE EVIDENCE)\n");
for (const beat of buildWhatsAppDemoJourney()) {
  console.log(`${labels[beat.actor]}\n${beat.message}\n`);
}
console.log("Before recording: replace every bracketed placeholder through one real acceptance run.");
