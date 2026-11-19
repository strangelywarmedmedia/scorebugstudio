/* Stat Keeper app (all sports). Sport-specific rules, buttons and tables live in stats-engine.js. */
(function () {
'use strict';
var E = StatEngine, RP = RosterParse;
var $ = function (s, r) { return (r || document).querySelector(s); };
var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
var LS = 'scorebug_stats_v1';
var DB, G, C = null, tab = 'live', curSide = 'home', selPid = null, lastSync = null;
var sb = null, sbConnected = false, sbOff = 0, ws = null, wsTimer = null;
var serverOK = null, pushTimer = null, lastRemote = 0, dirtyPush = false;
var ICON = { basketball: '🏀', football: '🏈', baseball: '⚾', volleyball: '🏐', soccer: '⚽' };
var D = function () { return E.sportDef(G); };
var byNum = function (a, b) { return (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0); };

/* ============================================================ storage */
function blankDB() { return { version: 2, updatedAt: 0, currentId: null, games: {}, rosters: {}, prefs: {} }; }
function loadLocal() { try { var d = JSON.parse(localStorage.getItem(LS)); if (d && d.games) return d; } catch (e) { } return null; }
function persist() {
  DB.updatedAt = Date.now();
  try { localStorage.setItem(LS, JSON.stringify(DB)); } catch (e) { }
  dirtyPush = true;
  clearTimeout(pushTimer); pushTimer = setTimeout(pushServer, 400);
  setSaveChip();
}
function touch() { G.updatedAt = Date.now(); persist(); }
function setSaveChip() {
  var chip = $('#saveChip'), t = $('#saveTxt');
  if (dirtyPush) { chip.className = 'chip'; t.textContent = 'saving…'; }
  else if (serverOK) { chip.className = 'chip ok'; t.textContent = 'saved to computer'; }
  else { chip.className = 'chip warn'; t.textContent = 'saved on this device only'; }
}
function pushServer(keep) {
  var body = JSON.stringify(DB);
  fetch('/api/store/sk_main', { method: 'PUT', body: body, headers: { 'Content-Type': 'application/json' }, keepalive: !!keep && body.length < 60000 })
    .then(function (r) { serverOK = r.ok; if (r.ok) { dirtyPush = false; lastRemote = Date.now(); } setSaveChip(); })
    .catch(function () { serverOK = false; setSaveChip(); });
}
function mergeDB(remote) {
  var changed = false;
  ['games', 'rosters'].forEach(function (k) {
    Object.keys(remote[k] || {}).forEach(function (id) {
      var r = remote[k][id], l = DB[k][id];
      if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) { DB[k][id] = r; changed = true; }
    });
  });
  if ((remote.updatedAt || 0) > (DB.updatedAt || 0)) {
    if (remote.currentId && DB.games[remote.currentId] && !DB.games[remote.currentId].deleted) DB.currentId = remote.currentId;
    DB.prefs = Object.assign({}, remote.prefs || {}, DB.prefs);
    changed = true;
  }
  return changed;
}
function normGame(g) {
  if (!g || g.deleted) return;
  g.sport = E.SPORTS[g.sport] ? g.sport : 'basketball';
  g.settings = Object.assign(E.defaultSettings(g.sport), g.settings || {});
  g.half = g.half || 'top';
  g.period = g.period || 1;
  g.local = g.local || { ms: g.settings.periodMin * 60000, running: false, anchor: 0 };
}
function pullServer(first) {
  return fetch('/api/store/sk_main', { cache: 'no-store' }).then(function (r) {
    if (!r.ok) { serverOK = (r.status === 404); if (r.status === 404 && first) pushServer(); setSaveChip(); return; }
    serverOK = true;
    return r.json().then(function (remote) {
      var before = G && G.updatedAt;
      var changed = mergeDB(remote);
      Object.keys(DB.games).forEach(function (id) { normGame(DB.games[id]); });
      try { localStorage.setItem(LS, JSON.stringify(DB)); } catch (e) { }
      if (!DB.games[DB.currentId] || DB.games[DB.currentId].deleted) ensureGame();
      if (changed) { G = DB.games[DB.currentId]; if (first || (G && G.updatedAt !== before)) resync(); }
      setSaveChip();
    });
  }).catch(function () { serverOK = false; setSaveChip(); });
}
function pollServer() {
  if (dirtyPush || document.hidden) return;
  fetch('/api/store', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (l) {
    serverOK = true;
    var m = l.sk_main || 0;
    if (m && m > lastRemote + 1500) { lastRemote = m; pullServer(false); }
  }).catch(function () { serverOK = false; setSaveChip(); });
}

/* per-sport remembered options (period length, assist prompt...). Older single-sport saves count as basketball. */
var PREF_KEYS = ['periods', 'periodMin', 'otMin', 'assistPrompt', 'keepSelected', 'syncScorebug', 'useScorebugClock'];
function prefsFor(sport) {
  var p = DB.prefs || {}, base = {};
  if (sport === 'basketball') PREF_KEYS.forEach(function (k) { if (p[k] !== undefined) base[k] = p[k]; });
  return Object.assign(base, (p.bySport || {})[sport] || {});
}
function setPref(k, v) {
  DB.prefs = DB.prefs || {}; DB.prefs.bySport = DB.prefs.bySport || {};
  var sp = G.sport || 'basketball';
  DB.prefs.bySport[sp] = DB.prefs.bySport[sp] || {};
  DB.prefs.bySport[sp][k] = v;
}
function freshGame(sport, teams) {
  return E.newGame({ sport: sport, teams: teams, settings: prefsFor(sport) });
}

function ensureGame() {
  var ids = Object.keys(DB.games).filter(function (id) { return !DB.games[id].deleted; });
  if (!DB.currentId || !DB.games[DB.currentId] || DB.games[DB.currentId].deleted) {
    if (ids.length) {
      ids.sort(function (a, b) { return DB.games[b].updatedAt - DB.games[a].updatedAt; });
      DB.currentId = ids[0];
    } else {
      var g = freshGame((DB.prefs && DB.prefs.lastSport) || 'basketball');
      DB.games[g.id] = g; DB.currentId = g.id;
    }
  }
  G = DB.games[DB.currentId];
  normGame(G);
  if (G.sport === 'baseball') curSide = E.battingSide(G);
}

/* ============================================================ clock & period */
function sbOK() { return sbConnected && sb && sb.sport === G.sport; }
function sbUse() { return sbOK() && G.settings.useScorebugClock; }
function sbPeriod() {
  if (G.sport === 'baseball') return { period: sb.game && sb.game.inning, half: sb.game && sb.game.half };
  return { period: sb.period };
}
/** time REMAINING in the period according to the scorebug clock (soccer: converts the count-up match clock; may go below 0 in stoppage time) */
function sbRem() {
  var c = sb.clock, cur = c.running ? c.ms + c.dir * (Date.now() + sbOff - c.anchor) : c.ms;
  if (G.sport === 'soccer') {
    if (c.dir > 0) {
      var p = sb.period, half = c.periodMs, ot = c.otMs || half;
      var base = p <= 2 ? (p - 1) * half : 2 * half + (p - 3) * ot, len = p <= 2 ? half : ot;
      return len - (cur - base);
    }
    return cur;
  }
  return Math.max(0, cur);
}
function clockInfo() {
  if (sbUse() && sb.clock) {
    var sp = sbPeriod();
    return { period: sp.period || G.period, half: sp.half || G.half, ms: D().clock ? sbRem() : 0, running: D().clock && sb.clock.running, src: 'sb' };
  }
  var L = G.local, ms = L.running ? L.ms - (Date.now() - L.anchor) : L.ms;
  if (!D().over) ms = Math.max(0, ms);
  return { period: G.period, half: G.half, ms: ms, running: L.running, src: 'local' };
}
function sbSend(o) { if (ws && ws.readyState === 1) { ws.send(JSON.stringify(o)); return true; } return false; }
function clockToggle() {
  if (!D().clock) return;
  if (sbUse()) return sbSend({ type: 'action', name: 'clock_toggle', args: {} });
  var L = G.local, ci = clockInfo();
  if (L.running) { L.ms = ci.ms; L.running = false; }
  else { if (L.ms <= 0 && !D().over) return; L.anchor = Date.now(); L.running = true; }
  touch(); renderBar();
}
/** ms = time remaining in the period (what the engine uses) */
function setClockRem(ms) {
  if (!D().over) ms = Math.max(0, ms);
  if (sbUse()) {
    var send = ms;
    if (G.sport === 'soccer' && sb.clock.dir > 0) { // scorebug counts up through the match
      var p = sb.period, half = sb.clock.periodMs, ot = sb.clock.otMs || half;
      var base = p <= 2 ? (p - 1) * half : 2 * half + (p - 3) * ot, len = p <= 2 ? half : ot;
      send = base + (len - ms);
    }
    return sbSend({ type: 'action', name: 'clock_set', args: { ms: Math.max(0, send) } });
  }
  G.local.ms = ms; G.local.anchor = Date.now(); touch(); refreshAll();
}
function stepHalf(d) { // baseball: next / previous half-inning
  var inn = G.period, h = G.half;
  if (d > 0) { if (h === 'top') h = 'bot'; else { h = 'top'; inn++; } }
  else { if (h === 'bot') h = 'top'; else { if (inn <= 1) return; h = 'bot'; inn--; } }
  if (sbUse()) {
    if (d > 0) sbSend({ type: 'action', name: 'next_half', args: {} });
    else { sbSend({ type: 'set', path: 'game.inning', value: inn }); sbSend({ type: 'set', path: 'game.half', value: h }); }
    return; // the scorebug state that comes back updates this screen
  }
  G.period = inn; G.half = h; curSide = E.battingSide(G); selPid = null;
  touch(); rebase(); pushDeltas(); refreshAll();
}
function changePeriod(d) {
  if (G.sport === 'baseball') return stepHalf(d);
  if (sbUse()) {
    var name = d > 0 ? (G.sport === 'volleyball' ? 'end_set' : 'period_next') : (G.sport === 'volleyball' ? 'undo_set' : 'period_prev');
    sbSend({ type: 'action', name: name, args: {} }); return;
  }
  var np = Math.max(1, G.period + d);
  if (np === G.period) return;
  G.period = np; G.local.running = false; G.local.ms = E.periodLenSec(G, np) * 1000; G.local.anchor = Date.now();
  touch(); rebase(); pushDeltas(); refreshAll();
}
function parseClock(s) {
  s = String(s).trim();
  var m = /^(\d+):(\d{1,2})(?:\.(\d))?$/.exec(s);
  if (m) return (parseInt(m[1], 10) * 60 + parseInt(m[2], 10)) * 1000 + (m[3] ? parseInt(m[3], 10) * 100 : 0);
  m = /^(\d+)(?:\.(\d))?$/.exec(s);
  if (m) return (parseInt(m[1], 10) * 1000 + (m[2] ? parseInt(m[2], 10) * 100 : 0)); // bare number = seconds
  return null;
}

/* ============================================================ scorebug connection */
function connectWS() {
  var port = (window.SCOREBUG && window.SCOREBUG.wsPort) || 8765;
  try { ws = new WebSocket('ws://' + location.hostname + ':' + port); } catch (e) { return retryWS(); }
  ws.onopen = function () { sbConnected = true; ws.send(JSON.stringify({ type: 'hello' })); renderChip(); };
  ws.onmessage = function (ev) {
    var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.type !== 'state') return;
    var firstState = !sb;
    sb = m.state; if (typeof m.t === 'number') sbOff = m.t - Date.now();
    onSbState(firstState);
  };
  ws.onclose = function () { sbConnected = false; sb = null; renderChip(); renderBar(); retryWS(); };
  ws.onerror = function () { try { ws.close(); } catch (e) { } };
}
function retryWS() { clearTimeout(wsTimer); wsTimer = setTimeout(connectWS, 2000); }
function onSbState(first) {
  var changed = false, periodMoved = false;
  if (sbUse()) {
    var sp = sbPeriod();
    if (sp.period && sp.period !== G.period) { G.period = sp.period; changed = periodMoved = true; }
    if (G.sport === 'baseball' && sp.half && sp.half !== G.half) { G.half = sp.half; changed = periodMoved = true; }
    if (periodMoved && G.sport === 'baseball') { curSide = E.battingSide(G); selPid = null; }
    if (D().clock && sb.clock) {
      var pm = sb.clock.periodMs ? sb.clock.periodMs / 60000 : 0;
      if (pm && Math.abs(pm - G.settings.periodMin) > 0.001) { G.settings.periodMin = pm; changed = true; }
      var om = sb.clock.otMs ? sb.clock.otMs / 60000 : 0;
      if (G.sport === 'soccer' && om && Math.abs(om - G.settings.otMin) > 0.001) { G.settings.otMin = om; changed = true; }
    }
  }
  if (changed) { touch(); if (periodMoved) rebase(); pushDeltas(); refreshAll(); } else { renderBar(); renderChip(); if (tab === 'game') renderGameLive(); }
}
function renderChip() {
  var c = $('#sbChip'), t = $('#sbTxt');
  if (!sbConnected) { c.className = 'chip'; t.textContent = 'Scorebug: not connected'; }
  else if (sb && sb.sport !== G.sport) { c.className = 'chip warn'; t.textContent = 'Scorebug is set to ' + sb.sport + ' — tap to switch'; }
  else { c.className = 'chip ok'; t.textContent = 'Scorebug: connected'; }
  var sc = $('#sportChip'); if (sc && G) sc.innerHTML = (ICON[G.sport] || '') + ' ' + esc(D().name);
}

