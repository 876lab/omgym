# OMGym

A personal 45-minute workout and budget meal planner. Enter your body measurements and goal; OMGym builds a daily training session, four meals sized to your calories and protein, and a 7-day shopping list priced at Jamaican (or US, or your own) food prices. It tracks weigh-ins and suggests calorie changes when your trend drifts from the plan.

Open the app: https://876lab.github.io/omgym/

## Put it on your Home Screen or desktop
- **iPhone / iPad:** open the link in Safari → Share → **Add to Home Screen**.
- **Android:** open in Chrome → menu → **Add to Home screen** (or **Install app**).
- **Mac:** Safari → File → **Add to Dock**. Chrome or Edge: the install icon at the right of the address bar.
- **Windows:** Chrome or Edge → install icon in the address bar, then pin it to the taskbar or Start.

The Home Screen app works offline at the gym. Your data is saved in the browser you use, on that device. The claude.ai version of the app saves to your Claude account instead.

## Working on it
- Edit `src/` (`core.js` = plan logic, `ui.js` = screens, `shell.html` = styles and layout).
- `python3 scripts/build.py` rebuilds `index.html` (the site) and `dist/artifact.html` (the claude.ai artifact).
- `npm test` runs every check: 580k+ logic assertions plus a full browser walk-through.
- GitHub runs the tests on every push to `main` and checks the live site every morning at 5:41am Jamaica time. A failure emails the repo owner.

General fitness guidance, not medical advice.
