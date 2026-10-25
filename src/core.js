/* ===== OMGym core: pure planning logic (no DOM) ===== */
var OM = (function () {
  'use strict';
  var DAY_MS = 864e5;

  /* ---------- dates ---------- */
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { var a = s.split('-').map(Number); return new Date(a[0], a[1] - 1, a[2]); }
  function dayNum(s) { var d = parseYmd(s); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS); }
  function addDays(s, n) { var d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  function weekday(s) { return parseYmd(s).getDay(); } // 0 = Sunday
  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return Math.abs(n); }

  /* ---------- body metrics ---------- */
  function navyBodyFat(p) {
    // US Navy circumference method, metric form (cm)
    if (!p.neckCm || !p.waistCm || !p.heightCm) return null;
    var v;
    if (p.sex === 'male') {
      if (p.waistCm - p.neckCm <= 0) return null;
      v = 495 / (1.0324 - 0.19077 * Math.log10(p.waistCm - p.neckCm) + 0.15456 * Math.log10(p.heightCm)) - 450;
    } else {
      if (!p.hipCm || p.waistCm + p.hipCm - p.neckCm <= 0) return null;
      v = 495 / (1.29579 - 0.35004 * Math.log10(p.waistCm + p.hipCm - p.neckCm) + 0.221 * Math.log10(p.heightCm)) - 450;
    }
    if (!isFinite(v) || v < 2 || v > 70) return null;
    return v;
  }
  function bfCategory(bf, sex) {
    // ACE classification
    var t = sex === 'male' ? [6, 14, 18, 25] : [14, 21, 25, 32];
    if (bf < t[0]) return 'Essential fat range';
    if (bf < t[1]) return 'Athletic range';
    if (bf < t[2]) return 'Fitness range';
    if (bf < t[3]) return 'Average range';
    return 'Above average';
  }
  function bmiCategory(b) {
    if (b < 18.5) return 'Underweight'; if (b < 25) return 'Healthy range'; if (b < 30) return 'Overweight'; return 'Obesity range';
  }
  function whtrCategory(r) {
    // NICE NG246
    if (r < 0.4) return 'Below 0.4'; if (r < 0.5) return 'Healthy (0.4–0.49)'; if (r < 0.6) return 'Increased risk (0.5–0.59)'; return 'High risk (0.6+)';
  }

  var NEAT = { desk: 1.2, light: 1.3, onfeet: 1.45, manual: 1.6 };
  var MET = { weights: 5.0, mix: 5.5, cardio: 6.5 };
  var LOSS_RATE = { steady: 0.005, standard: 0.0075, faster: 0.01 };
  var GAIN_RATE = { beginner: 0.0035, intermediate: 0.0025, advanced: 0.0015 };

  // PRO phases for lifters with 3+ years of training.
  // Cut: 0.5–1% of body weight a week (Garthe 2011), protein 2.3 g/kg (ISSN 2017: 2.3–3.1 g/kg for trained lifters in a deficit).
  // Bulk: slower than the 0.25–0.5%/week used for novices (Iraki 2019); protein 2.0 g/kg (1.6–2.2).
  var PRO_PHASES = {
    cut: { goalType: 'lose', label: 'Cut', rates: [0.005, 0.0075, 0.01], def: 0.0075, ppk: 2.3 },
    bulk: { goalType: 'gain', label: 'Lean bulk', rates: [0.0015, 0.0025], def: 0.0015, ppk: 2.0 },
    maintain: { goalType: 'maintain', label: 'Maintain', rates: [0], def: 0, ppk: 2.2 }
  };
  function proPlanOk(pro) { return !!(pro && PRO_PHASES[pro.phase]); }
  function calcTargets(p, kcalAdj, pro) {
    kcalAdj = kcalAdj || 0;
    var w = p.weightKg, h = p.heightCm, a = p.age, male = p.sex === 'male';
    var hm = h / 100;
    var bmr = 10 * w + 6.25 * h - 5 * a + (male ? 5 : -161); // Mifflin-St Jeor
    var neat = NEAT[p.activity] || 1.2;
    var sessKcal = (MET[p.style] || 5) * w * 0.75; // 45 min session
    var days = (p.days || []).length;
    var exDaily = sessKcal * days / 7;
    var tdee = bmr * neat + exDaily;
    var bmi = w / (hm * hm);
    var whtr = p.waistCm ? p.waistCm / h : null;
    var bf = navyBodyFat(p);
    var flags = [];
    var minHealthy = 18.5 * hm * hm;
    var goal = p.goalKg;
    var forceMaintain = false;

    if (a < 18) { forceMaintain = true; flags.push({ level: 'warn', text: 'Calorie targets here are built for adults. Under 18, this plan holds you at maintenance while you build the training habit. Check weight goals with a doctor or school nurse.' }); }
    if (p.pregnant) { forceMaintain = true; flags.push({ level: 'warn', text: 'Pregnant or breastfeeding: the plan stays at maintenance calories, not a deficit. Clear your training plan and food needs with your doctor or midwife.' }); }
    if (goal < minHealthy) {
      flags.push({ level: 'warn', text: 'Your goal weight is below the healthy BMI range for your height (under ' + minHealthy.toFixed(1) + ' kg). The plan aims for ' + minHealthy.toFixed(1) + ' kg instead.' });
      goal = minHealthy;
    }
    var parqYes = (p.parq || []).some(Boolean);
    if (parqYes) flags.push({ level: 'stop', text: 'You answered yes to a health screening question. Talk to your doctor before starting. Until then the workouts keep intensity moderate and skip hard intervals.' });

    var diff = goal - w;
    var goalType = forceMaintain ? 'maintain' : (diff < -1 ? 'lose' : (diff > 1 ? 'gain' : 'maintain'));
    var proPhase = !forceMaintain && proPlanOk(pro) ? pro.phase : null;
    var proRate = null;
    if (proPhase) {
      var ph = PRO_PHASES[proPhase];
      goalType = ph.goalType;
      proRate = ph.rates.indexOf(pro.rate) >= 0 ? pro.rate : ph.def;
    }
    var floor = male ? 1500 : 1200;
    var kcal, plannedRate = 0, floorApplied = false, deficit = 0;

    if (goalType === 'lose') {
      var r = proPhase ? proRate : (LOSS_RATE[p.pace] || LOSS_RATE.standard);
      deficit = w * r * 7700 / 7;
      deficit = Math.min(deficit, 1000, tdee * 0.25);
      kcal = tdee - deficit;
      if (kcal < floor) { kcal = floor; floorApplied = true; }
    } else if (goalType === 'gain') {
      var g = proPhase ? proRate : (GAIN_RATE[p.experience] || GAIN_RATE.beginner);
      var surplus = proPhase ? Math.max(100, Math.min(tdee * 0.15, w * g * 7700 / 7)) : Math.max(150, Math.min(450, w * g * 7700 / 7));
      kcal = tdee + surplus;
    } else {
      kcal = tdee;
    }
    kcal = kcal + kcalAdj;
        kcal = Math.max(kcal, floor);
    kcal = Math.round(kcal / 10) * 10;

    // planned weekly change from the final calorie number
    var dailyDelta = kcal - tdee;
    plannedRate = dailyDelta * 7 / 7700; // kg per week (negative = loss)

    // protein: per kg of a reference weight (adjusted when BMI >= 30)
    var refW = bmi >= 30 ? 27 * hm * hm : w;
    var ppk = proPhase ? PRO_PHASES[proPhase].ppk : (goalType === 'lose' ? 2.0 : goalType === 'gain' ? 1.8 : 1.6);
    var protein = Math.round(Math.min(refW * ppk, 230));
    var fat = Math.round(Math.max(kcal * 0.27 / 9, 0.6 * refW));
    var carbs = Math.round((kcal - protein * 4 - fat * 9) / 4);
    if (carbs < 100) { fat = Math.round(Math.max(0.5 * refW, (kcal - protein * 4 - 100 * 4) / 9)); carbs = Math.round((kcal - protein * 4 - fat * 9) / 4); }

    // projection
    var weeks = null;
    if (goalType === 'lose' && plannedRate < 0) {
      var rr = -plannedRate / w;
      weeks = Math.log(goal / w) / Math.log(1 - rr);
    } else if (goalType === 'gain' && plannedRate > 0) {
      weeks = (goal - w) / plannedRate;
    }
    if (floorApplied) flags.push({ level: 'info', text: 'Calories are held at the safe minimum of ' + floor + ' kcal so you are not under-eating. Progress will be a little slower than the pace you picked.' });
    if (bmi < 18.5 && goalType !== 'gain') flags.push({ level: 'warn', text: 'Your BMI is under 18.5. Focus on strength and eating enough; speak to a doctor about any weight loss.' });

    return {
      bmr: Math.round(bmr), neat: neat, sessKcal: Math.round(sessKcal), exDaily: Math.round(exDaily), tdee: Math.round(tdee),
      bmi: bmi, bmiCat: bmiCategory(bmi), whtr: whtr, whtrCat: whtr ? whtrCategory(whtr) : null,
      bf: bf, bfCat: bf != null ? bfCategory(bf, p.sex) : null,
      leanKg: bf != null ? w * (1 - bf / 100) : null,
      goalType: goalType, pro: proPhase, proRate: proRate, goalKg: goal, kcal: kcal, protein: protein, fat: fat, carbs: carbs,
      plannedWeeklyKg: plannedRate, weeksToGoal: weeks, floorApplied: floorApplied, flags: flags, caution: parqYes || !!p.pregnant,
      refW: refW, ppk: ppk
    };
  }

  /* ---------- exercise library ---------- */
  // eq: g = gym, d = home dumbbells, b = bodyweight only. avoid: k knee, b lower back, s shoulder. kind: c compound, a accessory, t timed core, m carry
  var EX = [
    ['bbsquat', 'Barbell back squat', 'squat', 'g', 'kb', 'c', 'Brace your belly, sit between your heels, keep knees in line with toes.'],
    ['goblet', 'Goblet squat', 'squat', 'gd', '', 'c', 'Hold one dumbbell at your chest, elbows inside knees, chest tall.'],
    ['legpress', 'Leg press', 'squat', 'g', '', 'c', 'Feet shoulder-width, lower until hips start to tuck, press through mid-foot.'],
    ['boxsquat', 'Box squat to bench', 'squat', 'gdb', '', 'c', 'Sit back to a bench at a pain-free height, pause lightly, stand tall.'],
    ['bwsquat', 'Tempo bodyweight squat', 'squat', 'b', 'k', 'c', 'Three seconds down, one second pause, stand up fast.'],
    ['bbrdl', 'Barbell Romanian deadlift', 'hinge', 'g', 'b', 'c', 'Soft knees, push hips back, bar slides down the thighs, flat back.'],
    ['dbrdl', 'Dumbbell Romanian deadlift', 'hinge', 'gd', 'b', 'c', 'Push hips back until hamstrings stretch, keep the dumbbells close.'],
    ['swing', 'Kettlebell or dumbbell swing', 'hinge', 'gd', 'b', 'c', 'Snap the hips forward; arms just guide the weight to chest height.'],
    ['hipthrust', 'Hip thrust (back on bench)', 'hinge glute', 'gdb', '', 'c', 'Chin tucked, drive through heels, squeeze glutes for one second at the top.'],
    ['bridge', 'Glute bridge with pause', 'glute', 'gdb', '', 'a', 'Lie on your back, heels close, lift hips and hold two seconds.'],
    ['slrdl', 'Single-leg RDL (hand on wall)', 'glute', 'gdb', 'b', 'a', 'Hinge on one leg, back leg reaches behind, hips stay square.'],
    ['backext', 'Back extension', 'glute', 'g', 'b', 'a', 'Hinge at the hips, squeeze glutes to come up, no over-arching.'],
    ['bench', 'Barbell bench press', 'push_h', 'g', 's', 'c', 'Shoulder blades pinched, feet planted, bar touches lower chest.'],
    ['dbbench', 'Dumbbell bench press', 'push_h', 'gd', 's', 'c', 'Elbows about 45 degrees from your body, press up and slightly in.'],
    ['floorpress', 'Dumbbell floor press', 'push_h', 'gd', '', 'c', 'Lie on the floor, lower until elbows touch down, press up.'],
    ['pushup', 'Push-up', 'push_h', 'gdb', 's', 'c', 'Body in one straight line, chest to just above the floor.'],
    ['inclpush', 'Incline push-up (hands on bench or counter)', 'push_h', 'gdb', '', 'c', 'Higher hands make it easier. Lower the height as you get stronger.'],
    ['cablerow', 'Seated cable row', 'pull_h', 'g', '', 'c', 'Tall chest, pull elbows back past your ribs, pause, return slowly.'],
    ['dbrow', 'One-arm dumbbell row', 'pull_h', 'gd', '', 'c', 'Hand and knee on a bench, pull the dumbbell toward your hip.'],
    ['invrow', 'Inverted row under a sturdy table', 'pull_h', 'b', '', 'c', 'Grip the table edge, body straight, pull chest to the edge. Test the table first.'],
    ['bagrow', 'Backpack bent-over row', 'pull_h', 'b', 'b', 'c', 'Load a backpack with books or water bottles, hinge forward, row to your belly.'],
    ['dbpress', 'Seated dumbbell shoulder press', 'push_v', 'gd', 's', 'c', 'Back against the bench, press up without shrugging.'],
    ['landmine', 'Half-kneeling landmine press', 'push_v', 'g', '', 'c', 'Bar end in a corner, press up and forward on an angle; shoulder-friendly.'],
    ['pike', 'Pike push-up', 'push_v', 'b', 's', 'c', 'Hips high, lower the top of your head toward the floor between your hands.'],
    ['lateral', 'Lateral raise', 'push_v delt', 'gd', '', 'a', 'Light weight, lift out to shoulder height, thumbs slightly up.'],
    ['wallslide', 'Wall slides', 'delt', 'gdb', '', 'a', 'Back and forearms on the wall, slide arms up and down slowly.'],
    ['pulldown', 'Lat pulldown', 'pull_v', 'g', '', 'c', 'Pull the bar to your upper chest, elbows down toward your back pockets.'],
    ['asspull', 'Assisted pull-up', 'pull_v', 'g', 's', 'c', 'Use the machine or a band; full hang to chin over bar.'],
    ['pullover', 'Dumbbell pullover', 'pull_v', 'd', 's', 'a', 'Lie across a bench, arms slightly bent, lower behind your head and pull back.'],
    ['ytw', 'Prone Y-T-W raises', 'pull_v delt', 'gdb', '', 'a', 'Lie face down, lift arms into a Y, then T, then W. Slow and controlled.'],
    ['revlunge', 'Reverse lunge', 'lunge', 'gdb', 'k', 'c', 'Step back, lower the back knee toward the floor, push through the front heel.'],
    ['splitsq', 'Split squat', 'lunge', 'gdb', 'k', 'c', 'Feet staggered, drop straight down, front knee tracks over toes.'],
    ['stepup', 'Step-up (knee height or lower)', 'lunge', 'gdb', '', 'c', 'Whole foot on the step, drive up through that leg, step down slowly.'],
    ['plank', 'Plank', 'core', 'gdb', '', 't', 'Forearms down, squeeze glutes, ribs down, breathe.'],
    ['deadbug', 'Dead bug', 'core', 'gdb', '', 't', 'Low back pressed to the floor, extend opposite arm and leg slowly.'],
    ['sideplank', 'Side plank', 'core', 'gdb', '', 't', 'Elbow under shoulder, hips high. Knees down to make it easier.'],
    ['birddog', 'Bird dog', 'core', 'gdb', '', 't', 'On hands and knees, reach opposite arm and leg, pause, switch.'],
    ['pallof', 'Pallof press', 'core', 'g', '', 't', 'Cable at chest height, press straight out and resist the twist.'],
    ['farmer', 'Farmer carry', 'carry', 'gd', '', 'm', 'Heavy dumbbells at your sides, walk tall with short steps.'],
    ['suitcase', 'Suitcase carry (one hand)', 'carry', 'gd', '', 'm', 'One weight on one side, stay upright, do not lean.']
  ].map(function (r) { return { id: r[0], name: r[1], patterns: r[2].split(' '), eq: r[3], avoid: r[4], kind: r[5], cue: r[6] }; });
  var EXBY = {}; EX.forEach(function (e) { EXBY[e.id] = e; });

  var EQ_LETTER = { gym: 'g', dumbbells: 'd', bodyweight: 'b' };
  var INJ_LETTER = { knees: 'k', back: 'b', shoulders: 's' };

  function candidates(pattern, p) {
    var L = EQ_LETTER[p.equipment] || 'g';
    var inj = (p.injuries || []).map(function (i) { return INJ_LETTER[i]; }).join('');
    return EX.filter(function (e) {
      if (e.patterns.indexOf(pattern) < 0) return false;
      if (e.eq.indexOf(L) < 0) return false;
      for (var i = 0; i < inj.length; i++) if (e.avoid.indexOf(inj[i]) >= 0) return false;
      return true;
    });
  }

  // session templates: [pattern, alt offset]
  var SESS = {
    FB_A: { name: 'Full body A', slots: [['squat', 0], ['push_h', 0], ['pull_h', 0], ['hinge', 0], ['core', 0]] },
    FB_B: { name: 'Full body B', slots: [['hinge', 1], ['push_v', 0], ['pull_v', 0], ['lunge', 0], ['core', 1]] },
    FB_C: { name: 'Full body C', slots: [['squat', 1], ['push_h', 1], ['pull_h', 1], ['glute', 0], ['carry', 0]] },
    UP_A: { name: 'Upper body A', slots: [['push_h', 0], ['pull_h', 0], ['push_v', 0], ['pull_v', 0], ['core', 0]] },
    UP_B: { name: 'Upper body B', slots: [['push_h', 1], ['pull_v', 1], ['pull_h', 1], ['delt', 0], ['core', 2]] },
    LO_A: { name: 'Lower body A', slots: [['squat', 0], ['hinge', 0], ['lunge', 0], ['glute', 0], ['core', 1]] },
    LO_B: { name: 'Lower body B', slots: [['hinge', 1], ['squat', 1], ['lunge', 1], ['glute', 1], ['carry', 0]] },
    PUSH: { name: 'Push', slots: [['push_h', 0], ['push_v', 0], ['push_h', 1], ['delt', 0], ['core', 0]] },
    PULL: { name: 'Pull', slots: [['pull_v', 0], ['pull_h', 0], ['pull_h', 1], ['glute', 1], ['core', 1]] },
    LEGS: { name: 'Legs', slots: [['squat', 0], ['hinge', 0], ['lunge', 0], ['glute', 0], ['core', 2]] },
    COND: { name: 'Conditioning + core', cond: true, slots: [['core', 0], ['core', 1], ['carry', 0]] }
  };
  var SPLITS = {
    1: ['FB_A'], 2: ['FB_A', 'FB_B'], 3: ['FB_A', 'FB_B', 'FB_C'],
    4: ['UP_A', 'LO_A', 'UP_B', 'LO_B'],
    5: ['UP_A', 'LO_A', 'COND', 'UP_B', 'LO_B'],
    6: ['PUSH', 'PULL', 'LEGS', 'PUSH', 'PULL', 'LEGS'],
    7: ['PUSH', 'PULL', 'LEGS', 'COND', 'PUSH', 'PULL', 'LEGS']
  };

  function conditioning(p, caution, minutes) {
    var knee = (p.injuries || []).indexOf('knees') >= 0;
    if (caution) return { name: 'Steady cardio', detail: minutes + ' min at a pace where you can still hold a conversation (brisk walk, bike or step-ups).', format: 'steady' };
    if (p.equipment === 'gym') {
      return knee
        ? { name: 'Bike intervals', detail: 'After 2 min easy: 30 s hard, 60 s easy. Repeat until ' + minutes + ' min is up.', format: 'intervals' }
        : { name: 'Rower or bike intervals', detail: 'After 2 min easy: 40 s hard, 50 s easy. Repeat until ' + minutes + ' min is up.', format: 'intervals' };
    }
    return knee
      ? { name: 'Low-impact circuit', detail: 'Rotate 40 s each: fast march, shadow boxing, step-ups, standing knee drives. 20 s rest between. Repeat for ' + minutes + ' min.', format: 'circuit' }
      : { name: 'Bodyweight circuit', detail: 'Rotate 40 s each: jumping jacks, mountain climbers, squat to calf raise, fast feet. 20 s rest between. Repeat for ' + minutes + ' min.', format: 'circuit' };
  }

  function phaseFor(week) {
    var w = ((week % 6) + 6) % 6;
    if (w < 2) return { name: 'Build', rir: '2–3', addSet: 0, deload: false, note: 'Leave 2–3 reps in the tank on every set. Learn the movement and write down your weights.' };
    if (w < 5) return { name: 'Push', rir: '1–2', addSet: 1, deload: false, note: 'Hit the top of the rep range on all sets? Add 2.5–5% weight next session.' };
    return { name: 'Deload', rir: '3–4', addSet: -1, deload: true, note: 'Lighter week. Use about 80% of last week\'s weights so your body can recover.' };
  }

  // PRO weeks run harder: 2 reps in reserve to build, 0–1 to push, then deload.
  function proPhaseFor(week) {
    var w = ((week % 6) + 6) % 6;
    if (w < 2) return { name: 'Build', rir: '2', addSet: 0, deload: false, note: 'Work up to sets with about 2 reps left. Log every top set.' };
    if (w < 5) return { name: 'Push', rir: '0–1', addSet: 1, deload: false, note: 'Last set of each lift close to failure. Beat last week\'s weight or reps.' };
    return { name: 'Deload', rir: '3–4', addSet: -1, deload: true, note: 'Lighter week: about 70–80% of last week\'s weights, fewer sets.' };
  }
  function repsFor(e, exp, pro) {
    if (e.kind === 't') return e.id === 'deadbug' || e.id === 'birddog' ? '8 / side' : '30–40 s';
    if (e.kind === 'm') return '30–40 m';
    if (pro) return e.kind === 'a' ? '10–15' : (pro.phase === 'cut' ? '5–8' : '6–10');
    if (e.kind === 'a') return '12–15';
    return exp === 'advanced' ? '6–10' : exp === 'intermediate' ? '8–12' : '10–12';
  }
  function restFor(e, exp) {
    if (e.kind === 't' || e.kind === 'm') return 30;
    if (e.kind === 'a') return 60;
    return exp === 'beginner' ? 75 : 90;
  }
  function exSeconds(item) {
    var work = (item.ex.kind === 't' || item.ex.kind === 'm') ? 40 : 45;
    return item.sets * (work + item.rest) + 45;
  }

  // which session (if any) falls on a date
  function sessionFor(dateStr, p, startDate) {
    var days = (p.days || []).slice().sort();
    var wd = weekday(dateStr);
    var idx = days.indexOf(wd);
    if (idx < 0) return null;
    var split = SPLITS[Math.min(7, Math.max(1, days.length))];
    var key = split[idx % split.length];
    if (p.style === 'cardio' && days.length >= 3 && idx % 2 === 1) key = 'COND';
    var week = Math.max(0, Math.floor((dayNum(dateStr) - dayNum(startDate || dateStr)) / 7));
    var cycle = Math.floor(week / 6);
    // second half of 6-day splits uses alternate exercise picks
    var altShift = (days.length >= 6 && idx >= 3) ? 1 : 0;
    return { key: key, week: week, cycle: cycle, altShift: altShift, indexInWeek: idx };
  }

  function buildWorkout(dateStr, p, startDate, caution, pro) {
    pro = proPlanOk(pro) ? pro : null;
    var s = sessionFor(dateStr, p, startDate);
    if (!s) {
      return {
        rest: true, title: 'Active recovery', minutes: 45,
        blocks: [
          { title: 'Walk', minutes: 35, lines: ['30–45 min walk at a pace where you can still talk. Aim for 7,000–8,000 steps across the day.'] },
          { title: 'Mobility', minutes: 10, lines: ['Cat-cow ×10', '90/90 hip switches ×8 / side', 'Thoracic rotations ×8 / side', 'Calf and hip-flexor stretch 30 s / side'] }
        ]
      };
    }
    var exp = pro ? 'advanced' : (p.experience || 'beginner');
    var tpl = SESS[s.key];
    var phase = pro && !caution ? proPhaseFor(s.week) : phaseFor(s.week);
    var budgetMain, finisherMin = 0;
    var style = p.style || 'mix';
    if (tpl.cond) { budgetMain = 8 * 60; finisherMin = 26; }
    else if (style === 'weights') { budgetMain = 34 * 60; }
    else if (style === 'cardio') { budgetMain = 22 * 60; finisherMin = 12; }
    else { budgetMain = 25 * 60; finisherMin = 9; }

    var baseC = exp === 'advanced' ? 4 : exp === 'intermediate' ? 3 : (s.week < 2 ? 2 : 3);
    var used = {};
    var items = [];
    tpl.slots.forEach(function (sl, i) {
      var list = candidates(sl[0], p).filter(function (e) { return !used[e.id]; });
      if (!list.length) list = candidates('core', p).filter(function (e) { return !used[e.id]; });
      if (!list.length) return;
      var e = list[(s.cycle + sl[1] + s.altShift) % list.length];
      used[e.id] = 1;
      var sets = e.kind === 'c' ? baseC + phase.addSet : (e.kind === 'a' ? 3 : 2) + (phase.deload ? -1 : 0);
      sets = Math.max(phase.deload ? 1 : 2, Math.min(5, sets));
      items.push({ ex: e, sets: sets, reps: repsFor(e, exp, pro), rest: restFor(e, exp), rir: phase.rir });
    });
    // circuit format for cardio style: shorter rests
    if (style === 'cardio' && !tpl.cond) items.forEach(function (it) { it.rest = Math.min(it.rest, 30); it.circuit = true; });

    function total() { return items.reduce(function (a, it) { return a + exSeconds(it); }, 0); }
    var guard = 0;
    while (total() > budgetMain && guard++ < 40) {
      var cand = items.filter(function (it) { return it.ex.kind !== 'c' && it.sets > 2; });
      if (!cand.length) cand = items.filter(function (it) { return it.sets > 2; });
      if (!cand.length) { if (items.length > 3) { items.pop(); continue; } break; }
      cand.sort(function (a, b) { return b.sets - a.sets; })[0].sets--;
    }
    guard = 0;
    var cap = exp === 'beginner' ? 4 : 5;
    while (total() < budgetMain - 150 && guard++ < 20 && !phase.deload) {
      var c2 = items.filter(function (it) { return it.ex.kind === 'c' && it.sets < cap; });
      if (!c2.length) break;
      c2.sort(function (a, b) { return a.sets - b.sets; })[0].sets++;
      if (total() > budgetMain) { c2[0].sets--; break; }
    }
    // fill spare time with accessory work (mostly matters for weights-only sessions)
    var FILL = ['glute', 'delt', 'core', 'carry', 'lunge', 'pull_h', 'push_h', 'core'];
    var fi = 0;
    while (total() < budgetMain - 240 && fi < FILL.length && items.length < 8 && !tpl.cond) {
      var fl = candidates(FILL[fi], p).filter(function (e) { return !used[e.id]; });
      fi++;
      if (!fl.length) continue;
      var fe = fl[(s.cycle + fi) % fl.length]; used[fe.id] = 1;
      var fit = { ex: fe, sets: phase.deload ? 2 : (fe.kind === 'c' ? 3 : (fe.kind === 'a' ? 3 : 2)), reps: repsFor(fe, exp, pro), rest: style === 'cardio' ? 30 : restFor(fe, exp), rir: phase.rir, circuit: style === 'cardio' };
      if (fe.kind === 'c') { fit.reps = '10–15'; fit.rest = Math.min(fit.rest, 60); }
      items.push(fit);
      while (total() > budgetMain + 30 && fit.sets > 1) fit.sets--;
      if (total() > budgetMain + 30) { items.pop(); break; }
    }
    var mainMin = Math.round(total() / 60);
    var blocks = [];
    blocks.push({ title: 'Warm-up', minutes: 6, lines: ['3 min brisk walk, skipping or easy bike', 'Leg swings ×10 / side, arm circles ×10, hip hinges ×10, inchworms ×5', '1–2 light ramp-up sets of your first exercise'] });
    if (tpl.cond) {
      var cnd = conditioning(p, caution, finisherMin);
      blocks.push({ title: cnd.name, minutes: finisherMin, lines: [cnd.detail], cond: true });
      blocks.push({ title: 'Core and carry', minutes: mainMin, items: items });
    } else {
      blocks.push({ title: style === 'cardio' ? 'Strength circuit' : 'Strength', minutes: mainMin, items: items, circuit: style === 'cardio' });
      if (finisherMin) { var c = conditioning(p, caution, finisherMin); blocks.push({ title: 'Finisher: ' + c.name.toLowerCase(), minutes: finisherMin, lines: [c.detail], cond: true }); }
    }
    blocks.push({ title: 'Cool-down', minutes: 5, lines: ['2–3 min easy walk with slow breathing', 'Stretch 30 s each: hip flexors, hamstrings, chest, upper back'] });
    var minutes = blocks.reduce(function (a, b) { return a + b.minutes; }, 0);
    return { rest: false, key: s.key, title: tpl.name, week: s.week + 1, phase: phase, minutes: minutes, blocks: blocks, caution: !!caution, pro: !!pro };
  }
  // Hard sets per muscle group over one week (ACSM 2026: about 10+ sets per muscle a week for growth).
  var MUSCLES = { squat: ['Quads'], lunge: ['Quads', 'Glutes'], hinge: ['Hamstrings', 'Glutes'], glute: ['Glutes'], push_h: ['Chest', 'Triceps'], push_v: ['Shoulders', 'Triceps'], delt: ['Shoulders'], pull_h: ['Back', 'Biceps'], pull_v: ['Back', 'Biceps'] };
  var MUSCLE_ORDER = ['Chest', 'Back', 'Shoulders', 'Quads', 'Hamstrings', 'Glutes', 'Biceps', 'Triceps'];
  function weeklyVolume(mondayStr, p, startDate, caution, pro) {
    var out = {}; MUSCLE_ORDER.forEach(function (m) { out[m] = 0; });
    for (var i = 0; i < 7; i++) {
      var w = buildWorkout(addDays(mondayStr, i), p, startDate, caution, pro);
      if (w.rest) continue;
      w.blocks.forEach(function (b) { (b.items || []).forEach(function (it) {
        var seen = {};
        it.ex.patterns.forEach(function (pt) { (MUSCLES[pt] || []).forEach(function (m) { if (!seen[m]) { seen[m] = 1; out[m] += it.sets; } }); });
      }); });
    }
    return MUSCLE_ORDER.map(function (m) { return { muscle: m, sets: out[m] }; });
  }

  /* ---------- foods ---------- */
  // per 100 g edible portion: kcal, protein, carbs, fat; y = edible yield from purchased weight; tags for diet filters
  var ING = {
    rice: { name: 'Rice, white (uncooked)', short: 'rice', k: 365, p: 7.1, c: 80, f: 0.7, y: 1, grp: 'Starches', cup: 185 },
    oats: { name: 'Rolled oats', short: 'oats', k: 379, p: 13.2, c: 67.7, f: 6.5, y: 1, grp: 'Starches', cup: 80 },
    cornmeal: { name: 'Cornmeal', short: 'cornmeal', k: 366, p: 7.5, c: 78, f: 2, y: 1, grp: 'Starches', cup: 150 },
    flour: { name: 'Flour (for dumplings)', k: 364, p: 10.3, c: 76, f: 1, y: 1, grp: 'Starches', cup: 125, tags: ['gluten'] },
    bread: { name: 'Hardo bread, sliced', short: 'hardo bread', k: 266, p: 8.9, c: 49, f: 3.3, y: 1, grp: 'Starches', slice: 40, tags: ['gluten'] },
    sweetpot: { name: 'Sweet potato', short: 'sweet potato', k: 86, p: 1.6, c: 20, f: 0.1, y: 0.85, grp: 'Ground provisions' },
    yam: { name: 'Yellow yam', short: 'yellow yam', k: 118, p: 1.5, c: 28, f: 0.2, y: 0.85, grp: 'Ground provisions' },
    gbanana: { name: 'Green banana', short: 'green banana', k: 89, p: 1.1, c: 23, f: 0.3, y: 0.65, grp: 'Ground provisions' },
    ipotato: { name: 'Irish potato', short: 'potatoes', k: 77, p: 2, c: 17, f: 0.1, y: 0.9, grp: 'Ground provisions' },
    redpeas: { name: 'Red peas (dry kidney beans)', short: 'red peas', k: 333, p: 24, c: 60, f: 0.8, y: 1, grp: 'Proteins', cup: 185 },
    broadbeans: { name: 'Broad beans (tin)', short: 'broad beans', k: 71, p: 5.5, c: 12.4, f: 0.2, y: 1, grp: 'Proteins' },
    chicken: { name: 'Chicken (bone-in, skin off)', short: 'chicken', k: 121, p: 21, c: 0, f: 4, y: 0.6, grp: 'Proteins', tags: ['meat'] },
    egg: { name: 'Eggs', short: 'egg', k: 143, p: 12.6, c: 0.7, f: 9.5, y: 1, grp: 'Proteins', each: 50, tags: ['egg'] },
    mackerel: { name: 'Mackerel in tomato sauce (tin)', short: 'mackerel', k: 158, p: 14.5, c: 2, f: 10, y: 1, grp: 'Proteins', tags: ['fish'] },
    sardines: { name: 'Sardines in oil (tin)', short: 'sardines', k: 208, p: 24.6, c: 0, f: 11.5, y: 1, grp: 'Proteins', tags: ['fish'] },
    tuna: { name: 'Tuna (tin)', short: 'tuna', k: 116, p: 25.5, c: 0, f: 0.8, y: 1, grp: 'Proteins', tags: ['fish'] },
    pb: { name: 'Peanut butter', k: 588, p: 25, c: 20, f: 50, y: 1, grp: 'Pantry', tbsp: 16, tags: ['peanut'] },
    oil: { name: 'Vegetable oil', k: 884, p: 0, c: 0, f: 100, y: 1, grp: 'Pantry', tbsp: 13.6 },
    milk: { name: 'Milk, whole', short: 'milk', k: 61, p: 3.2, c: 4.8, f: 3.3, y: 1, grp: 'Pantry', cup: 244, tags: ['dairy'] },
    callaloo: { name: 'Callaloo', short: 'callaloo', k: 23, p: 2.5, c: 4, f: 0.3, y: 0.7, grp: 'Vegetables & fruit' },
    cabbage: { name: 'Cabbage', short: 'cabbage', k: 25, p: 1.3, c: 5.8, f: 0.1, y: 0.9, grp: 'Vegetables & fruit' },
    carrot: { name: 'Carrot', short: 'carrot', k: 41, p: 0.9, c: 9.6, f: 0.2, y: 0.9, grp: 'Vegetables & fruit' },
    tomato: { name: 'Tomato', k: 18, p: 0.9, c: 3.9, f: 0.2, y: 1, grp: 'Vegetables & fruit' },
    onion: { name: 'Onion', k: 40, p: 1.1, c: 9.3, f: 0.1, y: 0.9, grp: 'Vegetables & fruit' },
    scallion: { name: 'Escallion', k: 32, p: 1.8, c: 7.3, f: 0.2, y: 0.9, grp: 'Vegetables & fruit' },
    pumpkin: { name: 'Pumpkin', short: 'pumpkin', k: 26, p: 1, c: 6.5, f: 0.1, y: 0.75, grp: 'Vegetables & fruit' },
    rbanana: { name: 'Ripe banana', short: 'banana', k: 89, p: 1.1, c: 23, f: 0.3, y: 0.65, grp: 'Vegetables & fruit', each: 100 },
    // added 2026-10-23 for budget levels and US dishes (USDA FoodData Central values)
    greekyog: { name: 'Greek yogurt, plain nonfat', short: 'Greek yogurt', k: 59, p: 10.3, c: 3.6, f: 0.4, y: 1, grp: 'Proteins', cup: 245, tags: ['dairy'] },
    cottage: { name: 'Cottage cheese, low-fat', short: 'cottage cheese', k: 81, p: 10.5, c: 4.8, f: 2.3, y: 1, grp: 'Proteins', cup: 225, tags: ['dairy'] },
    whey: { name: 'Whey protein powder', short: 'whey', k: 387, p: 77, c: 9.7, f: 4.8, y: 1, grp: 'Proteins', scoop: 31, tags: ['dairy'] },
    chickbreast: { name: 'Chicken breast, boneless skinless', short: 'chicken breast', k: 120, p: 22.5, c: 0, f: 2.6, y: 1, grp: 'Proteins', tags: ['meat'] },
    beef: { name: 'Lean beef mince (90%+ lean)', short: 'beef', k: 176, p: 20, c: 0, f: 10, y: 1, grp: 'Proteins', tags: ['meat'] },
    turkey: { name: 'Ground turkey (93% lean)', short: 'turkey', k: 150, p: 18.7, c: 0, f: 8.3, y: 1, grp: 'Proteins', tags: ['meat'] },
    salmon: { name: 'Salmon fillet', short: 'salmon', k: 208, p: 20.4, c: 0, f: 13.4, y: 1, grp: 'Proteins', tags: ['fish'] },
    pasta: { name: 'Pasta (dry)', short: 'pasta', k: 371, p: 13, c: 75, f: 1.5, y: 1, grp: 'Starches', tags: ['gluten'] },
    wwbread: { name: 'Whole-wheat bread, sliced', short: 'whole-wheat toast', k: 252, p: 12.4, c: 43, f: 3.5, y: 1, grp: 'Starches', slice: 32, tags: ['gluten'] },
    berries: { name: 'Mixed berries (frozen)', short: 'berries', k: 48, p: 0.7, c: 11.5, f: 0.3, y: 1, grp: 'Vegetables & fruit', cup: 140 },
    broccoli: { name: 'Broccoli (frozen)', short: 'broccoli', k: 28, p: 3, c: 5, f: 0.3, y: 1, grp: 'Vegetables & fruit' },
    mixveg: { name: 'Mixed vegetables (frozen)', short: 'mixed vegetables', k: 64, p: 3.3, c: 13, f: 0.5, y: 1, grp: 'Vegetables & fruit' },
    // added 2026-10-25 for vegetarian and vegan protein. Soya chunks: USDA FoodData Central "Soy flour, defatted" (FDC 174273; soya chunks/TVP are extruded defatted soy flour), weighed dry.
    // Chickpeas: USDA "Chickpeas, canned, drained, rinsed" (FDC 173801), per drained gram; a 400 g tin drains to about 240 g (y 0.6).
    soya: { name: 'Soya chunks (dry)', short: 'soya chunks', k: 327, p: 51.5, c: 33.9, f: 1.2, y: 1, grp: 'Proteins', dry: true, tags: ['soy'] },
    chickpeas: { name: 'Chickpeas (tin)', short: 'chickpeas', k: 138, p: 7.04, c: 22.9, f: 2.47, y: 0.6, grp: 'Proteins', tin: 240 }
  };
  // Food budget levels. Each region marks pricier foods with tier 2 (Standard) or 3 (Premium); everything else is tier 1.
  // spread: how far above the cheapest protein (per gram of protein) the planner may rotate.
  var BUDGETS = {
    1: { key: 1, label: 'Budget', spread: 1.35, note: 'Local staples and the cheapest proteins.' },
    2: { key: 2, label: 'Standard', spread: 1.8, note: 'Adds lean cuts and a few pricier foods.' },
    3: { key: 3, label: 'Premium', spread: 3, note: 'Everything: Greek yogurt, cottage cheese, berries, whey, salmon and more.' }
  };
  // Foods people can tick under "Foods I buy" (the plan uses them whatever the budget level)
  var LIKEABLE = ['greekyog', 'cottage', 'berries', 'whey', 'chickbreast', 'beef', 'turkey', 'salmon', 'wwbread', 'pasta', 'broccoli', 'mixveg', 'oats', 'egg', 'tuna', 'soya', 'chickpeas'];

  // Prices are quoted per pack, the way a supermarket sells it.
  // u = pack, g = grams in the pack, pr = pack price, weighed = sold by the pound at the counter,
  // store = where the price was seen, src = evidence, date, conf = survey | store | market | estimate
  var PRICES = {
    JM: {
      currency: 'JMD', symbol: 'J$', decimals: 0, label: 'Jamaica',
      stores: ['PriceSmart', 'Hi-Lo', 'Loshusan', 'Another store'],
      items: {
        rice: { u: '2 kg bag', g: 2000, pr: 480, store: 'Kingston supermarkets incl. Hi-Lo', src: 'CAC survey: bulk white rice J$157–200/kg at 9 supermarkets incl. Hi-Lo Constant Spring; bagged price estimated from it', date: 'Jul 2026', conf: 'estimate' },
        oats: { u: '800 g bag (Foska)', g: 800, pr: 662, store: 'Loshusan', src: 'Loshusan Supermarket online', date: 'Oct 2026', conf: 'store' },
        cornmeal: { u: '400 g bag (Foska)', g: 400, pr: 169, store: 'Loshusan', src: 'Loshusan Supermarket online', date: 'Oct 2026', conf: 'store' },
        flour: { u: '1 kg bag (JF Mills)', g: 1000, pr: 369, store: 'Loshusan', src: 'Loshusan online J$368.58; CAC survey J$322–350', date: 'Oct 2026', conf: 'store' },
        bread: { u: '2 lb loaf (National hardo)', g: 907, pr: 560, store: 'Hi-Lo and 8 other supermarkets', src: 'CAC survey: same price at all 9 outlets incl. Hi-Lo', date: 'Jul 2026', conf: 'survey' },
        sweetpot: { u: 'per lb, weighed', g: 454, pr: 450, weighed: true, store: 'Market', src: 'Observer Market Bag, Coronation Market', date: '23 Oct 2026', conf: 'market' },
        yam: { u: 'per lb, weighed', g: 454, pr: 500, weighed: true, store: 'Market', src: 'Observer Market Bag, Coronation Market', date: 'Aug 2026', conf: 'market' },
        gbanana: { u: 'per lb, weighed', g: 454, pr: 150, weighed: true, store: 'Market', src: 'Spanish Town Market J$400 a hand (about 1.4 kg), converted', date: 'Jul 2026', conf: 'market' },
        ipotato: { u: 'per lb, weighed', g: 454, pr: 250, weighed: true, store: 'Market', src: 'Observer Market Bag, Coronation Market', date: '23 Oct 2026', conf: 'market' },
        redpeas: { u: '1 lb bag', g: 454, pr: 650, store: 'Estimate', src: 'Online grocers J$250–882/lb; check your supermarket', date: 'Oct 2026', conf: 'estimate' },
        broadbeans: { u: '400 g tin (Lasco)', g: 400, pr: 290, store: 'Kingston supermarkets incl. Hi-Lo', src: 'CAC survey J$267–314', date: 'Jul 2026', conf: 'survey' },
        chicken: { u: 'whole frozen chicken (about 1.8 kg)', g: 1800, pr: 1710, store: 'Hi-Lo, Loshusan, PriceSmart and others', src: 'CAC survey J$849–1,033/kg (Jul 2026); agriculture ministry supermarket survey incl. Hi-Lo, Loshusan and PriceSmart J$849–950/kg', date: 'Jul 2026', conf: 'survey' },
        egg: { u: 'dozen, Grade A large', g: 600, pr: 950, store: 'Estimate', src: 'Price trackers J$617–854 earlier in 2026, plus inflation; check your supermarket', date: 'Oct 2026', conf: 'estimate' },
        mackerel: { u: '155 g tin (Grace)', g: 155, pr: 135, store: 'Kingston supermarkets incl. Hi-Lo', src: 'CAC survey J$120–144', date: 'Jul 2026', conf: 'survey' },
        sardines: { u: '106 g tin (Grace)', g: 106, pr: 225, store: 'Kingston supermarkets incl. Hi-Lo', src: 'CAC survey J$211–242', date: 'Jul 2026', conf: 'survey' },
        tuna: { u: '142 g tin (Brunswick)', g: 142, pr: 200, store: 'Kingston supermarkets incl. Hi-Lo', src: 'CAC survey J$197–205', date: 'Jul 2026', conf: 'survey' },
        pb: { u: '40 oz jar (Members Select)', g: 1134, pr: 1273, store: 'Loshusan', src: 'Loshusan Supermarket online', date: 'Oct 2026', conf: 'store' },
        oil: { u: '500 ml bottle (Lider)', g: 460, pr: 455, store: 'Kingston supermarkets incl. Hi-Lo', src: 'CAC survey J$431–477', date: 'Jul 2026', conf: 'survey' },
        milk: { u: '1 L carton', g: 1030, pr: 700, store: 'Estimate', src: 'Price guide, March 2026; check your supermarket', date: 'Mar 2026', conf: 'estimate' },
        callaloo: { u: '1 bundle (about 450 g)', g: 450, pr: 290, store: 'Estimate', src: 'MyVoice crop tracker J$638/kg retail', date: '13 Oct 2026', conf: 'estimate' },
        cabbage: { u: '1 head (about 1 kg)', g: 1000, pr: 900, store: 'Estimate', src: 'Reported J$500–1,400 a head in October (drought)', date: 'Oct 2026', conf: 'estimate' },
        carrot: { u: '1 lb bag', g: 454, pr: 500, store: 'Market', src: 'Observer Market Bag, Coronation Market J$500/lb', date: '23 Oct 2026', conf: 'market' },
        tomato: { u: 'per lb, weighed', g: 454, pr: 400, weighed: true, store: 'Market', src: 'Observer Market Bag, Coronation Market', date: '23 Oct 2026', conf: 'market' },
        onion: { u: '3 lb bag', g: 1361, pr: 750, store: 'Estimate', src: 'J$250/lb at Coronation Market (Observer Market Bag), converted', date: '23 Oct 2026', conf: 'estimate' },
        scallion: { u: '1 bundle (about 100 g)', g: 100, pr: 70, store: 'Estimate', src: 'J$300/lb at Coronation Market (Observer Market Bag), converted', date: '23 Oct 2026', conf: 'estimate' },
        pumpkin: { u: 'per lb, weighed', g: 454, pr: 400, weighed: true, store: 'Market', src: 'Observer Market Bag, Coronation Market', date: 'Aug 2026', conf: 'market' },
        rbanana: { u: '1 hand (about 6, 700 g)', g: 700, pr: 500, store: 'Estimate', src: 'J$1,000 a dozen at Coronation Market, converted', date: 'Aug 2026', conf: 'estimate' },
        greekyog: { u: '1.13 kg tub (Chobani plain)', g: 1130, pr: 3100, tier: 3, store: 'JA Deals (online grocer)', src: 'JA Deals J$2,700 before GCT; usually at PriceSmart and the larger Hi-Lo and Loshusan stores', date: 'Oct 2026', conf: 'store' },
        cottage: { u: '16 oz tub (imported)', g: 454, pr: 1300, tier: 3, store: 'Estimate', src: 'No Jamaican shelf price found online; US price (US$2.87 for 24 oz) × import costs. Not every store stocks it: try PriceSmart or Hi-Lo', date: 'Oct 2026', conf: 'estimate' },
        whey: { u: '5 lb tub (ON Gold Standard)', g: 2268, pr: 37700, fromStore: 'on-whey-5', local: { pr: 13800, store: 'Fitness Junkies JA (online, Kingston)', src: 'Fitness Junkies JA lists ON Gold Standard 5 lb at J$13,800; check it is in stock', date: 'Oct 2026', conf: 'store' }, tier: 3, store: 'OMGym Store', src: 'OMGym Store price, delivered with duty and GCT', date: 'Oct 2026', conf: 'store' },
        chickbreast: { u: '1 kg pack, boneless skinless', g: 1000, pr: 1340, store: 'Estimate', src: 'Kingston shoppers\' prices J$670 per 500 g (Expatistan, Jun 2026)', date: 'Jun 2026', conf: 'estimate' },
        beef: { u: '1 kg pack, beef mince', g: 1000, pr: 1600, tier: 2, store: 'Kingston supermarkets incl. Hi-Lo, Loshusan, PriceSmart', src: 'Agriculture ministry supermarket survey: local beef mince J$1,400–1,693/kg (Nov 2025). Ask for lean', date: 'Nov 2025', conf: 'survey' },
        turkey: { u: '1 lb frozen pack (imported)', g: 454, pr: 1300, tier: 3, store: 'Estimate', src: 'US price (US$5.46 per 1.2 lb) × import costs; PriceSmart is the likeliest stockist', date: 'Oct 2026', conf: 'estimate' },
        salmon: { u: '1 lb frozen fillets', g: 454, pr: 3000, tier: 3, store: 'Estimate', src: 'US price (US$13.44 per lb) × import costs; PriceSmart and Hi-Lo freezers', date: 'Oct 2026', conf: 'estimate' },
        pasta: { u: '400 g pack spaghetti', g: 400, pr: 280, store: 'Estimate', src: 'Typical supermarket price; check your store', date: 'Oct 2026', conf: 'estimate' },
        wwbread: { u: '1.5 lb whole-wheat loaf', g: 680, pr: 650, tier: 2, store: 'Estimate', src: 'Typical supermarket price; check your store', date: 'Oct 2026', conf: 'estimate' },
        berries: { u: '3 lb frozen bag (PriceSmart size)', g: 1361, pr: 3600, tier: 3, store: 'Estimate', src: 'US price (US$11.28 for 48 oz) × import costs. Local fruit (guava, papaya, June plum) is the cheaper swap', date: 'Oct 2026', conf: 'estimate' },
        broccoli: { u: '1 lb frozen bag', g: 454, pr: 650, tier: 2, store: 'Estimate', src: 'Typical supermarket price; check your store', date: 'Oct 2026', conf: 'estimate' },
        mixveg: { u: '1 lb frozen bag', g: 454, pr: 550, tier: 2, store: 'Estimate', src: 'Typical supermarket price; check your store', date: 'Oct 2026', conf: 'estimate' },
        soya: { u: '8 oz bag (227 g)', g: 227, pr: 450, store: 'Estimate', src: 'No Jamaican shelf price found online; US Caribbean grocer price for an 8 oz bag (US$2.75, Jamaican Country Style) converted. Look in the dried-peas aisle or a health-food shop and check the price', date: 'Oct 2026', conf: 'estimate' },
        chickpeas: { u: '400 g tin (Grace)', g: 400, pr: 330, store: 'Estimate', src: 'Loshusan stocks Grace 400 g but its price is not readable online; estimated from tinned broad beans (CAC J$267–314). Check your store', date: 'Oct 2026', conf: 'estimate' }
      }
    },
    US: {
      currency: 'USD', symbol: '$', decimals: 2, label: 'United States',
      stores: ['Walmart', 'Aldi', 'Kroger', 'Another store'],
      items: {
        rice: { u: '2 lb bag', g: 907, pr: 2.24, store: 'US average', src: 'BLS average price $1.12/lb, long-grain white rice', date: 'Sep 2026', conf: 'survey' },
        oats: { u: '18 oz canister', g: 510, pr: 3.49, store: 'Estimate', src: 'Typical store-brand price', date: 'Oct 2026', conf: 'estimate' },
        cornmeal: { u: '2 lb bag', g: 907, pr: 2.99, store: 'Estimate', src: 'Typical store-brand price', date: 'Oct 2026', conf: 'estimate' },
        flour: { u: '5 lb bag', g: 2268, pr: 2.75, store: 'US average', src: 'BLS average price $0.55/lb, all-purpose flour', date: 'Sep 2026', conf: 'survey' },
        bread: { name: 'White sandwich bread', short: 'toast', u: '1 lb loaf', g: 454, pr: 1.83, store: 'US average', src: 'BLS average price, white bread', date: 'Sep 2026', conf: 'survey' },
        sweetpot: { u: 'per lb, weighed', g: 454, pr: 1.49, weighed: true, store: 'Estimate', src: 'Typical supermarket price', date: 'Oct 2026', conf: 'estimate' },
        yam: { u: 'per lb, weighed', g: 454, pr: 2.49, weighed: true, store: 'Estimate', src: 'Typical Caribbean grocer price', date: 'Oct 2026', conf: 'estimate' },
        gbanana: { u: 'per lb, weighed', g: 454, pr: 0.66, weighed: true, store: 'US average', src: 'BLS average price, bananas', date: 'Sep 2026', conf: 'survey' },
        ipotato: { u: '5 lb bag', g: 2268, pr: 4.95, store: 'US average', src: 'BLS average price $0.99/lb, white potatoes', date: 'Sep 2026', conf: 'survey' },
        redpeas: { u: '1 lb bag', g: 454, pr: 1.70, store: 'US average', src: 'BLS average price, dried beans', date: 'Feb 2026', conf: 'survey' },
        broadbeans: { u: '15 oz can', g: 425, pr: 1.29, store: 'Estimate', src: 'Typical store price, canned fava beans', date: 'Oct 2026', conf: 'estimate' },
        chicken: { u: 'family pack of legs (about 3 lb)', g: 1361, pr: 5.22, store: 'US average', src: 'BLS average price $1.74/lb, chicken legs', date: 'Sep 2026', conf: 'survey' },
        egg: { u: 'dozen, Grade A large', g: 600, pr: 2.27, store: 'US average', src: 'BLS average price', date: 'Sep 2026', conf: 'survey' },
        mackerel: { u: '15 oz can', g: 425, pr: 3.49, store: 'Estimate', src: 'Typical store price, jack mackerel', date: 'Oct 2026', conf: 'estimate' },
        sardines: { u: '3.75 oz can', g: 106, pr: 1.79, store: 'Estimate', src: 'Typical store price', date: 'Oct 2026', conf: 'estimate' },
        tuna: { u: '5 oz can', g: 142, pr: 1.39, store: 'Estimate', src: 'Typical store-brand price', date: 'Oct 2026', conf: 'estimate' },
        pb: { u: '16 oz jar', g: 454, pr: 2.89, store: 'Estimate', src: 'Typical store-brand price', date: 'Oct 2026', conf: 'estimate' },
        oil: { u: '48 oz bottle', g: 1360, pr: 4.99, store: 'Estimate', src: 'Typical store-brand price', date: 'Oct 2026', conf: 'estimate' },
        milk: { u: 'gallon', g: 3900, pr: 4.11, store: 'US average', src: 'BLS average price, whole milk', date: 'Sep 2026', conf: 'survey' },
        callaloo: { name: 'Spinach (or callaloo)', short: 'spinach', u: '10 oz bag (spinach or callaloo)', g: 284, pr: 2.49, store: 'Estimate', src: 'Typical supermarket price', date: 'Oct 2026', conf: 'estimate' },
        cabbage: { u: '1 head (about 2 lb)', g: 907, pr: 1.78, store: 'Estimate', src: 'Typical supermarket price', date: 'Oct 2026', conf: 'estimate' },
        carrot: { u: '1 lb bag', g: 454, pr: 1.19, store: 'Estimate', src: 'Typical supermarket price', date: 'Oct 2026', conf: 'estimate' },
        tomato: { u: 'per lb, weighed', g: 454, pr: 1.99, weighed: true, store: 'US average', src: 'BLS average price, field-grown tomatoes', date: 'Sep 2026', conf: 'survey' },
        onion: { u: '3 lb bag', g: 1361, pr: 3.49, store: 'Estimate', src: 'Typical supermarket price', date: 'Oct 2026', conf: 'estimate' },
        scallion: { u: '1 bunch (about 100 g)', g: 100, pr: 0.99, store: 'Estimate', src: 'Typical supermarket price', date: 'Oct 2026', conf: 'estimate' },
        pumpkin: { u: 'per lb, weighed (squash)', g: 454, pr: 1.49, weighed: true, store: 'Estimate', src: 'Typical supermarket price', date: 'Oct 2026', conf: 'estimate' },
        rbanana: { u: 'per lb, weighed', g: 454, pr: 0.66, weighed: true, store: 'US average', src: 'BLS average price, bananas', date: 'Sep 2026', conf: 'survey' },
        greekyog: { u: '32 oz tub (Great Value plain nonfat)', g: 907, pr: 3.28, store: 'Walmart', src: 'Walmart.com', date: '23 Oct 2026', conf: 'store' },
        cottage: { u: '24 oz tub (Great Value 2%)', g: 680, pr: 2.87, store: 'Walmart', src: 'Walmart.com', date: '23 Oct 2026', conf: 'store' },
        whey: { u: '5 lb tub (ON Gold Standard)', g: 2268, pr: 114.99, tier: 2, store: 'Amazon', src: 'Amazon price on the WheyIndex tracker', date: 'Oct 2026', conf: 'store' },
        chickbreast: { u: '3 lb bag, frozen (Great Value)', g: 1361, pr: 9.47, store: 'Walmart', src: 'Walmart.com; BLS US average fresh breast US$4.20/lb (Sep 2026)', date: '23 Oct 2026', conf: 'store' },
        beef: { u: '3 lb roll, 93% lean', g: 1361, pr: 19.87, tier: 2, store: 'Walmart', src: 'Walmart.com', date: '23 Oct 2026', conf: 'store' },
        turkey: { u: '1.2 lb tray, 93% lean (Honeysuckle White)', g: 544, pr: 5.46, tier: 2, store: 'Walmart', src: 'Walmart.com', date: '23 Oct 2026', conf: 'store' },
        salmon: { u: '1 lb bag, frozen Atlantic (Great Value)', g: 454, pr: 13.44, tier: 3, store: 'Walmart', src: 'Walmart.com', date: '23 Oct 2026', conf: 'store' },
        pasta: { u: '16 oz box (Great Value penne)', g: 454, pr: 1.36, store: 'Walmart', src: 'Walmart.com', date: '23 Oct 2026', conf: 'store' },
        wwbread: { u: '20 oz loaf (Great Value 100% whole wheat)', g: 567, pr: 2.02, store: 'Walmart', src: 'Walmart.com', date: '23 Oct 2026', conf: 'store' },
        berries: { u: '48 oz bag, frozen triple berry (Great Value)', g: 1361, pr: 11.28, tier: 2, store: 'Walmart', src: 'Walmart.com', date: '23 Oct 2026', conf: 'store' },
        broccoli: { u: '12 oz bag, frozen florets (Great Value)', g: 340, pr: 1.16, store: 'Walmart', src: 'Walmart.com', date: '23 Oct 2026', conf: 'store' },
        mixveg: { u: '12 oz bag, frozen (Great Value)', g: 340, pr: 0.98, store: 'Walmart', src: 'Walmart.com', date: '23 Oct 2026', conf: 'store' },
        soya: { name: 'Textured vegetable protein (TVP, dry)', short: 'TVP', u: '12 oz bag (Bob\'s Red Mill TVP)', g: 340, pr: 10.00, store: 'Walmart', src: 'Walmart.com', date: '25 Oct 2026', conf: 'store' },
        chickpeas: { u: '15.5 oz can (Great Value)', g: 439, pr: 0.92, store: 'Walmart', src: 'Walmart.com', date: '25 Oct 2026', conf: 'store' }
      }
    }
  };

  /* ---------- meal templates ---------- */
  // pr: protein options (preference/cost picks), cb: carb options, fx: fixed [id, grams, optional]
  var MEALS = [
    { id: 'b_oats', slot: 'b', name: 'Oats porridge with peanut butter & banana, eggs on the side', pr: ['egg'], cb: ['oats'], fx: [['milk', 150, 1], ['pb', 15, 1], ['rbanana', 80, 1]], how: 'Simmer oats in the milk plus a little water for 5 min with a pinch of cinnamon and nutmeg. Top with sliced banana and peanut butter. Boil the eggs 9 min.' },
    { id: 'b_callaloo', cu: 'jm', slot: 'b', name: 'Steamed callaloo & scrambled eggs with hardo bread', pr: ['egg', 'sardines'], cb: ['bread', 'sweetpot'], fx: [['callaloo', 120], ['onion', 30], ['tomato', 50], ['oil', 5]], how: 'Sauté onion and tomato in the oil, add chopped callaloo with a splash of water, cover 6–8 min. Scramble the eggs (or flake the sardines) into the pan. Serve with bread or boiled sweet potato.' },
    { id: 'b_mackerel', cu: 'jm', slot: 'b', name: 'Mackerel & tomato stew with boiled green banana', pr: ['mackerel', 'sardines'], cb: ['gbanana', 'yam', 'ipotato'], fx: [['onion', 30], ['tomato', 60], ['scallion', 10], ['oil', 5]], how: 'Peel and boil green banana 15–20 min. Sauté onion, escallion and tomato, add the fish with its sauce, add thyme and black pepper, simmer 5 min.' },
    { id: 'b_cornmeal', cu: 'jm', slot: 'b', name: 'Cornmeal porridge with boiled eggs', pr: ['egg'], cb: ['cornmeal'], fx: [['milk', 200, 1]], how: 'Whisk cornmeal into cold water, then bring to a boil while stirring. Add the milk, nutmeg and vanilla, simmer 10 min. Use less sweetener than usual.' },
    { id: 'b_sardine', cu: 'jm', slot: 'b', name: 'Sardines & tomato on hardo bread', pr: ['sardines', 'tuna', 'egg'], cb: ['bread', 'sweetpot'], fx: [['tomato', 80], ['onion', 20]], how: 'Mash the fish with diced tomato, onion, lime and pepper. Pile onto toasted bread.' },
    { id: 'm_broadbean', cu: 'jm', slot: 'ld', plant: true, name: 'Broad bean & pumpkin stew with rice', names: { redpeas: 'Red peas & pumpkin stew with rice', soya: '{p} & pumpkin stew with rice' }, hows: { soya: 'Soak the soya chunks in hot water 10 min and squeeze dry. Sauté onion, escallion, garlic and thyme in the oil, add the chunks, tomato and diced pumpkin with a cup of water, simmer 12 min. Serve over rice or boiled provisions.' }, pr: ['broadbeans', 'redpeas', 'soya'], cb: ['rice', 'yam', 'ipotato'], fx: [['pumpkin', 120], ['tomato', 50], ['onion', 30], ['scallion', 10], ['oil', 6]], how: 'Sauté onion, escallion, garlic and thyme in the oil, add tomato and diced pumpkin with a cup of water, simmer 12 min. Add the drained beans for 5 min. Serve over rice or boiled provisions.' },
    { id: 'b_pboats', slot: 'b', plant: true, name: 'Peanut butter oats with banana (plant-based)', pr: ['pb'], cb: ['oats', 'cornmeal'], fx: [['rbanana', 80]], how: 'Cook the oats (or cornmeal) in water with cinnamon and a pinch of salt. Stir in peanut butter and top with sliced banana.' },
    { id: 'b_peascallaloo', cu: 'jm', slot: 'b', plant: true, name: 'Stewed peas & callaloo with boiled green banana', names: { soya: '{p} & callaloo with boiled green banana' }, hows: { soya: 'Soak the soya chunks in hot water 10 min, squeeze dry and season with thyme, garlic and black pepper. Sauté onion, add the chunks and callaloo with a splash of water, cover 6–8 min. Boil the green banana 15–20 min.' }, pr: ['redpeas', 'soya'], cb: ['gbanana', 'sweetpot', 'bread'], fx: [['callaloo', 100], ['onion', 25], ['oil', 5]], how: 'Use red peas cooked ahead in a batch. Warm them with sautéed onion and callaloo, thyme and black pepper. Boil the green banana 15–20 min.' },
    { id: 'm_stewchicken', cu: 'jm', slot: 'ld', name: 'Stew chicken, rice & peas, steamed cabbage', pr: ['chicken'], cb: ['rice'], fx: [['redpeas', 25], ['cabbage', 120], ['carrot', 40], ['onion', 30], ['scallion', 10], ['tomato', 40], ['oil', 8]], how: 'Season chicken with onion, escallion, thyme, garlic and browning; brown in the oil and stew 30 min. Boil the peas until soft, then cook the rice in the peas water. Steam cabbage and carrot 5 min.' },
    { id: 'm_curry', cu: 'jm', slot: 'ld', name: 'Curry chicken with boiled food', pr: ['chicken'], cb: ['yam', 'gbanana', 'ipotato', 'sweetpot'], fx: [['carrot', 40], ['onion', 30], ['scallion', 10], ['oil', 8]], how: 'Season chicken with curry powder, onion and escallion. Burn the curry in the oil 1 min, add chicken, then water to half-cover; simmer 35 min. Boil the provisions 20 min.' },
    { id: 'm_brownfish', cu: 'jm', slot: 'ld', name: 'Brown-stew mackerel, rice & callaloo', pr: ['mackerel', 'sardines', 'tuna'], cb: ['rice', 'ipotato'], fx: [['callaloo', 120], ['onion', 30], ['tomato', 50], ['oil', 5]], how: 'Cook the rice. Sauté onion and tomato, add the fish and a splash of water, simmer 5 min. Steam callaloo separately.' },
    { id: 'm_peasstew', cu: 'jm', slot: 'ld', name: 'Stew peas with {p}, spinners & pumpkin', names: { redpeas: 'Stew peas with spinners & pumpkin' }, pr: ['chicken', 'redpeas'], cb: ['flour', 'rice'], fx: [['redpeas', 40], ['pumpkin', 120], ['carrot', 40], ['onion', 30], ['scallion', 10], ['oil', 5]], hows: { redpeas: 'Soak peas overnight, boil 60 min until soft. Add pumpkin, carrot, onion, escallion and thyme. Knead flour and water into small spinners and drop them in for the last 15 min.' }, how: 'Soak peas overnight, boil 60 min until soft. Add the seasoned chicken for the last 30 min with pumpkin, carrot, onion, escallion and thyme. Knead flour and water into small spinners and drop them in for the last 15 min.' },
    { id: 'm_pumpkinrice', cu: 'jm', slot: 'ld', name: 'Chicken & pumpkin rice with callaloo', pr: ['chicken'], cb: ['rice'], fx: [['pumpkin', 120], ['callaloo', 60], ['onion', 30], ['oil', 8]], how: 'Brown seasoned chicken pieces in the oil. Add rice, diced pumpkin, onion and water (2 cups per cup of rice), cover and cook 25 min. Stir in callaloo for the last 5 min.' },
    { id: 'm_friedrice', slot: 'ld', name: 'Fried rice with {p} & vegetables', pr: ['chicken', 'egg'], cb: ['rice'], fx: [['cabbage', 80], ['carrot', 50], ['scallion', 15], ['oil', 10]], hows: { egg: 'Use rice cooked earlier and cooled. Scramble the eggs and set aside. Stir-fry carrot, cabbage and escallion, add rice and eggs, season with soy sauce (or salt if you avoid soy) and pepper.' }, how: 'Use rice cooked earlier and cooled. Cook the diced chicken and set aside. Stir-fry carrot, cabbage and escallion, add rice and eggs, season with soy sauce (or salt if you avoid soy) and pepper.' },
    { id: 'm_tunasalad', slot: 'ld', name: 'Tuna & potato salad with cabbage slaw', pr: ['tuna', 'sardines', 'egg'], cb: ['ipotato', 'sweetpot'], fx: [['cabbage', 100], ['carrot', 50], ['onion', 20], ['oil', 10]], how: 'Boil diced potato 12 min and cool. Mix with the fish, onion, lime juice, oil, salt and pepper. Shred cabbage and carrot for the slaw.' },
    { id: 'm_steamchicken', cu: 'jm', slot: 'ld', name: 'Brown-stew chicken with {c} & steamed cabbage', pr: ['chicken'], cb: ['sweetpot', 'yam'], fx: [['cabbage', 150], ['carrot', 50], ['onion', 30], ['scallion', 10], ['tomato', 40], ['oil', 6]], how: 'Season the chicken well, ideally overnight: onion, escallion, garlic, thyme, pimento, black pepper, a little scotch bonnet and browning. Brown it in the oil, add the tomato and a splash of water, cover and stew 30 min until the gravy thickens. Steam the cabbage and carrot with a little onion 5–8 min. Boil the yam or sweet potato 20 min.' },
    { id: 'm_peasrice', cu: 'jm', slot: 'ld', plant: true, name: 'Red peas & rice with steamed callaloo', pr: ['redpeas'], cb: ['rice'], fx: [['callaloo', 120], ['onion', 30], ['oil', 6]], how: 'Boil the soaked peas until soft, cook rice in the peas water with escallion and thyme. Steam callaloo with onion.' },
    { id: 's_pbbread', cu: 'jm', slot: 's', name: 'Peanut butter on hardo bread', pr: ['pb'], cb: ['bread'], fx: [], how: 'Thin spread of peanut butter on bread.' },
    { id: 's_banegg', slot: 's', name: 'Ripe banana & boiled eggs', pr: ['egg'], cb: ['rbanana'], fx: [], how: 'Boil eggs ahead and keep them in the fridge for quick snacks.' },
    { id: 's_tunabread', slot: 's', name: 'Tuna or sardine sandwich', pr: ['tuna', 'sardines'], cb: ['bread'], fx: [['tomato', 40]], how: 'Mash the fish with lime and pepper, add sliced tomato.' },
    { id: 's_pbbanana', slot: 's', name: 'Banana with peanut butter', pr: ['pb'], cb: ['rbanana'], fx: [], how: 'Slice the banana and dip in peanut butter.' },
    { id: 's_peasdip', cu: 'jm', slot: 's', plant: true, name: 'Red peas dip with hardo bread or sweet potato', pr: ['redpeas'], cb: ['bread', 'sweetpot'], fx: [['oil', 5]], how: 'Blend cooked red peas with garlic, lime, the oil, salt and scotch bonnet to taste. Keeps 4 days in the fridge.' },
    { id: 's_porridge', slot: 's', name: 'Small bowl of oats with milk', pr: ['milk'], cb: ['oats'], fx: [], how: 'Cook oats in milk 5 min; add cinnamon.' },
    // Higher-protein dishes (budget levels decide who sees the pricier ones). fx entry: [id, grams, optional, swap if not in budget]
    { id: 'b_yogbowl', slot: 'b', name: '{p} bowl with {f} & oats', pr: ['greekyog', 'cottage'], cb: ['oats'], fx: [['berries', 100, 1, 'rbanana'], ['pb', 10, 1]], how: 'Spoon the yogurt (or cottage cheese) into a bowl, top with the fruit, raw or toasted oats and a little peanut butter. Thaw frozen berries in the fridge overnight.' },
    { id: 's_yogfruit', slot: 's', name: '{p} with {c}', pr: ['greekyog', 'cottage'], cb: ['berries', 'rbanana'], fx: [], how: 'Top with the fruit and a pinch of cinnamon. A drizzle of honey is fine if it fits your calories.' },
    { id: 's_shake', slot: 's', name: 'Protein shake with {c}', pr: ['whey'], cb: ['rbanana', 'oats', 'berries'], fx: [['milk', 250, 1]], how: 'Blend the whey with milk (or water), the fruit or oats and ice. Best within a couple of hours after training.' },
    { id: 's_cottagetoast', slot: 's', name: 'Cottage cheese & tomato on {c}', pr: ['cottage'], cb: ['wwbread', 'bread'], fx: [['tomato', 40]], how: 'Toast the bread, spread the cottage cheese, top with sliced tomato and black pepper.' },
    { id: 'm_chickbowl', slot: 'ld', name: 'Chicken breast, {c} & {f}', names: { turkey: 'Turkey meatballs, {c} & {f}' }, pr: ['chickbreast', 'turkey'], cb: ['rice', 'sweetpot', 'ipotato'], fx: [['broccoli', 120, 1, 'cabbage'], ['oil', 8]], how: 'Season the meat with garlic, thyme and black pepper; grill, bake (200°C, 20–25 min) or pan-fry. Steam the vegetables 5 min.' },
    { id: 'm_salmon', slot: 'ld', name: 'Baked salmon with {c} & {f}', pr: ['salmon'], cb: ['sweetpot', 'rice', 'ipotato'], fx: [['broccoli', 100, 1, 'callaloo'], ['oil', 4]], how: 'Season the salmon with lime, garlic and black pepper and bake at 200°C for 12–15 min. Boil or roast the sweet potato; steam the greens.' },
    { id: 'm_beefpasta', slot: 'ld', name: '{p} pasta with tomato sauce', names: { beef: 'Lean beef pasta with tomato sauce', turkey: 'Turkey pasta with tomato sauce' }, pr: ['beef', 'turkey'], cb: ['pasta'], fx: [['tomato', 120], ['onion', 30], ['carrot', 30], ['oil', 5]], how: 'Brown the mince with onion and garlic, pour off any fat, add chopped tomato and grated carrot and simmer 15 min. Boil the pasta 10 min.' },
    { id: 'b_eggtoast', slot: 'b', cu: 'us', name: 'Scrambled eggs on whole-wheat toast with fruit', pr: ['egg'], cb: ['wwbread'], fx: [['berries', 80, 1, 'rbanana']], how: 'Scramble the eggs in a non-stick pan over low heat. Toast the bread. Fruit on the side.' },
    { id: 'b_pbtoast', slot: 'b', cu: 'us', plant: true, name: 'Peanut butter toast with banana (plant-based)', pr: ['pb'], cb: ['wwbread'], fx: [['rbanana', 100]], how: 'Toast the bread, spread the peanut butter and top with sliced banana.' },
    { id: 'm_chili', slot: 'ld', cu: 'us', name: '{p} & bean chili with rice', names: { turkey: 'Turkey & bean chili with rice', beef: 'Beef & bean chili with rice', chickbreast: 'Chicken & bean chili with rice' }, pr: ['turkey', 'beef', 'chickbreast'], cb: ['rice'], fx: [['redpeas', 40], ['tomato', 100], ['onion', 40], ['oil', 5]], how: 'Brown the meat with onion and garlic, add chili powder and cumin, the cooked beans and chopped tomato; simmer 20 min. Serve over rice.' },
    { id: 'm_stirfry', slot: 'ld', cu: 'us', name: '{p} & vegetable stir-fry with rice', names: { chickbreast: 'Chicken & vegetable stir-fry with rice', egg: 'Egg & vegetable stir-fry with rice' }, pr: ['chickbreast', 'chicken', 'egg'], cb: ['rice'], fx: [['mixveg', 150, 1, 'cabbage'], ['oil', 8]], how: 'Slice the meat thin and stir-fry 5–6 min; add the vegetables for 4 min and season with soy sauce (or salt if you avoid soy), garlic and ginger. Serve over rice.' },
    { id: 'm_sheetpan', slot: 'ld', cu: 'us', name: 'Sheet-pan chicken, {c} & {f}', pr: ['chicken', 'chickbreast'], cb: ['ipotato', 'sweetpot'], fx: [['broccoli', 120, 1, 'carrot'], ['oil', 8]], how: 'Toss the chicken, diced potato and vegetables in the oil with paprika, garlic and salt. Roast at 220°C for 30–35 min, adding the broccoli for the last 12.' },
    { id: 'm_tunapasta', slot: 'ld', cu: 'us', name: 'Tuna pasta salad', pr: ['tuna'], cb: ['pasta'], fx: [['mixveg', 80, 1, 'carrot'], ['onion', 20], ['oil', 8]], how: 'Boil the pasta and vegetables, cool, then toss with the tuna, onion, oil, lemon, salt and pepper.' },
    { id: 'm_beanbowl', slot: 'ld', cu: 'us', plant: true, name: 'Bean & rice burrito bowl', names: { soya: '{p} & rice burrito bowl' }, hows: { soya: 'Soak the soya (TVP) in hot water 10 min and squeeze dry, then fry it with cumin, garlic and chili powder. Serve over rice with chopped tomato, onion, the vegetables and lime.' }, pr: ['redpeas', 'soya'], cb: ['rice'], fx: [['tomato', 60], ['onion', 30], ['mixveg', 80, 1, 'carrot'], ['oil', 5]], how: 'Warm the cooked beans with cumin, garlic and chili powder. Serve over rice with chopped tomato, onion, the vegetables and lime.' },
    { id: 'm_beanpasta', slot: 'ld', cu: 'us', plant: true, name: 'Bean & tomato pasta', names: { soya: '{p} bolognese pasta' }, hows: { soya: 'Soak the soya (TVP) in hot water 10 min and squeeze dry. Fry with onion and garlic, add chopped tomato and oregano and simmer 10 min. Toss with the boiled pasta.' }, pr: ['redpeas', 'broadbeans', 'soya'], cb: ['pasta'], fx: [['tomato', 100], ['onion', 30], ['oil', 6]], how: 'Simmer the beans with onion, garlic, chopped tomato and oregano 10 min. Toss with the boiled pasta.' },
    { id: 's_pbtoast', slot: 's', cu: 'us', name: 'Peanut butter on whole-wheat toast', pr: ['pb'], cb: ['wwbread'], fx: [], how: 'Thin spread of peanut butter on toast.' },
    // Plant protein (added 2026-10-25): soya chunks are about half protein by dry weight; soy protein builds muscle as well as whey with training (Messina 2018 meta-analysis)
    { id: 'm_soyastew', cu: 'jm', slot: 'ld', plant: true, name: 'Brown-stew soya chunks, rice & peas, steamed cabbage', pr: ['soya'], cb: ['rice'], fx: [['redpeas', 25], ['cabbage', 120], ['carrot', 40], ['onion', 30], ['scallion', 10], ['tomato', 40], ['oil', 8]], how: 'Soak the soya chunks in hot water 10 min and squeeze dry. Season with onion, escallion, thyme, garlic and a little browning; fry in the oil 3 min, add tomato and a cup of water and stew 10 min. Boil the peas until soft and cook the rice in the peas water. Steam cabbage and carrot 5 min.' },
    { id: 'm_currychickpea', slot: 'ld', plant: true, name: 'Curry chickpeas & soya chunks with {c}', pr: ['chickpeas'], cb: ['rice', 'ipotato', 'sweetpot'], fx: [['soya', 30, 1], ['pumpkin', 80], ['onion', 30], ['scallion', 10], ['oil', 8]], how: 'Soak the soya chunks in hot water 10 min and squeeze dry. Burn curry powder in the oil 1 min, add onion, escallion and diced pumpkin, then the drained chickpeas, the chunks and a cup of water; simmer 15 min. Serve with rice or boiled potato.' },
    { id: 'b_soyahash', slot: 'b', plant: true, name: 'Soya chunk & vegetable hash with {c}', pr: ['soya'], cb: ['ipotato', 'sweetpot', 'wwbread', 'bread'], fx: [['cabbage', 80], ['onion', 30], ['tomato', 50], ['oil', 6]], how: 'Soak the soya chunks in hot water 10 min (or overnight in the fridge) and squeeze dry. Fry with onion, shredded cabbage, tomato, thyme and black pepper 6–8 min. Serve with boiled or pan-fried potato, sweet potato or toast.' },
    { id: 's_chickpeamash', slot: 's', plant: true, name: 'Chickpea mash on {c}', pr: ['chickpeas'], cb: ['bread', 'wwbread', 'sweetpot'], fx: [['tomato', 40], ['oil', 5]], how: 'Mash the drained chickpeas with the oil, lime, garlic, salt and black pepper (or scotch bonnet). Spread on the bread or serve with sweet potato and sliced tomato. Keeps 3 days in the fridge.' }
  ];
  // What's new, newest first. The nightly improvement run adds an entry here.
  var CHANGES = [
    { d: '2026-10-25', t: 'Log a day you forgot', b: ['Forgot to log a workout? On Today, tap that day in the week strip, then tick your sets, weights and habits and tap Log this workout.', 'Use the arrows to go back up to 4 weeks. Future days show a preview you can log on the day.'] },
    { d: '2026-10-25', t: 'Move my data', b: ['New on the Plan tab: Copy my data and Paste my data. Use them to move your plan, weigh-ins and workouts between the Home Screen app, Safari and the claude.ai version.', 'Nothing is uploaded: the code only goes where you paste it. Pasting shows what is in the code first, and you can undo once.', 'Fixed: pasting on iPhone no longer says the code is wrong.'] },
    { d: '2026-10-25', t: 'Brown-stew chicken', b: ['The "steamed chicken" dinner is now brown-stew chicken with steamed cabbage and boiled yam or sweet potato, properly seasoned the Jamaican way. Thanks for the tip!', 'Fixed: the dish name now matches the food on the plate (it said sweet potato when the plan gave yellow yam).'] },
    { d: '2026-10-25', t: 'More protein for vegetarians and vegans', b: ['New plant proteins: soya chunks (about half protein, dry) and tinned chickpeas, with new dishes like brown-stew soya chunks, curry chickpeas and a soya chunk hash for breakfast.', 'Vegetarian and vegan plans now reach about 63–77% of the protein target, up from about 50%. Your target has not changed, only the foods.', 'Soy is now in the allergy list, and soya chunks and chickpeas can be ticked under Foods I buy.', 'Price check: no newer supermarket or market prices this week; exchange rate unchanged (Bank of Jamaica, 22 Oct).'] },
    { d: '2026-10-24', t: 'Store paused', b: ['The OMGym Store is paused while we find a cheaper way to bring products into Jamaica. Nothing can be ordered for now.', 'Anything already in your bag is saved for when the Store reopens.', 'Meal plans that use whey now show a local shop price instead of the Store price.'] },
    { d: '2026-10-24', t: 'What\'s new button and price check', b: ['New sparkle button at the top: an orange dot shows when OMGym has something new. Tap it to see every update, newest first. The dot clears once you have looked.', 'Market prices from Coronation Market (23 Oct): tomatoes J$400/lb, Irish potato J$250/lb, onions J$250/lb and escallion J$300/lb are a little cheaper; sweet potato and carrot unchanged.', 'Store: Jamaica\'s environmental levy on imports went up from 0.5% to 0.85% on 1 October, so 8 Store items went up by J$50 (whey, ISO100, C4, jump rope, shaker, straps, wraps). Exchange rate unchanged at J$162 per US$.'] },
    { d: '2026-10-23', t: 'Food budgets and US meals', b: ['Choose a food budget: Budget, Standard or Premium. The Shopping list shows what a week of food costs at each level, and you can set a weekly limit.', 'Tick the foods you buy (Greek yogurt, cottage cheese, berries, whey, chicken breast, salmon and more) and the plan builds meals around them.', 'Switch between Jamaica, USA and elsewhere at the top of Meals and the Shopping list. The USA now gets American dishes with Walmart prices.', 'PRO: a daily protein top-up (tuna, whey, Greek yogurt or chicken breast) so cut and bulk plans reach the higher protein target.'] },
    { d: '2026-10-23', t: 'Store price check', b: ['Whey prices have gone up in the US: the 5 lb Gold Standard is now about US$115 and the 2 lb about US$65, so their Store prices went up.', 'Seller view now lists where each Amazon price came from and when, and marks the ones to confirm on Amazon before you order.', 'Exchange rate checked with the Bank of Jamaica (22 Oct): still J$162 per US$ with the card fee.'] },
    { d: '2026-10-23', t: 'OMGym PRO', b: ['New PRO section for lifters with 3+ years of training: choose cut, lean bulk or maintain, with higher protein on a cut, harder training weeks and weekly check-ins.', 'US$10 a month. Tap PRO at the top, create your invoice, pay by Scotiabank transfer or PayPal, and send your proof on WhatsApp.', 'PRO opens for 3 days while OMGym checks your payment, then runs for the month you paid for. Nothing renews by itself.'] },
    { d: '2026-10-23', t: 'Store: flavours, pictures, order links', b: ['Choose your flavour or glove size before adding to the bag.', 'Every Store item has a picture.', 'Your WhatsApp order now includes an order number and a link so OMGym can order exactly what you picked.'] },
    { d: '2026-10-23', t: 'OMGym Store', b: ['New Store tab: protein powder, creatine, pre-workout and gym gear, delivered to Jamaica in about 1–2 weeks.', 'Prices include shipping, customs duty and GCT. Order on WhatsApp.'] },
    { d: '2026-10-23', t: 'Supermarket packs and shellfish', b: ['Prices are now quoted per pack (a 2 kg bag of rice, a whole chicken, a tin of mackerel), with the store and date for each.', 'Shellfish added to allergies.', 'A rest timer starts when you tick a set; a week view shows your training days.', 'Each exercise links to demo videos. Plates keep a proper portion of starch.'] },
    { d: '2026-10-22', t: 'First version', b: ['Workouts, meals, shopping list, weigh-ins and calorie targets.'] }
  ];
  // "What's new" button: each entry is known by its date and title; the viewer's last seen key is kept in their browser.
  function changeKey(c) { return c.d + ' ' + c.t; }
  // How many entries the viewer has not seen yet (all of them on a first visit).
  function unseenChanges(list, lastKey) {
    list = list || CHANGES;
    if (!lastKey) return list.length;
    for (var i = 0; i < list.length; i++) if (changeKey(list[i]) === lastKey) return i;
    // the entry was renamed or removed: count entries dated after the last one seen
    var d = String(lastKey).slice(0, 10);
    return list.filter(function (c) { return c.d > d; }).length;
  }
  var SLOTS = [
    { key: 'b', name: 'Breakfast', share: 0.25, pshare: 0.26 },
    { key: 'l', name: 'Lunch', share: 0.30, pshare: 0.33 },
    { key: 'd', name: 'Dinner', share: 0.30, pshare: 0.33 },
    { key: 's', name: 'Snack', share: 0.15, pshare: 0.08 }
  ];

  function excludedTags(p) {
    var t = (p.allergies || []).slice();
    if (p.diet === 'pescatarian') t.push('meat');
    if (p.diet === 'vegetarian') t.push('meat', 'fish');
    if (p.diet === 'vegan') t.push('meat', 'fish', 'egg', 'dairy');
    return t;
  }
  function allowedIng(id, ex) { var tags = ING[id].tags || []; return !tags.some(function (t) { return ex.indexOf(t) >= 0; }); }

  function priceTable(p, custom) {
    var region = p.region === 'US' ? 'US' : p.region === 'JM' ? 'JM' : 'OTHER';
    var base = region === 'OTHER' ? PRICES.US : PRICES[region];
    var meta = region === 'OTHER'
      ? { currency: 'custom', symbol: p.currencySymbol || '$', decimals: p.currencyDecimals != null ? p.currencyDecimals : 2, label: p.regionName || 'Your area' }
      : { currency: base.currency, symbol: base.symbol, decimals: base.decimals, label: base.label };
    var items = {};
    Object.keys(base.items).forEach(function (id) {
      var b = base.items[id];
      var it = { u: b.u, g: b.g, pr: b.pr, weighed: !!b.weighed, store: b.store, src: b.src, date: b.date, conf: b.conf, tier: b.tier || 1, name: b.name || ING[id].name, short: b.short };
      if (b.fromStore && STORE.paused && b.local) { it.pr = b.local.pr; it.store = b.local.store; it.src = b.local.src; it.date = b.local.date; it.conf = b.local.conf; }
      else if (b.fromStore) { var sp = productById(b.fromStore); if (sp) it.pr = landed(sp).price; }
      if (region === 'OTHER') { it.conf = 'placeholder'; it.store = 'Placeholder'; it.src = 'US price used as a placeholder. Enter what your store charges.'; }
      var c = custom && custom[id];
      if (c && typeof c.pr === 'number') {
        it.pr = c.pr; it.conf = 'yours'; it.store = c.store || 'Your store'; it.src = 'Your price' + (c.store ? ' at ' + c.store : ''); it.date = c.date || '';
        if (c.u && c.g > 0) { it.u = c.u; it.g = c.g; it.weighed = !!c.weighed; }
      }
      items[id] = it;
    });
    meta.stores = (base.stores || []).slice();
    return { region: region, meta: meta, items: items };
  }
  function ingName(pt, id) { return (pt && pt.items[id] && pt.items[id].name) || ING[id].name; }
  function shortName(id, pt) { return (pt && pt.items[id] && pt.items[id].short) || ING[id].short || ING[id].name.toLowerCase(); }
  function cap1(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function budgetTier(p) { var b = +(p && p.budget); return b === 2 || b === 3 ? b : 1; }
  function cuisineOf(p) { var c = p && p.cuisine; if (c === 'jm' || c === 'us' || c === 'mix') return c; return p && p.region === 'JM' ? 'jm' : p && p.region === 'US' ? 'us' : 'mix'; }
  // what the planner may use: diet/allergy tags, budget level, foods ticked under "Foods I buy", and dish style
  function mealCtx(p, pt) {
    var ex = excludedTags(p), tier = budgetTier(p), likes = (p.likes || []).filter(function (id) { return ING[id]; });
    var blocked = {};
    Object.keys(ING).forEach(function (id) { var t = pt && pt.items[id] ? pt.items[id].tier || 1 : 1; if (t > tier && likes.indexOf(id) < 0) blocked[id] = 1; });
    return { ex: ex, tier: tier, likes: likes, blocked: blocked, cu: cuisineOf(p), spread: BUDGETS[tier].spread, plantDiet: p.diet === 'vegetarian' || p.diet === 'vegan' };
  }
  function okIng(id, c) { return allowedIng(id, c.ex) && !c.blocked[id]; }
  function costPerGram(pt, id) { var it = pt.items[id]; return it.pr / it.g / ING[id].y; } // per edible gram

  function solveMeal(tpl, protId, carbId, kT, pT, ex, c) {
    var fixed = [];
    tpl.fx.forEach(function (f) {
      var id = f[0];
      if (!allowedIng(id, ex)) return;
      if (c && c.blocked[id]) { if (f[3] && okIng(f[3], c)) id = f[3]; else if (f[2]) return; }
      if (id !== protId && id !== carbId && !fixed.some(function (x) { return x.id === id; })) fixed.push({ id: id, g: f[1] });
    });
    var kF = 0, pF = 0;
    fixed.forEach(function (f) { kF += ING[f.id].k * f.g / 100; });
    if (kF > 0.4 * kT) { var sc = 0.4 * kT / kF; fixed.forEach(function (f) { f.g = Math.max(5, Math.round(f.g * sc / 5) * 5); }); }
    kF = 0;
    fixed.forEach(function (f) { kF += ING[f.id].k * f.g / 100; pF += ING[f.id].p * f.g / 100; });
    var P = ING[protId], C = ING[carbId];
    var a = P.k / 100, b = C.k / 100, c = P.p / 100, d = C.p / 100;
    var K = kT - kF, Q = pT - pF;
    var det = a * d - b * c;
    var xp, xc;
    var pMax = protId === 'pb' ? 40 : protId === 'redpeas' ? 150 : protId === 'egg' ? 200 : protId === 'milk' ? 350 : protId === 'whey' ? 47 : protId === 'greekyog' ? 400 : protId === 'cottage' ? 340 : protId === 'soya' ? 80 : protId === 'chickpeas' ? 360 : 260;
    var pMin = protId === 'egg' ? 50 : protId === 'pb' ? 10 : protId === 'whey' ? 25 : protId === 'soya' ? 20 : 30;
    var weak = (c / a) < 2 * (d / b); // protein item barely more protein-dense than the starch
    if (weak) { xp = 0.4 * K / a; }
    else if (Math.abs(det) > 1e-6) { xp = (K * d - b * Q) / det; } else { xp = pMax; }
    if (!isFinite(xp)) xp = pMax;
    var lean = P.p / P.k >= 0.09; // chicken, tinned fish
    xp = Math.min(xp, (lean ? 0.65 : 0.6) * K / a); // protein food never crowds out the whole plate
    xp = Math.max(pMin, Math.min(pMax, xp));
    if (protId === 'egg') { xp = Math.max(50, Math.round(xp / 50) * 50); if (a * xp > 0.7 * K && xp > 50) xp -= 50; }
    xc = (K - a * xp) / b;
    var isBread = carbId === 'bread' || carbId === 'wwbread';
    var cMax = isBread ? 160 : carbId === 'rbanana' ? 240 : carbId === 'berries' ? 250 : (C.k > 300 ? 160 : 450);
    var cMin = Math.max(isBread ? 32 : 15, Math.round(0.22 * K / b)); // at least ~22% of the meal from the starch
    xc = Math.max(cMin, Math.min(cMax, xc));
    if (carbId === 'bread') xc = Math.round(xc / 20) * 20;
    else if (carbId === 'wwbread') xc = Math.max(32, Math.round(xc / 32) * 32);
    else xc = Math.round(xc / 5) * 5;
    if (protId === 'whey') xp = Math.max(25, Math.round(xp / 15.5) * 15.5);
    else if (protId !== 'egg') xp = Math.round(xp / 5) * 5;
    var items = [{ id: protId, g: xp, role: 'protein' }, { id: carbId, g: xc, role: 'carb' }].concat(fixed.map(function (f) { return { id: f.id, g: f.g, role: 'fixed' }; }));
    return items;
  }

  function mealTotals(items, pt) {
    var t = { k: 0, p: 0, c: 0, f: 0, cost: 0 };
    items.forEach(function (it) {
      var I = ING[it.id];
      t.k += I.k * it.g / 100; t.p += I.p * it.g / 100; t.c += I.c * it.g / 100; t.f += I.f * it.g / 100;
      it.cost = costPerGram(pt, it.id) * it.g; it.buyG = it.g / I.y;
      t.cost += it.cost;
    });
    return t;
  }

  function slotOptions(slotKey, ex, c) {
    var s = slotKey === 'l' || slotKey === 'd' ? 'ld' : slotKey;
    var plantOk = ex.indexOf('meat') >= 0 || ex.indexOf('egg') >= 0;
    var base = MEALS.filter(function (m) {
      if (m.slot !== s) return false;
      if (m.plant && !plantOk) return false;
      if (!m.pr.some(function (id) { return allowedIng(id, ex); })) return false;
      if (!m.cb.some(function (id) { return allowedIng(id, ex); })) return false;
      return m.fx.every(function (f) { return f[2] || allowedIng(f[0], ex); });
    });
    if (!c) return base;
    var cuOk = function (m) { return !m.cu || c.cu === 'mix' || m.cu === c.cu; };
    var fits = function (m) {
      return m.pr.some(function (id) { return okIng(id, c); }) && m.cb.some(function (id) { return okIng(id, c); }) &&
        m.fx.every(function (f) { return f[2] || okIng(f[0], c) || (f[3] && okIng(f[3], c)) || !allowedIng(f[0], c.ex); });
    };
    // need at least two dishes (lunch and dinner differ); widen to other dish styles, then ignore budget, if short
    var tries = [function (m) { return cuOk(m) && fits(m); }, fits, cuOk];
    var want = s === 'ld' ? 2 : 1, got = [];
    for (var i = 0; i < tries.length; i++) { var r = base.filter(tries[i]); if (r.length >= want) return r; if (r.length > got.length) got = r; }
    return got.length ? (base.length > got.length && got.length < want ? base : got) : base;
  }
  function usesLike(m, c) {
    if (!c.likes.length) return false;
    var ids = m.pr.concat(m.cb, m.fx.map(function (f) { return f[0]; }));
    return ids.some(function (id) { return c.likes.indexOf(id) >= 0 && allowedIng(id, c.ex); });
  }

  function planDay(dateStr, p, T, pt, swaps) {
    var c = mealCtx(p, pt), ex = c.ex;
    var dn = dayNum(dateStr);
    var sw = (swaps && swaps[dateStr]) || {};
    var meals = [];
    var usedIds = {};
    SLOTS.forEach(function (slot, si) {
      var opts = slotOptions(slot.key, ex, c);
      if (!opts.length) { meals.push({ slot: slot, empty: true }); return; }
      var base = hash(dn * 7 + si * 131 + (slot.key === 'd' ? 3 : 0)) % opts.length;
      // foods the person buys come up about two days in three
      var liked = opts.filter(function (m) { return usesLike(m, c); });
      if (liked.length && hash(dn * 5 + si * 17) % 3 !== 0) base = opts.indexOf(liked[hash(dn * 11 + si) % liked.length]);
      var k = (base + (sw[slot.key] || 0)) % opts.length;
      var tries = 0;
      while (usedIds[opts[k].id] && tries < opts.length) { k = (k + 1) % opts.length; tries++; }
      var tpl = opts[k]; usedIds[tpl.id] = 1;
      var pick = function (list) { var a = list.filter(function (id) { return okIng(id, c); }); return a.length ? a : list.filter(function (id) { return allowedIng(id, ex); }); };
      var prots = pick(tpl.pr).sort(function (a, b) { return costPerGram(pt, a) / ING[a].p - costPerGram(pt, b) / ING[b].p; });
      var likedP = prots.filter(function (id) { return c.likes.indexOf(id) >= 0; });
      var protId;
      if (likedP.length) protId = likedP[hash(dn * 3 + si) % likedP.length];
      else {
        // rotate among options within the budget level's spread of the cheapest cost per gram of protein
        var cheapest = costPerGram(pt, prots[0]) / ING[prots[0]].p;
        // plant diets may pay up to 4x the cheapest protein per gram for a denser one (US TVP vs dried beans)
        var near = prots.filter(function (id) { return costPerGram(pt, id) / ING[id].p <= cheapest * (c.plantDiet ? Math.max(c.spread, 4) : c.spread); });
        // Standard, Premium and PRO plans keep to the protein-dense choices in each dish (tuna over eggs, chicken over peas).
        // Vegetarian and vegan plans do too at every level (soya chunks over peas), because plant diets otherwise fall far short of protein.
        if (c.tier > 1 || T.pro || c.plantDiet) {
          var dens = function (id) { return ING[id].p / ING[id].k; };
          var best = Math.max.apply(null, near.map(dens));
          var dense = near.filter(function (id) { return dens(id) >= (c.tier > 2 || T.pro ? 0.8 : 0.65) * best; });
          if (dense.length) near = dense;
        }
        protId = near[hash(dn * 3 + si) % near.length];
      }
      // carb: a liked one if any, else rotate among the two cheapest per kcal
      var carbs = pick(tpl.cb).sort(function (a, b) { return costPerGram(pt, a) / ING[a].k - costPerGram(pt, b) / ING[b].k; });
      var likedC = carbs.filter(function (id) { return c.likes.indexOf(id) >= 0; });
      var carbId = likedC.length ? likedC[hash(dn + si) % likedC.length] : carbs[hash(dn + si) % Math.min(2, carbs.length)];
      var kT = T.kcal * slot.share, pT = T.protein * slot.pshare;
      var items = solveMeal(tpl, protId, carbId, kT, pT, ex, c);
      var tot = mealTotals(items, pt);
      meals.push({ slot: slot, tpl: tpl, items: items, tot: tot, options: opts.length, protId: protId, carbId: carbId, kT: kT, pT: pT, how: (tpl.hows && tpl.hows[protId]) || tpl.how });
    });
    // second pass: if the day is short on protein, lean harder on the lean-protein meals
    var pSum = meals.reduce(function (a, m) { return a + (m.tot ? m.tot.p : 0); }, 0);
    var short = T.protein - pSum;
    if (short > 0.05 * T.protein) {
      var leanMeals = meals.filter(function (m) { return m.tot && ING[m.protId].p / ING[m.protId].k >= 0.09; });
      leanMeals.forEach(function (m) {
        var items2 = solveMeal(m.tpl, m.protId, m.carbId, m.kT, m.pT + short / leanMeals.length, ex, c);
        var tot2 = mealTotals(items2, pt);
        if (tot2.p > m.tot.p) { m.items = items2; m.tot = tot2; }
      });
    }
    if (T.pro) proTopUp(meals, T, pt, c, dn);
    meals.forEach(function (m) { if (m.tpl) m.name = mealName(m, pt); });
    var day = { k: 0, p: 0, c: 0, f: 0, cost: 0 };
    meals.forEach(function (m) { if (m.tot) ['k', 'p', 'c', 'f', 'cost'].forEach(function (x) { day[x] += m.tot[x]; }); });
    return { date: dateStr, meals: meals, tot: day, budget: c.tier, cuisine: c.cu };
  }
  // PRO: the higher protein target (2.0–2.3 g/kg) is hard to reach with ordinary dishes inside a calorie deficit.
  // Add one protein top-up to the snack and trim starch in the other meals by the same calories.
  var TOPUP = { soya: { g: 50, step: 25, what: 'soya chunks (soaked) in a stew or soup' }, whey: { g: 31, step: 15.5, what: '1 scoop whey in water' }, tuna: { g: 142, step: 71, what: '1 tin of tuna' }, greekyog: { g: 250, step: 25, what: 'a bowl of Greek yogurt' }, cottage: { g: 225, step: 25, what: 'a cup of cottage cheese' }, sardines: { g: 106, step: 106, what: '1 tin of sardines' }, chickbreast: { g: 120, step: 20, what: 'extra chicken breast' }, redpeas: { g: 60, step: 20, what: 'extra red peas' } };
  function proTopUp(meals, T, pt, c, dn) {
    var have = meals.reduce(function (a, m) { return a + (m.tot ? m.tot.p : 0); }, 0);
    var gap = T.protein - have;
    if (gap < 0.04 * T.protein) return;
    var host = meals.filter(function (m) { return m.tot && m.slot.key === 's'; })[0] || meals.filter(function (m) { return m.tot; }).slice(-1)[0];
    if (!host) return;
    var opts = Object.keys(TOPUP).filter(function (id) { return okIng(id, c) && pt.items[id]; });
    var animal = opts.filter(function (id) { return id !== 'redpeas' && id !== 'soya'; });
    if (animal.length) opts = animal; // plant top-ups (soya chunks, then peas) only when nothing else fits (vegan, or vegetarian on a Budget level)
    if (!opts.length) return;
    var cpp = function (id) { return costPerGram(pt, id) / ING[id].p; };
    opts.sort(function (a, b) { return cpp(a) - cpp(b); });
    var liked = opts.filter(function (id) { return c.likes.indexOf(id) >= 0; });
    var pool = liked.length ? liked : opts.filter(function (id, i) { return i < 2 || cpp(id) <= cpp(opts[0]) * c.spread; });
    var id = pool[hash(dn * 13 + 7) % pool.length], tu = TOPUP[id];
    var g = Math.min(tu.g, gap / (ING[id].p / 100));
    g = Math.max(tu.step, Math.round(g / tu.step) * tu.step);
    var addK = ING[id].k * g / 100;
    host.items.push({ id: id, g: g, role: 'topup' });
    host.topup = tu.what;
    // take the same calories out of the starch in the other meals (never below half the original portion)
    var others = meals.filter(function (m) { return m.tot && m !== host; });
    var carbK = others.reduce(function (a, m) { var it = m.items.filter(function (x) { return x.role === 'carb'; })[0]; return a + (it ? ING[it.id].k * it.g / 100 : 0); }, 0);
    others.forEach(function (m) {
      var it = m.items.filter(function (x) { return x.role === 'carb'; })[0]; if (!it || !carbK) return;
      var kNow = ING[it.id].k * it.g / 100, cut = addK * kNow / carbK;
      var g2 = Math.max(it.g / 2, it.g - cut / (ING[it.id].k / 100));
      it.g = it.id === 'wwbread' ? Math.max(32, Math.round(g2 / 32) * 32) : it.id === 'bread' ? Math.max(40, Math.round(g2 / 20) * 20) : Math.round(g2 / 5) * 5;
      m.tot = mealTotals(m.items, pt);
    });
    host.tot = mealTotals(host.items, pt);
  }
  function mealName(m, pt) {
    var fx = m.items.filter(function (it) { return it.role === 'fixed' && ING[it.id].grp === 'Vegetables & fruit'; })[0];
    var t = (m.tpl.names && m.tpl.names[m.protId]) || m.tpl.name;
    t = t.replace('{p}', shortName(m.protId, pt)).replace('{c}', shortName(m.carbId, pt)).replace('{f}', fx ? shortName(fx.id, pt) : 'vegetables');
    return cap1(t);
  }
  // Food actually eaten in a week at each budget level (so people can see what Premium costs)
  function weekCostByTier(start, p, T, pt, swaps) {
    var out = {};
    [1, 2, 3].forEach(function (t) {
      var q = {}; Object.keys(p).forEach(function (k) { q[k] = p[k]; }); q.budget = t;
      var e = 0; for (var i = 0; i < 7; i++) e += planDay(addDays(start, i), q, T, pt, swaps).tot.cost;
      out[t] = e;
    });
    return out;
  }

  function shoppingList(startDate, nDays, p, T, pt, swaps) {
    var need = {};
    var total = 0, days = [];
    for (var i = 0; i < nDays; i++) {
      var d = addDays(startDate, i);
      var plan = planDay(d, p, T, pt, swaps);
      days.push(plan);
      plan.meals.forEach(function (m) { (m.items || []).forEach(function (it) { need[it.id] = (need[it.id] || 0) + it.buyG; }); });
    }
    var rows = Object.keys(need).map(function (id) {
      var it = pt.items[id], g = need[id];
      var qty, cost, qtyText;
      if (it.weighed) {
        var lb = g / 453.6;
        var lbR = Math.max(0.5, Math.ceil(lb * 2) / 2);
        qty = lbR; cost = lbR * 453.6 * it.pr / it.g;
        qtyText = lbR + ' lb, weighed (' + Math.round(lbR * 0.4536 * 10) / 10 + ' kg)';
      } else {
        qty = Math.max(1, Math.ceil(g / it.g - 0.05));
        cost = qty * it.pr; qtyText = qty + ' × ' + it.u;
      }
      total += cost;
      return { id: id, name: ingName(pt, id), grp: ING[id].grp, needG: g, qty: qty, qtyText: qtyText, cost: cost, price: it };
    });
    var order = ['Proteins', 'Starches', 'Ground provisions', 'Vegetables & fruit', 'Pantry'];
    rows.sort(function (a, b) { return order.indexOf(a.grp) - order.indexOf(b.grp) || b.cost - a.cost; });
    var eaten = days.reduce(function (a, d) { return a + d.tot.cost; }, 0);
    return { rows: rows, total: total, eatenCost: eaten, days: days };
  }

  /* ---------- store: supplements and gym gear bought on Amazon, shipped by a forwarder ---------- */
  // Pricing per item: Amazon price + US sales tax, converted to J$; freight per lb; Jamaica Customs charges on CIF;
  // then the seller's markup on the landed cost, rounded up.
  var STORE = {
    fx: 162, fxDate: '2026-10-22', fxNote: 'J$158.73 per US$ (Bank of Jamaica, 22 Oct 2026, still the latest published rate found on 25 Oct (Forex report, Jamaica Homes News, 23 Oct): midpoint of J$157.87 buying and J$159.59 selling) plus about 2% card fee',
    freightPerLb: 600, freightNote: 'Freight forwarder rate, J$600 per lb (owner)',
    usSalesTax: 0.07, usTaxNote: 'Miami-Dade sales tax 7% on Amazon orders to a Florida forwarder; refundable through tax-exempt@amazon.com with the airway bill',
    duty: 0.20, gct: 0.15, scf: 0.003, envLevy: 0.0085, stampDuty: 100, stampOver: 5500,
    dutyNote: 'Jamaica Customs: 20% import duty, 15% GCT on CIF + duty, 0.3% standards fee and 0.85% environmental levy on CIF (levy raised from 0.5% on 1 Oct 2026), J$100 stamp duty when CIF is over J$5,500',
    markup: 0.15, roundTo: 50,
    whatsapp: '16582184432', // owner's WhatsApp, international form (+1 658 218 4432)
    orderBase: 'https://876lab.github.io/omgym/', // order links always open the public site
    leadTime: 'about 1–2 weeks',
    // Owner paused all Store sales on 24 Oct 2026 until import costs come down (see the import research doc).
    // While paused: no prices, no Add to bag, no WhatsApp orders, no add-on prompts. Saved bags are kept.
    // To reopen, set paused: false.
    paused: true,
    pauseNote: 'The OMGym Store is paused while we find a cheaper way to bring products into Jamaica, so we can offer better prices. Your bag is saved for when we reopen.'
  };
  // usd: typical Amazon price (check on Amazon before ordering), lb: billed shipping weight.
  var PRODUCTS = [
    { id: 'on-whey-5', pic: 'tub', q: 'Optimum Nutrition Gold Standard 100% Whey Protein 5 lb', vlabel: 'Flavour', variants: [{ id: 'drc', label: 'Double Rich Chocolate', asin: 'B000QSNYGI' }, { id: 'emc', label: 'Extreme Milk Chocolate', asin: 'B000QSTBNS' }, { id: 'vic', label: 'Vanilla Ice Cream', asin: 'B000GISU1M' }, { id: 'str', label: 'Delicious Strawberry', asin: 'B000QSRO1Y' }], cat: 'protein', name: 'Optimum Nutrition Gold Standard 100% Whey', size: '5 lb tub · 74 servings', usd: 114.99, lb: 6, servings: 74, perServing: '24 g protein a scoop', tags: ['dairy'], desc: 'The best-known whey. One scoop in water or milk after training.', src: 'Amazon price on the WheyIndex tracker, US$114.99 (top of its range); Optimum Nutrition\'s own store sells a tub for US$131.99 (2-pack price, 23 Oct 2026)', date: '2026-10-01', conf: 'tracker' },
    { id: 'on-whey-2', pic: 'tub', q: 'Optimum Nutrition Gold Standard 100% Whey Protein 2 lb', vlabel: 'Flavour', variants: [{ id: 'drc', label: 'Double Rich Chocolate' }, { id: 'vic', label: 'Vanilla Ice Cream' }, { id: 'emc', label: 'Extreme Milk Chocolate' }], cat: 'protein', name: 'Optimum Nutrition Gold Standard 100% Whey', size: '2 lb tub · 29 servings', usd: 64.99, lb: 3, servings: 29, perServing: '24 g protein a scoop', tags: ['dairy'], desc: 'Smaller tub to try a flavour first.', src: 'Vitacost US$64.99 (Amazon could not be read)', date: '2026-10-23', conf: 'retailer' },
    { id: 'iso100-5', pic: 'tub', q: 'Dymatize ISO100 Hydrolyzed Whey Isolate 5 lb', vlabel: 'Flavour', variants: [{ id: 'gch', label: 'Gourmet Chocolate' }, { id: 'gva', label: 'Gourmet Vanilla' }, { id: 'fbr', label: 'Fudge Brownie' }], cat: 'protein', name: 'Dymatize ISO100 Hydrolyzed Whey Isolate', size: '5 lb tub · 71 servings', usd: 119.99, lb: 6, servings: 71, perServing: '25 g protein a scoop', tags: ['dairy'], desc: 'Whey isolate: very low lactose, mixes thin.', src: 'Amazon US$109.99 on the Rocketium tracker (Jan 2026); Walmart lists US$203.98 (Oct 2026, likely a marketplace seller). Kept at US$119.99 until checked on Amazon', date: '2026-01-29', conf: 'estimate' },
    { id: 'orgain-plant', pic: 'plant', q: 'Orgain Organic Plant Based Protein Powder 2.03 lb', vlabel: 'Flavour', variants: [{ id: 'ccf', label: 'Creamy Chocolate Fudge' }, { id: 'vb', label: 'Vanilla Bean' }], cat: 'protein', name: 'Orgain Organic Plant-Based Protein', size: '2.03 lb tub · 20 servings', usd: 32.99, lb: 3, servings: 20, perServing: '21 g protein a scoop', tags: [], desc: 'Pea, rice and chia protein. Dairy-free and vegan.', src: 'Vitacost US$32.99 (Amazon could not be read)', date: '2026-10-23', conf: 'retailer' },
    { id: 'on-creatine', pic: 'jar', q: 'Optimum Nutrition Micronized Creatine Monohydrate Powder Unflavored 600g', cat: 'creatine', name: 'Optimum Nutrition Micronized Creatine', size: '600 g · 120 servings', usd: 34.99, lb: 2, servings: 120, perServing: '5 g creatine a scoop', tags: [], desc: 'The most researched supplement for strength. 5 g a day, any time.', src: 'Walmart US$32.50; kept at US$34.99 to allow for Amazon\'s price moving', date: '2026-10-23', conf: 'retailer' },
    { id: 'nutricost-creatine', pic: 'jar', q: 'Nutricost Creatine Monohydrate Micronized Powder 500g', cat: 'creatine', name: 'Nutricost Creatine Monohydrate', size: '500 g · 100 servings', usd: 19.95, lb: 1.5, servings: 100, perServing: '5 g creatine a scoop', tags: [], desc: 'Budget creatine, same active ingredient.', src: 'Typical Amazon price, not yet confirmed', date: '2026-10-22', conf: 'estimate' },
    { id: 'c4-original', pic: 'bolt', q: 'Cellucor C4 Original Pre Workout Powder 60 Servings', vlabel: 'Flavour', variants: [{ id: 'fp', label: 'Fruit Punch' }, { id: 'ibr', label: 'Icy Blue Razz' }, { id: 'cl', label: 'Cherry Limeade' }], cat: 'preworkout', name: 'Cellucor C4 Original Pre-Workout', size: '60 servings', usd: 42.99, lb: 1.5, servings: 60, perServing: '150 mg caffeine a scoop', tags: [], stim: true, desc: 'Energy before training. Contains caffeine: skip coffee that day.', src: 'Amazon list price US$49.99, often US$29.99 before coupons (Slickdeals, Apr 2026)', date: '2026-04-07', conf: 'estimate' },
    { id: 'gloves', pic: 'gloves', q: 'weightlifting gloves padded palm wrist support men women', vlabel: 'Size', variants: [{ id: 's', label: 'Small' }, { id: 'm', label: 'Medium' }, { id: 'l', label: 'Large' }, { id: 'xl', label: 'XL' }], cat: 'gear', name: 'Weightlifting gloves', size: 'Padded palm, wrist strap · S–XL', usd: 19.99, lb: 0.5, tags: [], desc: 'Better grip on bars and dumbbells, fewer calluses.', src: 'Typical Amazon price for this kind of item, not yet confirmed', date: '2026-10-22', conf: 'estimate' },
    { id: 'jump-rope', pic: 'rope', q: 'adjustable speed jump rope steel cable ball bearing', cat: 'gear', name: 'Adjustable speed jump rope', size: 'Steel cable, ball-bearing handles', usd: 9.99, lb: 0.5, tags: [], desc: 'Ten minutes of skipping covers a cardio finisher anywhere.', src: 'Typical Amazon price for this kind of item, not yet confirmed', date: '2026-10-22', conf: 'estimate' },
    { id: 'bands', pic: 'bands', q: 'resistance loop exercise bands set of 5', cat: 'gear', name: 'Resistance loop bands', size: 'Set of 5 strengths', usd: 12.99, lb: 0.5, tags: [], desc: 'Warm-ups, glute work and home sessions.', src: 'Typical Amazon price for this kind of item, not yet confirmed', date: '2026-10-22', conf: 'estimate' },
    { id: 'shaker', pic: 'shaker', q: 'BlenderBottle Classic Shaker Bottle 28 oz', cat: 'gear', name: 'BlenderBottle Classic shaker', size: '28 oz with whisk ball', usd: 9.99, lb: 0.5, tags: [], desc: 'Lump-free protein shakes.', src: 'Typical Amazon price for this kind of item, not yet confirmed', date: '2026-10-22', conf: 'estimate' },
    { id: 'straps', pic: 'straps', q: 'lifting straps padded cotton pair', cat: 'gear', name: 'Lifting straps', size: 'Padded cotton, pair', usd: 9.99, lb: 0.5, tags: [], desc: 'Hold heavier rows and deadlifts when grip gives out first.', src: 'Typical Amazon price for this kind of item, not yet confirmed', date: '2026-10-22', conf: 'estimate' },
    { id: 'wraps', pic: 'wraps', q: 'wrist wraps weightlifting 18 inch pair', cat: 'gear', name: 'Wrist wraps', size: '18 in, pair', usd: 11.99, lb: 0.5, tags: [], desc: 'Support for pressing days.', src: 'Typical Amazon price for this kind of item, not yet confirmed', date: '2026-10-22', conf: 'estimate' }
  ];
  var PRODUCT_PRICES_NOTE = 'Amazon blocks automated price checks, so each price comes from a price tracker or another US store, with its date. Confirm on Amazon before ordering, especially items marked "confirm".';
  // How sure each Amazon price is, and whether it needs checking again (over 30 days old or never confirmed).
  var PRICE_CONF = { amazon: 'Seen on Amazon', tracker: 'Amazon price tracker', retailer: 'Another US store', estimate: 'Estimate' };
  function priceCheck(prod, todayStr) {
    var age = prod.date ? dayNum(todayStr) - dayNum(prod.date) : null;
    var stale = age == null || age > 30;
    return { label: PRICE_CONF[prod.conf] || 'Estimate', age: age, stale: stale, confirm: prod.conf !== 'amazon' || stale };
  }

  function landed(prod, cfg) {
    cfg = cfg || STORE;
    var usd = prod.usd * (1 + cfg.usSalesTax);
    var goods = usd * cfg.fx;
    var freight = prod.lb * cfg.freightPerLb;
    var cif = goods + freight;
    var duty = cif * cfg.duty;
    var gct = (cif + duty) * cfg.gct;
    var fees = cif * (cfg.scf + cfg.envLevy) + (cif > cfg.stampOver ? cfg.stampDuty : 0);
    var cost = goods + freight + duty + gct + fees;
    var price = Math.ceil(cost * (1 + cfg.markup) / cfg.roundTo) * cfg.roundTo;
    return { usd: prod.usd, usTax: prod.usd * cfg.usSalesTax, goods: goods, freight: freight, cif: cif, duty: duty, gct: gct, fees: fees, cost: cost, price: price, profit: price - cost, perServing: prod.servings ? price / prod.servings : null };
  }
  // what a person may see: stimulants hidden for under-18, pregnancy or a health-screen "yes"; allergy and diet flags
  function productView(prod, p) {
    var ex = excludedTags(p || {});
    var blocked = !!prod.stim && p && (p.age < 18 || p.pregnant || (p.parq || []).some(Boolean));
    var conflict = prod.tags.filter(function (t) { return ex.indexOf(t) >= 0; });
    return { hidden: blocked, conflict: conflict };
  }
  // Encode for links sent on WhatsApp, which treats * _ ~ as formatting marks.
  function waSafe(x) { return encodeURIComponent(x).replace(/[!'()*~_]/g, function (c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); }); }
  // Bag keys are "productId.variantId" ("productId" for items with no choices).
  function productById(id) { return PRODUCTS.filter(function (x) { return x.id === id; })[0]; }
  function variantOf(prod, vid) {
    if (!prod || !prod.variants || !prod.variants.length) return null;
    return prod.variants.filter(function (v) { return v.id === vid; })[0] || prod.variants[0];
  }
  function cartKey(id, vid) { var pr = productById(id), v = variantOf(pr, vid); return v ? id + '.' + v.id : id; }
  function parseKey(key) {
    var i = key.indexOf('.'), id = i < 0 ? key : key.slice(0, i), pr = productById(id);
    if (!pr) return null;
    var v = variantOf(pr, i < 0 ? '' : key.slice(i + 1));
    return { key: cartKey(id, v && v.id), prod: pr, variant: v };
  }
  // merge old or duplicate keys into one line per product and flavour/size
  function normalizeCart(cart) {
    var out = {};
    Object.keys(cart || {}).forEach(function (k) {
      var q = Math.max(0, Math.min(50, Math.round(cart[k] || 0))), pk = parseKey(k);
      if (!q || !pk) return; out[pk.key] = (out[pk.key] || 0) + q;
    });
    return out;
  }
  function amazonLink(prod, variant) {
    if (variant && variant.asin) return { url: 'https://www.amazon.com/dp/' + variant.asin, exact: true };
    var text = (prod.q || prod.name + ' ' + prod.size.split(' · ')[0]) + (variant && prod.vlabel === 'Flavour' ? ' ' + variant.label : '');
    return { url: 'https://www.amazon.com/s?k=' + encodeURIComponent(text), exact: false };
  }
  function itemTitle(pk) { return pk.prod.name + ', ' + pk.prod.size.split(' · ')[0] + (pk.variant ? ', ' + pk.variant.label : ''); }
  function shortHash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', o = ''; h = h >>> 0; for (var j = 0; j < 4; j++) { o += a[h % 32]; h = Math.floor(h / 32); } return o; }
  // Same bag, name and day always give the same order number.
  function orderId(cart, name, dateStr) { var c = normalizeCart(cart); return 'OM-' + dateStr.slice(5, 7) + dateStr.slice(8, 10) + '-' + shortHash(Object.keys(c).sort().map(function (k) { return k + ':' + c[k]; }).join(',') + '|' + (name || '').trim().toLowerCase()); }
  function orderUrl(cart, name, id, cfg) {
    cfg = cfg || STORE; var c = normalizeCart(cart);
    var o = Object.keys(c).map(function (k) { var pk = parseKey(k); return pk.prod.id + '.' + (pk.variant ? pk.variant.id : 'x') + '.' + c[k]; }).join(',');
    return cfg.orderBase + '?o=' + waSafe(o) + '&id=' + waSafe(id) + (name ? '&n=' + waSafe(name.trim().slice(0, 40)) : '');
  }
  function parseOrder(search) {
    var q = {}; String(search || '').replace(/^\?/, '').split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); try { q[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = decodeURIComponent((i < 0 ? '' : kv.slice(i + 1)).replace(/\+/g, ' ')); } catch (e) { } });
    if (!q.o) return null;
    var lines = [];
    q.o.split(',').forEach(function (part) {
      var f = part.split('.'); if (f.length < 3) return;
      var pk = parseKey(f[1] === 'x' ? f[0] : f[0] + '.' + f[1]), n = Math.max(0, Math.min(50, parseInt(f[2], 10) || 0));
      if (pk && n) lines.push({ pk: pk, qty: n });
    });
    return { id: (q.id || '').slice(0, 20), name: (q.n || '').slice(0, 40), lines: lines };
  }
  function orderSummary(lines, cfg) {
    cfg = cfg || STORE; var t = { usd: 0, usdTax: 0, lb: 0, freight: 0, cost: 0, price: 0, profit: 0, items: 0 };
    lines.forEach(function (ln) { var l = landed(ln.pk.prod, cfg); t.items += ln.qty; t.usd += ln.pk.prod.usd * ln.qty; t.usdTax += (ln.pk.prod.usd + l.usTax) * ln.qty; t.lb += ln.pk.prod.lb * ln.qty; t.freight += l.freight * ln.qty; t.cost += l.cost * ln.qty; t.price += l.price * ln.qty; t.profit += l.profit * ln.qty; });
    return t;
  }
  function orderText(cart, cfg, name, dateStr) {
    cfg = cfg || STORE;
    var c = normalizeCart(cart), lines = [], total = 0;
    Object.keys(c).forEach(function (k) {
      var pk = parseKey(k), q = c[k], l = landed(pk.prod, cfg); total += l.price * q;
      lines.push(q + ' × ' + itemTitle(pk) + ' — J$' + (l.price * q).toLocaleString('en-US'));
    });
    if (!lines.length) return { text: '', total: 0, count: 0, id: '', url: '' };
    var id = orderId(c, name, dateStr || ymd(new Date())), url = orderUrl(c, name, id, cfg);
    var text = 'Hi! I would like to order from OMGym (order ' + id + '):\n' + lines.join('\n') + '\nTotal: J$' + total.toLocaleString('en-US') + (name ? '\nName: ' + name.trim() : '') + '\n\nOrder details for OMGym:\n' + url;
    return { text: text, total: total, count: lines.length, id: id, url: url };
  }

  /* ---------- PRO subscription: invoices, payment proof and signed unlock links ---------- */
  // The owner confirms each payment and sends a link signed with a private key only he holds.
  // The app checks the signature with this public key, so links cannot be made up or edited.
  var PRO = {
    priceUsd: 10, graceDays: 3, graceEveryDays: 30, remindDays: 5,
    boj: { rate: 159.59, date: '2026-10-22', note: 'Bank of Jamaica selling rate, 22 Oct 2026 (still the latest published on 25 Oct)' },
    bank: { holder: 'CARGILL BROWN', bank: 'Scotiabank', type: 'Chequing', number: '90605 000606999', currency: 'JMD' },
    paypal: 'Cargill.brown@gmail.com', // owner's PayPal (US$)
    lynk: '', // owner's Lynk username (J$ at the BOJ rate); when set, Lynk is offered first
    showBank: true, // owner can switch off the Scotiabank details once Lynk is set
    whatsapp: '16582184432', seller: 'OMGym (Cargill Brown)',
    siteBase: 'https://876lab.github.io/omgym/',
    publicKey: {"kty":"EC","crv":"P-256","x":"oVa72ChdJEDPKrJlMC9_0KOg1JTQjz3Rb7_WrtnZAIs","y":"ga295EpCdNJYf1qRQquywceMLBTEzi3Y78K6w5KIRm4"},
    terms: [
      'PRO is month to month. Nothing renews by itself: you only pay when you want another month.',
      'To cancel, just don\'t renew. You keep PRO until the end of the period you paid for.',
      'No refunds for part of a month already started.',
      'Full refund if OMGym can\'t unlock PRO within 3 working days of receiving your correct payment, or if you paid twice for the same period.',
      'If the amount received is different (for example a bank fee), OMGym will contact you to sort out the difference.',
      'Keep your payment screenshot until PRO is unlocked. OMGym deletes it once the payment is checked.'
    ]
  };
  var PRO_METHODS = { lynk: 'Lynk', bns: 'Scotiabank transfer', pp: 'PayPal', cash: 'Cash' };
  // payment options the customer sees, in order
  function proPayMethods() { var m = []; if (PRO.lynk) m.push('lynk'); if (PRO.showBank || !PRO.lynk) m.push('bns'); m.push('pp'); return m; }
  function compact(d) { return d.replace(/-/g, ''); }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function niceDay(dateStr) { var d = parseYmd(dateStr); return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); }
  function expand(c) { return /^\d{8}$/.test(c) ? c.slice(0, 4) + '-' + c.slice(4, 6) + '-' + c.slice(6, 8) : ''; }
  function addMonths(dateStr, n) {
    var d = parseYmd(dateStr), day = d.getDate();
    d.setDate(1); d.setMonth(d.getMonth() + n);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last)); return ymd(d);
  }
  function newProId(rand) { var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', o = ''; for (var i = 0; i < 6; i++) o += a[Math.floor((rand || Math.random)() * 32) % 32]; return o; }
  function proJmd(usd, rate) { return Math.round(usd * rate * 100) / 100; }
  function invoiceNo(proId, startStr, seq) { return 'PRO-' + startStr.slice(2, 4) + startStr.slice(5, 7) + '-' + proId + '-' + seq; }
  // What the customer sends on WhatsApp with their payment screenshot.
  function proProofText(inv, method) {
    var jmd = proJmd(PRO.priceUsd, PRO.boj.rate);
    return 'OMGym PRO payment\nName: ' + inv.name + '\nInvoice: ' + inv.no + '\nPRO ID: ' + inv.id +
      '\nPeriod: ' + niceDay(inv.start) + ' to ' + niceDay(inv.until) + '\nAmount: US$' + PRO.priceUsd.toFixed(2) +
      (method === 'bns' || method === 'lynk' ? ' (J$' + jmd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' at the Bank of Jamaica rate of J$' + PRO.boj.rate + ', ' + niceDay(PRO.boj.date) + ')' : '') +
      '\nPaid by: ' + (PRO_METHODS[method] || method) + '\nMy payment screenshot is attached.\n\nRef: OMPRO.' + inv.id + '.' + compact(inv.start) + '.' + compact(inv.until) + '.' + inv.no + '.' + method;
  }
  // Read a customer's message (pasted into the PRO Desk).
  function parseProof(text) {
    var m = String(text || '').match(/OMPRO\.([A-Z2-9]{6})\.(\d{8})\.(\d{8})\.(PRO-\d{4}-[A-Z2-9]{6}-\d{1,3})\.([a-z]+)/);
    if (!m) return null;
    var nm = String(text).match(/^Name:\s*(.+)$/m);
    return { id: m[1], start: expand(m[2]), until: expand(m[3]), no: m[4], method: m[5], name: nm ? nm[1].trim().slice(0, 40) : '' };
  }
  // The signed facts in an unlock link.
  var PRO_FIELDS = ['id', 's', 'u', 'inv', 'n', 'm', 'amt', 'cur', 'pd'];
  function proCanon(f) { return ['OMPRO1'].concat(PRO_FIELDS.map(function (k) { return String(f[k] == null ? '' : f[k]); })).join('|'); }
  function proLink(f, sigHex) { return PRO.siteBase + '?pro=1&' + PRO_FIELDS.map(function (k) { return k + '=' + waSafe(f[k] == null ? '' : f[k]); }).join('&') + '&sig=' + sigHex; }
  function parseProLink(search) {
    var q = {}; String(search || '').replace(/^\?/, '').split('&').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); try { q[decodeURIComponent(i < 0 ? kv : kv.slice(0, i))] = decodeURIComponent((i < 0 ? '' : kv.slice(i + 1)).replace(/\+/g, ' ')); } catch (e) { } });
    if (q.pro !== '1' || !q.sig) return null;
    var f = {}; PRO_FIELDS.forEach(function (k) { f[k] = q[k] || ''; }); f.sig = q.sig; return f;
  }
  function hexToBytes(h) { if (!/^[0-9a-f]+$/i.test(h) || h.length % 2) return null; var b = new Uint8Array(h.length / 2); for (var i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16); return b; }
  function bytesToHex(b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  function subtle() { var c = (typeof crypto !== 'undefined' && crypto) || (typeof globalThis !== 'undefined' && globalThis.crypto); return c && c.subtle; }
  function proVerify(f, jwk) {
    var sb = subtle(), sig = hexToBytes(f && f.sig || '');
    if (!sb || !sig || sig.length !== 64) return Promise.resolve(false);
    if (!/^[A-Z2-9]{6}$/.test(f.id) || !expand(f.s) || !expand(f.u) || f.s > f.u) return Promise.resolve(false);
    return sb.importKey('jwk', jwk || PRO.publicKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
      .then(function (k) { return sb.verify({ name: 'ECDSA', hash: 'SHA-256' }, k, sig, new TextEncoder().encode(proCanon(f))); })
      .catch(function () { return false; });
  }
  function proSign(f, privJwk) {
    var sb = subtle();
    return sb.importKey('jwk', privJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'])
      .then(function (k) { return sb.sign({ name: 'ECDSA', hash: 'SHA-256' }, k, new TextEncoder().encode(proCanon(f))); })
      .then(bytesToHex);
  }
  // PRO status on this phone from verified unlocks and a grace period.
  // unlocks: verified link fields for this phone's id; grace: {start} or null.
  function proStatus(todayStr, proId, unlocks, grace) {
    var t = compact(todayStr), best = null;
    (unlocks || []).forEach(function (f) { if (f.id === proId && f.s <= t && t <= f.u && (!best || f.u > best.u)) best = f; });
    var lastUntil = (unlocks || []).filter(function (f) { return f.id === proId; }).reduce(function (a, f) { return f.u > a ? f.u : a; }, '');
    if (best) {
      var left = dayNum(expand(best.u)) - dayNum(todayStr);
      return { active: true, via: 'paid', until: expand(best.u), daysLeft: left, renewSoon: left <= PRO.remindDays, lastUntil: expand(lastUntil) };
    }
    if (grace && grace.start) {
      var end = addDays(grace.start, PRO.graceDays);
      if (todayStr >= grace.start && todayStr < end) return { active: true, via: 'grace', until: end, daysLeft: dayNum(end) - dayNum(todayStr), renewSoon: false, lastUntil: expand(lastUntil) };
    }
    return { active: false, via: null, until: null, lastUntil: expand(lastUntil) };
  }
  function graceAllowed(todayStr, graceLog) {
    return !(graceLog || []).some(function (g) { return dayNum(todayStr) - dayNum(g) < PRO.graceEveryDays; });
  }
  // Next PRO period: starts when the current one ends, or today.
  function nextPeriod(todayStr, lastUntil, months) {
    var start = lastUntil && lastUntil >= todayStr ? lastUntil : todayStr;
    return { start: start, until: addMonths(start, months || 1) };
  }

  /* ---------- progress ---------- */
  function trend(weights, todayStr, windowDays) {
    windowDays = windowDays || 21;
    var t0 = dayNum(todayStr);
    var pts = weights.filter(function (w) { var dn = dayNum(w.d); return dn <= t0 && dn > t0 - windowDays; }).map(function (w) { return [dayNum(w.d), w.kg]; });
    if (pts.length < 4) return null;
    var span = pts[pts.length - 1][0] - pts[0][0];
    var xs = pts.map(function (q) { return q[0]; });
    if (Math.max.apply(null, xs) - Math.min.apply(null, xs) < 10) return null;
    var n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    pts.forEach(function (q) { sx += q[0]; sy += q[1]; sxx += q[0] * q[0]; sxy += q[0] * q[1]; });
    var slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    var mean = sy / n;
    return { perWeek: slope * 7, n: n, span: span, mean: mean };
  }

  function suggestAdjust(T, tr, w) {
    if (!tr) return null;
    if (T.pro) {
      // PRO: weekly check-in against the chosen rate, 100 kcal steps
      var want = T.goalType === 'lose' ? -T.proRate * w : T.goalType === 'gain' ? T.proRate * w : 0;
      var gap = tr.perWeek - want, tol = Math.max(0.1, 0.0015 * w);
      if (T.goalType === 'lose' && T.floorApplied && gap > 0) return null;
      if (gap > tol) return { delta: -100, why: 'Your 3-week trend is ' + (tr.perWeek >= 0 ? '+' : '') + tr.perWeek.toFixed(2) + ' kg/week against a target of ' + (want >= 0 ? '+' : '') + want.toFixed(2) + '. Remove 100 kcal a day.' };
      if (gap < -tol) return { delta: 100, why: 'Your 3-week trend is ' + (tr.perWeek >= 0 ? '+' : '') + tr.perWeek.toFixed(2) + ' kg/week against a target of ' + (want >= 0 ? '+' : '') + want.toFixed(2) + '. Add 100 kcal a day.' };
      return null;
    }
    var planned = T.plannedWeeklyKg, actual = tr.perWeek;
    if (T.goalType === 'lose') {
      if (actual > planned * 0.4 && !T.floorApplied) return { delta: -150, why: 'You are losing ' + Math.abs(actual).toFixed(2) + ' kg/week against a plan of ' + Math.abs(planned).toFixed(2) + ' kg. A small cut of 150 kcal should get things moving.' };
      if (actual < -0.012 * w) return { delta: 150, why: 'You are losing faster than 1.2% of body weight a week. Adding 150 kcal protects muscle and energy.' };
    } else if (T.goalType === 'gain') {
      if (actual < planned * 0.4) return { delta: 100, why: 'Weight is climbing slower than planned. Add 100 kcal.' };
      if (actual > planned * 2) return { delta: -100, why: 'Weight is climbing faster than planned, so more of it is likely fat. Remove 100 kcal.' };
    } else {
      if (actual > 0.0025 * w) return { delta: -100, why: 'Your weight is creeping up. Trim 100 kcal to hold steady.' };
      if (actual < -0.0025 * w) return { delta: 100, why: 'Your weight is drifting down. Add 100 kcal to hold steady.' };
    }
    return null;
  }

  /* ---------- move my data: one text code, never uploaded anywhere ---------- */
  var DATA_PREFIX = 'OMGYM1:';
  function b64enc(str) { return btoa(unescape(encodeURIComponent(str))); }
  function b64dec(str) { return decodeURIComponent(escape(atob(str))); }
  function exportCode(state) { return DATA_PREFIX + b64enc(JSON.stringify(state)); }
  function dataSummary(d) {
    var days = d.days || {};
    return { name: (d.profile && d.profile.name) || 'No name', weighIns: (d.weights || []).length, workouts: Object.keys(days).filter(function (k) { return days[k] && days[k].done; }).length, since: d.startDate || null };
  }
  // Check a pasted code. Returns { ok, data, summary } or { ok: false, msg } in plain language.
  function parseDataCode(text) {
    var t = String(text || '').replace(/\s+/g, '');
    if (!t) return { ok: false, msg: 'Paste the code first.' };
    var at = t.toUpperCase().indexOf(DATA_PREFIX); // iPhone may lower-case the start when pasting
    if (at < 0) return { ok: false, msg: 'That isn\'t an OMGym data code. It starts with OMGYM1:' };
    var d;
    try { d = JSON.parse(b64dec(t.slice(at + DATA_PREFIX.length).replace(/[^A-Za-z0-9+/=]/g, ''))); } catch (e) { return { ok: false, msg: 'The code is incomplete or damaged. Copy it again and paste the whole thing.' }; }
    var pf = d && d.profile;
    if (!d || typeof d !== 'object' || d.v !== 1 || !pf || typeof pf !== 'object') return { ok: false, msg: 'That code has no OMGym plan in it.' };
    if (!(pf.weightKg > 0) || !(pf.heightCm > 0) || !(pf.age > 0)) return { ok: false, msg: 'That code is missing the profile details (age, height, weight).' };
    if (d.weights != null && !Array.isArray(d.weights)) return { ok: false, msg: 'That code\'s weigh-ins are damaged.' };
    return { ok: true, data: d, summary: dataSummary(d) };
  }

  return {
    ymd: ymd, parseYmd: parseYmd, dayNum: dayNum, addDays: addDays, weekday: weekday,
    navyBodyFat: navyBodyFat, calcTargets: calcTargets, buildWorkout: buildWorkout, sessionFor: sessionFor,
    candidates: candidates, EX: EX, ING: ING, PRICES: PRICES, MEALS: MEALS, SLOTS: SLOTS, TOPUP: TOPUP,
    BUDGETS: BUDGETS, LIKEABLE: LIKEABLE, budgetTier: budgetTier, cuisineOf: cuisineOf, ingName: ingName, weekCostByTier: weekCostByTier, mealCtx: mealCtx,
    priceTable: priceTable, planDay: planDay, shoppingList: shoppingList, excludedTags: excludedTags,
    trend: trend, suggestAdjust: suggestAdjust, CHANGES: CHANGES, changeKey: changeKey, unseenChanges: unseenChanges, exportCode: exportCode, parseDataCode: parseDataCode, dataSummary: dataSummary, PRO_PHASES: PRO_PHASES, weeklyVolume: weeklyVolume, PRO: PRO, PRO_METHODS: PRO_METHODS, addMonths: addMonths, newProId: newProId, proJmd: proJmd, invoiceNo: invoiceNo, proProofText: proProofText, parseProof: parseProof, proCanon: proCanon, proLink: proLink, parseProLink: parseProLink, proVerify: proVerify, proSign: proSign, proStatus: proStatus, graceAllowed: graceAllowed, nextPeriod: nextPeriod, compactDate: compact, proPayMethods: proPayMethods, expandDate: expand, niceDay: niceDay, PRO_FIELDS: PRO_FIELDS,
    STORE: STORE, PRODUCTS: PRODUCTS, productById: productById, variantOf: variantOf, cartKey: cartKey, parseKey: parseKey, normalizeCart: normalizeCart, amazonLink: amazonLink, itemTitle: itemTitle, orderId: orderId, orderUrl: orderUrl, parseOrder: parseOrder, orderSummary: orderSummary, waSafe: waSafe, PRODUCT_PRICES_NOTE: PRODUCT_PRICES_NOTE, PRICE_CONF: PRICE_CONF, priceCheck: priceCheck, landed: landed, productView: productView, orderText: orderText, slotOptions: slotOptions, LOSS_RATE: LOSS_RATE
  };
})();
if (typeof module !== 'undefined') module.exports = OM;
