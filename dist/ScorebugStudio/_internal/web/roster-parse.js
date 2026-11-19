/* Roster PDF parsing: turns positioned text items (from pdf.js) into {num, name, pos} rows.
 * Pure functions so they can be tested without a browser.
 *
 * Input: pages = [ [ {str, x, y, w}, ... ], ... ]   (PDF coordinates: y grows upward)
 * Heuristic, not magic: it looks for lines that contain a jersey number and a name. The caller shows a
 * review screen so mistakes can be fixed before anything is saved.
 */
(function (root) {
  'use strict';

  var POS = /^(PG|SG|SF|PF|C|G|F|GF|FC|G\/F|F\/G|F\/C|C\/F|G-F|F-G|F-C|C-F|G\/C|GUARD|FORWARD|CENTER|CENTRE|FWD|GRD|CTR|WING|POINT|SHOOTING|SMALL|POWER|QB|RB|WR|TE|OL|DL|LB|DB|CB|FS|SS|FB|HB|DE|DT|OT|OG|NT|ILB|OLB|ATH|QUARTERBACK|RECEIVER|P|RHP|LHP|1B|2B|3B|LF|CF|RF|DH|OF|IF|INF|UT|PITCHER|CATCHER|INFIELD|OUTFIELD|GK|DF|MF|CF|K|KEEPER|GOALKEEPER|DEFENDER|MIDFIELDER|STRIKER|FORWARD|OH|MB|RS|OPP|DS|L|S|RH|LH|SETTER|LIBERO|OUTSIDE|MIDDLE|HITTER)$/i;
  var GRADE = /^(FR|SO|JR|SR|FRESHMAN|SOPHOMORE|JUNIOR|SENIOR|FR\.|SO\.|JR\.|SR\.|8TH|9TH|10TH|11TH|12TH|GR|GR\.|YR|CL|CLASS|GRADE|HT|HT\.|WT|WT\.|LBS|LB|LBS\.|IN|IN\.|NO|NO\.|NUM|NUMBER|JERSEY|NAME|POS|POS\.|POSITION|HEIGHT|WEIGHT|HOMETOWN|PLAYER|PLAYERS|ROSTER|TEAM|BASKETBALL|FOOTBALL|SOCCER|BASEBALL|SOFTBALL|VOLLEYBALL|VARSITY|JV|COACH|COACHES|HEAD|ASSISTANT|MANAGER|MANAGERS|STAFF|SCHOOL|HIGH|BOYS|GIRLS|MALE|FEMALE|SCHEDULE|PAGE|OF|PRINT|PRINTED|GENERATED|SEASON|PHOTO)$/i;
  var STOPLINE = /(\bpage\s*\d+|\b\d+\s*(of|\/)\s*\d+\s*$|copyright|https?:|www\.|\.com\b|\b20\d\d[-–]\d\d\b|\b(19|20)\d\d\b.*\b(season|roster)\b|phone|email|@)/i;
  var SUFFIX = /^(JR\.?|SR\.?|II|III|IV|V)$/i;
  var NAMETOK = /^[A-Za-zÀ-ɏ][A-Za-zÀ-ɏ'’.\-]*,?$/;
  var NUMTOK = /^#?(\d{1,2})\.?$/;
  var HEADNUM = /^(#|no\.?|num\.?|number|jersey|jrsy)$/i;

  function titleCase(s) {
    var letters = s.replace(/[^A-Za-z]/g, '');
    if (!letters || (letters !== letters.toUpperCase() && letters !== letters.toLowerCase())) return s; // already mixed case
    return s.toLowerCase().replace(/(^|[\s\-'’])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); })
      .replace(/\bMc([a-z])/g, function (m, c) { return 'Mc' + c.toUpperCase(); })
      .replace(/\b(Ii|Iii|Iv)\b/g, function (m) { return m.toUpperCase(); });
  }

  /** group items into text lines (top to bottom, left to right), splitting multi-word items into word tokens */
  function toLines(items) {
    var toks = [];
    items.forEach(function (it) {
      var s = String(it.str == null ? '' : it.str);
      if (!s.trim()) return;
      var w = it.w || s.length * 5, x = it.x || 0;
      var re = /\S+/g, m;
      while ((m = re.exec(s))) {
        toks.push({ s: m[0], x: x + (m.index / s.length) * w, y: it.y || 0 });
      }
    });
    toks.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var lines = [];
    toks.forEach(function (t) {
      var ln = lines.length ? lines[lines.length - 1] : null;
      if (ln && Math.abs(ln.y - t.y) <= 3.2) { ln.toks.push(t); }
      else lines.push({ y: t.y, toks: [t] });
    });
    lines.forEach(function (l) { l.toks.sort(function (a, b) { return a.x - b.x; }); });
    return lines;
  }

  function nameFromTokens(toks) {
    // longest... actually first reasonable run of name-like tokens that are not positions/grades/headers
    var runs = [], cur = [];
    toks.forEach(function (t) {
      var clean = t.s.replace(/,$/, '');
      var ok = NAMETOK.test(t.s) && !POS.test(clean) && !(GRADE.test(clean) && !SUFFIX.test(clean));
      if (ok) cur.push(t.s);
      else { if (cur.length) runs.push(cur); cur = []; }
    });
    if (cur.length) runs.push(cur);
    if (!runs.length) return '';
    // prefer the first run with at least two words; otherwise the first run
    var run = null;
    for (var i = 0; i < runs.length; i++) if (runs[i].length >= 2) { run = runs[i]; break; }
    if (!run) run = runs[0];
    var flip = /,$/.test(run[0]);
    if (run.length > 3) {
      var take = 2;
      if (run[2] && (SUFFIX.test(run[2]) || /^[A-Za-z]\.?$/.test(run[2]))) take = 3;
      if (flip && run[take] && SUFFIX.test(run[take])) take++;
      run = run.slice(0, take);
    }
    var name = run.join(' ');
    if (flip) {
      var parts = name.split(',');
      var last = parts[0].trim(), first = parts.slice(1).join(',').trim();
      name = (first + ' ' + last).trim();
    }
    return titleCase(name.replace(/,/g, '').replace(/\s+/g, ' ').trim());
  }

  function parseItems(pages) {
    var players = [], warnings = [], headerX = null, seenHeader = false;
    pages.forEach(function (items) {
      var lines = toLines(items);
      lines.forEach(function (ln) {
        var text = ln.toks.map(function (t) { return t.s; }).join(' ');
        // header row: remember where the number column is
        var hd = ln.toks.filter(function (t) { return HEADNUM.test(t.s); });
        var hasWord = ln.toks.some(function (t) { return /^(name|player|pos\.?|position)$/i.test(t.s); });
        if (hd.length && hasWord) { headerX = hd[0].x; seenHeader = true; return; }
        if (STOPLINE.test(text)) return;

        var cands = [];
        ln.toks.forEach(function (t) { var m = NUMTOK.exec(t.s); if (m) cands.push({ n: m[1], x: t.x, tok: t }); });
        if (!cands.length) return;

        var pick = cands[0];
        if (headerX != null) {
          var best = cands.slice().sort(function (a, b) { return Math.abs(a.x - headerX) - Math.abs(b.x - headerX); })[0];
          if (Math.abs(best.x - headerX) < 45) pick = best;
        } else if (cands.length === 1 && ln.toks[0] !== cands[0].tok && ln.toks[ln.toks.length - 1] === cands[0].tok) {
          pick = cands[0]; // "Name ... 23"
        }
        var rest = ln.toks.filter(function (t) { return t !== pick.tok; });
        var name = nameFromTokens(rest);
        if (!name || name.replace(/[^A-Za-z]/g, '').length < 2) return;

        var pos = '';
        rest.forEach(function (t) { var c = t.s.replace(/,$/, ''); if (!pos && POS.test(c)) pos = c.toUpperCase(); });
        players.push({ num: String(pick.n).replace(/^0+(?=\d)/, ''), name: name, pos: pos, raw: text });
      });
    });

    // de-duplicate identical rows (repeated headers across pages)
    var seen = {}, out = [];
    players.forEach(function (p) {
      var k = p.num + '|' + p.name.toLowerCase();
      if (!seen[k]) { seen[k] = 1; out.push(p); }
    });
    var nums = {};
    out.forEach(function (p) { nums[p.num] = (nums[p.num] || 0) + 1; });
    out.forEach(function (p) { if (nums[p.num] > 1) p.dup = true; });
    if (!out.length) warnings.push('No players found. If the PDF is a scan or picture of a roster, text cannot be read from it - add players by hand.');
    if (out.some(function (p) { return p.dup; })) warnings.push('Some jersey numbers appear more than once - check them.');
    return { players: out, warnings: warnings, header: seenHeader };
  }

  var api = { parseItems: parseItems, toLines: toLines, titleCase: titleCase };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RosterParse = api;
})(typeof window !== 'undefined' ? window : this);