/* push score / team-foul / card CHANGES to the scorebug (increments, so manual fixes made on the scorebug are preserved) */
function metrics() {
  var ci = clockInfo(), comp = E.compute(G, E.elapsed(G, ci.period, ci.ms)), v = {}, reset = {};
  ['home', 'away'].forEach(function (side) {
    v['teams.' + side + '.score'] = comp.cur[side];
    if (G.sport === 'volleyball') reset['teams.' + side + '.score'] = 1;
    if (G.sport === 'basketball') { var p = 'teams.' + side + '.fouls'; v[p] = E.fouls(G, comp, side, ci.period); reset[p] = 1; }
    if (G.sport === 'soccer') {
      v['game.cards.' + side + '.yellow'] = comp.sides[side].totals.yc;
      v['game.cards.' + side + '.red'] = comp.sides[side].totals.rc;
    }
  });
  return { v: v, reset: reset };
}
/** the scorebug resets these itself when the period / set changes, so don't send a correction for them */
function rebase() {
  if (!lastSync) return;
  var m = metrics();
  Object.keys(m.reset).forEach(function (p) { lastSync.v[p] = m.v[p]; });
}
function pushDeltas() {
  var m = metrics();
  if (lastSync && sbOK() && G.settings.syncScorebug) {
    Object.keys(m.v).forEach(function (p) {
      var d = m.v[p] - (lastSync.v[p] || 0);
      if (d) sbSend({ type: 'inc', path: p, delta: d, min: 0 });
    });
  }
  lastSync = m;
}
function syncNow() {
  var m = metrics();
  Object.keys(m.v).forEach(function (p) { sbSend({ type: 'set', path: p, value: m.v[p] }); });
  lastSync = m;
}

/* ============================================================ recording */
function onCourt(side) { return C.onCourt[side]; }
function ctx() { var ci = clockInfo(); return { period: ci.period, clockMs: D().clock ? ci.ms : null, half: ci.half }; }
function toast(msg, undo) {
  var t = $('#toast');
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button class="sm" data-act="undo">Undo</button>' : '');
  t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { t.hidden = true; }, 3500);
}
function commit(evs, msg) {
  E.addEvents(G, evs);
  persist(); pushDeltas(); refreshAll();
  if (G.sport === 'baseball' && E.outsNow(G, C) >= 3) msg = (msg ? msg + ' · ' : '') + '3 outs — tap ▶ for the next half-inning';
  if (msg) toast(msg, true);
}
function mk(side, pid, type, extra) { return E.makeEvent(G, side, pid, type, ctx(), extra); }
function afterRecord() { if (!G.settings.keepSelected) selPid = null; refreshAll(); }

function act(i) {
  var def = D(), b = def.buttons[i]; if (!b) return;
  if (b.t === 'sub') { if (!selPid) return toast('Pick a player first'); return openSub(); }
  if (b.flow === 'pch') return openPitcherChange();
  if (!selPid) { $('#hint') && ($('#hint').textContent = 'Tap a player first'); toast('Pick a player first'); return; }
  var side = curSide, pid = selPid, type = b.t;
  if (b.flow === 'pass') return openPass();
  if (b.flow === 'yards') return openYards(b);
  if (b.flow === 'rbi') return openRbi(b);
  if (b.flow === 'hr') return openHr(b);
  var finish = function (assistPid) {
    var evs, grp = assistPid ? E.uid() : null, extra = {};
    if (grp) extra.grp = grp;
    if (b.extra) Object.keys(b.extra).forEach(function (k) { extra[k] = b.extra[k]; });
    evs = [mk(side, pid, type, Object.keys(extra).length ? extra : null)];
    if (assistPid) evs.push(mk(side, assistPid, 'ast', { grp: grp }));
    commit(evs, E.describe(G, evs[0]) + (assistPid ? ' (ast ' + E.playerLabel(G, side, assistPid) + ')' : ''));
    afterRecord();
  };
  if ((def.assistFor || []).indexOf(type) >= 0 && G.settings.assistPrompt && pid !== E.TEAM) {
    var pool = def.lineup ? onCourt(side) : G.teams[side].players.map(function (p) { return p.id; });
    var mates = pool.filter(function (p) { return p !== pid; });
    if (mates.length) {
      var h = '<h3>Assist?</h3><div class="pick">' + mates.map(function (p) {
        var pl = E.findPlayer(G, side, p);
        return '<button data-act="assist" data-v="' + p + '"><span class="n">' + esc(pl.num) + '</span><span class="t">' + esc(pl.name) + '</span></button>';
      }).join('') + '<button data-act="assist" data-v="">No assist</button></div>';
      openModal(h);
      modalHandlers.assist = function (v) { closeModal(); finish(v || null); };
      return;
    }
  }
  finish(null);
}

