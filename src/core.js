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

  function calcTargets(p, kcalAdj) {
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
    var floor = male ? 1500 : 1200;
    var kcal, plannedRate = 0, floorApplied = false, deficit = 0;

    if (goalType === 'lose') {
      var r = LOSS_RATE[p.pace] || LOSS_RATE.standard;
      deficit = w * r * 7700 / 7;
      deficit = Math.min(deficit, 1000, tdee * 0.25);
      kcal = tdee - deficit;
      if (kcal < floor) { kcal = floor; floorApplied = true; }
    } else if (goalType === 'gain') {
      var g = GAIN_RATE[p.experience] || GAIN_RATE.beginner;
      var surplus = Math.max(150, Math.min(450, w * g * 7700 / 7));
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
    var ppk = goalType === 'lose' ? 2.0 : goalType === 'gain' ? 1.8 : 1.6;
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
      goalType: goalType, goalKg: goal, kcal: kcal, protein: protein, fat: fat, carbs: carbs,
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

  function repsFor(e, exp) {
    if (e.kind === 't') return e.id === 'deadbug' || e.id === 'birddog' ? '8 / side' : '30–40 s';
    if (e.kind === 'm') return '30–40 m';
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

  function buildWorkout(dateStr, p, startDate, caution) {
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
    var exp = p.experience || 'beginner';
    var tpl = SESS[s.key];
    var phase = phaseFor(s.week);
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
      items.push({ ex: e, sets: sets, reps: repsFor(e, exp), rest: restFor(e, exp), rir: phase.rir });
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
      var fit = { ex: fe, sets: phase.deload ? 2 : (fe.kind === 'c' ? 3 : (fe.kind === 'a' ? 3 : 2)), reps: repsFor(fe, exp), rest: style === 'cardio' ? 30 : restFor(fe, exp), rir: phase.rir, circuit: style === 'cardio' };
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
    return { rest: false, key: s.key, title: tpl.name, week: s.week + 1, phase: phase, minutes: minutes, blocks: blocks, caution: !!caution };
  }

  /* ---------- foods ---------- */
  // per 100 g edible portion: kcal, protein, carbs, fat; y = edible yield from purchased weight; tags for diet filters
  var ING = {
    rice: { name: 'Rice, white (uncooked)', k: 365, p: 7.1, c: 80, f: 0.7, y: 1, grp: 'Starches', cup: 185 },
    oats: { name: 'Rolled oats', k: 379, p: 13.2, c: 67.7, f: 6.5, y: 1, grp: 'Starches', cup: 80 },
    cornmeal: { name: 'Cornmeal', k: 366, p: 7.5, c: 78, f: 2, y: 1, grp: 'Starches', cup: 150 },
    flour: { name: 'Flour (for dumplings)', k: 364, p: 10.3, c: 76, f: 1, y: 1, grp: 'Starches', cup: 125, tags: ['gluten'] },
    bread: { name: 'Hardo bread, sliced', k: 266, p: 8.9, c: 49, f: 3.3, y: 1, grp: 'Starches', slice: 40, tags: ['gluten'] },
    sweetpot: { name: 'Sweet potato', k: 86, p: 1.6, c: 20, f: 0.1, y: 0.85, grp: 'Ground provisions' },
    yam: { name: 'Yellow yam', k: 118, p: 1.5, c: 28, f: 0.2, y: 0.85, grp: 'Ground provisions' },
    gbanana: { name: 'Green banana', k: 89, p: 1.1, c: 23, f: 0.3, y: 0.65, grp: 'Ground provisions' },
    ipotato: { name: 'Irish potato', k: 77, p: 2, c: 17, f: 0.1, y: 0.9, grp: 'Ground provisions' },
    redpeas: { name: 'Red peas (dry kidney beans)', short: 'red peas', k: 333, p: 24, c: 60, f: 0.8, y: 1, grp: 'Proteins', cup: 185 },
    broadbeans: { name: 'Broad beans (tin)', short: 'broad beans', k: 71, p: 5.5, c: 12.4, f: 0.2, y: 1, grp: 'Proteins' },
    chicken: { name: 'Chicken (bone-in, skin off)', short: 'chicken', k: 121, p: 21, c: 0, f: 4, y: 0.6, grp: 'Proteins', tags: ['meat'] },
    egg: { name: 'Eggs', short: 'egg', k: 143, p: 12.6, c: 0.7, f: 9.5, y: 1, grp: 'Proteins', each: 50, tags: ['egg'] },
    mackerel: { name: 'Mackerel in tomato sauce (tin)', short: 'mackerel', k: 158, p: 14.5, c: 2, f: 10, y: 1, grp: 'Proteins', tags: ['fish'] },
    sardines: { name: 'Sardines in oil (tin)', short: 'sardines', k: 208, p: 24.6, c: 0, f: 11.5, y: 1, grp: 'Proteins', tags: ['fish'] },
    tuna: { name: 'Tuna (tin)', short: 'tuna', k: 116, p: 25.5, c: 0, f: 0.8, y: 1, grp: 'Proteins', tags: ['fish'] },
    pb: { name: 'Peanut butter', k: 588, p: 25, c: 20, f: 50, y: 1, grp: 'Pantry', tbsp: 16, tags: ['peanut'] },
    oil: { name: 'Vegetable oil', k: 884, p: 0, c: 0, f: 100, y: 1, grp: 'Pantry', tbsp: 13.6 },
    milk: { name: 'Milk, whole', k: 61, p: 3.2, c: 4.8, f: 3.3, y: 1, grp: 'Pantry', cup: 244, tags: ['dairy'] },
    callaloo: { name: 'Callaloo', k: 23, p: 2.5, c: 4, f: 0.3, y: 0.7, grp: 'Vegetables & fruit' },
    cabbage: { name: 'Cabbage', k: 25, p: 1.3, c: 5.8, f: 0.1, y: 0.9, grp: 'Vegetables & fruit' },
    carrot: { name: 'Carrot', k: 41, p: 0.9, c: 9.6, f: 0.2, y: 0.9, grp: 'Vegetables & fruit' },
    tomato: { name: 'Tomato', k: 18, p: 0.9, c: 3.9, f: 0.2, y: 1, grp: 'Vegetables & fruit' },
    onion: { name: 'Onion', k: 40, p: 1.1, c: 9.3, f: 0.1, y: 0.9, grp: 'Vegetables & fruit' },
    scallion: { name: 'Escallion', k: 32, p: 1.8, c: 7.3, f: 0.2, y: 0.9, grp: 'Vegetables & fruit' },
    pumpkin: { name: 'Pumpkin', k: 26, p: 1, c: 6.5, f: 0.1, y: 0.75, grp: 'Vegetables & fruit' },
    rbanana: { name: 'Ripe banana', k: 89, p: 1.1, c: 23, f: 0.3, y: 0.65, grp: 'Vegetables & fruit', each: 100 }
  };

  // price records: u = how it is sold, g = grams in that unit, pr = price, loose = sold by weight, src, date, conf
  var PRICES = {
    JM: {
      currency: 'JMD', symbol: 'J$', decimals: 0, label: 'Jamaica',
      items: {
        rice: { u: '1 kg bulk', g: 1000, pr: 180, loose: true, src: 'Consumer Affairs Commission grocery survey (J$157–200/kg)', date: 'Jul 2026', conf: 'survey' },
        oats: { u: '800 g bag', g: 800, pr: 662, src: 'Loshusan Supermarket online (Foska)', date: 'Oct 2026', conf: 'retail' },
        cornmeal: { u: '400 g bag', g: 400, pr: 169, src: 'Loshusan Supermarket online (Foska)', date: 'Oct 2026', conf: 'retail' },
        flour: { u: '1 kg bag', g: 1000, pr: 340, src: 'CAC survey, JF Mills counter flour (J$322–350)', date: 'Jul 2026', conf: 'survey' },
        bread: { u: '2 lb loaf', g: 907, pr: 560, src: 'CAC survey, National hardo loaf (same price at all 9 outlets)', date: 'Jul 2026', conf: 'survey' },
        sweetpot: { u: 'per lb', g: 454, pr: 450, loose: true, src: 'Jamaica Observer Market Bag, Mandeville Market', date: '16 Oct 2026', conf: 'market' },
        yam: { u: 'per lb', g: 454, pr: 500, loose: true, src: 'Jamaica Observer Market Bag, Coronation Market', date: 'Aug 2026', conf: 'market' },
        gbanana: { u: 'per hand (~1.4 kg)', g: 1400, pr: 400, src: 'Jamaica Observer Market Bag, Spanish Town Market (hand weight is our estimate)', date: 'Jul 2026', conf: 'market' },
        ipotato: { u: 'per lb', g: 454, pr: 300, loose: true, src: 'Jamaica Observer Market Bag, Mandeville Market', date: '16 Oct 2026', conf: 'market' },
        redpeas: { u: 'per lb', g: 454, pr: 650, loose: true, src: 'Estimate from online grocers (J$250–882/lb); check your shop', date: 'Oct 2026', conf: 'estimate' },
        broadbeans: { u: '400 g tin', g: 400, pr: 290, src: 'CAC survey, Lasco broad beans (J$267–314)', date: 'Jul 2026', conf: 'survey' },
        chicken: { u: 'per kg (whole, frozen)', g: 1000, pr: 950, loose: true, src: 'CAC survey, Grade A whole chicken (J$849–1,033/kg)', date: 'Jul 2026', conf: 'survey' },
        egg: { u: 'dozen', g: 600, pr: 900, src: 'Cost-of-living trackers (J$617–854) plus 2026 inflation', date: 'Oct 2026', conf: 'estimate' },
        mackerel: { u: '155 g tin', g: 155, pr: 135, src: 'CAC survey, Grace mackerel (J$120–144)', date: 'Jul 2026', conf: 'survey' },
        sardines: { u: '106 g tin', g: 106, pr: 225, src: 'CAC survey, Grace sardines (J$211–242)', date: 'Jul 2026', conf: 'survey' },
        tuna: { u: '142 g tin', g: 142, pr: 200, src: 'CAC survey, Brunswick tuna (J$197–205)', date: 'Jul 2026', conf: 'survey' },
        pb: { u: '40 oz jar (1.13 kg)', g: 1134, pr: 1273, src: 'Loshusan Supermarket online (Members Select)', date: 'Oct 2026', conf: 'retail' },
        oil: { u: '500 ml bottle', g: 460, pr: 455, src: 'CAC survey, Lider vegetable oil (J$431–477)', date: 'Jul 2026', conf: 'survey' },
        milk: { u: '1 L carton', g: 1030, pr: 700, src: 'Traveller price guide', date: 'Mar 2026', conf: 'estimate' },
        callaloo: { u: 'per kg', g: 1000, pr: 640, loose: true, src: 'MyVoice crop price tracker (retail)', date: '13 Oct 2026', conf: 'market' },
        cabbage: { u: 'per kg', g: 1000, pr: 1380, loose: true, src: 'MyVoice crop price tracker (green, local)', date: '13 Oct 2026', conf: 'market' },
        carrot: { u: 'per lb', g: 454, pr: 500, loose: true, src: 'Jamaica Observer Market Bag, Mandeville Market', date: '16 Oct 2026', conf: 'market' },
        tomato: { u: 'per lb', g: 454, pr: 500, loose: true, src: 'Jamaica Observer Market Bag, Mandeville Market', date: '16 Oct 2026', conf: 'market' },
        onion: { u: 'per lb', g: 454, pr: 300, loose: true, src: 'Jamaica Observer Market Bag, Mandeville Market', date: '16 Oct 2026', conf: 'market' },
        scallion: { u: 'per lb', g: 454, pr: 400, loose: true, src: 'Jamaica Observer Market Bag, Mandeville Market', date: '16 Oct 2026', conf: 'market' },
        pumpkin: { u: 'per lb', g: 454, pr: 400, loose: true, src: 'Jamaica Observer Market Bag, Coronation Market', date: 'Aug 2026', conf: 'market' },
        rbanana: { u: 'dozen (~1.4 kg)', g: 1400, pr: 1000, src: 'Jamaica Observer Market Bag, Coronation Market', date: 'Aug 2026', conf: 'market' }
      }
    },
    US: {
      currency: 'USD', symbol: '$', decimals: 2, label: 'United States',
      items: {
        rice: { u: 'per lb', g: 454, pr: 1.12, loose: true, src: 'BLS average price, long-grain white rice', date: 'Sep 2026', conf: 'survey' },
        oats: { u: '18 oz canister', g: 510, pr: 3.49, src: 'Typical store-brand price', date: 'Oct 2026', conf: 'estimate' },
        cornmeal: { u: '2 lb bag', g: 907, pr: 2.99, src: 'Typical store-brand price', date: 'Oct 2026', conf: 'estimate' },
        flour: { u: 'per lb', g: 454, pr: 0.55, loose: true, src: 'BLS average price, all-purpose flour', date: 'Sep 2026', conf: 'survey' },
        bread: { u: '1 lb loaf', g: 454, pr: 1.83, src: 'BLS average price, white pan bread', date: 'Sep 2026', conf: 'survey' },
        sweetpot: { u: 'per lb', g: 454, pr: 1.49, loose: true, src: 'Typical supermarket price', date: 'Oct 2026', conf: 'estimate' },
        yam: { u: 'per lb', g: 454, pr: 2.49, loose: true, src: 'Typical Caribbean grocer price', date: 'Oct 2026', conf: 'estimate' },
        gbanana: { u: 'per lb', g: 454, pr: 0.66, loose: true, src: 'BLS average price, bananas', date: 'Sep 2026', conf: 'survey' },
        ipotato: { u: 'per lb', g: 454, pr: 0.99, loose: true, src: 'BLS average price, white potatoes', date: 'Sep 2026', conf: 'survey' },
        redpeas: { u: 'per lb', g: 454, pr: 1.70, loose: true, src: 'BLS average price, dried beans', date: 'Feb 2026', conf: 'survey' },
        broadbeans: { u: '15 oz can', g: 425, pr: 1.29, src: 'Typical store price, canned fava beans', date: 'Oct 2026', conf: 'estimate' },
        chicken: { u: 'per lb (legs)', g: 454, pr: 1.74, loose: true, src: 'BLS average price, chicken legs', date: 'Sep 2026', conf: 'survey' },
        egg: { u: 'dozen', g: 600, pr: 2.27, src: 'BLS average price, Grade A large eggs', date: 'Sep 2026', conf: 'survey' },
        mackerel: { u: '15 oz can', g: 425, pr: 3.49, src: 'Typical store price, jack mackerel', date: 'Oct 2026', conf: 'estimate' },
        sardines: { u: '3.75 oz can', g: 106, pr: 1.79, src: 'Typical store price', date: 'Oct 2026', conf: 'estimate' },
        tuna: { u: '5 oz can', g: 142, pr: 1.39, src: 'Typical store-brand price', date: 'Oct 2026', conf: 'estimate' },
        pb: { u: '16 oz jar', g: 454, pr: 2.89, src: 'Typical store-brand price', date: 'Oct 2026', conf: 'estimate' },
        oil: { u: '48 oz bottle', g: 1360, pr: 4.99, src: 'Typical store-brand price', date: 'Oct 2026', conf: 'estimate' },
        milk: { u: 'gallon', g: 3900, pr: 4.11, src: 'BLS average price, whole milk', date: 'Sep 2026', conf: 'survey' },
        callaloo: { u: '10 oz bag spinach or callaloo', g: 284, pr: 2.49, src: 'Typical supermarket price', date: 'Oct 2026', conf: 'estimate' },
        cabbage: { u: 'per lb', g: 454, pr: 0.89, loose: true, src: 'Typical supermarket price', date: 'Oct 2026', conf: 'estimate' },
        carrot: { u: 'per lb', g: 454, pr: 1.19, loose: true, src: 'Typical supermarket price', date: 'Oct 2026', conf: 'estimate' },
        tomato: { u: 'per lb', g: 454, pr: 1.99, loose: true, src: 'BLS average price, field-grown tomatoes', date: 'Sep 2026', conf: 'survey' },
        onion: { u: 'per lb', g: 454, pr: 1.29, loose: true, src: 'Typical supermarket price', date: 'Oct 2026', conf: 'estimate' },
        scallion: { u: 'bunch (~100 g)', g: 100, pr: 0.99, src: 'Typical supermarket price', date: 'Oct 2026', conf: 'estimate' },
        pumpkin: { u: 'per lb (squash)', g: 454, pr: 1.49, loose: true, src: 'Typical supermarket price', date: 'Oct 2026', conf: 'estimate' },
        rbanana: { u: 'per lb', g: 454, pr: 0.66, loose: true, src: 'BLS average price, bananas', date: 'Sep 2026', conf: 'survey' }
      }
    }
  };

  /* ---------- meal templates ---------- */
  // pr: protein options (preference/cost picks), cb: carb options, fx: fixed [id, grams, optional]
  var MEALS = [
    { id: 'b_oats', slot: 'b', name: 'Oats porridge with peanut butter & banana, eggs on the side', pr: ['egg'], cb: ['oats'], fx: [['milk', 150, 1], ['pb', 15, 1], ['rbanana', 80, 1]], how: 'Simmer oats in the milk plus a little water for 5 min with a pinch of cinnamon and nutmeg. Top with sliced banana and peanut butter. Boil the eggs 9 min.' },
    { id: 'b_callaloo', slot: 'b', name: 'Steamed callaloo & scrambled eggs with hardo bread', pr: ['egg', 'sardines'], cb: ['bread', 'sweetpot'], fx: [['callaloo', 120], ['onion', 30], ['tomato', 50], ['oil', 5]], how: 'Sauté onion and tomato in the oil, add chopped callaloo with a splash of water, cover 6–8 min. Scramble the eggs (or flake the sardines) into the pan. Serve with bread or boiled sweet potato.' },
    { id: 'b_mackerel', slot: 'b', name: 'Mackerel & tomato stew with boiled green banana', pr: ['mackerel', 'sardines'], cb: ['gbanana', 'yam', 'ipotato'], fx: [['onion', 30], ['tomato', 60], ['scallion', 10], ['oil', 5]], how: 'Peel and boil green banana 15–20 min. Sauté onion, escallion and tomato, add the fish with its sauce, add thyme and black pepper, simmer 5 min.' },
    { id: 'b_cornmeal', slot: 'b', name: 'Cornmeal porridge with boiled eggs', pr: ['egg'], cb: ['cornmeal'], fx: [['milk', 200, 1]], how: 'Whisk cornmeal into cold water, then bring to a boil while stirring. Add the milk, nutmeg and vanilla, simmer 10 min. Use less sweetener than usual.' },
    { id: 'b_sardine', slot: 'b', name: 'Sardines & tomato on hardo bread', pr: ['sardines', 'tuna', 'egg'], cb: ['bread', 'sweetpot'], fx: [['tomato', 80], ['onion', 20]], how: 'Mash the fish with diced tomato, onion, lime and pepper. Pile onto toasted bread.' },
    { id: 'm_broadbean', slot: 'ld', plant: true, name: 'Broad bean & pumpkin stew with rice', names: { redpeas: 'Red peas & pumpkin stew with rice' }, pr: ['broadbeans', 'redpeas'], cb: ['rice', 'yam', 'ipotato'], fx: [['pumpkin', 120], ['tomato', 50], ['onion', 30], ['scallion', 10], ['oil', 6]], how: 'Sauté onion, escallion, garlic and thyme in the oil, add tomato and diced pumpkin with a cup of water, simmer 12 min. Add the drained beans for 5 min. Serve over rice or boiled provisions.' },
    { id: 'b_pboats', slot: 'b', plant: true, name: 'Peanut butter oats with banana (plant-based)', pr: ['pb'], cb: ['oats', 'cornmeal'], fx: [['rbanana', 80]], how: 'Cook the oats (or cornmeal) in water with cinnamon and a pinch of salt. Stir in peanut butter and top with sliced banana.' },
    { id: 'b_peascallaloo', slot: 'b', plant: true, name: 'Stewed peas & callaloo with boiled green banana', pr: ['redpeas'], cb: ['gbanana', 'sweetpot', 'bread'], fx: [['callaloo', 100], ['onion', 25], ['oil', 5]], how: 'Use red peas cooked ahead in a batch. Warm them with sautéed onion and callaloo, thyme and black pepper. Boil the green banana 15–20 min.' },
    { id: 'm_stewchicken', slot: 'ld', name: 'Stew chicken, rice & peas, steamed cabbage', pr: ['chicken'], cb: ['rice'], fx: [['redpeas', 25], ['cabbage', 120], ['carrot', 40], ['onion', 30], ['scallion', 10], ['tomato', 40], ['oil', 8]], how: 'Season chicken with onion, escallion, thyme, garlic and browning; brown in the oil and stew 30 min. Boil the peas until soft, then cook the rice in the peas water. Steam cabbage and carrot 5 min.' },
    { id: 'm_curry', slot: 'ld', name: 'Curry chicken with boiled food', pr: ['chicken'], cb: ['yam', 'gbanana', 'ipotato', 'sweetpot'], fx: [['carrot', 40], ['onion', 30], ['scallion', 10], ['oil', 8]], how: 'Season chicken with curry powder, onion and escallion. Burn the curry in the oil 1 min, add chicken, then water to half-cover; simmer 35 min. Boil the provisions 20 min.' },
    { id: 'm_brownfish', slot: 'ld', name: 'Brown-stew mackerel, rice & callaloo', pr: ['mackerel', 'sardines', 'tuna'], cb: ['rice', 'ipotato'], fx: [['callaloo', 120], ['onion', 30], ['tomato', 50], ['oil', 5]], how: 'Cook the rice. Sauté onion and tomato, add the fish and a splash of water, simmer 5 min. Steam callaloo separately.' },
    { id: 'm_peasstew', slot: 'ld', name: 'Stew peas with {p}, spinners & pumpkin', names: { redpeas: 'Stew peas with spinners & pumpkin' }, pr: ['chicken', 'redpeas'], cb: ['flour', 'rice'], fx: [['redpeas', 40], ['pumpkin', 120], ['carrot', 40], ['onion', 30], ['scallion', 10], ['oil', 5]], hows: { redpeas: 'Soak peas overnight, boil 60 min until soft. Add pumpkin, carrot, onion, escallion and thyme. Knead flour and water into small spinners and drop them in for the last 15 min.' }, how: 'Soak peas overnight, boil 60 min until soft. Add the seasoned chicken for the last 30 min with pumpkin, carrot, onion, escallion and thyme. Knead flour and water into small spinners and drop them in for the last 15 min.' },
    { id: 'm_pumpkinrice', slot: 'ld', name: 'Chicken & pumpkin rice with callaloo', pr: ['chicken'], cb: ['rice'], fx: [['pumpkin', 120], ['callaloo', 60], ['onion', 30], ['oil', 8]], how: 'Brown seasoned chicken pieces in the oil. Add rice, diced pumpkin, onion and water (2 cups per cup of rice), cover and cook 25 min. Stir in callaloo for the last 5 min.' },
    { id: 'm_friedrice', slot: 'ld', name: 'Fried rice with {p} & vegetables', pr: ['chicken', 'egg'], cb: ['rice'], fx: [['cabbage', 80], ['carrot', 50], ['scallion', 15], ['oil', 10]], hows: { egg: 'Use rice cooked earlier and cooled. Scramble the eggs and set aside. Stir-fry carrot, cabbage and escallion, add rice and eggs, season with soy sauce and pepper.' }, how: 'Use rice cooked earlier and cooled. Cook the diced chicken and set aside. Stir-fry carrot, cabbage and escallion, add rice and eggs, season with soy sauce and pepper.' },
    { id: 'm_tunasalad', slot: 'ld', name: 'Tuna & potato salad with cabbage slaw', pr: ['tuna', 'sardines', 'egg'], cb: ['ipotato', 'sweetpot'], fx: [['cabbage', 100], ['carrot', 50], ['onion', 20], ['oil', 10]], how: 'Boil diced potato 12 min and cool. Mix with the fish, onion, lime juice, oil, salt and pepper. Shred cabbage and carrot for the slaw.' },
    { id: 'm_steamchicken', slot: 'ld', name: 'Steamed chicken & cabbage with sweet potato', pr: ['chicken'], cb: ['sweetpot', 'yam'], fx: [['cabbage', 150], ['carrot', 50], ['onion', 30], ['tomato', 40], ['oil', 6]], how: 'Season chicken and cook covered with onion, tomato and a little water 30 min. Add cabbage and carrot for the last 8 min. Boil or roast the sweet potato.' },
    { id: 'm_peasrice', slot: 'ld', plant: true, name: 'Red peas & rice with steamed callaloo', pr: ['redpeas'], cb: ['rice'], fx: [['callaloo', 120], ['onion', 30], ['oil', 6]], how: 'Boil the soaked peas until soft, cook rice in the peas water with escallion and thyme. Steam callaloo with onion.' },
    { id: 's_pbbread', slot: 's', name: 'Peanut butter on hardo bread', pr: ['pb'], cb: ['bread'], fx: [], how: 'Thin spread of peanut butter on bread.' },
    { id: 's_banegg', slot: 's', name: 'Ripe banana & boiled eggs', pr: ['egg'], cb: ['rbanana'], fx: [], how: 'Boil eggs ahead and keep them in the fridge for quick snacks.' },
    { id: 's_tunabread', slot: 's', name: 'Tuna or sardine sandwich', pr: ['tuna', 'sardines'], cb: ['bread'], fx: [['tomato', 40]], how: 'Mash the fish with lime and pepper, add sliced tomato.' },
    { id: 's_pbbanana', slot: 's', name: 'Banana with peanut butter', pr: ['pb'], cb: ['rbanana'], fx: [], how: 'Slice the banana and dip in peanut butter.' },
    { id: 's_peasdip', slot: 's', plant: true, name: 'Red peas dip with hardo bread or sweet potato', pr: ['redpeas'], cb: ['bread', 'sweetpot'], fx: [['oil', 5]], how: 'Blend cooked red peas with garlic, lime, the oil, salt and scotch bonnet to taste. Keeps 4 days in the fridge.' },
    { id: 's_porridge', slot: 's', name: 'Small bowl of oats with milk', pr: ['milk'], cb: ['oats'], fx: [], how: 'Cook oats in milk 5 min; add cinnamon.' }
  ];
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
      var it = { u: b.u, g: b.g, pr: b.pr, loose: !!b.loose, src: b.src, date: b.date, conf: b.conf };
      if (region === 'OTHER') { it.conf = 'placeholder'; it.src = 'US price used as a placeholder. Tap to enter your local price.'; }
      var c = custom && custom[id];
      if (c && typeof c.pr === 'number') { it.pr = c.pr; it.conf = 'yours'; it.src = 'Your price'; it.date = c.date || ''; }
      items[id] = it;
    });
    return { region: region, meta: meta, items: items };
  }
  function costPerGram(pt, id) { var it = pt.items[id]; return it.pr / it.g / ING[id].y; } // per edible gram

  function solveMeal(tpl, protId, carbId, kT, pT, ex) {
    var fixed = [];
    tpl.fx.forEach(function (f) { if (allowedIng(f[0], ex) && f[0] !== protId && f[0] !== carbId) fixed.push({ id: f[0], g: f[1] }); });
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
    var pMax = protId === 'pb' ? 40 : protId === 'redpeas' ? 150 : protId === 'egg' ? 200 : protId === 'milk' ? 350 : 260;
    var pMin = protId === 'egg' ? 50 : protId === 'pb' ? 10 : 30;
    var weak = (c / a) < 2 * (d / b); // protein item barely more protein-dense than the starch
    if (weak) { xp = 0.4 * K / a; }
    else if (Math.abs(det) > 1e-6) { xp = (K * d - b * Q) / det; } else { xp = pMax; }
    if (!isFinite(xp)) xp = pMax;
    var lean = P.p / P.k >= 0.09; // chicken, tinned fish
    xp = Math.min(xp, (lean ? 0.85 : 0.65) * K / a); // protein food never crowds out the whole plate
    xp = Math.max(pMin, Math.min(pMax, xp));
    if (protId === 'egg') { xp = Math.max(50, Math.round(xp / 50) * 50); if (a * xp > 0.7 * K && xp > 50) xp -= 50; }
    xc = (K - a * xp) / b;
    var cMax = carbId === 'bread' ? 160 : carbId === 'rbanana' ? 240 : (C.k > 300 ? 160 : 450);
    var cMin = carbId === 'bread' ? 40 : 15;
    xc = Math.max(cMin, Math.min(cMax, xc));
    if (carbId === 'bread') xc = Math.round(xc / 20) * 20;
    else xc = Math.round(xc / 5) * 5;
    if (protId !== 'egg') xp = Math.round(xp / 5) * 5;
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

  function slotOptions(slotKey, ex) {
    var s = slotKey === 'l' || slotKey === 'd' ? 'ld' : slotKey;
    var plantOk = ex.indexOf('meat') >= 0 || ex.indexOf('egg') >= 0;
    return MEALS.filter(function (m) {
      if (m.slot !== s) return false;
      if (m.plant && !plantOk) return false;
      if (!m.pr.some(function (id) { return allowedIng(id, ex); })) return false;
      if (!m.cb.some(function (id) { return allowedIng(id, ex); })) return false;
      return m.fx.every(function (f) { return f[2] || allowedIng(f[0], ex); });
    });
  }

  function planDay(dateStr, p, T, pt, swaps) {
    var ex = excludedTags(p);
    var dn = dayNum(dateStr);
    var sw = (swaps && swaps[dateStr]) || {};
    var meals = [];
    var usedIds = {};
    SLOTS.forEach(function (slot, si) {
      var opts = slotOptions(slot.key, ex);
      if (!opts.length) { meals.push({ slot: slot, empty: true }); return; }
      var base = hash(dn * 7 + si * 131 + (slot.key === 'd' ? 3 : 0)) % opts.length;
      var k = (base + (sw[slot.key] || 0)) % opts.length;
      var tries = 0;
      while (usedIds[opts[k].id] && tries < opts.length) { k = (k + 1) % opts.length; tries++; }
      var tpl = opts[k]; usedIds[tpl.id] = 1;
      // cheapest allowed protein per gram of protein
      var prots = tpl.pr.filter(function (id) { return allowedIng(id, ex); }).sort(function (a, b) { return costPerGram(pt, a) / ING[a].p - costPerGram(pt, b) / ING[b].p; });
      // rotate among options within 1.6x the cheapest cost per gram of protein
      var cheapest = costPerGram(pt, prots[0]) / ING[prots[0]].p;
      var near = prots.filter(function (id) { return costPerGram(pt, id) / ING[id].p <= cheapest * 1.6; });
      var protId = near[hash(dn * 3 + si) % near.length];
      // carb: rotate among the two cheapest per kcal
      var carbs = tpl.cb.filter(function (id) { return allowedIng(id, ex); }).sort(function (a, b) { return costPerGram(pt, a) / ING[a].k - costPerGram(pt, b) / ING[b].k; });
      var carbId = carbs[hash(dn + si) % Math.min(2, carbs.length)];
      var kT = T.kcal * slot.share, pT = T.protein * slot.pshare;
      var items = solveMeal(tpl, protId, carbId, kT, pT, ex);
      var tot = mealTotals(items, pt);
      meals.push({ slot: slot, tpl: tpl, items: items, tot: tot, options: opts.length, protId: protId, carbId: carbId, kT: kT, pT: pT, name: (tpl.names && tpl.names[protId]) || tpl.name.replace('{p}', ING[protId].short || ING[protId].name.toLowerCase()), how: (tpl.hows && tpl.hows[protId]) || tpl.how });
    });
    // second pass: if the day is short on protein, lean harder on the lean-protein meals
    var pSum = meals.reduce(function (a, m) { return a + (m.tot ? m.tot.p : 0); }, 0);
    var short = T.protein - pSum;
    if (short > 0.05 * T.protein) {
      var leanMeals = meals.filter(function (m) { return m.tot && ING[m.protId].p / ING[m.protId].k >= 0.09; });
      leanMeals.forEach(function (m) {
        var items2 = solveMeal(m.tpl, m.protId, m.carbId, m.kT, m.pT + short / leanMeals.length, ex);
        var tot2 = mealTotals(items2, pt);
        if (tot2.p > m.tot.p) { m.items = items2; m.tot = tot2; }
      });
    }
    var day = { k: 0, p: 0, c: 0, f: 0, cost: 0 };
    meals.forEach(function (m) { if (m.tot) ['k', 'p', 'c', 'f', 'cost'].forEach(function (x) { day[x] += m.tot[x]; }); });
    return { date: dateStr, meals: meals, tot: day };
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
      if (it.loose) {
        var lb = g / 453.6;
        var lbR = Math.max(0.25, Math.ceil(lb * 4) / 4);
        qty = lbR; cost = lbR * 453.6 * it.pr / it.g;
        qtyText = lbR.toFixed(2).replace(/\.?0+$/, '') + ' lb (' + Math.round(lbR * 0.4536 * 100) / 100 + ' kg)';
      } else {
        qty = Math.max(1, Math.ceil(g / it.g - 0.05));
        cost = qty * it.pr; qtyText = qty + ' × ' + it.u;
      }
      total += cost;
      return { id: id, name: ING[id].name, grp: ING[id].grp, needG: g, qty: qty, qtyText: qtyText, cost: cost, price: it };
    });
    var order = ['Proteins', 'Starches', 'Ground provisions', 'Vegetables & fruit', 'Pantry'];
    rows.sort(function (a, b) { return order.indexOf(a.grp) - order.indexOf(b.grp) || b.cost - a.cost; });
    var eaten = days.reduce(function (a, d) { return a + d.tot.cost; }, 0);
    return { rows: rows, total: total, eatenCost: eaten, days: days };
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

  return {
    ymd: ymd, parseYmd: parseYmd, dayNum: dayNum, addDays: addDays, weekday: weekday,
    navyBodyFat: navyBodyFat, calcTargets: calcTargets, buildWorkout: buildWorkout, sessionFor: sessionFor,
    candidates: candidates, EX: EX, ING: ING, PRICES: PRICES, MEALS: MEALS, SLOTS: SLOTS,
    priceTable: priceTable, planDay: planDay, shoppingList: shoppingList, excludedTags: excludedTags,
    trend: trend, suggestAdjust: suggestAdjust, slotOptions: slotOptions, LOSS_RATE: LOSS_RATE
  };
})();
if (typeof module !== 'undefined') module.exports = OM;
