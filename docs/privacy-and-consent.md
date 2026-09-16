# Privacy and consent

## Merchant

Before intake, explain that ProofGate will process the merchant’s WhatsApp text, English voice notes, and supplied photos; create a public catalog; run automated checks; track anonymous page activity and order-CTA clicks; and privately return reel drafts. Record the authenticated WA-ID hash, consent timestamp, purpose, and takedown status. The merchant’s control number and public order number are separate by default.

The merchant must approve the exact site release, call batch, and reel plan through a signed WhatsApp button. Free-form text is not a substitute. No automatic posting or publishing occurs.

## Leads and calls

- Leads must be supplied by the merchant; scraping and enrichment are prohibited.
- Every lead requires a purpose-specific consent source, evidence hash, grant timestamp, India/US country, local call window, and non-revoked status.
- Batch approval binds exact lead IDs, countries, script, call window, one-attempt limit, cost cap, and 24-hour expiry.
- The first Vapi assistant cannot record, log, or transcribe and asks explicit recording consent. A decline ends politely.
- The qualification assistant begins only after yes, identifies itself as AI, never takes payment, and records only the approved qualification fields.
- “Do not call” immediately records revocation. No future batch may include that lead.
- Consented call recordings are private and encrypted in S3 and expire after 30 days. Only the structured outcome remains afterward.

Real non-test calling stays disabled until India/US telecom and telemarketing readiness is independently confirmed.

## Site analytics and media

Photos remain private until their immutable IDs are selected in a published spec. They are held in private Convex File Storage; the Cloudflare R2 path exists in code but is not active. Page events use a random first-party session ID hashed at ingestion. ProofGate stores no IP address. Public passports and reports use aggregate counts and redact identities. Reel outputs contain only approved supplied media and are returned privately.

Takedown removes the public site/media promptly while preserving redacted append-only release and consent evidence where legally required.

## Account deletion

A merchant can delete their account from Studio after typing an explicit confirmation phrase. The deletion runs immediately rather than being queued: it erases Studio projects and every revision, linked browser sessions, private media (database record and stored bytes), workflow state, and reel and campaign drafts, and it unpublishes their sites. Redacted append-only release, approval, lead-consent, call, and usage evidence is retained on the basis described above. The response reports how many records were removed.
