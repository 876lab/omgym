# Changelog

## 2026-10-23: PayPal address and Lynk support for PRO
- PRO invoices show the owner's PayPal (Cargill.brown@gmail.com) with a note on buyer protection.
- Lynk support: when the owner adds his Lynk username, invoices offer Lynk first (J$ at the Bank of Jamaica rate), and the Scotiabank details can be switched off. The PRO Desk records Lynk payments with the J$ received.
- Sources: Jamaica Observer (Lynk serves 300,000 users, 10 Apr 2026); JIS on LynkBiz (sole traders can sign up with a personal account); Ezy Web Pro on PayPal withdrawals in Jamaica (Apr 2026).

## 2026-10-23: OMGym PRO
- PRO section (header button) for lifters with 3+ years of training: cut (0.5/0.75/1% a week, protein 2.3 g/kg), lean bulk (~0.15 or 0.25% a week, 2.0 g/kg) or maintain (2.2 g/kg); harder training weeks (Build RIR 2, Push RIR 0–1, Deload; 5–8 reps on a cut); weekly sets per muscle; weekly calorie check-ins.
- Payments: invoice in the app with Scotiabank JMD details and the J$ amount at the Bank of Jamaica rate (J$159.65, 22 Oct 2026); proof sent on WhatsApp; 3-day early access once every 30 days; signed unlock link that doubles as the receipt; renewal reminder 5 days before the end; terms (no automatic renewal, no refunds for part months, full refund if not unlocked within 3 working days or paid twice).
- Owner's private PRO Desk (claude.ai artifact, owner-only storage): reads the customer's message, signs the unlock link after the owner ticks that the money arrived, keeps the payment log, ending-soon reminders and a new-phone reissue.
- Links are WhatsApp-safe (no * _ ~). Order links got the same fix.
- Sources: ISSN position stand on protein and exercise (2017); Garthe et al. 2011; Iraki et al. 2019 (Sports); ACSM resistance training position stand 2026; Bank of Jamaica rate via AllRatesToday / Jamaica Observer.

## 2026-10-23: Store flavours, pictures and order links
- Customers pick a flavour (whey, ISO100, Orgain, C4) or glove size before adding to the bag; the bag lists each flavour or size on its own line. Older bags merge into the new format.
- Simple drawn pictures for every Store item (generic shapes, no brand artwork), also on the add-on prompts.
- The WhatsApp message now carries an order number (same bag, name and day give the same number) and an order link. The link opens an order sheet on the public site: each item with quantity and flavour/size, "Open on Amazon" (exact listing for ON Gold Standard 5 lb flavours, ASINs seen on Amazon) or "Find on Amazon" (search with the exact product, size and flavour), price and weight, "Ordered" ticks remembered on the phone, Amazon subtotal and shipping weight.
- Cost, landed cost and profit on the order sheet show only on a phone with Seller view switched on; customers who open the link see the items only.
- Sources: Amazon product pages for ON Gold Standard 5 lb (ASINs B000QSNYGI, B000QSTBNS, B000GISU1M, B000QSRO1Y, from search results).

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
