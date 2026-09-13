import { z } from "zod";

import { formatApprovalChecklist } from "./studio";
import { customerProgressMessage } from "./workflow";

const DemoBeatSchema = z.object({
  actor: z.enum(["merchant", "axcas", "system"]),
  kind: z.enum(["disclaimer", "intake", "receipt", "silent_work", "preview", "approval", "decision", "completion", "reel_request", "reel_angles", "metrics_request", "metrics"]),
  message: z.string().trim().min(1).max(1_024),
  liveEvidence: z.boolean(),
}).strict();

export type DemoBeat = z.infer<typeof DemoBeatSchema>;

/**
 * Deterministic screen-recording rehearsal. Bracketed placeholders prevent a
 * fixture from being confused with a live provider acceptance run.
 */
export function buildWhatsAppDemoJourney(): DemoBeat[] {
  const beats: DemoBeat[] = [
    { actor: "system", kind: "disclaimer", message: "REHEARSAL FIXTURE — replace bracketed placeholders with URLs from the live acceptance run.", liveEvidence: false },
    { actor: "merchant", kind: "intake", message: "I run Maya Studio in Bengaluru. We stitch custom blouses from ₹1,500 and do alterations in 3–5 days. I want a website and reels. [voice note + 3 real photos attached]", liveEvidence: false },
    { actor: "axcas", kind: "receipt", message: customerProgressMessage("message_received")!, liveEvidence: false },
    { actor: "system", kind: "silent_work", message: "The agent stores the supplied media privately, builds structured content, and checks the candidate. No customer messages are sent during these reversible steps.", liveEvidence: false },
    { actor: "axcas", kind: "preview", message: "Your website preview is ready. Check the business details, prices, and WhatsApp button:\n[checked preview URL]", liveEvidence: false },
    {
      actor: "axcas", kind: "approval", liveEvidence: false,
      message: formatApprovalChecklist({
        type: "release",
        subject: "Maya Studio website",
        details: ["Business details and prices checked", "Mobile layout and WhatsApp button checked", "Only your supplied claims and photos used"],
      }),
    },
    { actor: "merchant", kind: "decision", message: "[taps Publish]", liveEvidence: false },
    { actor: "axcas", kind: "completion", message: `${customerProgressMessage("published")}\n[verified live site URL]`, liveEvidence: false },
    { actor: "merchant", kind: "reel_request", message: "Give me reel ideas for this launch.", liveEvidence: false },
    { actor: "axcas", kind: "reel_angles", message: "Three launch angles from your real photos:\n1. Sketch → finished fit\n2. Three details that change the fit\n3. What happens after you message us\n\nChoose 1, 2, or 3. I’ll show the final reel plan before rendering.", liveEvidence: false },
    { actor: "merchant", kind: "metrics_request", message: "How is the website doing?", liveEvidence: false },
    { actor: "axcas", kind: "metrics", message: "Last 7 days: [real page views] views and [real CTA clicks] WhatsApp clicks. I’ll suggest a page change only when there is enough evidence, and I’ll ask before publishing it.", liveEvidence: false },
  ];
  return z.array(DemoBeatSchema).parse(beats);
}