/* football: a completed pass credits the passer and the receiver together */
var passSt = null;
function parseYds(v) { var n = parseInt(String(v).replace(/[^0-9\-]/g, ''), 10); return isNaN(n) ? 0 : n; }
function openPass() {
  var side = curSide, qb = selPid;
  if (qb === E.TEAM) return toast('Pick the passer first');
  passSt = { side: side, qb: qb, rcv: null };
  var mates = G.teams[side].players.filter(function (p) { return p.id !== qb; }).sort(byNum);
  openModal('<h3>Pass complete — ' + esc(E.playerLabel(G, side, qb)) + '</h3><label class="f">Caught by</label><div class="pick" id="rcvPick">' +
    mates.map(function (p) { return '<button data-act="rcv" data-v="' + p.id + '"><span class="n">' + esc(p.num) + '</span><span class="t">' + esc(p.name) + '</span></button>'; }).join('') +
    '<button data-act="rcv" data-v="' + E.TEAM + '">Not listed</button></div>' +
    '<div class="cols" style="margin-top:12px"><div><label class="f">Yards</label><div class="row" style="flex-wrap:nowrap"><input id="ydsIn" type="text" inputmode="numeric" autocomplete="off" placeholder="0"><button data-act="yneg" style="flex:none">+/−</button></div></div>' +
    '<div style="display:flex;align-items:flex-end"><label class="row" style="gap:8px;min-height:40px"><input type="checkbox" id="tdIn"> Touchdown</label></div></div>' +
    '<div class="row" style="margin-top:12px"><button class="good fill" data-act="passsave">Save pass</button><button data-act="close">Cancel</button></div>');
  var i = $('#ydsIn'); if (i && !('ontouchstart' in window)) i.focus();
}
function savePass() {
  if (!passSt.rcv) return toast('Tap who caught it');
  var yds = parseYds($('#ydsIn').value), td = $('#tdIn').checked, grp = E.uid(), s = passSt;
  closeModal();
  var evs = [mk(s.side, s.qb, td ? 'ptd' : 'pcmp', { yds: yds, grp: grp }), mk(s.side, s.rcv, td ? 'rectd' : 'rec', { yds: yds, grp: grp })];
  commit(evs, (td ? 'TD pass ' : 'Pass ') + E.playerLabel(G, s.side, s.qb) + ' to ' + E.playerLabel(G, s.side, s.rcv) + ' (' + yds + ' yds)');
  afterRecord();
}
var ydSt = null;
function openYards(b) {
  ydSt = { side: curSide, pid: selPid, b: b };
  openModal('<h3>' + esc(b.label) + ' — ' + esc(E.playerLabel(G, curSide, selPid)) + '</h3><label class="f">Yards</label>' +
    '<div class="row" style="flex-wrap:nowrap"><input id="ydsIn" type="text" inputmode="numeric" autocomplete="off" placeholder="0"><button data-act="yneg" style="flex:none">+/−</button></div>' +
    (b.td ? '<label class="row" style="gap:8px;min-height:44px;margin-top:8px"><input type="checkbox" id="tdIn"> Touchdown</label>' : '') +
    '<div class="row" style="margin-top:12px"><button class="good fill" data-act="yardsave">Save</button><button data-act="close">Cancel</button></div>');
  var i = $('#ydsIn'); if (i && !('ontouchstart' in window)) i.focus();
}
function saveYards() {
  var s = ydSt, yds = parseYds($('#ydsIn').value), td = s.b.td && $('#tdIn') && $('#tdIn').checked;
  closeModal();
  var e = mk(s.side, s.pid, td ? s.b.td : s.b.t, { yds: yds });
  commit([e], E.describe(G, e)); afterRecord();
}
/* baseball: hits ask how many runners drove in; a home run also scores the batter */
var rbiSt = null;
function openRbi(b) {
  rbiSt = { side: curSide, pid: selPid, b: b };
  openModal('<h3>' + esc(b.label) + ' — ' + esc(E.playerLabel(G, curSide, selPid)) + '</h3><label class="f">RBI on the play</label><div class="pick">' +
    [0, 1, 2, 3, 4].map(function (n) { return '<button data-act="rbi" data-v="' + n + '"><span class="n">' + n + '</span></button>'; }).join('') + '</div>' +
    '<div style="margin-top:12px"><button data-act="close">Cancel</button></div>');
}
function openHr(b) {
  rbiSt = { side: curSide, pid: selPid, b: b };
  openModal('<h3>Home run — ' + esc(E.playerLabel(G, curSide, selPid)) + '</h3><label class="f">Runners who scored besides the batter</label><div class="pick">' +
    [0, 1, 2, 3].map(function (n) { return '<button data-act="hrrbi" data-v="' + n + '"><span class="n">' + n + '</span></button>'; }).join('') + '</div>' +
    '<p class="muted small">The batter gets the run and the RBI automatically. Tap RUN on each runner who scored.</p><div style="margin-top:8px"><button data-act="close">Cancel</button></div>');
}
function saveRbi(n, hr) {
  var s = rbiSt; closeModal();
  var evs, grp = hr ? E.uid() : null;
  var e = mk(s.side, s.pid, s.b.t, { rbi: hr ? n + 1 : n, grp: grp || undefined });
  if (!grp) delete e.grp;
  evs = [e];
  if (hr) evs.push(mk(s.side, s.pid, 'run', { grp: grp }));
  commit(evs, E.describe(G, e)); afterRecord();
}
function openPitcherChange() {
  var side = curSide, cur = C.pitcher[side];
  var list = G.teams[side].players.filter(function (p) { return p.id !== cur; }).sort(byNum);
  if (!list.length) return toast('Add players to ' + G.teams[side].name + ' first');
  openModal('<h3>New pitcher for ' + esc(G.teams[side].name) + '</h3><div class="pick">' + list.map(function (p) {
    return '<button data-act="pchpick" data-v="' + p.id + '"><span class="n">' + esc(p.num) + '</span><span class="t">' + esc(p.name) + '</span></button>';
  }).join('') + '</div><div style="margin-top:12px"><button data-act="close">Cancel</button></div>');
}
function outTag(l) { return G.sport === 'basketball' ? (l && l.pf >= 5 ? ' <span class="err">OUT</span>' : '') : (l && l.rc ? ' <span class="err">RED</span>' : ''); }
function openSub() {
  var side = curSide, on = onCourt(side), isOn = on.indexOf(selPid) >= 0;
  var list, title, word = G.sport === 'soccer' ? 'field' : 'court';
  if (selPid === E.TEAM) return toast('Pick a player to substitute');
  if (isOn) {
    list = G.teams[side].players.filter(function (p) { return on.indexOf(p.id) < 0; });
    title = 'Sub IN for ' + E.playerLabel(G, side, selPid);
  } else {
    list = on.map(function (id) { return E.findPlayer(G, side, id); }).filter(Boolean);
    title = E.playerLabel(G, side, selPid) + ' comes IN — who comes out?';
  }
  if (!list.length) return toast(isOn ? 'No one on the bench' : 'No one on the ' + word);
  list.sort(byNum);
  openModal('<h3>' + esc(title) + '</h3><div class="pick">' + list.map(function (pl) {
    var l = C.sides[side].players[pl.id];
    return '<button data-act="dosub" data-v="' + pl.id + '"><span class="n">' + esc(pl.num) + '</span><span class="t">' + esc(pl.name) + outTag(l) + '</span></button>';
  }).join('') + '</div><div style="margin-top:12px"><button data-act="close">Cancel</button></div>');
  modalHandlers.dosub = function (v) {
    closeModal();
    var inn = isOn ? v : selPid, out = isOn ? selPid : v;
    var e = mk(side, inn, 'sub', { out: out });
    selPid = null;
    commit([e], 'Sub: ' + E.playerLabel(G, side, inn) + ' in for ' + E.playerLabel(G, side, out));
  };
}
function resync() { refreshAll(); lastSync = metrics(); }
function undoLast() {
  var r = E.undo(G);
  if (!r.length) return toast('Nothing to undo');
  persist(); pushDeltas(); refreshAll();
  toast('Undid: ' + E.describe(G, r[0]));
}
function openAddPlayer(side) {
  side = side || curSide;
  var h = '<h3>Add player — ' + esc(G.teams[side].name) + '</h3><label class="f">Jersey number</label>' +
    '<input id="apNum" class="num-in" type="text" inputmode="numeric" maxlength="3" autocomplete="off">' +
    '<div class="pad">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button data-act="padkey" data-v="' + n + '">' + n + '</button>'; }).join('') +
    '<button data-act="padkey" data-v="C">⌫</button><button data-act="padkey" data-v="0">0</button><button data-act="padkey" data-v="00">00</button></div>' +
    '<label class="f">Name (optional)</label><input id="apName" type="text" autocomplete="off">' +
    '<div class="row" style="margin-top:12px"><button class="good fill" data-act="addplayer" data-v="' + side + '">Add player</button><button data-act="close">Cancel</button></div>';
  openModal(h);
  var inp = $('#apNum'); if (inp && !('ontouchstart' in window)) inp.focus();
}
function addPlayer(side) {
  var num = ($('#apNum').value || '').trim(), name = ($('#apName').value || '').trim();
  if (!num) return toast('Enter a number');
  var ex = G.teams[side].players.filter(function (p) { return p.num === num; })[0];
  closeModal();
  if (ex) { curSide = side; selPid = ex.id; toast('#' + num + ' is already on the roster — selected'); return refreshAll(); }
  var p = { id: E.uid(), num: num, name: name, pos: '' };
  G.teams[side].players.push(p);
  curSide = side; selPid = p.id;
  if (D().lineup && onCourt(side).length < D().lineup) { E.addEvents(G, [mk(side, p.id, 'sub', { out: null })]); }
  touch(); pushDeltas(); refreshAll();
  toast('Added #' + num + (D().lineup && onCourt(side).indexOf(p.id) >= 0 ? ' (' + (G.sport === 'soccer' ? 'on the field' : 'on court') + ')' : ''));
}

/* ============================================================ modal */
var modalHandlers = {};
function openModal(html) { var m = $('#modal'); m.innerHTML = '<div class="box">' + html + '</div>'; m.hidden = false; modalHandlers = {}; }
function closeModal() { $('#modal').hidden = true; $('#modal').innerHTML = ''; modalHandlers = {}; }
function askText(title, value, placeholder, cb) {
  openModal('<h3>' + esc(title) + '</h3><input id="askIn" type="text" value="' + esc(value || '') + '" placeholder="' + esc(placeholder || '') + '">' +
    '<div class="row" style="margin-top:12px"><button class="good fill" data-act="askok">OK</button><button data-act="close">Cancel</button></div>');
  modalHandlers.askok = function () { var v = $('#askIn').value; closeModal(); cb(v); };
  var i = $('#askIn'); i.focus(); i.select();
  i.addEventListener('keydown', function (e) { if (e.key === 'Enter') modalHandlers.askok(); });
}
function confirmBox(msg, okLabel, cb) {
  openModal('<h3>' + esc(msg) + '</h3><div class="row" style="margin-top:12px"><button class="warn fill" data-act="confok">' + esc(okLabel || 'OK') + '</button><button data-act="close">Cancel</button></div>');
  modalHandlers.confok = function () { closeModal(); cb(); };
}

