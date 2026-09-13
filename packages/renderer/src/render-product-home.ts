export function renderProductHome(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="description" content="Axcas builds complete small-business websites and original reels from WhatsApp or a guided web studio.">
  <title>Axcas — websites and reels for small businesses</title>
  <style>
    :root{color-scheme:light;--ink:#241b18;--muted:#6d615d;--paper:#fffaf5;--card:#fff;--line:#eadfd6;--green:#176b49;--lime:#dff6df;--peach:#ffdfc4;--accent:#eb6d3c}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:linear-gradient(180deg,#fff7ef 0,#fffaf5 32rem,#f7f4ef 100%);color:var(--ink);font:16px/1.55 ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
    a{color:inherit}.shell{width:min(1120px,calc(100% - 32px));margin:auto}.nav{display:flex;align-items:center;justify-content:space-between;padding:22px 0}.brand{font-weight:850;letter-spacing:-.04em;font-size:1.25rem}.badge{display:inline-flex;align-items:center;gap:8px;border:1px solid #b9ddb9;background:var(--lime);color:#13583d;border-radius:999px;padding:6px 11px;font-size:.8rem;font-weight:750}.badge:before{content:"";width:7px;height:7px;border-radius:50%;background:#31a36b}
    .hero{display:grid;grid-template-columns:1.05fr .95fr;gap:54px;align-items:center;padding:64px 0 86px}.eyebrow{color:var(--accent);font-size:.78rem;font-weight:850;text-transform:uppercase;letter-spacing:.12em}.hero h1{font-size:clamp(2.6rem,6vw,5.7rem);line-height:.95;letter-spacing:-.07em;margin:16px 0 24px;max-width:760px}.lead{font-size:clamp(1.05rem,2vw,1.3rem);color:var(--muted);max-width:640px;margin:0 0 30px}.actions{display:flex;gap:12px;flex-wrap:wrap}.button{display:inline-block;text-decoration:none;border-radius:13px;padding:13px 18px;font-weight:780}.primary{background:var(--ink);color:#fff}.secondary{border:1px solid var(--line);background:#fff}.micro{margin-top:16px;color:var(--muted);font-size:.84rem}
    .phone{max-width:380px;margin:auto;background:#0e1614;border:8px solid #171d1c;border-radius:34px;box-shadow:0 28px 70px #5e3e2730;overflow:hidden}.phone-head{padding:16px 18px;color:#fff;background:#075e54;font-weight:760}.chat{background:#efe8df;padding:18px 14px 24px;display:flex;flex-direction:column;gap:10px;min-height:435px}.bubble{max-width:86%;padding:10px 12px;border-radius:11px;background:#fff;box-shadow:0 1px 1px #00000012;font-size:.88rem}.mine{align-self:flex-end;background:#d8fdd2}.bubble small{display:block;text-align:right;color:#777;margin-top:4px}.preview{border:1px solid #cfd8cf;border-radius:9px;background:#fff;padding:10px;margin-top:7px}.preview strong{display:block}.preview span{color:var(--muted);font-size:.8rem}.approve{display:inline-block;margin-top:9px;background:#1d6f51;color:#fff;border-radius:7px;padding:7px 10px;font-size:.78rem;font-weight:800}
    section{padding:78px 0}.section-head{display:flex;justify-content:space-between;gap:30px;align-items:end;margin-bottom:30px}.section-head h2{font-size:clamp(2rem,4vw,3.4rem);letter-spacing:-.055em;line-height:1;margin:0;max-width:650px}.section-head p{color:var(--muted);max-width:420px;margin:0}.steps{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}.step{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:24px;min-height:220px}.num{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:var(--peach);font-weight:850}.step h3{font-size:1.08rem;margin:26px 0 8px}.step p{color:var(--muted);margin:0;font-size:.92rem}
    .outcomes{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.outcome{border-top:1px solid var(--line);padding:24px 4px}.outcome h3{margin:0 0 8px;font-size:1.2rem}.outcome p{margin:0;color:var(--muted)}
    .truth{background:var(--ink);color:#fff;border-radius:26px;padding:34px;display:grid;grid-template-columns:1fr 1fr;gap:34px}.truth h2{font-size:clamp(1.8rem,3vw,2.8rem);letter-spacing:-.045em;line-height:1.05;margin:0 0 14px}.truth p{color:#d9d0cb;margin:0}.checks{display:grid;gap:10px}.check{border:1px solid #ffffff22;background:#ffffff0a;border-radius:12px;padding:12px 14px}.check strong{color:#bff2c7}.footer{padding:28px 0 46px;border-top:1px solid var(--line);display:flex;justify-content:space-between;color:var(--muted);font-size:.84rem}
    @media(max-width:820px){.hero{grid-template-columns:1fr;padding-top:38px}.steps,.outcomes{grid-template-columns:1fr 1fr}.truth{grid-template-columns:1fr}.section-head{display:block}.section-head p{margin-top:14px}}
    @media(max-width:520px){.shell{width:min(100% - 22px,1120px)}.hero{gap:38px;padding-bottom:54px}.hero h1{font-size:3.25rem}.steps,.outcomes{grid-template-columns:1fr}.step{min-height:0}.footer{display:block}.footer span{display:block;margin-top:5px}}
  </style>
</head>
<body data-pg="product-home">
  <header class="shell nav"><div class="brand">Axcas</div><div class="badge">Private beta</div></header>
  <main>
    <section class="shell hero">
      <div>
        <div class="eyebrow">For small businesses</div>
        <h1>Websites and reels, without the agency maze.</h1>
        <p class="lead">Start in WhatsApp for speed or use Axcas Studio for visual control. Your business details, real media, hosting, storage and feedback loop stay in one service.</p>
        <div class="actions"><a class="button primary" data-pg="start-whatsapp" href="https://wa.me/15556537153?text=START%20AXCAS" rel="noopener noreferrer">Start in WhatsApp</a><a class="button secondary" data-pg="start-studio" href="/studio">Open Axcas Studio</a><a class="button secondary" data-pg="judge-demo" href="/demo">View judge sandbox</a></div>
        <p class="micro">Tailors · tutors · salons · home services · retailers · bakeries · and more</p>
      </div>
      <div class="phone" aria-label="Demo WhatsApp conversation">
        <div class="phone-head">Axcas agent</div>
        <div class="chat">
          <div class="bubble mine">I run Maya's Boutique in Bengaluru. Blouse stitching from ₹900, alterations from ₹250. Usually ready in 4 days. <small>10:02</small></div>
          <div class="bubble mine">Photos + offerings + voice note <small>10:03</small></div>
          <div class="bubble">Got it. I prepared your business page and checked the WhatsApp buttons, mobile layout, and claims.
            <div class="preview"><strong>Maya's Boutique — preview ready</strong><span>3 services · WhatsApp enquiries · Bengaluru</span><div class="approve">Approve site</div></div><small>10:05</small>
          </div>
          <div class="bubble">After approval, I’ll publish it and report views and order clicks here. <small>10:05</small></div>
        </div>
      </div>
    </section>

    <section class="shell" id="journey">
      <div class="section-head"><h2>One business, two simple ways to build.</h2><p>Chat when you want speed. Open the guided Studio when you want to choose layouts, reel formats and reference media.</p></div>
      <div class="steps">
        <article class="step"><div class="num">1</div><h3>Choose the outcome</h3><p>Website, reels, or both. Describe the business in WhatsApp or the guided Studio.</p></article>
        <article class="step"><div class="num">2</div><h3>Review one preview</h3><p>The agent builds a constrained business page and independently checks it before asking.</p></article>
        <article class="step"><div class="num">3</div><h3>Approve one checklist</h3><p>The WhatsApp-linked owner publishes exactly the version they reviewed.</p></article>
        <article class="step"><div class="num">4</div><h3>Improve with evidence</h3><p>Views and order-clicks return to WhatsApp. Any page change needs fresh approval.</p></article>
      </div>
    </section>

    <section class="shell">
      <div class="section-head"><h2>What the merchant gets.</h2><p>No account portal to learn and no blank website editor to fight.</p></div>
      <div class="outcomes">
        <article class="outcome"><h3>Verified business page</h3><p>A fast mobile page with products or services, pricing when supplied, business details, and tracked WhatsApp buttons.</p></article>
        <article class="outcome"><h3>Original reel system</h3><p>Trend-aware human-led formats, editable layers, and approved vertical videos made from supplied business media.</p></article>
        <article class="outcome"><h3>Plain-language report</h3><p>Views, order clicks, and one evidence-backed improvement proposal delivered in chat.</p></article>
      </div>
    </section>

    <section class="shell" id="ready">
      <div class="truth">
        <div><h2>Demo journey — not live merchant proof.</h2><p>This page shows the customer experience. A real merchant site is published only after their own content passes verification and they approve it.</p></div>
        <div class="checks">
          <div class="check"><strong>Working:</strong> WhatsApp intake, tenant isolation, catalog generation, verification, approvals, tracked CTAs, metrics, reel pipeline.</div>
          <div class="check"><strong>Live foundation:</strong> AWS-hosted Hermes is live and the public Worker forwards through a fail-closed authenticated origin.</div>
          <div class="check"><strong>Controlled beta:</strong> Meta-approved test recipients can complete the WhatsApp flow while production access is completed.</div>
          <div class="check"><strong>Still gated:</strong> Meta production-number access, one real merchant-media reel, and consented Vapi call acceptance.</div>
        </div>
      </div>
    </section>
  </main>
  <footer class="shell footer"><strong>Axcas</strong><span>WhatsApp-first growth for people who do not want dashboards.</span></footer>
</body>
</html>`;
}
