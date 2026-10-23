# OMGym roadmap

## Owner and app
- Owner: lives in Jamaica, uses an iPhone, shops at **PriceSmart, Hi-Lo and Loshusan**. Wants affordable meals and 45-minute sessions, and works on the app with Claude every day.
- Live app: https://876lab.github.io/omgym/ (GitHub Pages from `main`, file `index.html`, built from `src/` by `python3 scripts/build.py`).
- claude.ai artifact: https://claude.ai/artifact/7afMFqTRyUmBr7j7DHyr8W (same app; saves to the owner's Claude account). Republish it from `dist/artifact.html` after changes, when the session can.
- Research and test report: OMGym project doc `claude/omgym-v1-research-and-test-report.md`.

## Architecture
- `src/core.js`: plan logic with no screen code (targets, workouts, meals, prices, shopping list, trend). Prices live in `PRICES`; what's new lives in `CHANGES`.
- `src/ui.js`: screens and storage (claude.ai account storage when available, otherwise the browser).
- `src/shell.html`: layout and styles (light and dark themes via colour tokens).
- `tests/run.sh`: every check. `tests/logic.js` (580k+ assertions), `tests/browser.js` (full walk-through in a headless browser; with `SITE=` it checks the live site).

## Rules for every change (binding for the nightly run)
1. Safety floors stay: never below 1,200 kcal (women) / 1,500 kcal (men); deficit capped at 1,000 kcal and 25% of maintenance; under-18 and pregnancy stay at maintenance; PAR-Q "yes" keeps the doctor-first banner.
2. Change a formula or target only with a primary source (position stand, systematic review, government guideline), and update `tests/logic.js` to match.
3. Prices are quoted **per pack** as the store sells it (bag, tin, dozen, loaf, bottle, bundle, head) or per lb only for produce weighed at the counter. Every price keeps its store, source and date. Prefer PriceSmart, Hi-Lo and Loshusan; then the Consumer Affairs Commission survey; then market reports. Label anything else "Estimate". Never show per-serving costs.
4. Never remove a feature or change the user's saved-data format without a migration.
5. Run `bash tests/run.sh`; publish only on ALL CHECKS PASSED. Rebuild with `scripts/build.py` before committing (CI fails if `index.html` is stale).
6. Add a plain-language entry at the top of `CHANGES` in `src/core.js` and a dated entry in `CHANGELOG.md`.
7. One focused improvement per night. Never change repository settings or hosting, add paid services, keys or secrets.

## Store (added 2026-10-23)
- Store tab sells supplements and gym gear the owner buys on Amazon and ships through a Miami freight forwarder. Orders go to the owner's WhatsApp (+1 658 218 4432); nothing is charged in the app.
- Price = (Amazon price + 7% Miami-Dade sales tax) × FX, + J$600/lb freight, + Jamaica Customs (20% duty on CIF, 15% GCT on CIF + duty, 0.3% standards fee, 0.5% environmental levy, J$100 stamp duty over J$5,500 CIF), then 15% markup on landed cost, rounded up to J$50. Settings live in `STORE` in `src/core.js`; products in `PRODUCTS`.
- Rules: keep the markup at 15% and freight at J$600/lb unless the owner changes them; never show pre-workout (caffeine) to under-18s, pregnant users or anyone with a health-screen "yes"; flag milk in whey for vegan or dairy-free users; add-on prompts stay one per screen, dismissible, with no fake scarcity, countdowns or invented reviews.
- Orders: the customer's WhatsApp message ends with an order link (`?o=`, `&id=`, `&n=`) to the public site, which opens the order sheet with Amazon links. Bag keys are `productId.variantId`. Exact Amazon links (`asin`) only for listings actually seen on Amazon; everything else uses a search link with the product, size and flavour. Cost and profit on the order sheet only when Seller view is on for that phone (`localStorage['omgym-seller']`).
- Legal: supplements need a Ministry of Health import permit (Pharmaceutical Chemical and Food Additives Import Permit; one permit covers up to ten products) and post-import inspection by FSPID for processed foods. The owner should also register the business and check GCT registration with TAJ.