/* ============================================================ rendering */
function refreshAll() {
  var ci = clockInfo();
  C = E.compute(G, E.elapsed(G, ci.period, ci.ms));
  renderBar(); renderChip();
  if (tab === 'live') renderLive(); else if (tab === 'box') renderBox(); else if (tab === 'pbp') renderPBP(); else if (tab === 'game') renderGame();
}
function barSub(side, ci) {
  var t = C.sides[side].totals;
  switch (G.sport) {
    case 'basketball': var f = E.fouls(G, C, side, ci.period); return 'FOULS <b>' + f + '</b>' + (E.fouls(G, C, side === 'home' ? 'away' : 'home', ci.period) >= D().bonusAt ? ' · <b>BONUS</b>' : '');
    case 'soccer': return 'YC <b>' + t.yc + '</b> · RC <b>' + t.rc + '</b>';
    case 'volleyball': return 'SETS <b>' + C.sets[side] + '</b>';
    case 'baseball': return 'H <b>' + t.h + '</b> · E <b>' + t.e + '</b>';
    case 'football': return 'YDS <b>' + (t.pyds + t.ryds) + '</b>';
  }
  return '';
}
function midLabel(ci) {
  if (G.sport === 'baseball') return (ci.half === 'bot' ? 'BOT ' : 'TOP ') + ci.period;
  if (G.sport === 'volleyball') return 'SET ' + ci.period;
  return E.periodLabel(G, ci.period);
}
function renderBar() {
  if (!C) return;
  var ci = clockInfo(), T = G.teams, def = D();
  var h = '';
  ['home', 'away'].forEach(function (side, i) {
    var t = T[side];
    var info = '<div class="info"><div class="nm">' + esc(t.name) + '</div><div class="sub">' + barSub(side, ci) + '</div></div>';
    var sc = '<div class="sc">' + C.cur[side] + '</div>';
    if (i === 1) h += '<div class="mid" id="mid"></div>';
    h += '<div class="tm ' + side + (curSide === side ? ' cur' : '') + '" data-act="side" data-v="' + side + '">' + info + sc + '</div>';
  });
  var parts = h.split('<div class="mid" id="mid"></div>');
  h = parts[0] + '<div class="mid" id="mid"></div>' + parts[1];
  var mm = '';
  if (sbOK() && sb.teams) {
    var a = sb.teams.home.score, b = sb.teams.away.score;
    if (a !== C.cur.home || b !== C.cur.away) {
      mm = '<div class="mismatch noprint">Scorebug shows ' + a + '–' + b + ', stats say ' + C.cur.home + '–' + C.cur.away +
        ' <button class="sm" data-act="syncnow">Set scorebug to stats</button></div>';
    }
  }
  $('#sbar').innerHTML = h + mm;
  var mid = '<div class="per">' + midLabel(ci) + '</div>';
  if (def.clock) {
    mid += '<div class="clk' + (ci.running ? ' run' : '') + '" id="clockTxt" data-act="clockset"></div>' +
      '<div class="ctl"><button class="sm" data-act="per" data-v="-1">◀</button><button class="sm ' + (ci.running ? 'warn' : 'good') + '" id="clkBtn" data-act="clock">' + (ci.running ? 'STOP <kbd>Space</kbd>' : 'START <kbd>Space</kbd>') + '</button><button class="sm" data-act="per" data-v="1">▶</button></div>';
  } else {
    var nxt = '▶', prv = '◀', hot = '';
    if (G.sport === 'baseball') {
      var o = E.outsNow(G, C);
      mid += '<div class="outs" id="outsTxt">' + [0, 1, 2].map(function (n) { return '<span class="od' + (n < o ? ' on' : '') + '"></span>'; }).join('') + '<small>' + Math.min(o, 3) + ' OUT</small></div>';
      hot = o >= 3 ? ' good' : '';
    } else mid += '<div class="clk sm0">' + C.cur.home + '–' + C.cur.away + '</div>';
    var nl = G.sport === 'volleyball' ? 'END SET' : 'NEXT HALF';
    mid += '<div class="ctl"><button class="sm" data-act="per" data-v="-1" title="Back">◀</button><button class="sm' + hot + '" data-act="per" data-v="1">' + nl + ' ▶</button></div>';
  }
  $('#mid').innerHTML = mid;
  tickClock();
}
function tickClock() {
  var el = $('#clockTxt'); if (!el) return;
  var ci = clockInfo(), ms = ci.ms;
  if (D().clockUp) el.textContent = E.matchClock(G, ci.period, ms);
  else {
    var tenths = ms < 60000 && ms > 0;
    el.textContent = tenths ? (Math.floor(ms / 1000) + '.' + Math.floor((ms % 1000) / 100)) : E.clockLabel(ms);
  }
  if (ci.src === 'local' && ci.running && ms <= 0 && !D().over) { G.local.ms = 0; G.local.running = false; touch(); renderBar(); }
}

function pcard(side, pl, opts) {
  var def = D(), l = C.sides[side].players[pl.id] || E.blank(G);
  var cls = 'pc' + (selPid === pl.id && curSide === side ? ' sel' : '') + (def.cardCls ? def.cardCls(l) : '');
  var tag = def.cardTag ? def.cardTag(l) : '';
  return '<button class="' + cls + '" data-act="selp" data-v="' + pl.id + '">' + (opts && opts.key ? '<kbd class="k">' + opts.key + '</kbd>' : '') +
    '<span class="pf">' + tag + '</span><span class="n">' + esc(pl.num) + '</span><span class="pn">' + esc(pl.name || ' ') + (pl.pos ? ' <span class="muted small">' + esc(pl.pos) + '</span>' : '') + '</span><span class="st">' + def.card(l) + '</span></button>';
}
function benchChip(side, pl) {
  var def = D(), l = C.sides[side].players[pl.id] || E.blank(G);
  var cls = 'pc' + (selPid === pl.id && curSide === side ? ' sel' : '') + ((def.cardCls ? def.cardCls(l) : '').indexOf('out') >= 0 ? ' out' : '');
  return '<button class="' + cls + '" data-act="selp" data-v="' + pl.id + '"><span class="n">' + esc(pl.num) + '</span><span class="pn">' + esc(pl.name) + '</span></button>';
}
function renderLive() {
  var def = D(), side = curSide, T = G.teams[side], ci = clockInfo();
  var sorted = T.players.slice().sort(byNum);
  var h = '';
  if (!G.teams.home.players.length && !G.teams.away.players.length) h += '<div class="card" style="border-color:#5b4a10"><h3 style="color:var(--accent)">Set up your game</h3><p style="margin:0 0 12px">Add your roster first: import it from a PDF, or add players by hand.' + (def.startLabel ? ' Then tick the starters.' : '') + '</p><button class="good" data-act="tab" data-v="game">Go to GAME tab</button></div>';
  h += '<div class="live"><div>';
  var batting = G.sport === 'baseball' ? E.battingSide(G) : null;
  h += '<div class="row" style="margin-bottom:10px"><div class="tabs" style="flex:1"><button style="flex:1" data-act="side" data-v="home" class="' + (side === 'home' ? 'on' : '') + '">' + esc(G.teams.home.name) + (batting === 'home' ? ' · AT BAT' : '') + '</button>' +
    '<button style="flex:1" data-act="side" data-v="away" class="' + (side === 'away' ? 'on' : '') + '">' + esc(G.teams.away.name) + (batting === 'away' ? ' · AT BAT' : '') + '</button></div></div>';
  if (G.sport === 'baseball') {
    var pid = C.pitcher[side], pp = pid && E.findPlayer(G, side, pid);
    h += '<div class="pit">Pitching for ' + esc(T.name) + ': <b>' + (pp ? esc('#' + pp.num + ' ' + pp.name) : 'nobody set') + '</b> <button class="sm" data-act="pitchchg">Change pitcher</button></div>';
  }
  if (def.lineup) {
    var on = onCourt(side), onPl = on.map(function (id) { return E.findPlayer(G, side, id); }).filter(Boolean);
    var bench = sorted.filter(function (p) { return on.indexOf(p.id) < 0; });
    var word = G.sport === 'soccer' ? 'ON THE FIELD' : 'ON COURT';
    h += '<div class="muted small" style="margin:0 0 6px">' + word + ' (' + on.length + ')</div><div class="players">';
    if (!onPl.length) h += '<div class="muted" style="grid-column:1/-1;padding:10px">No one here yet. Set starters in the GAME tab, or use + Player.</div>';
    onPl.forEach(function (p, i) { h += pcard(side, p, { key: i < 9 ? i + 1 : null }); });
    h += '</div><div class="muted small" style="margin:14px 0 6px">BENCH</div><div class="bench">';
    bench.forEach(function (p) { h += benchChip(side, p); });
  } else {
    h += '<div class="row" style="margin:0 0 8px"><span class="muted small fill">ROSTER (' + sorted.length + ')</span><input id="findNum" type="text" inputmode="numeric" placeholder="Jump to #" style="width:120px" autocomplete="off"></div><div class="players tight">';
    if (!sorted.length) h += '<div class="muted" style="grid-column:1/-1;padding:10px">No players yet. Import a roster in the GAME tab, or use + Player.</div>';
    sorted.forEach(function (p) { h += pcard(side, p); });
    h += '</div><div class="bench" style="margin-top:12px">';
  }
  h += '<button class="pc' + (selPid === E.TEAM && curSide === side ? ' sel' : '') + '" data-act="selp" data-v="' + E.TEAM + '"><span class="pn">TEAM <kbd>0</kbd></span></button>';
  h += '<button class="pc add" data-act="addp"><span class="pn">+ Player</span></button></div></div>';

  h += '<div><div class="hint" id="hint">' + (selPid ? 'Selected: <b>' + esc(E.playerLabel(G, side, selPid)) + '</b>' : 'Tap a player, then tap what happened') + '</div>';
  h += '<div class="acts">' + def.buttons.map(function (b, i) {
    return '<button class="' + (b.cls || '') + '" data-act="actb" data-v="' + i + '">' + b.label + (b.sub ? '<small>' + b.sub + '</small>' : '') + (b.key ? '<kbd>' + b.key.toUpperCase() + '</kbd>' : '') + '</button>';
  }).join('') + '<button class="warn wide" data-act="undo">UNDO <kbd>Z</kbd></button></div>';
  var recent = G.events.slice(-4).reverse();
  h += '<div class="card" style="margin-top:14px"><h3>Last plays</h3><div class="recent">' + (recent.length ? recent.map(function (e) {
    return '<div><b>' + E.stamp(G, e) + '</b> ' + esc(G.teams[e.side].abbr) + ' · ' + esc(E.describe(G, e)) + '</div>';
  }).join('') : 'Nothing yet') + '</div></div>';
  h += '</div></div>';
  $('#p-live').innerHTML = h;
}

