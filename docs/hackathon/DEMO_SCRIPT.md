# Axcas grand-prize demo script

Target length: **3:45–4:15**. Record at 1080p. Use large browser text, a clean phone capture, and captions. Do not show terminals, environment variables, provider dashboards, or credentials.

## 0:00–0:25 — Human problem

**Visual:** A small-business owner switching among WhatsApp photos, notes, and a blank website builder.

**Voiceover:** “Small-business owners already run their business in WhatsApp. But turning scattered voice notes, prices, and photos into a website, content, and measurable growth still means hiring an agency or learning another dashboard. Axcas is the background operator that does that repetitive work for them.”

## 0:25–1:05 — One natural input

**Visual:** Send one voice note plus three real merchant-owned photos and prices to Axcas.

**Merchant input:** “Start Axcas. I run Maya Tailoring in Hubli. We make custom blouses and alterations, starting at ₹450. Usually ready in four days. Customers can order on this WhatsApp number. Build me a simple elegant site and a reel idea.”

**Expected Axcas response:** One acknowledgement followed by either a single consolidated missing-facts question or a progress update. No command approvals, code, internal names, or repeated confirmations.

**Voiceover:** “Axcas understands voice, text, and photos together. It infers the business type and asks at most one combined question if a fact is genuinely required.”

## 1:05–1:35 — Quiet agentic work

**Visual:** WhatsApp shows one receipt—“Got it. I’m building your draft now; I’ll message you when the checked preview is ready.” Then it stays quiet. While the work completes, briefly show the architecture graphic with the real run ID unobtrusively overlaid. Return to WhatsApp when the preview arrives.

**Voiceover:** “A Strands agent coordinates intake, drafting, and the independent check through typed tools. Those reversible steps stay under the hood. Its authority stops at the decision that changes the outside world.”

Do not show “details saved,” “asset stored,” “verification requested,” or one acknowledgement per tool call. Those are system trace events, not customer messages.

## 1:35–2:10 — Preview and one approval

**Visual:** Open the private preview on mobile, scroll offerings, fulfillment information, and WhatsApp CTA. Return to the single checklist.

**Expected checklist:**

- Business name and contact are correct
- Offerings and prices are correct
- Selected photos may be published
- Publish this exact checked version

**Voiceover:** “The model never writes arbitrary page code. It proposes validated data. An independent verifier checks the public candidate, and one owner approval is cryptographically bound to that exact version.”

## 2:10–2:40 — Published result and measurable action

**Visual:** Approve, open the published site in a separate visitor session, and tap an offering CTA. Show the exact prefilled WhatsApp enquiry. This click must be a real event from the demonstrated site, not a seeded fixture.

**Voiceover:** “Deterministic policy—not the agent—publishes the verified version. Every enquiry CTA records the page version and campaign without storing the visitor’s IP address.”

## 2:40–3:15 — Growth loop

**Visual:** Ask “How is my site doing, and what should I test next?” Show raw views/clicks including the visitor action just demonstrated, followed by one plain-language proposed improvement. The explicit request permits an immediate proposal even before the normal seven-day/100-view threshold. Show three reel angles based on the actual supplied media; preview one structured format.

**Voiceover:** “Axcas comes back only when it has evidence or needs a real choice. It reports raw denominators, proposes one verified improvement, and creates original reel concepts from the owner’s media. It never auto-publishes.”

## 3:15–3:45 — Technical credibility

**Visual:** For 8–10 seconds, show the redacted Strands trace for this exact run: model invocation, selected typed actions, tool observations, pause for approval, and resume. Then show the architecture diagram with three highlighted boundaries: Strands agent, independent verifier, deterministic release. If an AgentCore invocation is live, show its CloudWatch/AgentCore receipt; otherwise do not name AgentCore.

**Voiceover:** “This is the Strands trace for the run you just saw. AWS runs the isolated background runtime and media pipeline. Builder, verifier, and release authority are separate, so neither a prompt injection nor a hallucination can approve or publish a change.”

## 3:45–4:05 — Close

**Visual:** Merchant’s WhatsApp beside the finished mobile site.

**Voiceover:** “Axcas gives the smallest businesses a website and growth operator without forcing them to become software operators. They speak, review one clear decision, and keep serving customers.”

End card: **Axcas — say it once; run your business.**

## Recording acceptance

- [ ] Real merchant-owned photos, not generated product imagery.
- [ ] One continuous customer story; cuts may remove waiting but not hide failures.
- [ ] No terminal or provider configuration shown.
- [ ] No claim of a live call, reel delivery, trend learning, or Instagram posting unless visibly proven.
- [ ] The Strands tool trace shown corresponds to the same demonstrated run.
- [ ] The CTA and reported metric are generated by the demonstrated visitor action, not seeded data.
- [ ] WhatsApp shows one receipt, one preview, one checklist, and one live confirmation—no internal tool chatter.
- [ ] A failure or prerecorded fallback is labeled accurately.