## PRO (added 2026-10-23)
- For lifters with 3+ years of training (self-declared). US$10 a month, no tax line on invoices (owner's decision), no automatic renewal.
- Phases (`PRO_PHASES` in `src/core.js`): cut 0.5/0.75/1%/wk with 2.3 g/kg protein (ISSN 2017; Garthe 2011), lean bulk ~0.15 or 0.25%/wk with 2.0 g/kg (Iraki 2019), maintain 2.2 g/kg. Safety floors, deficit cap, under-18/pregnancy guardrails apply on top. PRO training: Build RIR 2, Push RIR 0–1, Deload; 5–8 reps on a cut. Weekly sets per muscle (ACSM 2026: ~10+). Weekly check-ins (±100 kcal).
- Payment: the customer creates an invoice in the app (`PRO-YYMM-<PRO ID>-<n>`), pays Scotiabank JMD (CARGILL BROWN, Chequing, 90605 000606999) at the Bank of Jamaica rate or PayPal, and sends proof on WhatsApp. Early access: 3 days, once every 30 days. The owner confirms in the private **PRO Desk** (https://claude.ai/artifact/AwAwUcCoNJ795xjefZmxC3), which signs an unlock link (ECDSA P-256). The app holds only the public key (`PRO.publicKey`) and re-checks signatures on every load. On iPhone the Home Screen app has its own storage, so customers paste the link under "Already paid?".
- Rules: never change `PRO.publicKey` (every issued link would stop working) and never put a private key in the repo or the app. Keep the price, bank details and terms unless the owner changes them. The nightly run updates `PRO.boj` to the latest Bank of Jamaica selling rate with its date. `PRO.paypal` is empty until the owner sends his PayPal address.

## Backlog
- [ ] PayPal address for PRO (`PRO.paypal`): waiting for the owner.
- [ ] **Owner request, do first (2026-10-23):** a "What's new" button in the header, like Futures Radar's (`#openHelp` icon with a `newdot` that shows when there are entries the viewer hasn't seen). Tapping it opens a panel listing `CHANGES` from `src/core.js` (newest first, plain-language bullets). Remember the last seen entry per viewer in browser storage so the dot clears after opening. Keep the existing What's new section on the Plan tab. Add browser tests (dot shows on first visit, clears after opening, panel lists the newest entry).
- [x] (2026-10-23) Confirm each Store product's Amazon price (Amazon blocks automated reading; ask the owner for screenshots or use whatever source becomes readable) and refresh `STORE.fx` from the Bank of Jamaica weekly.
- [ ] Owner: open Amazon for items marked "Estimate" or "Check again" in Seller view (ISO100, C4, Nutricost, all gear) and send screenshots; then set `conf: 'amazon'` with the date. Whey prices rose ~28% in 2026, so re-check protein monthly.
- [ ] Show a gentle "price may have changed" note on Store items whose source is over 60 days old (customer side), using `priceCheck()`.
- [ ] Compare Store prices with local stores (PriceSmart, supplement shops in Kingston) so the owner knows where he is competitive.
- [ ] **Live store prices (blocked: PriceSmart blocks automated reading, Hi-Lo's online shop isn't reachable, Loshusan hides prices from automated readers).** Ways forward for the owner to choose: share receipts or screenshots of the store apps, or connect Claude in Chrome on a computer for a weekly price check. Until then the owner can tap Edit price and pick the store.
- [ ] More plant protein for vegan plans: soya chunks, chickpeas (tin), with Loshusan prices.
- [ ] A shrimp or saltfish meal (tag shrimp `shellfish`, saltfish `fish`) for variety.
- [ ] Daily food budget cap that steers toward the cheapest proteins and starches.
- [ ] Meal-prep view: cook once, eat three days.
- [ ] Suggest next session's weights from logged loads (add 2.5–5% when all sets hit the top of the range).
- [ ] Simple exercise illustrations (no copyrighted images).
- [ ] Owner's own product photos for the Store once stock arrives (replace the drawn pictures; never copy Amazon or brand photos).
- [ ] Add exact Amazon listings (ASINs) for the other Store items once the owner sends the links he buys from.
- [ ] Monthly price refresh from the CAC grocery survey and Observer Market Bag.
- [ ] Sync between the Home Screen app and the claude.ai version (needs the owner's decision on accounts).

## Notes from runs
- 2026-10-23: Store added. Amazon, PriceSmart and the Jamaica trade portal's 9506 (exercise equipment) and 4203 (gloves) pages could not be read, so gym gear uses the standard 20% duty (conservative). Protein powder 2106.90 rates confirmed on the Jamaica Trade Information Portal.
- 2026-10-23: Store sites checked. PriceSmart (robots block), Hi-Lo online shop (not reachable), Loshusan (prices load by script, not readable). Used Loshusan prices from earlier indexed pages, the CAC survey (outlets include Hi-Lo Constant Spring) and the agriculture ministry's supermarket survey (includes Hi-Lo, Loshusan, PriceSmart).
- 2026-10-23 (night): Price check found no newer dated grocery prices. PriceSmart (permission request timed out / robots), Loshusan and Hi-Lo not readable; Observer Market Bag tag page newest is 9 Oct (16 Oct already used). Amazon blocks robots and camelcamelcamel failed, so Store prices came from WheyIndex (Amazon tracker), Vitacost, Walmart and ON's own store. npm could not reach the registry; tests ran with the global Playwright.