/* ---- box score */
function boxTables(side) {
  var def = D(), st = C.sides[side], on = C.onCourt[side], rows = E.boxRows(G, C, side), out = '';
  def.tables.forEach(function (tb) {
    var cols = tb.cols;
    function cells(l, isTeam) {
      return cols.map(function (c) {
        if (isTeam && c.team === false) return '<td></td>';
        var v = c.v(l), cls = c.hi && c.hi(l) ? ' class="hi"' : '';
        return '<td' + cls + '>' + (c.bold ? '<b>' + v + '</b>' : v) + '</td>';
      }).join('');
    }
    var h = (tb.title ? '<div class="tbtitle">' + esc(tb.title) + '</div>' : '') +
      '<div class="scroll"><table class="box"><thead><tr><th class="l">#</th><th class="l">Player</th>' + cols.map(function (c) { return '<th>' + c.h + '</th>'; }).join('') + '</tr></thead><tbody>';
    var shown = 0;
    rows.forEach(function (r) {
      if (tb.show && !tb.show(r.l)) return;
      shown++;
      h += '<tr><td class="l">' + (def.lineup && on.indexOf(r.id) >= 0 ? '<span class="oc"></span>' : '') + esc(r.num) + '</td><td class="l">' + esc(r.name) + '</td>' + cells(r.l) + '</tr>';
    });
    if (!shown && tb.show) h += '<tr><td class="l muted" colspan="' + (cols.length + 2) + '">None recorded</td></tr>';
    h += '<tr class="team"><td class="l"></td><td class="l">TEAM (unassigned)</td>' + cells(st.team, true) + '</tr>';
    h += '<tr class="tot"><td class="l"></td><td class="l">TOTAL</td>' + cells(st.totals, true) + '</tr></tbody></table></div>';
    out += h;
  });
  return out;
}
function renderBox() {
  var def = D();
  var n = Math.max(G.settings.periods, C ? Math.max(C.byPeriod.home.length, C.byPeriod.away.length) : 0, clockInfo().period);
  var head = '<tr><th></th>'; for (var i = 1; i <= n; i++) head += '<th>' + E.periodLabel(G, i) + '</th>';
  var tots = G.sport === 'baseball' ? ['R', 'H', 'E'] : ['T'];
  head += tots.map(function (t) { return '<th>' + t + '</th>'; }).join('') + '</tr>';
  function lrow(side) {
    var r = '<tr><td>' + esc(G.teams[side].name) + '</td>';
    for (var i = 0; i < n; i++) r += '<td>' + (C.byPeriod[side][i] || 0) + '</td>';
    var t = C.sides[side].totals;
    var vals = G.sport === 'baseball' ? [C.score[side], t.h, t.e] : [C.score[side]];
    return r + vals.map(function (v, k) { return '<td class="' + (k === 0 ? 't' : '') + '">' + v + '</td>'; }).join('') + '</tr>';
  }
  var H = C.sides.home.totals, A = C.sides.away.totals;
  var h = '<div class="printhead"><h2>' + esc(G.teams.home.name) + ' ' + C.score.home + ' — ' + C.score.away + ' ' + esc(G.teams.away.name) + '</h2><div>' + esc(def.name) + ' · ' + esc(G.date) + '</div></div>';
  h += '<div class="card"><div class="row noprint" style="margin-bottom:10px"><button data-act="csv">Download CSV</button><button data-act="print">Print / Save as PDF</button><button data-act="json">Backup game (JSON)</button></div>';
  h += '<h3>' + (G.sport === 'volleyball' ? 'Points by set' : 'Line score') + '</h3><div class="scroll"><table class="ls"><thead>' + head + '</thead><tbody>' + lrow('home') + lrow('away') + '</tbody></table></div></div>';
  h += '<div class="card"><h3>Team comparison</h3><table class="cmp"><tbody>' + def.compare(H, A).map(function (c) {
    var hw = '', aw = '';
    if (c.hn !== c.an) { var homeBetter = c.low ? c.hn < c.an : c.hn > c.an; if (homeBetter) hw = ' class="w"'; else aw = ' class="w"'; }
    return '<tr><td' + hw + '>' + c.hv + '</td><td class="lab">' + c.label + '</td><td' + aw + '>' + c.av + '</td></tr>';
  }).join('') + '</tbody></table></div>';
  ['home', 'away'].forEach(function (side) {
    h += '<div class="card"><h3>' + esc(G.teams[side].name) + '</h3>' + boxTables(side) + '</div>';
  });
  $('#p-box').innerHTML = h;
}

var pbpFilter = 'all';
function renderPBP() {
  var def = D(), run = { home: 0, away: 0 }, rows = [], lastP = 0;
  G.events.forEach(function (e) {
    if (def.perSet && e.period !== lastP) { run = { home: 0, away: 0 }; lastP = e.period; }
    var d = E.scoreDelta(G, e); run.home += d.home; run.away += d.away;
    rows.push({ e: e, score: run.home + '–' + run.away });
  });
  rows.reverse();
  if (pbpFilter !== 'all') rows = rows.filter(function (r) { return r.e.side === pbpFilter; });
  var h = '<div class="card"><div class="row" style="margin-bottom:10px"><select id="pbpf" style="width:auto"><option value="all">Both teams</option><option value="home">' + esc(G.teams.home.name) + '</option><option value="away">' + esc(G.teams.away.name) + '</option></select>' +
    '<span class="muted small">' + G.events.length + ' events. Deleting an event updates every stat.</span></div><div class="pbp">';
  if (!rows.length) h += '<div class="muted" style="padding:10px">No plays yet.</div>';
  rows.forEach(function (r) {
    var e = r.e;
    h += '<div class="ev"><span>' + E.stamp(G, e) + '</span><span class="muted">' + r.score + '</span><span><span class="tag ' + e.side + '">' + esc(G.teams[e.side].abbr) + '</span> ' + esc(E.describe(G, e)) + '</span><button class="sm warn" data-act="delev" data-v="' + e.id + '" title="Delete">✕</button></div>';
  });
  h += '</div></div>';
  $('#p-pbp').innerHTML = h;
  $('#pbpf').value = pbpFilter;
}

