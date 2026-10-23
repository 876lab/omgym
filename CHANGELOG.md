# Changelog

## 2026-10-23 (night run): Store price check and price sources
- Store prices re-checked. Whey has risen in the US: ON Gold Standard 5 lb US$89.99 → US$114.99 (Store J$30,800 → J$37,700), 2 lb US$41.99 → US$64.99 (J$14,650 → J$21,000); Orgain plant protein US$29.99 → US$32.99 (J$11,300 → J$12,150). Other items unchanged.
- Every Store product now carries its price source, date and confidence (Amazon, Amazon price tracker, another US store, estimate). Seller view lists them and flags prices over 30 days old or never confirmed ("Check again"). New `priceCheck()` in core.js with tests.
- Exchange rate re-checked: Bank of Jamaica 22 Oct 2026, buying J$157.83 / selling J$159.65 (midpoint J$158.74) + 2% card fee → J$162, unchanged.
- Grocery price check: no newer dated supermarket, CAC or Market Bag prices than those already in the app (latest Market Bag on the tag page is 9 Oct; 16 Oct already used). No grocery prices changed.
- Sources: Bank of Jamaica indicative rates via AllRatesToday (22 Oct 2026); WheyIndex Amazon tracker (1 Oct 2026); Optimum Nutrition US store (23 Oct 2026); Vitacost (23 Oct 2026); Walmart (23 Oct 2026); Rocketium Amazon tracker (Jan 2026); Slickdeals (Apr 2026); Jamaica Observer Market Bag tag page.

## 2026-10-23: OMGym Store
- New Store tab: whey and plant protein, creatine, pre-workout, gloves, jump rope, resistance bands, shaker, lifting straps, wrist wraps. Bag with quantity controls and a "Send order on WhatsApp" button (owner: +1 658 218 4432), or copy the order.
- Prices include Amazon price, Florida sales tax, J$600/lb freight, Jamaica Customs duty, GCT and fees, plus 15% markup. A Seller view shows the full breakdown and profit per item.
- Small add-on prompts: jump rope on cardio-finisher days, gloves or straps on strength days, bands on rest days, protein powder on days short of protein. Each can be dismissed for the day.
- Pre-workout hidden for under-18s, pregnancy and health-screen "yes" answers; whey flagged for vegan or dairy-free users.
- Sources: Jamaica Trade Information Portal (HS 2106.90: 20% duty, 15% GCT, 0.3% SCF, 0.5% environmental levy, MOH permit, FSPID inspection); Jamaica Customs Agency duties page and de minimis page (US$100 FOB); JIS on Ministry of Health import permits; Bank of Jamaica rate via Jamaica Observer (J$158.98, 16 Oct 2026); Amazon tax-exempt help page; Optimum Nutrition and Garage Gym Reviews for product prices.

## 2026-10-23: Supermarket packs, shellfish, review fixes
- Prices are quoted per pack the way supermarkets sell them (2 kg bag of rice, whole frozen chicken, 155 g tin of mackerel, dozen eggs, bundle of callaloo), each with store, source and date. Meal tables show the pack you buy instead of a per-serving cost; the Today screen shows the week's shop.
- Edit price now records which store (PriceSmart, Hi-Lo, Loshusan or another).
- Shellfish added to allergies.
- Rest timer starts when you tick a set; week strip on Today; "Watch demos" link on every exercise; What's new on the Plan tab.
- Main meals keep at least ~22% of their calories from the starch (a fried-rice lunch had dropped to 40 g of rice). Protein for meat-eaters is now about 1.7 g/kg (84% of the 2.0 g/kg target), above the 1.6 g/kg level where muscle gains plateau (Morton et al., 2018).
- Proteins rotate only among options within 1.35× of the cheapest per gram of protein.
- Home Screen app: works offline at the gym and rolls over at midnight.
- Sources: Loshusan Supermarket online; Consumer Affairs Commission grocery survey (Jul 2026, includes Hi-Lo Constant Spring); Ministry of Agriculture JAMIS supermarket meat survey (includes Hi-Lo, Loshusan, PriceSmart); Jamaica Observer Market Bag (16 Oct 2026).

## 2026-10-22: First version
- Setup: body stats, tape measurements, goal and pace, activity, training days, style, equipment, PAR-Q+ health screen, injuries, location, diet, allergies.
- Calorie and protein targets (Mifflin-St Jeor, ISSN protein), body-fat (US Navy), BMI and waist-to-height ratio.
- 45-minute workouts in 6-week cycles for gym, dumbbells or bodyweight, with knee, back and shoulder swaps.
- Jamaican-style meals with amounts, costs and methods; 7-day shopping list with sourced prices you can edit.
- Weigh-ins, trend chart and calorie adjustment suggestions.
- Home Screen icon and app name; tests on every push and a daily live health check.
