# Changelog

## 2026-10-25: Brown-stew chicken (owner feedback)
- `m_steamchicken` is now "Brown-stew chicken with {c} & steamed cabbage" (Jamaican dish style, `cu: 'jm'`), with escallion added and a properly seasoned method (overnight seasoning, browning, stewed gravy). The owner noted "steamed chicken" isn't a Jamaican dish. The id is kept so saved data is unaffected.
- Fixed: the name was hard-coded "with sweet potato" even when the plan picked yellow yam; it now follows the starch. New logic test checks the name matches.

## 2026-10-25 (night run): More protein for vegetarians and vegans; price check
- New ingredients (USDA FoodData Central): soya chunks, weighed dry (`soya`, values of defatted soy flour, FDC 174273: 327 kcal, 51.5 g protein per 100 g; tagged `soy`) and tinned chickpeas, per drained gram (`chickpeas`, FDC 173801: 138 kcal, 7.04 g protein; 400 g tin drains to about 240 g, `y` 0.6). Amounts show "dry" for soya and "drained (about N tins)" for chickpeas.
- New plant dishes: brown-stew soya chunks with rice & peas (JM), curry chickpeas & soya chunks, soya chunk & vegetable hash (breakfast), chickpea mash on bread or sweet potato (snack). Soya added as an option to stewed peas & callaloo, the pumpkin stew, the burrito bowl and bean pasta (TVP bolognese). Plant dishes stay limited to plant diets, so omnivore plans are unchanged (tested).
- Planner: vegetarian and vegan plans pick the protein-dense option in each dish at every budget level and may pay up to 4x the cheapest protein per gram to do so (US TVP vs dried beans). PRO top-up can use soya chunks when no animal option fits. Protein targets unchanged.
- Result (median protein vs target, Budget level): JM vegetarian 50% → 63%, JM vegan 47% → 73%, US vegetarian 54% → 74%, US vegan 47% → 77%. Whole test matrix: 10th percentile 44% → 54%, median 70% → 79%; calorie accuracy unchanged.
- Soy added to the allergy list (soya never used with it, even if ticked); soya chunks and chickpeas added to Foods I buy. Stir-fry and fried-rice methods note salt instead of soy sauce for people avoiding soy.
- Prices: US Walmart.com 25 Oct 2026 (Bob's Red Mill TVP 12 oz US$10.00; Great Value chickpeas 15.5 oz US$0.92). Jamaica: estimates (soya chunks 8 oz J$450 from the US Caribbean-grocer price US$2.75 converted; Grace chickpeas 400 g J$330 from CAC tinned broad bean prices) because Loshusan, PriceSmart and Hi-Lo prices are not readable online.
- Price check: no newer Market Bag than 23 Oct (already used), no newer CAC survey, no change to customs duty, GCT or fees found. Exchange rate: the Bank of Jamaica 22 Oct rate (buying J$157.87, selling J$159.59) is still the latest published; Store J$162 per US$ and PRO J$159.59 unchanged (notes re-dated). Amazon not readable, so Store prices unchanged (Store paused anyway).
- Tests: logic tests add the soy allergy to the full diet x allergy matrix, USDA values, pack prices, plant protein thresholds (vegan 65%+, vegetarian 60%+ median), calorie accuracy, omnivore plans unchanged, soy allergy, Foods I buy, PRO soya top-up. Browser: soy allergy option; a vegan week shows soya/TVP and chickpeas with dry/drained amounts and no animal foods (screenshot `shot-vegan-meals.png`).
- Sources: Messina et al. 2018, IJSNEM 28(6):674–685 (soy vs animal protein with resistance training, no difference); Academy of Nutrition and Dietetics position paper "Vegetarian Dietary Patterns for Adults" (J Acad Nutr Diet, 2025); USDA FoodData Central via getfoodfacts.com and foodstruct.com; Walmart.com; jcskitchen.com; Jamaica Observer Market Bag tag page; Jamaica Homes News Forex 23 Oct 2026 (BOJ 22 Oct rates).

## 2026-10-24: Store paused (owner decision)
- `STORE.paused` (true) and `STORE.pauseNote` in core.js. While paused the Store tab shows a paused notice and the saved bag (items and quantities, no prices), with no product grid, no Add to bag, no WhatsApp order and no add-on prompts on Today or Meals; the bag badge is hidden; `cartadd` is refused with a toast. Saved bags are kept untouched. Seller view and order sheets for links already sent keep working; Seller view says the Store is paused.
- Grocery whey (JM) uses a local shop price while the Store is paused: ON Gold Standard 5 lb J$13,800 at Fitness Junkies JA (Oct 2026), instead of the Store's J$37,800.
- Why: a local comparison found whey at about a third of the Store price (J$13,800 vs J$37,800 for 5 lb; J$7,570 vs J$21,050 for 2 lb). Research on import routes, duties, the US$100 de minimis and MOHW permits is in the claude.ai doc "Bringing OMGym Store prices down".
- To reopen: set `STORE.paused` to false, rebuild, run the tests.
- Tests: the browser walk-through now runs on a copy with the Store open (tests/out/index-open.html), and 11 new checks cover the paused build (notice, no prices or ordering, saved bag kept, no prompts, badge hidden, Seller view, light and dark screenshots). Logic tests cover the whey price in both states.

## 2026-10-24 (night run): What's new button and price check
- "What's new" button in the header (sparkle icon) with an orange dot while the viewer has unseen entries. Tapping it opens a full-screen panel listing every `CHANGES` entry newest first, with "New" on the ones not seen before; the dot clears after opening. The last seen entry is kept per viewer in browser storage (`omgym-news-seen`, key = date + title; falls back to the date if an entry is renamed). Escape or Close shuts the panel. The What's new card on the Plan tab stays. New `changeKey()` and `unseenChanges()` in core.js.
- Grocery prices (Jamaica Observer Market Bag, Coronation Market, 23 Oct 2026): tomato J$500 → J$400/lb, Irish potato J$300 → J$250/lb, onion 3 lb bag J$850 → J$750 (J$250/lb), escallion bundle J$100 → J$70 (J$300/lb); sweet potato J$450/lb and carrot J$500/lb re-confirmed (dates moved to 23 Oct).
- Store: Environmental Protection Levy raised from 0.5% to 0.85% of CIF from 1 Oct 2026 (Environmental Protection Levy Act 2026; JIS 24 and 26 Sep 2026; Senate passed it 26 Sep). Store prices that moved (J$50 each, from rounding): ON whey 5 lb J$37,800, 2 lb J$21,050, ISO100 J$39,200, C4 J$13,500, jump rope, shaker and straps J$3,300, wrist wraps J$3,850. Orgain, both creatines, gloves and bands unchanged. GCT 15% and import duty unchanged (EY 2026/27 budget summary).
- Exchange rate: Bank of Jamaica website, 22 Oct 2026 (latest posted on 24 Oct): buying J$157.87, selling J$159.59, midpoint J$158.73 + 2% card fee → Store J$162 (unchanged). PRO invoices now use J$159.59 (was J$159.65 from AllRatesToday): US$10 = J$1,595.90.
- Amazon prices not changed: Amazon still blocks automated reading and the only search results (Slickdeals) were undated or old deals.
- Tests: What's new logic (unique keys, sort order, unseen counts, renamed entries); 19 new browser checks (dot on first visit, panel lists newest first, every entry marked New, dot clears and stays cleared after reload, comes back for a newer entry, Escape and Close, dark-mode screenshot). The PRO test profile now always trains on the day the test runs (it failed on weekends because Today was a rest day). PRO amount checks follow `PRO.boj.rate` instead of a fixed J$1,596.50.
- Sources: Jamaica Observer Market Bag 23 Oct 2026 (jamaicaobserver.com/2026/10/23/market-bag-carrot-500-relief-rains-not-yet-felt/); boj.org.jm (22 Oct 2026 rates); JIS "House Establishes Comprehensive Statutory Framework for Environmental Protection Levy" (24 Sep 2026) and "Environmental Protection Levy to Help Fund Jamaica's Climate Resilience" (26 Sep 2026); Jamaica Gleaner 26 Sep 2026; EY Jamaica revenue measures 2026/27 summary.

## 2026-10-23: Food budgets, foods I buy, US meals, quick region switch, PRO protein top-up
- Food budget levels (profile `budget` 1/2/3): each region marks pricier foods tier 2 (Standard) or 3 (Premium) in `PRICES`; Budget keeps today's plans. Standard and Premium rotate among more proteins but keep to protein-dense choices in each dish. The List shows a week of food eaten at each level (`weekCostByTier`) and an optional weekly limit (`foodCap`) with a one-tap switch to a level that fits.
- "Foods I buy" (`likes`): Greek yogurt, cottage cheese, berries, whey, chicken breast, lean beef, turkey, salmon, whole-wheat bread, pasta, frozen veg, oats, eggs, tuna. Used about two days in three whatever the level; never overrides diet or allergies.
- 12 new ingredients (USDA values) and 17 new dishes: yogurt and cottage-cheese bowls, protein shake, chicken breast bowls, salmon, beef or turkey pasta; US dishes (chili, stir-fry, sheet-pan chicken, tuna pasta salad, burrito bowl, bean pasta, egg or peanut-butter toast). Jamaican dishes are tagged `cu: 'jm'`; dish style follows the region unless the person picks Jamaican, American or Both (`cuisine`).
- US prices from Walmart.com (23 Oct 2026) and BLS (chicken breast US$4.20/lb, Sep 2026). Jamaica: Chobani Greek yogurt J$2,700 + GCT at JA Deals; beef mince J$1,400–1,693/kg (agriculture ministry survey, Nov 2025); chicken breast J$670 per 500 g (Expatistan, Jun 2026); whey from the OMGym Store price; cottage cheese, berries, turkey, salmon, pasta, frozen veg are estimates until the owner confirms shelf prices.
- Quick Prices (Jamaica / USA / Elsewhere) and Budget switch at the top of Meals and the List; US shopping names (white sandwich bread, spinach); region-aware seasoning tips; Store notes it delivers in Jamaica only.
- PRO: daily protein top-up on the snack (tuna, sardines, whey, Greek yogurt, cottage cheese or chicken breast, by budget and foods ticked) with the same calories trimmed from starch elsewhere. PRO cut plans now reach about 93–97% of 2.3 g/kg (was 83%).
- Tests: 711k logic assertions (meal loop now runs Budget and Premium), 83 browser checks.

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
