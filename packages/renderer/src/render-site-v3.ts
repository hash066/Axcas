import { SiteSpecV3Schema } from "../../domain/src/production-redesign";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function mediaUrl(assetId: string | undefined, resolver: (assetId: string) => string): string | undefined {
  if (!assetId) return undefined;
  const value = resolver(assetId);
  let parsed: URL;
  try { parsed = new URL(value); }
  catch { throw new Error("media URL is invalid"); }
  if (parsed.protocol !== "https:") throw new Error("media URL must use HTTPS");
  return escapeHtml(parsed.toString());
}

function priceLabel(price: { currency: "INR"; amountMinor: number } | undefined): string {
  if (!price) return "Ask for price";
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: price.amountMinor % 100 === 0 ? 0 : 2 }).format(price.amountMinor / 100);
}

export function renderSiteSpecV3(input: unknown, options: { mediaUrl: (assetId: string) => string }): string {
  const spec = SiteSpecV3Schema.parse(input);
  const heroMedia = mediaUrl(spec.hero.assetId, options.mediaUrl);
  const sections: Record<(typeof spec.sectionOrder)[number], string> = {
    hero: `<section class="hero" data-pg="hero"><div><p class="eyebrow">${escapeHtml(spec.businessType.replace(/_/g, " "))}</p><h1>${escapeHtml(spec.hero.headline)}</h1><p class="lead">${escapeHtml(spec.hero.subheadline)}</p><a class="cta" data-pg="hero-cta" href="/r/whatsapp/${encodeURIComponent(spec.siteId)}/general?source=site">${escapeHtml(spec.contact.ctaLabel)}</a></div>${heroMedia ? `<img data-pg="hero-media" src="${heroMedia}" alt="${escapeHtml(spec.business.name)}">` : ""}</section>`,
    offerings: `<section data-pg="offerings"><div class="section-head"><p class="eyebrow">What we offer</p><h2>Made for real local customers.</h2></div><div class="grid">${spec.offerings.map((offering) => {
      const offeringMedia = mediaUrl(offering.assetId, options.mediaUrl);
      return `<article class="card" data-pg="offering-${escapeHtml(offering.itemId)}">${offeringMedia ? `<img src="${offeringMedia}" alt="${escapeHtml(offering.name)}">` : ""}<div class="card-body"><div class="row"><h3>${escapeHtml(offering.name)}</h3><strong>${escapeHtml(priceLabel(offering.price))}</strong></div><p>${escapeHtml(offering.description)}</p><a data-pg="offering-cta-${escapeHtml(offering.itemId)}" href="/r/whatsapp/${encodeURIComponent(spec.siteId)}/${encodeURIComponent(offering.itemId)}?source=site">${escapeHtml(spec.contact.ctaLabel)}</a></div></article>`;
    }).join("")}</div></section>`,
    proof: `<section class="proof" data-pg="proof"><div><p class="eyebrow">Why choose us</p><h2>${escapeHtml(spec.business.description)}</h2></div><div class="proof-list">${spec.proof.length ? spec.proof.map((entry, index) => `<article data-pg="proof-${index + 1}"><strong>${escapeHtml(entry.label)}</strong><p>${escapeHtml(entry.detail)}</p></article>`).join("") : `<article><strong>Direct from the business</strong><p>Message us for current availability and details.</p></article>`}</div></section>`,
    contact: `<section class="contact" data-pg="contact"><p class="eyebrow">Ready when you are</p><h2>${escapeHtml(spec.contact.fulfillmentArea)}</h2><p>${escapeHtml(spec.contact.leadTime)}</p><a class="cta light" data-pg="global-whatsapp-cta" href="/r/whatsapp/${encodeURIComponent(spec.siteId)}/general?source=site">${escapeHtml(spec.contact.ctaLabel)}</a></section>`,
  };
  const headingFont = spec.theme.headingFont === "serif" ? "Georgia,serif" : spec.theme.headingFont === "display" ? "Impact,Haettenschweiler,sans-serif" : "Inter,ui-sans-serif,system-ui,sans-serif";
  const bodyFont = spec.theme.bodyFont === "serif" ? "Georgia,serif" : "Inter,ui-sans-serif,system-ui,sans-serif";
  return `<!doctype html><html lang="en-IN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(spec.seo.title)}</title><meta name="description" content="${escapeHtml(spec.seo.description)}"><meta property="og:title" content="${escapeHtml(spec.seo.title)}"><meta property="og:description" content="${escapeHtml(spec.seo.description)}"><style>:root{--accent:${spec.theme.accent};--surface:${spec.theme.surface};--text:${spec.theme.text};--heading:${headingFont};--body:${bodyFont}}*{box-sizing:border-box}body{margin:0;background:var(--surface);color:var(--text);font:16px/1.55 var(--body)}header,main,footer{width:min(1120px,calc(100% - 32px));margin:auto}header{display:flex;justify-content:space-between;align-items:center;padding:24px 0}.brand{font:700 1.25rem var(--heading)}.hero{min-height:70vh;display:grid;grid-template-columns:1.05fr .95fr;gap:48px;align-items:center;padding:56px 0}.hero img,.card img{width:100%;height:100%;max-height:560px;object-fit:cover;border-radius:24px}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-weight:800;color:var(--accent);font-size:.76rem}h1,h2,h3{font-family:var(--heading);line-height:1.02}h1{font-size:clamp(3rem,8vw,6.6rem);letter-spacing:-.055em;margin:.2em 0}h2{font-size:clamp(2.1rem,5vw,4rem);letter-spacing:-.04em}.lead{font-size:1.2rem;max-width:42rem}.cta{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:800;padding:13px 18px;border-radius:12px;margin-top:18px}main>section{padding:72px 0}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}.card{background:#fff;border:1px solid #0001;border-radius:22px;overflow:hidden}.card img{height:230px;border-radius:0}.card-body{padding:20px}.row{display:flex;gap:12px;justify-content:space-between;align-items:start}.row h3{margin:0}.card a{color:var(--accent);font-weight:800}.proof{display:grid;grid-template-columns:1fr 1fr;gap:42px}.proof-list{display:grid;gap:12px}.proof-list article{border-top:1px solid #0002;padding:16px 0}.contact{background:var(--text);color:var(--surface);padding:56px!important;border-radius:28px}.contact .eyebrow{color:#ffd8c9}.light{background:var(--surface);color:var(--text)}.pg-view{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}footer{padding:34px 0;color:#5d5550}@media(max-width:760px){.hero,.proof{grid-template-columns:1fr}.hero{min-height:0}.grid{grid-template-columns:1fr}.hero img{max-height:420px}.contact{padding:34px 24px!important}}</style></head><body data-pg="site-v3" data-layout="${spec.layoutPreset}"><img class="pg-view" data-pg="page-view" src="/e/view/${encodeURIComponent(spec.siteId)}?source=site" alt="" aria-hidden="true"><header><div class="brand">${escapeHtml(spec.business.name)}</div><a href="#contact">Contact</a></header><main>${spec.sectionOrder.map((section) => section === "contact" ? sections[section].replace('data-pg="contact"', 'id="contact" data-pg="contact"') : sections[section]).join("")}</main><footer>${escapeHtml(spec.business.name)} · ${escapeHtml(spec.contact.fulfillmentArea)}</footer></body></html>`;
}