/* ---- game tab */
function startMax() { return D().lineup || D().startMax || 0; }
function rosterTable(side) {
  var T = G.teams[side], def = D(), sm = startMax();
  var rows = T.players.slice().sort(byNum);
  var h = '<div class="scroll"><table class="rost"><thead><tr>' + (sm ? '<th>' + esc(def.startLabel || 'Start') + '</th>' : '') + '<th>#</th><th>Name</th><th>Pos</th><th></th></tr></thead><tbody>';
  rows.forEach(function (p) {
    h += '<tr>' + (sm ? '<td><input type="checkbox" data-f="start" data-side="' + side + '" data-id="' + p.id + '"' + (T.starters.indexOf(p.id) >= 0 ? ' checked' : '') + '></td>' : '') +
      '<td class="num"><input type="text" data-f="num" data-side="' + side + '" data-id="' + p.id + '" value="' + esc(p.num) + '"></td>' +
      '<td><input type="text" data-f="name" data-side="' + side + '" data-id="' + p.id + '" value="' + esc(p.name) + '"></td>' +
      '<td class="pos"><input type="text" data-f="pos" data-side="' + side + '" data-id="' + p.id + '" value="' + esc(p.pos) + '"></td>' +
      '<td class="del"><button class="sm warn" data-act="delp" data-side="' + side + '" data-v="' + p.id + '">✕</button></td></tr>';
  });
  if (!rows.length) h += '<tr><td colspan="5" class="muted" style="padding:10px">No players yet. Import a roster PDF or add players by hand.</td></tr>';
  return h + '</tbody></table></div>';
}
function rosterSport(r) { return r.sport || 'basketball'; }
function rostersFor(sport) { return Object.keys(DB.rosters).filter(function (k) { return !DB.rosters[k].deleted && rosterSport(DB.rosters[k]) === sport; }).sort(); }
function renderGame() {
  var S = G.settings, def = D(), lib = rostersFor(G.sport);
  var libOpts = '<option value="">Load saved roster…</option>' + lib.map(function (k) { return '<option value="' + esc(k) + '">' + esc(DB.rosters[k].name) + '</option>'; }).join('');
  var sportOpts = E.ORDER.map(function (s) { return '<option value="' + s + '"' + (s === G.sport ? ' selected' : '') + '>' + ICON[s] + ' ' + esc(E.SPORTS[s].name) + '</option>'; }).join('');
  var h = '<div id="gameLive"></div>';
  h += '<div class="card"><h3>This game</h3><div class="cols">' +
    '<div><label class="f">Sport</label><select data-f="sport">' + sportOpts + '</select></div>' +
    '<div><label class="f">Date</label><input type="date" data-f="date" value="' + esc(G.date) + '"></div>' +
    '<div><label class="f">Title (optional)</label><input type="text" data-f="title" value="' + esc(G.title || '') + '" placeholder="Varsity — District game"></div></div>' +
    '<div class="muted small" style="margin-top:6px">You can change the sport until the first play is recorded. After that, start a new game for a different sport.</div>' +
    '<div class="row" style="margin-top:12px"><button data-act="newgame">Start a new game…</button></div></div>';
  ['home', 'away'].forEach(function (side) {
    var T = G.teams[side];
    h += '<div class="card"><h3>' + (side === 'home' ? 'Home' : 'Away') + ' team</h3><div class="cols">' +
      '<div><label class="f">Team name</label><input type="text" data-f="tname" data-side="' + side + '" value="' + esc(T.name) + '"></div>' +
      '<div><label class="f">Short name (3 letters)</label><input type="text" data-f="tabbr" data-side="' + side + '" maxlength="4" value="' + esc(T.abbr) + '"></div></div>' +
      '<div class="row" style="margin:12px 0"><button class="good" data-act="importpdf" data-side="' + side + '">Import roster from PDF…</button><button data-act="addp2" data-side="' + side + '">+ Add player</button>' +
      '<select data-f="libload" data-side="' + side + '" style="width:auto;flex:1 1 180px">' + libOpts + '</select><button data-act="saveroster" data-side="' + side + '">Save roster for later</button></div>' +
      '<div class="muted small" style="margin-bottom:6px">' + (def.startHelp ? def.startHelp + ' ' : '') + 'Numbers, names and positions can be edited right here.</div>' + rosterTable(side) + '</div>';
  });
  var fm = def.formats.slice(); if (!fm.some(function (f) { return f.v === S.periods; })) fm.push({ v: S.periods, t: S.periods + (G.sport === 'baseball' ? ' innings' : ' periods') });
  var fmtLabel = G.sport === 'baseball' ? 'Game length' : G.sport === 'volleyball' ? 'Match format' : 'Game format';
  var lenLabel = G.sport === 'soccer' ? 'Half length (min)' : G.sport === 'football' ? 'Quarter length (min)' : 'Period length (min)';
  h += '<div class="card"><h3>Rules &amp; options</h3><div class="cols">' +
    '<div><label class="f">' + fmtLabel + '</label><select data-f="periods">' + fm.map(function (f) { return '<option value="' + f.v + '"' + (S.periods === f.v ? ' selected' : '') + '>' + f.t + '</option>'; }).join('') + '</select></div>' +
    (def.clock ? '<div><label class="f">' + lenLabel + (sbUse() ? ' — follows scorebug' : '') + '</label><input type="number" step="0.5" min="1" data-f="periodMin" value="' + S.periodMin + '"' + (sbUse() ? ' disabled' : '') + '></div>' : '') +
    (def.clock && G.sport !== 'football' ? '<div><label class="f">' + (G.sport === 'soccer' ? 'Extra-time half (min)' : 'Overtime length (min)') + '</label><input type="number" step="0.5" min="1" data-f="otMin" value="' + S.otMin + '"></div>' : '') + '</div>' +
    '<div class="row" style="margin-top:12px;gap:18px">' +
    (def.assistFor ? '<label class="row" style="gap:8px"><input type="checkbox" data-f="assistPrompt"' + (S.assistPrompt ? ' checked' : '') + '> Ask for the assist after a ' + (G.sport === 'soccer' ? 'goal' : 'made basket') + '</label>' : '') +
    '<label class="row" style="gap:8px"><input type="checkbox" data-f="keepSelected"' + (S.keepSelected ? ' checked' : '') + '> Keep player selected after each stat</label></div></div>';
  h += '<div class="card"><h3>Scorebug Studio link</h3><div id="sbBox"></div></div>';
  var games = Object.keys(DB.games).map(function (k) { return DB.games[k]; }).filter(function (g) { return !g.deleted; }).sort(function (a, b) { return b.updatedAt - a.updatedAt; });
  h += '<div class="card"><h3>Saved games</h3>';
  games.forEach(function (g) {
    var c = E.compute(g, 0);
    h += '<div class="row" style="padding:6px 0;border-bottom:1px solid var(--line)"><div class="fill"><b>' + (ICON[g.sport] || '') + ' ' + esc(g.teams.home.name) + ' ' + c.score.home + ' – ' + c.score.away + ' ' + esc(g.teams.away.name) + '</b><div class="muted small">' + esc(E.sportDef(g).name) + ' · ' + esc(g.date) + (g.title ? ' · ' + esc(g.title) : '') + (g.id === G.id ? ' · <span style="color:var(--accent)">open now</span>' : '') + '</div></div>' +
      (g.id === G.id ? '' : '<button class="sm" data-act="opengame" data-v="' + g.id + '">Open</button>') + '<button class="sm warn" data-act="delgame" data-v="' + g.id + '">Delete</button></div>';
  });
  h += '<div class="row" style="margin-top:12px"><button data-act="exportall">Back up everything (JSON)</button><button data-act="restore">Restore from backup…</button><input type="file" id="restoreFile" accept=".json,application/json" hidden></div></div>';
  $('#p-game').innerHTML = h;
  renderGameLive();
}
function sbSyncText() {
  switch (G.sport) {
    case 'basketball': return 'Made baskets, free throws and team fouls update the on-air scorebug automatically, and the game clock/period are shared.';
    case 'soccer': return 'Goals and cards update the on-air scorebug automatically, and the match clock and half are shared.';
    case 'football': return 'Touchdowns, kicks and safeties update the on-air scorebug score automatically, and the game clock/quarter are shared.';
    case 'volleyball': return 'Points update the set score on the scorebug automatically. Use END SET here and the scorebug records the set too.';
    case 'baseball': return 'Runs update the scorebug score automatically. The inning and half-inning are shared with the scorebug.';
  }
  return '';
}
function renderGameLive() {
  var box = $('#sbBox'); if (!box) return;
  var h, def = D();
  if (!sbConnected) h = '<p class="muted">Not connected. Start Scorebug Studio on this computer and this page connects by itself.</p>';
  else if (sb.sport !== G.sport) h = '<p>Scorebug is set to <b>' + esc(sb.sport) + '</b>.</p><button data-act="sbswitch">Switch scorebug to ' + esc(def.name.toLowerCase()) + ' (starts a new scorebug game)</button>';
  else {
    var shareLabel = def.clock ? 'Use the scorebug clock &amp; period' : G.sport === 'baseball' ? 'Use the scorebug inning &amp; half-inning' : 'Use the scorebug set number';
    h = '<p>Connected. ' + sbSyncText() + '</p><div class="row">' +
      '<label class="row" style="gap:8px"><input type="checkbox" data-f="syncScorebug"' + (G.settings.syncScorebug ? ' checked' : '') + '> Send the score' + (G.sport === 'basketball' ? ' &amp; team fouls' : G.sport === 'soccer' ? ' &amp; cards' : '') + ' to the scorebug</label>' +
      '<label class="row" style="gap:8px"><input type="checkbox" data-f="useScorebugClock"' + (G.settings.useScorebugClock ? ' checked' : '') + '> ' + shareLabel + '</label></div>' +
      '<div class="row" style="margin-top:10px"><button data-act="pushnames">Send team names to scorebug</button><button data-act="pullnames">Use names from scorebug</button><button data-act="syncnow">Set scorebug to match stats</button></div>';
  }
  box.innerHTML = h;
}

/* ============================================================ roster import */
function extractPdf(file) {
  if (!window.pdfjsLib) return Promise.reject(new Error('PDF reader did not load'));
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.js';
  return file.arrayBuffer().then(function (buf) {
    return pdfjsLib.getDocument({ data: buf }).promise;
  }).then(function (pdf) {
    var pages = [], chain = Promise.resolve();
    for (var i = 1; i <= pdf.numPages; i++) (function (n) {
      chain = chain.then(function () { return pdf.getPage(n); }).then(function (pg) { return pg.getTextContent(); }).then(function (tc) {
        pages.push(tc.items.filter(function (it) { return it.str != null; }).map(function (it) { return { str: it.str, x: it.transform[4], y: it.transform[5], w: it.width }; }));
      });
    })(i);
    return chain.then(function () { return pages; });
  });
}
function textToPages(text) {
  var lines = text.split(/\r?\n/);
  return [lines.map(function (l, i) { return { str: l, x: 0, y: 10000 - i * 12, w: l.length * 5 }; })];
}
var imp = null;
function openImport(side) {
  imp = { side: side, rows: [], mode: 'replace', starters: false };
  openModal('<h3>Import roster — ' + esc(G.teams[side].name) + '</h3><div id="impBody"></div>');
  renderImport();
}
function renderImport() {
  var b = $('#impBody'); if (!b) return;
  if (!imp.rows.length) {
    b.innerHTML = '<p class="muted">Choose a roster PDF (one with selectable text, like one saved or printed from a school or team website). You get to check and fix every row before anything is saved.</p>' +
      '<div class="row"><button class="good fill" data-act="pickpdf">Choose PDF file…</button></div><input type="file" id="pdfFile" accept="application/pdf,.pdf" hidden>' +
      '<div id="impMsg" class="small" style="margin:10px 0"></div>' +
      '<details style="margin-top:8px"><summary class="muted">No PDF? Paste roster text instead</summary><textarea id="pasteTxt" rows="6" placeholder="23 John Smith G&#10;5 Mike Jones F&#10;..." style="margin-top:8px"></textarea><div class="row" style="margin-top:8px"><button data-act="parsepaste">Read pasted text</button></div></details>' +
      '<div style="margin-top:12px"><button data-act="close">Cancel</button></div>';
    var f = $('#pdfFile');
    f.addEventListener('change', function () {
      if (!f.files[0]) return;
      $('#impMsg').textContent = 'Reading ' + f.files[0].name + '…';
      extractPdf(f.files[0]).then(function (pages) { showParsed(RP.parseItems(pages)); })
        .catch(function (err) { $('#impMsg').innerHTML = '<span class="err">Could not read that PDF: ' + esc(err.message || err) + '</span>'; });
    });
    return;
  }
  var h = '<p class="small muted">' + imp.rows.length + ' players found. Fix anything that looks wrong, untick rows you don’t want.</p>';
  if (imp.warnings && imp.warnings.length) h += '<p class="small" style="color:var(--accent)">' + imp.warnings.map(esc).join('<br>') + '</p>';
  h += '<div class="scroll"><table class="rost"><thead><tr><th>Use</th><th>#</th><th>Name</th><th>Pos</th></tr></thead><tbody>';
  imp.rows.forEach(function (r, i) {
    h += '<tr><td><input type="checkbox" data-imp="use" data-i="' + i + '"' + (r.use ? ' checked' : '') + '></td><td class="num"><input type="text" data-imp="num" data-i="' + i + '" value="' + esc(r.num) + '"' + (r.dup ? ' style="outline:2px solid var(--accent)"' : '') + '></td>' +
      '<td><input type="text" data-imp="name" data-i="' + i + '" value="' + esc(r.name) + '"></td><td class="pos"><input type="text" data-imp="pos" data-i="' + i + '" value="' + esc(r.pos) + '"></td></tr>';
  });
  h += '</tbody></table></div><div class="row" style="margin:12px 0"><button class="sm" data-act="impswap">Swap first/last names</button>' +
    '<label class="row" style="gap:6px"><input type="radio" name="impmode" data-imp="mode" value="replace"' + (imp.mode === 'replace' ? ' checked' : '') + '> Replace current roster</label>' +
    '<label class="row" style="gap:6px"><input type="radio" name="impmode" data-imp="mode" value="add"' + (imp.mode === 'add' ? ' checked' : '') + '> Add to current roster</label></div>' +
    '<div class="row"><button class="good fill" data-act="impapply">Use these players</button><button data-act="impback">Start over</button><button data-act="close">Cancel</button></div>';
  b.innerHTML = h;
}
function showParsed(res) {
  imp.rows = res.players.map(function (p) { return { use: true, num: p.num, name: p.name, pos: p.pos, dup: p.dup }; });
  imp.warnings = res.warnings;
  if (!imp.rows.length) { $('#impMsg').innerHTML = '<span class="err">' + esc(res.warnings[0] || 'No players found.') + '</span>'; imp.rows = []; return; }
  renderImport();
}
function applyImport() {
  var side = imp.side, T = G.teams[side];
  var rows = imp.rows.filter(function (r) { return r.use && (r.num || r.name); });
  if (imp.mode === 'replace' && G.events.some(function (e) { return e.side === side; })) {
    return confirmBox('This team already has recorded plays. Replacing the roster would orphan them. Add to the roster instead?', 'Add instead', function () { imp.mode = 'add'; applyImport(); });
  }
  if (imp.mode === 'replace') { T.players = []; T.starters = []; }
  rows.forEach(function (r) {
    var ex = T.players.filter(function (p) { return p.num === String(r.num).trim(); })[0];
    if (ex) { ex.name = r.name || ex.name; ex.pos = r.pos || ex.pos; }
    else T.players.push({ id: E.uid(), num: String(r.num).trim(), name: r.name.trim(), pos: (r.pos || '').trim() });
  });
  closeModal(); imp = null; touch(); pushDeltas(); refreshAll();
  toast('Roster updated: ' + T.players.length + ' players.' + (startMax() ? ' Tick the starters below.' : ''));
}

