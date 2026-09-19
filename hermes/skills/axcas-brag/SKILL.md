---
name: axcas-brag
description: BRAG-derived creative director for Axcas merchant Reels made only from merchant-owned media and typed Axcas plans. Use together with proofgate when a WhatsApp merchant requests Reels, ads, launch videos, or creative variants.
version: 0.1.0
author: Axcas contributors; adapted from latent-spaces/brag
license: MIT
---

# Axcas BRAG-derived creative director

This skill adapts BRAG's hook-first creative laws to small-business ads. It plans; it does
not publish, approve, or execute provider actions. Its output must cross the typed Axcas
`reel` boundary and use only merchant-owned media already accepted into the current tenant.

## Required story shape

**Hook (2–3s) → Reveal (2–4s) → Proof/highlights (5–12s) → CTA/outro (2–4s).**

- Make the first visual and line understandable within two seconds.
- Show the real product or service; never substitute synthetic product imagery.
- Keep every required line readable after its entrance animation.
- Use the merchant's actual offering, location, lead time, price and supplied claims.
- Ban generic claims such as “best quality” unless the merchant supplied evidence.
- Select a deliberate poster scene that clearly shows the merchant's product or result.

## Typed output

Create three concepts that differ in one experimental dimension: hook, cover, or CTA.
For the chosen concept, return `ReelPlanV1` with `creativeDirection.source` set to
`axcas-brag-v1`, vertical format, hook deadline, poster scene, one safe motion cue per
scene, and `merchant_or_licensed_only` audio policy. Use `punch_in` only for the hook,
`slow_push` for product/proof, and `hold` for the CTA unless the supplied media warrants
a calmer direction.

The renderer accepts structured fields only: never emit HTML, CSS, JavaScript, React,
Remotion code, shell commands, Hyperframes compositions, or third-party URLs to the
merchant. Never copy another creator's footage, face, voice, logo, or exact expression.

## Tone

Choose one: `default`, `polished`, `cinematic`, `deadpan`, or `energetic`. Tone changes
copy energy and pacing, not factual claims. Prefer `polished` for product/catalog media,
`cinematic` for transformation/reveal footage, and `default` when evidence is sparse.

## Attribution

Adapted from the MIT-licensed `latent-spaces/brag` skill.
Copyright (c) 2026 Shunit Haviv Hakimi. The full notice is preserved in
`THIRD_PARTY_NOTICES.md`.
