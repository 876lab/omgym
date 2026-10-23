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

## Backlog
- [ ] **Live store prices (blocked: PriceSmart blocks automated reading, Hi-Lo's online shop isn't reachable, Loshusan hides prices from automated readers).** Ways forward for the owner to choose: share receipts or screenshots of the store apps, or connect Claude in Chrome on a computer for a weekly price check. Until then the owner can tap Edit price and pick the store.
- [ ] More plant protein for vegan plans: soya chunks, chickpeas (tin), with Loshusan prices.
- [ ] A shrimp or saltfish meal (tag shrimp `shellfish`, saltfish `fish`) for variety.
- [ ] Daily food budget cap that steers toward the cheapest proteins and starches.
- [ ] Meal-prep view: cook once, eat three days.
- [ ] Suggest next session's weights from logged loads (add 2.5–5% when all sets hit the top of the range).
- [ ] Simple exercise illustrations (no copyrighted images).
- [ ] Monthly price refresh from the CAC grocery survey and Observer Market Bag.
- [ ] Sync between the Home Screen app and the claude.ai version (needs the owner's decision on accounts).

## Notes from runs
- 2026-10-23: Store sites checked. PriceSmart (robots block), Hi-Lo online shop (not reachable), Loshusan (prices load by script, not readable). Used Loshusan prices from earlier indexed pages, the CAC survey (outlets include Hi-Lo Constant Spring) and the agriculture ministry's supermarket survey (includes Hi-Lo, Loshusan, PriceSmart).