/* ============================================================ sport / new game / exports */
function openSportPicker() {
  openModal('<h3>Which sport?</h3><div class="pick sports">' + E.ORDER.map(function (s) {
    return '<button data-act="sportpick" data-v="' + s + '"' + (s === G.sport ? ' class="on"' : '') + '><span class="n">' + ICON[s] + '</span><span class="t">' + esc(E.SPORTS[s].name) + '</span></button>';
  }).join('') + '</div><p class="muted small">' + (G.events.length ? 'This game already has plays recorded, so picking another sport starts a new game (this one stays saved).' : 'Nothing recorded yet, so this just switches the current game.') + '</p><div><button data-act="close">Cancel</button></div>');
}
function changeSport(sport) {
  if (sport === G.sport) return;
  G.sport = sport;
  G.settings = Object.assign(E.defaultSettings(sport), prefsFor(sport));
  G.period = 1; G.half = 'top'; G.events = [];
  G.local = { ms: G.settings.periodMin * 60000, running: false, anchor: Date.now() };
  var cap = E.sportDef(sport).lineup || E.sportDef(sport).startMax || 0;
  ['home', 'away'].forEach(function (s) { G.teams[s].starters = cap ? G.teams[s].starters.slice(0, cap) : []; });
  DB.prefs.lastSport = sport;
  selPid = null; curSide = sport === 'baseball' ? E.battingSide(G) : 'home';
  touch(); resync();
  toast('Now keeping ' + E.sportDef(sport).name + ' stats');
}
function openNewGame(sport) {
  sport = sport || G.sport;
  var so = E.ORDER.map(function (s) { return '<option value="' + s + '"' + (s === sport ? ' selected' : '') + '>' + ICON[s] + ' ' + esc(E.SPORTS[s].name) + '</option>'; }).join('');
  var rosterOpts = function (sp) {
    var lib = rostersFor(sp);
    return '<option value="">(blank roster)</option><option value="__cur">Keep current roster</option>' + lib.map(function (k) { return '<option value="' + esc(k) + '">' + esc(DB.rosters[k].name) + '</option>'; }).join('');
  };
  openModal('<h3>New game</h3><div style="margin-bottom:12px"><label class="f">Sport</label><select id="ngS">' + so + '</select></div><div class="cols"><div><label class="f">Home roster</label><select id="ngH">' + rosterOpts(sport) + '</select></div><div><label class="f">Away roster</label><select id="ngA">' + rosterOpts(sport) + '</select></div></div>' +
    '<p class="muted small">The current game stays saved under SAVED GAMES.' + (sbOK() && G.settings.syncScorebug ? ' If the scorebug is on the same sport its score, clock and counters reset too.' : '') + '</p><div class="row"><button class="good fill" data-act="ngok">Start new game</button><button data-act="close">Cancel</button></div>');
  var dflt = sport === G.sport ? '__cur' : '';
  $('#ngH').value = dflt; $('#ngA').value = dflt;
  $('#ngS').addEventListener('change', function () {
    var sp = this.value, o = rosterOpts(sp);
    $('#ngH').innerHTML = o; $('#ngA').innerHTML = o; $('#ngH').value = sp === G.sport ? '__cur' : ''; $('#ngA').value = sp === G.sport ? '__cur' : '';
  });
}
function teamFromChoice(key, side, sport) {
  var cur = G.teams[side];
  var cap = E.sportDef(sport).lineup || E.sportDef(sport).startMax || 0;
  if (key === '__cur') {
    var map = {}, players = cur.players.map(function (p) { var id = E.uid(); map[p.id] = id; return { id: id, num: p.num, name: p.name, pos: p.pos }; });
    var st = sport === G.sport ? cur.starters.map(function (id) { return map[id]; }).filter(Boolean).slice(0, cap) : [];
    return { name: cur.name, abbr: cur.abbr, players: players, starters: st };
  }
  if (!key) return { name: side === 'home' ? 'HOME' : 'AWAY', abbr: side === 'home' ? 'HOM' : 'AWY', players: [], starters: [] };
  return rosterToTeam(DB.rosters[key], sport);
}
function rosterToTeam(r, sport) {
  var cap = E.sportDef(sport || G.sport).lineup || E.sportDef(sport || G.sport).startMax || 0;
  var starters = [], players = r.players.map(function (p) { var id = E.uid(); if (p.start) starters.push(id); return { id: id, num: p.num, name: p.name, pos: p.pos }; });
  return { name: r.name, abbr: r.abbr || r.name.slice(0, 3).toUpperCase(), players: players, starters: starters.slice(0, cap) };
}
function startNewGame(hk, ak, sport) {
  sport = sport || G.sport;
  var teams = { home: teamFromChoice(hk, 'home', sport), away: teamFromChoice(ak, 'away', sport) };
  var g = freshGame(sport, teams);
  DB.games[g.id] = g; DB.currentId = g.id; G = g; selPid = null; curSide = sport === 'baseball' ? 'away' : 'home';
  DB.prefs.lastSport = sport;
  persist(); lastSync = null; resync();
  if (sbOK() && G.settings.syncScorebug) { sbSend({ type: 'action', name: 'new_game', args: {} }); setTimeout(function () { syncNow(); }, 250); }
  toast('New ' + E.sportDef(sport).name.toLowerCase() + ' game started');
}
function saveRoster(side) {
  var T = G.teams[side];
  if (!T.name.trim()) return toast('Give the team a name first');
  var name = T.name.trim(), key = G.sport === 'basketball' ? name : G.sport + ':' + name;
  DB.rosters[key] = { id: key, name: name, sport: G.sport, abbr: T.abbr, updatedAt: Date.now(), players: T.players.map(function (p) { return { num: p.num, name: p.name, pos: p.pos, start: T.starters.indexOf(p.id) >= 0 }; }) };
  persist(); refreshAll(); toast('Saved ' + E.sportDef(G.sport).name.toLowerCase() + ' roster "' + name + '"');
}
function download(name, text, type) {
  var b = new Blob([text], { type: type || 'text/plain' }), a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function fileBase() { return (G.sport + '-' + G.teams.home.name + '-vs-' + G.teams.away.name + '-' + G.date).replace(/[^A-Za-z0-9\-]+/g, '_'); }

/* ============================================================ events */
var actions = {
  tab: function (el) { setTab(el.dataset.v); },
  side: function (el) { curSide = el.dataset.v; selPid = null; refreshAll(); },
  selp: function (el) { selPid = selPid === el.dataset.v ? null : el.dataset.v; refreshAll(); },
  actb: function (el) { act(parseInt(el.dataset.v, 10)); },
  undo: undoLast,
  clock: clockToggle,
  per: function (el) { changePeriod(parseInt(el.dataset.v, 10)); },
  clockset: function () {
    var up = D().clockUp, ci = clockInfo();
    askText(up ? 'Set the match time' : 'Set the clock', up ? E.matchClock(G, ci.period, ci.ms) : E.clockLabel(ci.ms), 'm:ss or seconds', function (v) {
      var ms = parseClock(v); if (ms == null) return toast('Use m:ss, like 5:30');
      if (up) { var len = E.periodLenSec(G, ci.period) * 1000, base = E.baseSec(G, ci.period) * 1000; setClockRem(len - (ms - base)); }
      else setClockRem(ms);
    });
  },
  addp: function () { openAddPlayer(curSide); },
  addp2: function (el) { openAddPlayer(el.dataset.side); },
  padkey: function (el) { var i = $('#apNum'), v = el.dataset.v; i.value = v === 'C' ? i.value.slice(0, -1) : (i.value + v).slice(0, 3); },
  addplayer: function (el) { addPlayer(el.dataset.v); },
  close: closeModal,
  assist: function (el) { if (modalHandlers.assist) modalHandlers.assist(el.dataset.v); },
  dosub: function (el) { if (modalHandlers.dosub) modalHandlers.dosub(el.dataset.v); },
  askok: function () { if (modalHandlers.askok) modalHandlers.askok(); },
  confok: function () { if (modalHandlers.confok) modalHandlers.confok(); },
  rcv: function (el) { passSt.rcv = el.dataset.v; Array.prototype.forEach.call(document.querySelectorAll('#rcvPick button'), function (b) { b.classList.toggle('on', b === el); }); },
  passsave: savePass,
  yardsave: saveYards,
  yneg: function () { var i = $('#ydsIn'), v = parseYds(i.value); i.value = v === 0 && !/-/.test(i.value) ? '-' : String(-v); },
  rbi: function (el) { saveRbi(parseInt(el.dataset.v, 10), false); },
  hrrbi: function (el) { saveRbi(parseInt(el.dataset.v, 10), true); },
  pitchchg: openPitcherChange,
  pchpick: function (el) {
    var side = curSide, pid = el.dataset.v; closeModal();
    var e = mk(side, pid, 'pch', null);
    commit([e], E.describe(G, e));
  },
  sportpick: function (el) {
    var s = el.dataset.v; closeModal();
    if (!G.events.length) changeSport(s); else if (s !== G.sport) openNewGame(s);
  },
  sportchip: openSportPicker,
  delev: function (el) { E.removeEvent(G, el.dataset.v); persist(); pushDeltas(); refreshAll(); },
  csv: function () { var ci = clockInfo(); download(fileBase() + '-box.csv', E.toCSV(G, E.elapsed(G, ci.period, ci.ms)), 'text/csv'); },
  json: function () { download(fileBase() + '.json', JSON.stringify(G, null, 1), 'application/json'); },
  print: function () { window.print(); },
  newgame: function () { openNewGame(G.sport); },
  ngok: function () { var h = $('#ngH').value, a = $('#ngA').value, s = $('#ngS').value; closeModal(); startNewGame(h, a, s); },
  opengame: function (el) { DB.currentId = el.dataset.v; G = DB.games[DB.currentId]; normGame(G); selPid = null; if (G.sport === 'baseball') curSide = E.battingSide(G); persist(); lastSync = null; resync(); },
  delgame: function (el) {
    var id = el.dataset.v;
    confirmBox('Delete this saved game?', 'Delete', function () {
      DB.games[id].deleted = true; DB.games[id].updatedAt = Date.now();
      if (id === DB.currentId) ensureGame();
      persist(); lastSync = null; resync();
    });
  },
  exportall: function () { download('stat-keeper-backup-' + new Date().toISOString().slice(0, 10) + '.json', JSON.stringify(DB), 'application/json'); },
  restore: function () { $('#restoreFile').click(); },
  importpdf: function (el) { openImport(el.dataset.side); },
  pickpdf: function () { $('#pdfFile').click(); },
  parsepaste: function () { showParsed(RP.parseItems(textToPages($('#pasteTxt').value))); },
  impswap: function () { imp.rows.forEach(function (r) { var p = r.name.trim().split(/\s+/); if (p.length >= 2) r.name = p.slice(1).join(' ') + ' ' + p[0]; }); renderImport(); },
  impback: function () { imp.rows = []; renderImport(); },
  impapply: applyImport,
  saveroster: function (el) { saveRoster(el.dataset.side); },
  delp: function (el) {
    var side = el.dataset.side, id = el.dataset.v, used = G.events.some(function (e) { return e.side === side && (e.pid === id || e.out === id); });
    var doDel = function () { var T = G.teams[side]; T.players = T.players.filter(function (p) { return p.id !== id; }); T.starters = T.starters.filter(function (x) { return x !== id; }); touch(); refreshAll(); };
    if (used) confirmBox('This player has recorded plays. Remove them anyway? Their stats disappear from the box score.', 'Remove', doDel); else doDel();
  },
  sbchip: function () { if (sbConnected && sb && sb.sport !== G.sport) actions.sbswitch(); },
  sbswitch: function () {
    confirmBox('Switch the scorebug to ' + D().name.toLowerCase() + '? This starts a new game on the scorebug (scores reset).', 'Switch', function () {
      sbSend({ type: 'action', name: 'set_sport', args: { sport: G.sport } }); setTimeout(function () { refreshAll(); syncNow(); }, 400);
    });
  },
  syncnow: function () { if (sbOK()) { syncNow(); toast('Scorebug updated to match stats'); } },
  pushnames: function () {
    ['home', 'away'].forEach(function (s) { sbSend({ type: 'set', path: 'teams.' + s + '.name', value: G.teams[s].name }); sbSend({ type: 'set', path: 'teams.' + s + '.abbr', value: G.teams[s].abbr }); });
    toast('Names sent to scorebug');
  },
  pullnames: function () {
    if (!sb) return;
    ['home', 'away'].forEach(function (s) { G.teams[s].name = sb.teams[s].name || G.teams[s].name; G.teams[s].abbr = sb.teams[s].abbr || G.teams[s].abbr; });
    touch(); refreshAll();
  }
};
var tabNames = ['live', 'box', 'pbp', 'game'];
function setTab(t) {
  tab = t;
  tabNames.forEach(function (n) { $('#p-' + n).hidden = n !== t; });
  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.classList.toggle('on', b.dataset.v === t); });
  refreshAll(); window.scrollTo(0, 0);
}

