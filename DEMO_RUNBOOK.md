# Axcas demo runbook

This is the current WhatsApp-first judging path. It replaces the obsolete Telegram and
booking-oracle notes. The deterministic rehearsal and public `/demo` sandbox are not live
evidence; bracketed values must be replaced through one real acceptance run before recording.

## Story in one sentence

Axcas turns one small-business WhatsApp bundle—voice, photos, offerings, prices, and
area—into a checked website preview, publishes the exact approved version, proposes
human-led reel angles, and reports measurable WhatsApp enquiries without exposing a
dashboard or technical setup.

## Rehearsal and judge sandbox

Run the exact customer-copy rehearsal:

```powershell
npm run demo:whatsapp
```

The deployed `/demo` route is a public, no-login judge walkthrough. It is visibly labelled
as sample data, performs no mutations, sends no WhatsApp messages, and cannot approve or
publish anything. It exists because Meta's test number is allowlist-only; it does not weaken
Studio or WhatsApp authentication.

## Required live acceptance before recording

- [ ] A fresh test merchant sends one message, one English voice note, and at least three
      real photos to the configured WhatsApp number.
- [ ] Axcas replies once to acknowledge the bundle. No command, provider, credential,
      storage, or infrastructure language appears.
- [ ] If essential facts are missing, Axcas asks one consolidated question. Otherwise it
      continues without another prompt.
- [ ] Internal intake, storage, drafting, and checking steps remain silent.
- [ ] The returned preview URL opens on a phone and shows the supplied details and media.
- [ ] The WhatsApp CTA opens the exact prefilled enquiry and records one deduplicated click.
- [ ] One publish checklist arrives with native Publish / Change buttons.
- [ ] Publish promotes only the verified candidate and returns the real production URL.
- [ ] The merchant asks for reels and receives three business-specific, human-led angles.
- [ ] A real activity request reports raw views, CTA clicks, denominator, and time window.

If any item fails, show it as a limitation or fix it before recording. A local fixture,
synthetic event, provider acceptance receipt, or previous recording is never described as a
live merchant success.

## Five-minute recording outline

1. **Problem (0:00–0:25):** small-business owners already run their work from WhatsApp and
   do not want another dashboard.
2. **Natural intake (0:25–1:05):** send the voice note, text, and photos together. Show the
   single concise acknowledgement.
3. **Agent work (1:05–1:35):** explain that reversible work happens under the hood. Briefly
   show the architecture overlay; do not expose terminals or secrets in the customer story.
4. **Checked preview (1:35–2:35):** open the actual preview on mobile, inspect the supplied
   products or services, and tap the WhatsApp CTA.
5. **One decision (2:35–3:10):** show the consolidated checklist and tap Publish. Open the
   returned production URL.
6. **Growth loop (3:10–4:15):** request reel ideas, show three specific angles, then request
   the real metrics summary and explain the evidence threshold for improvements.
7. **Trust (4:15–5:00):** structured site data only, independent checking, signed owner
   approval, deterministic release, supplied media, and no auto-posting.

## Customer-visible message budget

The normal website path has four outbound moments:

1. One receipt after the useful intake bundle.
2. One consolidated missing-facts question only when essential facts are absent.
3. One preview plus one native publish checklist when verification passes.
4. One live-site confirmation after deterministic promotion.

Messages such as “policy applied,” “asset stored,” “candidate created,” “verification
requested,” “approval sent,” and “provider authentication failed” must never reach a
merchant. Recoverable internal failures use one saved-and-retrying message and preserve
the already received bundle.

## Judge questions

- **Is this just prompting?** No. The agent can create only validated structured content;
  checking and promotion are separate deterministic capabilities.
- **Is the demo staged?** Give the judge the live preview and production URL. Clearly label
  rehearsals or recordings and never substitute fixtures for provider receipts.
- **Why WhatsApp and Studio?** WhatsApp is the default natural-language and voice surface;
  Studio is optional visual control over the same account.
- **What happens on a hallucination?** Unsupported claims are not supplied facts, candidate
  contracts fail closed, and no model can promote its own work.
- **Does it post or call by itself?** No. Site publication, final reel rendering, and every
  exact consented call batch have separate signed approvals.

## Failure protocol

Retry a deterministic transport failure once. If it still fails, say exactly which live step
failed, switch to an explicitly labelled recording of the same contract if available, and
offer the last independently verified site for inspection. Never narrate failure as a pass.