document.addEventListener('click', function (ev) {
  var el = ev.target.closest('[data-act]');
  if (!el) return;
  var fn = actions[el.dataset.act];
  if (fn) { ev.preventDefault(); fn(el); }
});
document.addEventListener('input', function (ev) {
  if (ev.target.id !== 'findNum') return;
  var v = ev.target.value.trim(); if (!v) return;
  var p = G.teams[curSide].players.filter(function (x) { return x.num === v; })[0];
  if (p) { selPid = p.id; refreshAll(); var f = $('#findNum'); if (f) { f.focus(); f.value = v; } }
});
document.addEventListener('change', function (ev) {
  var el = ev.target, f = el.dataset && el.dataset.f;
  if (el.id === 'restoreFile') {
    var file = el.files[0]; if (!file) return;
    file.text().then(function (txt) {
      var d; try { d = JSON.parse(txt); } catch (e) { return toast('That file is not a backup'); }
      if (d.events && d.teams) { d.id = d.id || E.uid(); d.updatedAt = Date.now(); normGame(d); DB.games[d.id] = d; DB.currentId = d.id; }
      else if (d.games) { mergeDB(Object.assign({}, d, { updatedAt: 0 })); Object.keys(DB.games).forEach(function (id) { normGame(DB.games[id]); }); }
      else return toast('That file is not a backup');
      ensureGame(); persist(); lastSync = null; resync(); toast('Restored');
    });
    return;
  }
  if (el.dataset && el.dataset.imp && imp) {
    var k = el.dataset.imp, i = parseInt(el.dataset.i, 10);
    if (k === 'use') imp.rows[i].use = el.checked; else if (k === 'mode') imp.mode = el.value; else imp.rows[i][k] = el.value;
    return;
  }
  if (el.id === 'pbpf') { pbpFilter = el.value; return renderPBP(); }
  if (!f) return;
  if (f === 'sport') {
    if (G.events.length) { el.value = G.sport; return toast('Start a new game to change the sport'); }
    return changeSport(el.value);
  }
  var side = el.dataset.side, id = el.dataset.id, T = side && G.teams[side];
  var S = G.settings;
  switch (f) {
    case 'date': G.date = el.value; break;
    case 'title': G.title = el.value; break;
    case 'tname': T.name = el.value.trim() || T.name; if (!T.abbr || T.abbr === 'HOM' || T.abbr === 'AWY') T.abbr = T.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || T.abbr; break;
    case 'tabbr': T.abbr = el.value.toUpperCase().slice(0, 4); break;
    case 'num': case 'name': case 'pos': { var p = E.findPlayer(G, side, id); if (p) p[f] = el.value.trim(); break; }
    case 'start':
      if (el.checked) { if (T.starters.length >= startMax()) { el.checked = false; return toast('Only ' + startMax() + ' starter' + (startMax() === 1 ? '' : 's')); } T.starters.push(id); }
      else T.starters = T.starters.filter(function (x) { return x !== id; });
      break;
    case 'libload': {
      var r = DB.rosters[el.value]; if (!r) return;
      var doIt = function () { var t = rosterToTeam(r, G.sport); G.teams[side] = t; touch(); refreshAll(); toast('Loaded ' + r.name); };
      if (G.events.some(function (e) { return e.side === side; })) { el.value = ''; return toast('Start a new game to load a different roster'); }
      return doIt();
    }
    case 'periods': S.periods = parseInt(el.value, 10); setPref('periods', S.periods); if (!G.local.running) G.local.ms = E.periodLenSec(G, G.period) * 1000; break;
    case 'periodMin': case 'otMin': {
      var v = parseFloat(el.value); if (!(v > 0)) return; var old = E.periodLenSec(G, G.period) * 1000;
      S[f] = v; setPref(f, v);
      if (!G.local.running && Math.abs(G.local.ms - old) < 1) G.local.ms = E.periodLenSec(G, G.period) * 1000;
      break;
    }
    case 'assistPrompt': case 'keepSelected': case 'syncScorebug': case 'useScorebugClock': S[f] = el.checked; setPref(f, el.checked); break;
    default: return;
  }
  touch(); pushDeltas();
  if (f === 'tname' || f === 'tabbr' || f === 'periods' || f === 'periodMin' || f === 'otMin' || f === 'useScorebugClock' || f === 'num') refreshAll(); else { var ci = clockInfo(); C = E.compute(G, E.elapsed(G, ci.period, ci.ms)); renderBar(); }
});

document.addEventListener('keydown', function (ev) {
  var tag = (ev.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
  if (!$('#modal').hidden) { if (ev.key === 'Escape') closeModal(); return; }
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  var k = ev.key.toLowerCase();
  if (k === ' ') { if (!D().clock) return; ev.preventDefault(); return clockToggle(); }
  if (tab !== 'live') return;
  if (k === 'z') return undoLast();
  var bi = -1; D().buttons.forEach(function (b, i) { if (b.key === k && bi < 0) bi = i; });
  if (bi >= 0) return act(bi);
  if (k === '0') { selPid = E.TEAM; return refreshAll(); }
  if (D().lineup && /^[1-9]$/.test(k)) { var on = onCourt(curSide), id = on[parseInt(k, 10) - 1]; if (id) { selPid = id; refreshAll(); } return; }
  if (k === 'h') { curSide = 'home'; selPid = null; refreshAll(); }
  if (k === 'j') { curSide = 'away'; selPid = null; refreshAll(); }
});

/* ============================================================ start */
DB = loadLocal() || blankDB();
DB.prefs = DB.prefs || {}; DB.rosters = DB.rosters || {}; DB.games = DB.games || {};
ensureGame();
Object.keys(DB.games).forEach(function (id) { normGame(DB.games[id]); });
lastSync = null;
refreshAll(); lastSync = metrics();
setSaveChip();
pullServer(true).then(function () { lastSync = metrics(); });
setInterval(pollServer, 4000);
setInterval(function () { tickClock(); if (tab === 'box' && !document.hidden) { var ci = clockInfo(); C = E.compute(G, E.elapsed(G, ci.period, ci.ms)); } }, 200);
setInterval(function () { if (tab === 'box' && !document.hidden && clockInfo().running) renderBox(); }, 5000);
document.addEventListener('visibilitychange', function () { if (document.hidden) { if (dirtyPush) pushServer(true); } else refreshAll(); });
window.addEventListener('pagehide', function () { if (dirtyPush) pushServer(true); });
connectWS();

window.SK = { clockInfo: clockInfo, E: E, RP: RP, get G() { return G; }, get DB() { return DB; }, get C() { return C; }, refreshAll: refreshAll, metrics: metrics, act: act, changeSport: changeSport };
})();
