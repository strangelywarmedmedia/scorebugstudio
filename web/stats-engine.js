/* Stat Keeper engine: pure functions, no DOM. Works in the browser (window.StatEngine) and Node (module.exports).
 *
 * A game is a list of EVENTS. Every number in the box score is derived from that list, so deleting or
 * undoing any event just recomputes the totals - nothing can drift.
 *
 * Each sport is a small DEFINITION (stats it tracks, what every event does to a stat line, the buttons shown
 * while keeping stats, and the box-score tables). Adding a sport = adding a definition below.
 */
(function (root) {
  'use strict';

  var TEAM = 'TEAM'; // pseudo-player id for team-level stats (team rebounds, unassigned stats, or a team you only track as a whole)

  function uid() {
    return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  }

  // ---------- formatting helpers (used by the sport definitions) ----------
  function pct(m, a) { return a ? Math.round(m / a * 1000) / 10 : null; }
  function fmtPct(m, a) { var p = pct(m, a); return p == null ? '-' : p.toFixed(1); }
  function fmtMin(sec) { sec = Math.round(sec); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }
  function reb(l) { return l.oreb + l.dreb; }
  function avg(n, d) { return d ? (n / d).toFixed(1) : '-'; }
  function rate3(n, d) { if (!d) return '-'; var v = n / d; var s = Math.abs(v).toFixed(3); s = s.replace(/^0/, ''); return (v < 0 ? '-' : '') + s; }
  function ip(outs) { return Math.floor(outs / 3) + '.' + (outs % 3); }
  function sum(l, keys) { return keys.reduce(function (n, k) { return n + (l[k] || 0); }, 0); }
  function any(l, keys) { return sum(l, keys) > 0; }

  // ============================================================ sport definitions
  var SPORTS = {};

  /* ---------------------------------------------------------- basketball */
  SPORTS.basketball = {
    id: 'basketball', name: 'Basketball',
    stats: ['min', 'pts', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta', 'oreb', 'dreb', 'ast', 'stl', 'blk', 'to', 'pf', 'pm'],
    lineup: 5, pm: true, startLabel: 'Start', startHelp: 'Tick <b>Start</b> for the five starters.',
    clock: true, over: false,
    periods: 4, periodMin: 8, otMin: 4,
    formats: [{ v: 4, t: '4 quarters' }, { v: 2, t: '2 halves' }],
    bonusAt: 5, // team fouls reset every period (quarter, half and each overtime); a team shoots the bonus once the OTHER team has 5 fouls
    assistFor: ['2m', '3m'],
    events: {
      '2m': { label: '2PT made', fx: { fgm: 1, fga: 1 }, pts: 2 },
      '2x': { label: '2PT missed', fx: { fga: 1 } },
      '3m': { label: '3PT made', fx: { fgm: 1, fga: 1, tpm: 1, tpa: 1 }, pts: 3 },
      '3x': { label: '3PT missed', fx: { fga: 1, tpa: 1 } },
      'ftm': { label: 'FT made', fx: { ftm: 1, fta: 1 }, pts: 1 },
      'ftx': { label: 'FT missed', fx: { fta: 1 } },
      oreb: { label: 'Offensive rebound', fx: { oreb: 1 } },
      dreb: { label: 'Defensive rebound', fx: { dreb: 1 } },
      ast: { label: 'Assist', fx: { ast: 1 } },
      stl: { label: 'Steal', fx: { stl: 1 } },
      blk: { label: 'Block', fx: { blk: 1 } },
      to: { label: 'Turnover', fx: { to: 1 } },
      pf: { label: 'Foul', fx: { pf: 1 }, tf: 1 },
      reb: { label: 'Rebound', fx: { dreb: 1 } } // quick mode: one REB button (counted in the rebound total)
    },
    // Quick mode: scoring + key stats only, one tap each. No misses, subs or minutes.
    quickButtons: [
      { t: '2m', label: '2PT', cls: 'made', key: 'q' }, { t: '3m', label: '3PT', cls: 'made', key: 'e' }, { t: 'ftm', label: 'FT', cls: 'made', key: 't' },
      { t: 'reb', label: 'REB', key: 'o' }, { t: 'ast', label: 'AST', key: 'a' }, { t: 'stl', label: 'STL', key: 's' },
      { t: 'blk', label: 'BLK', key: 'b' }, { t: 'to', label: 'TO', key: 'v' }, { t: 'pf', label: 'FOUL', cls: 'foul', key: 'f' }
    ],
    quickCols: [
      { h: 'PTS', v: function (l) { return l.pts; }, bold: true },
      { h: '2PM', v: function (l) { return l.fgm - l.tpm; } },
      { h: '3PM', v: function (l) { return l.tpm; } },
      { h: 'FTM', v: function (l) { return l.ftm; } },
      { h: 'REB', v: function (l) { return reb(l); } },
      { h: 'AST', v: function (l) { return l.ast; } },
      { h: 'STL', v: function (l) { return l.stl; } },
      { h: 'BLK', v: function (l) { return l.blk; } },
      { h: 'TO', v: function (l) { return l.to; } },
      { h: 'PF', v: function (l) { return l.pf; }, hi: function (l) { return l.pf >= 5; } }
    ],
    quickCard: function (l) { return '<b>' + l.pts + '</b> pts · ' + reb(l) + ' reb · ' + l.ast + ' ast'; },
    buttons: [
      { t: '2m', label: '2PT ✓', cls: 'made', key: 'q' }, { t: '2x', label: '2PT ✗', cls: 'miss', key: 'w' },
      { t: '3m', label: '3PT ✓', cls: 'made', key: 'e' }, { t: '3x', label: '3PT ✗', cls: 'miss', key: 'r' },
      { t: 'ftm', label: 'FT ✓', cls: 'made', key: 't' }, { t: 'ftx', label: 'FT ✗', cls: 'miss', key: 'y' },
      { t: 'oreb', label: 'OFF REB', key: 'o' }, { t: 'dreb', label: 'DEF REB', key: 'd' },
      { t: 'ast', label: 'ASSIST', key: 'a' }, { t: 'stl', label: 'STEAL', key: 's' },
      { t: 'blk', label: 'BLOCK', key: 'b' }, { t: 'to', label: 'TURNOVER', key: 'v' },
      { t: 'pf', label: 'FOUL', cls: 'foul', key: 'f' }, { t: 'sub', label: 'SUB', key: 'u' }
    ],
    tables: [{
      cols: [
        { h: 'MIN', v: function (l) { return fmtMin(l.min); }, team: false },
        { h: 'PTS', v: function (l) { return l.pts; }, bold: true },
        { h: 'FG', csv: ['FGM', 'FGA'], v: function (l) { return l.fgm + '-' + l.fga; }, cv: function (l) { return [l.fgm, l.fga]; } },
        { h: 'FG%', v: function (l) { return fmtPct(l.fgm, l.fga); } },
        { h: '3PT', csv: ['3PM', '3PA'], v: function (l) { return l.tpm + '-' + l.tpa; }, cv: function (l) { return [l.tpm, l.tpa]; } },
        { h: '3P%', v: function (l) { return fmtPct(l.tpm, l.tpa); } },
        { h: 'FT', csv: ['FTM', 'FTA'], v: function (l) { return l.ftm + '-' + l.fta; }, cv: function (l) { return [l.ftm, l.fta]; } },
        { h: 'FT%', v: function (l) { return fmtPct(l.ftm, l.fta); } },
        { h: 'OR', csv: ['OREB'], v: function (l) { return l.oreb; } },
        { h: 'DR', csv: ['DREB'], v: function (l) { return l.dreb; } },
        { h: 'REB', v: function (l) { return reb(l); } },
        { h: 'AST', v: function (l) { return l.ast; } },
        { h: 'STL', v: function (l) { return l.stl; } },
        { h: 'BLK', v: function (l) { return l.blk; } },
        { h: 'TO', v: function (l) { return l.to; } },
        { h: 'PF', v: function (l) { return l.pf; }, hi: function (l) { return l.pf >= 5; } },
        { h: '+/-', v: function (l) { return (l.pm > 0 ? '+' : '') + l.pm; }, cv: function (l) { return l.pm; }, team: false }
      ]
    }],
    compare: function (H, A) {
      return [
        { label: 'Field goals', hv: H.fgm + '-' + H.fga + ' (' + fmtPct(H.fgm, H.fga) + '%)', av: A.fgm + '-' + A.fga + ' (' + fmtPct(A.fgm, A.fga) + '%)', hn: pct(H.fgm, H.fga) || 0, an: pct(A.fgm, A.fga) || 0 },
        { label: '3-pointers', hv: H.tpm + '-' + H.tpa + ' (' + fmtPct(H.tpm, H.tpa) + '%)', av: A.tpm + '-' + A.tpa + ' (' + fmtPct(A.tpm, A.tpa) + '%)', hn: pct(H.tpm, H.tpa) || 0, an: pct(A.tpm, A.tpa) || 0 },
        { label: 'Free throws', hv: H.ftm + '-' + H.fta + ' (' + fmtPct(H.ftm, H.fta) + '%)', av: A.ftm + '-' + A.fta + ' (' + fmtPct(A.ftm, A.fta) + '%)', hn: pct(H.ftm, H.fta) || 0, an: pct(A.ftm, A.fta) || 0 },
        { label: 'Rebounds (off)', hv: reb(H) + ' (' + H.oreb + ')', av: reb(A) + ' (' + A.oreb + ')', hn: reb(H), an: reb(A) },
        { label: 'Assists', hv: H.ast, av: A.ast, hn: H.ast, an: A.ast },
        { label: 'Steals', hv: H.stl, av: A.stl, hn: H.stl, an: A.stl },
        { label: 'Blocks', hv: H.blk, av: A.blk, hn: H.blk, an: A.blk },
        { label: 'Turnovers', hv: H.to, av: A.to, hn: H.to, an: A.to, low: true },
        { label: 'Fouls', hv: H.pf, av: A.pf, hn: H.pf, an: A.pf, low: true }
      ];
    },
    card: function (l) { return '<b>' + l.pts + '</b> pts · ' + l.fgm + '/' + l.fga + ' FG<br>' + reb(l) + ' reb · ' + l.ast + ' ast · ' + l.stl + ' stl'; },
    cardCls: function (l) { return l.pf >= 5 ? ' out' : l.pf === 4 ? ' f4' : ''; },
    cardTag: function (l) { return l.pf + ' PF'; }
  };

  /* ---------------------------------------------------------- football */
  SPORTS.football = {
    id: 'football', name: 'Football',
    stats: ['pts', 'pcmp', 'patt', 'pyds', 'ptd', 'pint', 'rush', 'ryds', 'rtd', 'rec', 'recyds', 'rectd',
      'tkl', 'atkl', 'sack', 'tfl', 'dint', 'pd', 'ff', 'fr', 'fum', 'fgm', 'fga', 'xpm', 'xpa', 'twopt', 'saf', 'otd', 'punts', 'puyds'],
    lineup: 0, startLabel: '', clock: true, over: false,
    periods: 4, periodMin: 12, otMin: 12,
    formats: [{ v: 4, t: '4 quarters' }],
    events: {
      pcmp: { label: 'Pass complete', fx: { pcmp: 1, patt: 1, pyds: 'yds' } },
      ptd: { label: 'TD pass', fx: { pcmp: 1, patt: 1, pyds: 'yds', ptd: 1 } },
      pinc: { label: 'Pass incomplete', fx: { patt: 1 } },
      pint: { label: 'Interception thrown', fx: { patt: 1, pint: 1 } },
      rec: { label: 'Reception', fx: { rec: 1, recyds: 'yds' } },
      rectd: { label: 'Receiving TD', fx: { rec: 1, recyds: 'yds', rectd: 1 }, pts: 6 },
      rush: { label: 'Rush', fx: { rush: 1, ryds: 'yds' } },
      rushtd: { label: 'Rushing TD', fx: { rush: 1, ryds: 'yds', rtd: 1 }, pts: 6 },
      fum: { label: 'Fumble lost', fx: { fum: 1 } },
      tkl: { label: 'Tackle', fx: { tkl: 1 } },
      atkl: { label: 'Assisted tackle', fx: { atkl: 1 } },
      sack: { label: 'Sack', fx: { sack: 1 } },
      tfl: { label: 'Tackle for loss', fx: { tfl: 1 } },
      dint: { label: 'Interception', fx: { dint: 1 } },
      pd: { label: 'Pass breakup', fx: { pd: 1 } },
      ff: { label: 'Forced fumble', fx: { ff: 1 } },
      fr: { label: 'Fumble recovery', fx: { fr: 1 } },
      otd: { label: 'Defensive / return TD', fx: { otd: 1 }, pts: 6 },
      fgm: { label: 'FG good', fx: { fgm: 1, fga: 1 }, pts: 3 },
      fgx: { label: 'FG missed', fx: { fga: 1 } },
      xpm: { label: 'XP good', fx: { xpm: 1, xpa: 1 }, pts: 1 },
      xpx: { label: 'XP missed', fx: { xpa: 1 } },
      '2pm': { label: '2-pt conversion', fx: { twopt: 1 }, pts: 2 },
      saf: { label: 'Safety', fx: { saf: 1 }, pts: 2 },
      punt: { label: 'Punt', fx: { punts: 1, puyds: 'yds' } }
    },
    buttons: [
      { t: 'pcmp', label: 'PASS ✓', cls: 'made', key: 'q', flow: 'pass', sub: 'to a receiver' },
      { t: 'pinc', label: 'PASS ✗', cls: 'miss', key: 'w' },
      { t: 'pint', label: 'INT THROWN', cls: 'miss', key: 'e' },
      { t: 'rush', label: 'RUSH', cls: 'made', key: 'r', flow: 'yards', td: 'rushtd', sub: 'yards + TD' },
      { t: 'tkl', label: 'TACKLE', key: 't' }, { t: 'atkl', label: 'AST TKL', key: 'y' },
      { t: 'sack', label: 'SACK', key: 'a' }, { t: 'tfl', label: 'TFL', key: 's' },
      { t: 'dint', label: 'INTERCEPT', key: 'd' }, { t: 'pd', label: 'PASS BRKUP', key: 'f' },
      { t: 'ff', label: 'FORCED FUM', key: 'g' }, { t: 'fr', label: 'FUM REC', key: 'u' },
      { t: 'fum', label: 'FUMBLE LOST', cls: 'miss', key: 'v' }, { t: 'otd', label: 'DEF/RET TD', cls: 'made', key: 'o' },
      { t: 'fgm', label: 'FG ✓', cls: 'made', key: 'i' }, { t: 'fgx', label: 'FG ✗', cls: 'miss', key: 'p' },
      { t: 'xpm', label: 'XP ✓', cls: 'made', key: 'x' }, { t: 'xpx', label: 'XP ✗', cls: 'miss', key: 'c' },
      { t: '2pm', label: '2-PT ✓', cls: 'made', key: 'n' }, { t: 'saf', label: 'SAFETY', key: 'm' },
      { t: 'punt', label: 'PUNT', key: 'l', flow: 'yards', sub: 'yards' }
    ],
    tables: [
      { title: 'Passing', show: function (l) { return l.patt > 0; }, cols: [
        { h: 'C/ATT', csv: ['CMP', 'ATT'], v: function (l) { return l.pcmp + '/' + l.patt; }, cv: function (l) { return [l.pcmp, l.patt]; } },
        { h: 'CMP%', v: function (l) { return fmtPct(l.pcmp, l.patt); } },
        { h: 'YDS', v: function (l) { return l.pyds; }, bold: true }, { h: 'TD', v: function (l) { return l.ptd; } }, { h: 'INT', v: function (l) { return l.pint; } }] },
      { title: 'Rushing', show: function (l) { return l.rush > 0; }, cols: [
        { h: 'ATT', v: function (l) { return l.rush; } }, { h: 'YDS', v: function (l) { return l.ryds; }, bold: true },
        { h: 'AVG', v: function (l) { return avg(l.ryds, l.rush); } }, { h: 'TD', v: function (l) { return l.rtd; } }, { h: 'FUM', v: function (l) { return l.fum; } }] },
      { title: 'Receiving', show: function (l) { return l.rec > 0; }, cols: [
        { h: 'REC', v: function (l) { return l.rec; } }, { h: 'YDS', v: function (l) { return l.recyds; }, bold: true },
        { h: 'AVG', v: function (l) { return avg(l.recyds, l.rec); } }, { h: 'TD', v: function (l) { return l.rectd; } }] },
      { title: 'Defense', show: function (l) { return any(l, ['tkl', 'atkl', 'sack', 'tfl', 'dint', 'pd', 'ff', 'fr']); }, cols: [
        { h: 'SOLO', v: function (l) { return l.tkl; } }, { h: 'AST', v: function (l) { return l.atkl; } }, { h: 'TOT', v: function (l) { return l.tkl + l.atkl; }, bold: true },
        { h: 'SACK', v: function (l) { return l.sack; } }, { h: 'TFL', v: function (l) { return l.tfl; } }, { h: 'INT', v: function (l) { return l.dint; } },
        { h: 'PBU', v: function (l) { return l.pd; } }, { h: 'FF', v: function (l) { return l.ff; } }, { h: 'FR', v: function (l) { return l.fr; } }] },
      { title: 'Kicking & punting', show: function (l) { return any(l, ['fga', 'xpa', 'punts', 'twopt']); }, cols: [
        { h: 'FG', csv: ['FGM', 'FGA'], v: function (l) { return l.fgm + '/' + l.fga; }, cv: function (l) { return [l.fgm, l.fga]; } },
        { h: 'XP', csv: ['XPM', 'XPA'], v: function (l) { return l.xpm + '/' + l.xpa; }, cv: function (l) { return [l.xpm, l.xpa]; } },
        { h: 'PUNTS', v: function (l) { return l.punts; } }, { h: 'PUNT YDS', v: function (l) { return l.puyds; } }, { h: 'AVG', v: function (l) { return avg(l.puyds, l.punts); } }] },
      { title: 'Scoring', show: function (l) { return l.pts > 0; }, cols: [
        { h: 'TD', v: function (l) { return l.rtd + l.rectd + l.otd; } }, { h: 'FG', v: function (l) { return l.fgm; } }, { h: 'XP', v: function (l) { return l.xpm; } },
        { h: '2PT', v: function (l) { return l.twopt; } }, { h: 'SAF', v: function (l) { return l.saf; } }, { h: 'PTS', v: function (l) { return l.pts; }, bold: true }] }
    ],
    compare: function (H, A) {
      var ht = H.pyds + H.ryds, at = A.pyds + A.ryds;
      return [
        { label: 'Total yards', hv: ht, av: at, hn: ht, an: at },
        { label: 'Passing', hv: H.pcmp + '/' + H.patt + ', ' + H.pyds + ' yds', av: A.pcmp + '/' + A.patt + ', ' + A.pyds + ' yds', hn: H.pyds, an: A.pyds },
        { label: 'Rushing', hv: H.rush + ' att, ' + H.ryds + ' yds', av: A.rush + ' att, ' + A.ryds + ' yds', hn: H.ryds, an: A.ryds },
        { label: 'Turnovers', hv: H.pint + H.fum, av: A.pint + A.fum, hn: H.pint + H.fum, an: A.pint + A.fum, low: true },
        { label: 'Sacks', hv: H.sack, av: A.sack, hn: H.sack, an: A.sack },
        { label: 'Tackles for loss', hv: H.tfl, av: A.tfl, hn: H.tfl, an: A.tfl },
        { label: 'Field goals', hv: H.fgm + '/' + H.fga, av: A.fgm + '/' + A.fga, hn: H.fgm, an: A.fgm }
      ];
    },
    card: function (l) {
      var p = [];
      if (l.patt) p.push('Pass ' + l.pcmp + '/' + l.patt + ' ' + l.pyds + 'y' + (l.ptd ? ' ' + l.ptd + 'TD' : ''));
      if (l.rush) p.push('Rush ' + l.rush + '-' + l.ryds + (l.rtd ? ' ' + l.rtd + 'TD' : ''));
      if (l.rec) p.push('Rec ' + l.rec + '-' + l.recyds + (l.rectd ? ' ' + l.rectd + 'TD' : ''));
      if (l.tkl + l.atkl) p.push('Tkl ' + (l.tkl + l.atkl) + (l.sack ? ' · ' + l.sack + ' sk' : ''));
      if (l.fga || l.xpa) p.push('FG ' + l.fgm + '/' + l.fga + ' XP ' + l.xpm + '/' + l.xpa);
      if (l.punts) p.push('Punt ' + l.punts + '-' + l.puyds);
      return (l.pts ? '<b>' + l.pts + '</b> pts<br>' : '') + (p.join(' · ') || '<span style="opacity:.5">no stats yet</span>');
    },
    cardTag: function (l) { return l.pts ? l.pts + ' pts' : ''; }
  };

  /* ---------------------------------------------------------- soccer */
  SPORTS.soccer = {
    id: 'soccer', name: 'Soccer',
    stats: ['min', 'g', 'a', 'sh', 'sot', 'sv', 'fc', 'off', 'ck', 'yc', 'rc', 'og'],
    lineup: 11, pm: false, startLabel: 'Start', startHelp: 'Tick <b>Start</b> for the eleven starters.',
    clock: true, over: true, clockUp: true,
    periods: 2, periodMin: 40, otMin: 10,
    formats: [{ v: 2, t: '2 halves' }],
    assistFor: ['goal'],
    events: {
      goal: { label: 'Goal', fx: { g: 1, sh: 1, sot: 1 }, pts: 1 },
      pkg: { label: 'Penalty goal', fx: { g: 1, sh: 1, sot: 1 }, pts: 1 },
      pkm: { label: 'Penalty missed', fx: { sh: 1 } },
      shot: { label: 'Shot (off target)', fx: { sh: 1 } },
      sot: { label: 'Shot on target', fx: { sh: 1, sot: 1 } },
      save: { label: 'Save', fx: { sv: 1 } },
      ast: { label: 'Assist', fx: { a: 1 } },
      foul: { label: 'Foul committed', fx: { fc: 1 } },
      off: { label: 'Offside', fx: { off: 1 } },
      ck: { label: 'Corner kick', fx: { ck: 1 } },
      yc: { label: 'Yellow card', fx: { yc: 1 } },
      rc: { label: 'Red card', fx: { rc: 1 } },
      og: { label: 'Own goal', fx: { og: 1 }, ptsOpp: 1 }
    },
    buttons: [
      { t: 'goal', label: 'GOAL', cls: 'made', key: 'q' }, { t: 'pkg', label: 'PK GOAL', cls: 'made', key: 'w' },
      { t: 'pkm', label: 'PK MISS', cls: 'miss', key: 'e' }, { t: 'og', label: 'OWN GOAL', cls: 'miss', key: 'r' },
      { t: 'sot', label: 'SHOT ON TGT', key: 't' }, { t: 'shot', label: 'SHOT OFF', key: 'y' },
      { t: 'save', label: 'SAVE', key: 'a' }, { t: 'ast', label: 'ASSIST', key: 's' },
      { t: 'foul', label: 'FOUL', cls: 'foul', key: 'f' }, { t: 'off', label: 'OFFSIDE', key: 'o' },
      { t: 'ck', label: 'CORNER', key: 'c' }, { t: 'yc', label: 'YELLOW', cls: 'foul', key: 'i' },
      { t: 'rc', label: 'RED', cls: 'miss', key: 'p' }, { t: 'sub', label: 'SUB', key: 'u' }
    ],
    tables: [{
      cols: [
        { h: 'MIN', v: function (l) { return Math.round(l.min / 60); }, team: false },
        { h: 'G', v: function (l) { return l.g; }, bold: true }, { h: 'A', v: function (l) { return l.a; } },
        { h: 'SH', v: function (l) { return l.sh; } }, { h: 'SOT', v: function (l) { return l.sot; } },
        { h: 'SV', v: function (l) { return l.sv; } }, { h: 'FC', v: function (l) { return l.fc; } },
        { h: 'OFF', v: function (l) { return l.off; } }, { h: 'CK', v: function (l) { return l.ck; } },
        { h: 'YC', v: function (l) { return l.yc; } }, { h: 'RC', v: function (l) { return l.rc; }, hi: function (l) { return l.rc > 0; } }
      ]
    }],
    compare: function (H, A) {
      return [
        { label: 'Shots (on target)', hv: H.sh + ' (' + H.sot + ')', av: A.sh + ' (' + A.sot + ')', hn: H.sh, an: A.sh },
        { label: 'Corners', hv: H.ck, av: A.ck, hn: H.ck, an: A.ck },
        { label: 'Saves', hv: H.sv, av: A.sv, hn: H.sv, an: A.sv },
        { label: 'Fouls', hv: H.fc, av: A.fc, hn: H.fc, an: A.fc, low: true },
        { label: 'Offsides', hv: H.off, av: A.off, hn: H.off, an: A.off, low: true },
        { label: 'Yellow cards', hv: H.yc, av: A.yc, hn: H.yc, an: A.yc, low: true },
        { label: 'Red cards', hv: H.rc, av: A.rc, hn: H.rc, an: A.rc, low: true }
      ];
    },
    card: function (l) { return '<b>' + l.g + '</b> G · ' + l.a + ' A<br>' + l.sh + ' sh (' + l.sot + ' on) · ' + l.sv + ' sv'; },
    cardCls: function (l) { return l.rc ? ' out' : l.yc ? ' f4' : ''; },
    cardTag: function (l) { return (l.yc ? l.yc + 'Y ' : '') + (l.rc ? l.rc + 'R' : ''); }
  };

  /* ---------------------------------------------------------- volleyball */
  SPORTS.volleyball = {
    id: 'volleyball', name: 'Volleyball',
    stats: ['pts', 'k', 'ta', 'ae', 'ace', 'se', 'ast', 'dig', 'bs', 'ba', 'be', 're'],
    lineup: 0, startLabel: '', clock: false, over: false, perSet: true,
    periods: 5, periodMin: 0, otMin: 0,
    formats: [{ v: 5, t: 'Best of 5 sets' }, { v: 3, t: 'Best of 3 sets' }],
    events: {
      kill: { label: 'Kill', fx: { k: 1, ta: 1 }, pts: 1 },
      atk: { label: 'Attack (no kill)', fx: { ta: 1 } },
      ae: { label: 'Attack error', fx: { ae: 1, ta: 1 }, ptsOpp: 1 },
      ace: { label: 'Ace', fx: { ace: 1 }, pts: 1 },
      se: { label: 'Service error', fx: { se: 1 }, ptsOpp: 1 },
      ast: { label: 'Assist', fx: { ast: 1 } },
      dig: { label: 'Dig', fx: { dig: 1 } },
      bs: { label: 'Block (point)', fx: { bs: 1 }, pts: 1 },
      ba: { label: 'Block assist', fx: { ba: 1 } },
      be: { label: 'Ball-handling error', fx: { be: 1 }, ptsOpp: 1 },
      re: { label: 'Reception error', fx: { re: 1 }, ptsOpp: 1 },
      pt: { label: 'Point (other)', fx: {}, pts: 1 }
    },
    buttons: [
      { t: 'kill', label: 'KILL', cls: 'made', key: 'q' }, { t: 'atk', label: 'ATTACK', key: 'w' },
      { t: 'ae', label: 'ATK ERROR', cls: 'miss', key: 'e' }, { t: 'ace', label: 'ACE', cls: 'made', key: 'r' },
      { t: 'se', label: 'SERVE ERR', cls: 'miss', key: 't' }, { t: 'ast', label: 'ASSIST', key: 'a' },
      { t: 'dig', label: 'DIG', key: 'd' }, { t: 'bs', label: 'BLOCK', cls: 'made', key: 'b', sub: 'point' },
      { t: 'ba', label: 'BLOCK AST', key: 'n', sub: 'no point' }, { t: 'be', label: 'BALL HNDL', cls: 'miss', key: 'v', sub: 'error' },
      { t: 're', label: 'RECEIVE ERR', cls: 'miss', key: 'y' }, { t: 'pt', label: 'POINT', cls: 'made', key: 'p', sub: 'other' }
    ],
    tables: [{
      cols: [
        { h: 'PTS', v: function (l) { return l.pts; }, bold: true },
        { h: 'K', v: function (l) { return l.k; } }, { h: 'ATT', v: function (l) { return l.ta; } }, { h: 'E', v: function (l) { return l.ae; } },
        { h: 'HIT%', v: function (l) { return rate3(l.k - l.ae, l.ta); } },
        { h: 'ACE', v: function (l) { return l.ace; } }, { h: 'SE', v: function (l) { return l.se; } },
        { h: 'AST', v: function (l) { return l.ast; } }, { h: 'DIG', v: function (l) { return l.dig; } },
        { h: 'BS', v: function (l) { return l.bs; } }, { h: 'BA', v: function (l) { return l.ba; } },
        { h: 'BHE', v: function (l) { return l.be; } }, { h: 'RE', v: function (l) { return l.re; } }
      ]
    }],
    compare: function (H, A) {
      var he = H.ae + H.se + H.be + H.re, ae = A.ae + A.se + A.be + A.re;
      return [
        { label: 'Kills', hv: H.k, av: A.k, hn: H.k, an: A.k },
        { label: 'Hitting %', hv: rate3(H.k - H.ae, H.ta), av: rate3(A.k - A.ae, A.ta), hn: H.ta ? (H.k - H.ae) / H.ta : 0, an: A.ta ? (A.k - A.ae) / A.ta : 0 },
        { label: 'Aces', hv: H.ace, av: A.ace, hn: H.ace, an: A.ace },
        { label: 'Blocks (solo + assist)', hv: H.bs + ' + ' + H.ba, av: A.bs + ' + ' + A.ba, hn: H.bs + H.ba / 2, an: A.bs + A.ba / 2 },
        { label: 'Digs', hv: H.dig, av: A.dig, hn: H.dig, an: A.dig },
        { label: 'Assists', hv: H.ast, av: A.ast, hn: H.ast, an: A.ast },
        { label: 'Errors', hv: he, av: ae, hn: he, an: ae, low: true }
      ];
    },
    card: function (l) { return '<b>' + l.pts + '</b> pts · ' + l.k + ' K · ' + l.ace + ' ace<br>' + l.dig + ' dig · ' + l.ast + ' ast · ' + (l.bs + l.ba) + ' blk'; },
    cardTag: function (l) { return l.pts ? l.pts + ' pts' : ''; }
  };

  /* ---------------------------------------------------------- baseball / softball */
  SPORTS.baseball = {
    id: 'baseball', name: 'Baseball / Softball',
    stats: ['ab', 'r', 'h', 'd2', 'd3', 'hr', 'rbi', 'bb', 'k', 'hbp', 'sb', 'cs', 'sac', 'sf', 'e',
      'p_outs', 'p_h', 'p_r', 'p_er', 'p_bb', 'p_k', 'p_hr'],
    lineup: 0, startLabel: 'Start P', startMax: 1, startHelp: 'Tick <b>Start P</b> for the starting pitcher (pitching stats go to the current pitcher).',
    clock: false, over: false, innings: true,
    periods: 7, periodMin: 0, otMin: 0,
    formats: [{ v: 7, t: '7 innings' }, { v: 9, t: '9 innings' }, { v: 6, t: '6 innings' }],
    events: {
      '1b': { label: 'Single', fx: { ab: 1, h: 1, rbi: 'rbi' }, chg: { p_h: 1 } },
      '2b': { label: 'Double', fx: { ab: 1, h: 1, d2: 1, rbi: 'rbi' }, chg: { p_h: 1 } },
      '3b': { label: 'Triple', fx: { ab: 1, h: 1, d3: 1, rbi: 'rbi' }, chg: { p_h: 1 } },
      hr: { label: 'Home run', fx: { ab: 1, h: 1, hr: 1, rbi: 'rbi' }, chg: { p_h: 1, p_hr: 1 } },
      bb: { label: 'Walk', fx: { bb: 1, rbi: 'rbi' }, chg: { p_bb: 1 } },
      hbp: { label: 'Hit by pitch', fx: { hbp: 1, rbi: 'rbi' } },
      k: { label: 'Strikeout', fx: { ab: 1, k: 1 }, outs: 1, chg: { p_k: 1, p_outs: 1 } },
      out: { label: 'Out in play', fx: { ab: 1 }, outs: 1, chg: { p_outs: 1 } },
      dp: { label: 'Double play', fx: { ab: 1 }, outs: 2, chg: { p_outs: 2 } },
      fc: { label: "Fielder's choice", fx: { ab: 1 }, outs: 1, chg: { p_outs: 1 } },
      roe: { label: 'Reached on error', fx: { ab: 1 } },
      sf: { label: 'Sacrifice fly', fx: { sf: 1, rbi: 'rbi' }, outs: 1, chg: { p_outs: 1 } },
      sac: { label: 'Sacrifice bunt', fx: { sac: 1 }, outs: 1, chg: { p_outs: 1 } },
      run: { label: 'Run scored', fx: { r: 1 }, pts: 1, chg: { p_r: 1, p_er: 1 } },
      sb: { label: 'Stolen base', fx: { sb: 1 } },
      cs: { label: 'Caught stealing', fx: { cs: 1 }, outs: 1, chg: { p_outs: 1 } },
      err: { label: 'Error', fx: { e: 1 }, fielding: true },
      pch: { label: 'Pitching change', special: 'pch' }
    },
    buttons: [
      { t: '1b', label: 'SINGLE', cls: 'made', key: 'q', flow: 'rbi' }, { t: '2b', label: 'DOUBLE', cls: 'made', key: 'w', flow: 'rbi' },
      { t: '3b', label: 'TRIPLE', cls: 'made', key: 'e', flow: 'rbi' }, { t: 'hr', label: 'HOME RUN', cls: 'made', key: 'r', flow: 'hr' },
      { t: 'bb', label: 'WALK', key: 't' }, { t: 'hbp', label: 'HBP', key: 'y' },
      { t: 'k', label: 'STRIKEOUT', cls: 'miss', key: 'a' }, { t: 'out', label: 'OUT', cls: 'miss', key: 's', sub: 'in play' },
      { t: 'dp', label: 'DBL PLAY', cls: 'miss', key: 'd' }, { t: 'fc', label: "FIELD CHOICE", key: 'f' },
      { t: 'roe', label: 'REACH ERR', key: 'g' }, { t: 'sf', label: 'SAC FLY', key: 'u', flow: 'rbi' },
      { t: 'sac', label: 'SAC BUNT', key: 'i' }, { t: 'run', label: 'RUN', cls: 'made', key: 'o', sub: 'earned' },
      { t: 'run', label: 'RUN', key: 'p', extra: { ue: 1 }, sub: 'unearned', id: 'run_ue' }, { t: 'sb', label: 'STOLEN BASE', key: 'c' },
      { t: 'cs', label: 'CAUGHT STEAL', cls: 'miss', key: 'x' }, { t: 'err', label: 'ERROR', cls: 'foul', key: 'v', sub: 'fielder' },
      { t: 'pch', label: 'PITCHER CHANGE', key: 'b', flow: 'pch', nosel: true, cls: 'wide' }
    ],
    tables: [
      { title: 'Batting', show: function (l) { return any(l, ['ab', 'bb', 'hbp', 'r', 'sb', 'cs', 'sac', 'sf', 'e']); }, cols: [
        { h: 'AB', v: function (l) { return l.ab; } }, { h: 'R', v: function (l) { return l.r; } }, { h: 'H', v: function (l) { return l.h; }, bold: true },
        { h: '2B', v: function (l) { return l.d2; } }, { h: '3B', v: function (l) { return l.d3; } }, { h: 'HR', v: function (l) { return l.hr; } },
        { h: 'RBI', v: function (l) { return l.rbi; } }, { h: 'BB', v: function (l) { return l.bb; } }, { h: 'K', v: function (l) { return l.k; } },
        { h: 'SB', v: function (l) { return l.sb; } }, { h: 'E', v: function (l) { return l.e; } }, { h: 'AVG', v: function (l) { return rate3(l.h, l.ab); } }] },
      { title: 'Pitching', show: function (l) { return any(l, ['p_outs', 'p_h', 'p_r', 'p_bb', 'p_k']); }, cols: [
        { h: 'IP', v: function (l) { return ip(l.p_outs); }, bold: true }, { h: 'H', v: function (l) { return l.p_h; } }, { h: 'R', v: function (l) { return l.p_r; } },
        { h: 'ER', v: function (l) { return l.p_er; } }, { h: 'BB', v: function (l) { return l.p_bb; } }, { h: 'K', v: function (l) { return l.p_k; } }, { h: 'HR', v: function (l) { return l.p_hr; } }] }
    ],
    compare: function (H, A) {
      return [
        { label: 'Hits', hv: H.h, av: A.h, hn: H.h, an: A.h },
        { label: 'Walks', hv: H.bb, av: A.bb, hn: H.bb, an: A.bb },
        { label: 'Strikeouts (batting)', hv: H.k, av: A.k, hn: H.k, an: A.k, low: true },
        { label: 'Home runs', hv: H.hr, av: A.hr, hn: H.hr, an: A.hr },
        { label: 'Stolen bases', hv: H.sb, av: A.sb, hn: H.sb, an: A.sb },
        { label: 'Errors', hv: H.e, av: A.e, hn: H.e, an: A.e, low: true }
      ];
    },
    card: function (l) {
      var p = [];
      if (l.ab || l.bb || l.hbp) p.push('<b>' + l.h + '-' + l.ab + '</b>' + (l.r ? ' · ' + l.r + ' R' : '') + (l.rbi ? ' · ' + l.rbi + ' RBI' : '') + (l.bb ? ' · ' + l.bb + ' BB' : '') + (l.k ? ' · ' + l.k + ' K' : ''));
      else if (l.r) p.push(l.r + ' R');
      if (l.p_outs || l.p_h || l.p_bb) p.push(ip(l.p_outs) + ' IP · ' + l.p_h + ' H · ' + l.p_r + ' R · ' + l.p_k + ' K');
      return p.join('<br>') || '<span style="opacity:.5">no stats yet</span>';
    },
    cardTag: function (l) { return l.e ? l.e + ' E' : ''; }
  };

  var ORDER = ['basketball', 'football', 'baseball', 'volleyball', 'soccer'];

  function sportDef(g) {
    var id = typeof g === 'string' ? g : (g && g.sport) || 'basketball';
    return SPORTS[id] || SPORTS.basketball;
  }

  // ---------- settings / games ----------
  function defaultSettings(sport) {
    var d = sportDef(sport || 'basketball');
    return { periods: d.periods, periodMin: d.periodMin, otMin: d.otMin, assistPrompt: true, keepSelected: false, syncScorebug: true, useScorebugClock: true, autoMatch: true, quick: true };
  }

  function newGame(opts) {
    opts = opts || {};
    var now = Date.now(), sport = SPORTS[opts.sport] ? opts.sport : 'basketball', d = SPORTS[sport];
    var g = {
      id: uid(), createdAt: now, updatedAt: now, sport: sport,
      date: opts.date || new Date(now - new Date(now).getTimezoneOffset() * 60000).toISOString().slice(0, 10),
      title: opts.title || '',
      settings: Object.assign(defaultSettings(sport), opts.settings || {}),
      teams: {
        home: { name: 'HOME', abbr: 'HOM', players: [], starters: [] },
        away: { name: 'AWAY', abbr: 'AWY', players: [], starters: [] }
      },
      events: [],
      period: 1,
      half: 'top',
      local: { ms: null, running: false, anchor: 0 }
    };
    if (opts.teams) {
      ['home', 'away'].forEach(function (s) { if (opts.teams[s]) Object.assign(g.teams[s], opts.teams[s]); });
    }
    if (g.local.ms == null) g.local.ms = g.settings.periodMin * 60000;
    return g;
  }

  // ---------- time ----------
  function periodLenSec(g, period) {
    var s = g.settings;
    return (period > s.periods ? s.otMin : s.periodMin) * 60;
  }

  function baseSec(g, period) {
    var s = g.settings;
    return period <= s.periods ? (period - 1) * s.periodMin * 60
      : s.periods * s.periodMin * 60 + (period - s.periods - 1) * s.otMin * 60;
  }

  /** seconds into the current period when the clock shows clockMs REMAINING (can go past the period length in soccer stoppage time) */
  function within(g, period, clockMs) {
    var def = sportDef(g), len = periodLenSec(g, period);
    var left = Math.min(len, (clockMs == null ? len * 1000 : clockMs) / 1000);
    if (!def.over) left = Math.max(0, left);
    return len - left;
  }

  /** seconds of game time elapsed when the clock shows clockMs remaining in `period` (used for minutes played) */
  function elapsed(g, period, clockMs) {
    var def = sportDef(g);
    if (!def.clock) return 0;
    var s = g.settings, len = periodLenSec(g, period), w = within(g, period, clockMs);
    if (def.over && (period < s.periods || period === s.periods + 1)) w = Math.min(w, len); // keep times in order across the half-time break
    return Math.round((baseSec(g, period) + w) * 10) / 10;
  }

  function periodLabel(g, p) {
    var d = sportDef(g), n = g.settings.periods;
    if (d.id === 'volleyball') return 'S' + p;
    if (d.id === 'baseball') return String(p);
    if (d.id === 'soccer') return p <= n ? 'H' + p : p <= n + 2 ? 'ET' + (p - n) : 'PENS';
    if (p <= n) return (n === 2 ? 'H' : 'Q') + p;
    return p - n === 1 ? 'OT' : (p - n) + 'OT';
  }

  function clockLabel(ms) {
    var t = Math.max(0, Math.ceil(ms / 1000));
    return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2);
  }

  /** soccer-style match time ("47:12", always counting up) for a remaining-time clock reading */
  function matchClock(g, period, clockMs) {
    var t = Math.max(0, Math.floor(baseSec(g, period) + within(g, period, clockMs)));
    return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2);
  }

  /** where an event happened, as text: "Q2 5:30", "34'", "45+2'", "TOP 3", "S2" */
  function stamp(g, e) {
    var d = sportDef(g), p = e.period || 1;
    if (d.id === 'baseball') return (e.half === 'bot' ? 'BOT ' : 'TOP ') + p;
    if (d.id === 'volleyball') return 'S' + p;
    if (d.id === 'soccer') {
      var len = periodLenSec(g, p), w = e.w != null ? e.w : within(g, p, e.clockMs), bm = baseSec(g, p) / 60;
      if (w >= len)
        return (bm + len / 60) + '+' + (Math.floor((w - len) / 60) + 1) + "'";
      return (bm + Math.floor(w / 60) + 1) + "'";
    }
    return periodLabel(g, p) + ' ' + clockLabel(e.clockMs);
  }

  function half(g, period) {
    var n = g.settings.periods;
    return period <= n / 2 ? 1 : 2; // overtime counts with the second half
  }

  // ---------- roster helpers ----------
  function findPlayer(g, side, pid) {
    var ps = g.teams[side].players;
    for (var i = 0; i < ps.length; i++) if (ps[i].id === pid) return ps[i];
    return null;
  }

  function otherSide(s) { return s === 'home' ? 'away' : 'home'; }

  function playerLabel(g, side, pid) {
    if (pid === TEAM) return 'TEAM';
    var p = findPlayer(g, side, pid);
    if (!p) return '?';
    return '#' + p.num + (p.name ? ' ' + p.name : '');
  }

  // ---------- compute ----------
  function blank(g) {
    var o = {};
    sportDef(g || 'basketball').stats.forEach(function (k) { o[k] = 0; });
    return o;
  }

  /** baseball: the team batting in the current half-inning */
  function battingSide(g) { return g.half === 'bot' ? 'home' : 'away'; }

  /** Everything derived from the event list: stat lines, score, line score, who is on the court, team fouls, outs, pitchers.
   *  `nowT` = elapsed seconds "now" (for live minutes). */
  function compute(g, nowT) {
    var def = sportDef(g);
    var out = {
      sport: def.id,
      sides: {},
      score: { home: 0, away: 0 },
      cur: { home: 0, away: 0 },    // the score shown in the score bar (volleyball: points in the current set)
      sets: { home: 0, away: 0 },   // volleyball sets won so far
      byPeriod: { home: [], away: [] },
      onCourt: { home: [], away: [] },
      teamFouls: { home: {}, away: {} }, // basketball: by period (a quarter, a half or one overtime)
      outs: { home: {}, away: {} },      // baseball: outs made by each team, by inning
      pitcher: { home: null, away: null },
      lastT: 0
    };
    var inAt = { home: {}, away: {} };
    var hasPts = def.stats.indexOf('pts') >= 0;
    ['home', 'away'].forEach(function (side) {
      var st = { players: {}, totals: blank(g), team: blank(g) };
      g.teams[side].players.forEach(function (p) { st.players[p.id] = blank(g); });
      out.sides[side] = st;
      var on = [];
      if (def.lineup) (g.teams[side].starters || []).forEach(function (pid) { if (st.players[pid] && on.indexOf(pid) < 0 && on.length < def.lineup) { on.push(pid); inAt[side][pid] = 0; } });
      out.onCourt[side] = on;
      if (def.id === 'baseball') { var sp = (g.teams[side].starters || [])[0]; out.pitcher[side] = sp && st.players[sp] ? sp : null; }
    });

    function addScore(side, pts, period, noPm) {
      out.score[side] += pts;
      var pi = (period || 1) - 1;
      out.byPeriod[side][pi] = (out.byPeriod[side][pi] || 0) + pts;
      if (def.pm && !noPm) {
        out.onCourt[side].forEach(function (pid) { out.sides[side].players[pid].pm += pts; });
        var os = otherSide(side);
        out.onCourt[os].forEach(function (pid) { out.sides[os].players[pid].pm -= pts; });
      }
    }

    var maxT = 0;
    g.events.forEach(function (e) {
      var side = e.side, st = out.sides[side];
      if (!st) return;
      if (e.t > maxT) maxT = e.t;
      var on = out.onCourt[side];
      if (e.type === 'sub') {
        if (!def.lineup) return;
        if (e.out && on.indexOf(e.out) >= 0) {
          var o = st.players[e.out];
          if (o) o.min += Math.max(0, e.t - (inAt[side][e.out] || 0));
          on.splice(on.indexOf(e.out), 1);
          delete inAt[side][e.out];
        }
        if (e.pid && st.players[e.pid] && on.indexOf(e.pid) < 0) {
          on.push(e.pid);
          inAt[side][e.pid] = e.t;
        }
        return;
      }
      if (e.type === 'adj') { addScore(side, e.pts || 0, e.period, true); return; } // scorebug correction: team score only, no player credit
      var ed = def.events[e.type];
      if (!ed) return;
      if (ed.special === 'pch') { if (st.players[e.pid]) out.pitcher[side] = e.pid; return; }
      var line = e.pid === TEAM ? st.team : st.players[e.pid];
      if (!line) return;
      if (ed.fx) Object.keys(ed.fx).forEach(function (k) {
        var v = ed.fx[k];
        if (v === 'yds') v = e.yds || 0; else if (v === 'rbi') v = e.rbi || 0;
        if (line[k] !== undefined) line[k] += v;
      });
      if (ed.pts) { if (hasPts) line.pts += ed.pts; addScore(side, ed.pts, e.period); }
      if (ed.ptsOpp) addScore(otherSide(side), ed.ptsOpp, e.period);
      if (ed.chg) {
        var fs = ed.fielding ? side : otherSide(side), pid = out.pitcher[fs];
        var pl = pid ? out.sides[fs].players[pid] : out.sides[fs].team;
        Object.keys(ed.chg).forEach(function (k) { if (k === 'p_er' && e.ue) return; pl[k] += ed.chg[k]; });
      }
      if (ed.outs) out.outs[side][e.period || 1] = (out.outs[side][e.period || 1] || 0) + ed.outs;
      if (ed.tf) out.teamFouls[side][e.period || 1] = (out.teamFouls[side][e.period || 1] || 0) + 1;
    });

    out.lastT = maxT;
    var endT = Math.max(nowT == null ? 0 : nowT, maxT);
    ['home', 'away'].forEach(function (side) {
      var st = out.sides[side];
      if (def.lineup) out.onCourt[side].forEach(function (pid) { st.players[pid].min += Math.max(0, endT - (inAt[side][pid] || 0)); });
      var tot = blank(g);
      var all = Object.keys(st.players).map(function (k) { return st.players[k]; }).concat([st.team]);
      all.forEach(function (l) { Object.keys(tot).forEach(function (k) { if (k !== 'min' && k !== 'pm') tot[k] += l[k]; }); });
      st.totals = tot;
      for (var i = 0; i < out.byPeriod[side].length; i++) if (out.byPeriod[side][i] == null) out.byPeriod[side][i] = 0;
    });
    // volleyball: sets won = completed sets; the bar shows the set in progress
    if (def.perSet) {
      var cp = g.period || 1;
      for (var p = 1; p < cp; p++) {
        var h = out.byPeriod.home[p - 1] || 0, a = out.byPeriod.away[p - 1] || 0;
        if (h > a) out.sets.home++; else if (a > h) out.sets.away++;
      }
      ['home', 'away'].forEach(function (side) { out.cur[side] = out.byPeriod[side][cp - 1] || 0; });
    } else {
      out.cur.home = out.score.home; out.cur.away = out.score.away;
    }
    return out;
  }

  /** basketball: team fouls in the current period (resets every quarter, half and overtime) */
  function fouls(g, comp, side, period) {
    return comp.teamFouls[side][period] || 0;
  }

  function outsNow(g, comp) {
    return (comp.outs[battingSide(g)][g.period || 1] || 0);
  }

  // ---------- events ----------
  /** ctx: { period, clockMs, half }. extra fields (out, grp, yds, rbi, ue) pass through. */
  function makeEvent(g, side, pid, type, ctx, extra) {
    var e = {
      id: uid(), side: side, pid: pid, type: type,
      period: ctx.period, clockMs: ctx.clockMs,
      t: elapsed(g, ctx.period, ctx.clockMs), at: Date.now()
    };
    if (sportDef(g).clock && ctx.clockMs != null) e.w = Math.round(within(g, ctx.period, ctx.clockMs) * 10) / 10;
    if (sportDef(g).id === 'baseball') e.half = ctx.half || g.half || 'top';
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }

  function addEvents(g, evs) {
    evs.forEach(function (e) { g.events.push(e); });
    g.updatedAt = Date.now();
    return evs;
  }

  /** remove the newest event (and anything grouped with it, e.g. a basket + its assist). Returns removed events. */
  function undo(g) {
    if (!g.events.length) return [];
    var last = g.events[g.events.length - 1];
    return removeEvent(g, last.id);
  }

  function removeEvent(g, id) {
    var target = null;
    g.events.forEach(function (e) { if (e.id === id) target = e; });
    if (!target) return [];
    var removed = g.events.filter(function (e) { return e.id === id || (target.grp && e.grp === target.grp); });
    g.events = g.events.filter(function (e) { return removed.indexOf(e) < 0; });
    g.updatedAt = Date.now();
    return removed;
  }

  /** points this event adds to each team's score (for the running score in play-by-play) */
  function scoreDelta(g, e) {
    var d = { home: 0, away: 0 }, ed = sportDef(g).events[e.type];
    if (e.type === 'adj' && e.side) { d[e.side] += e.pts || 0; return d; }
    if (!ed || !e.side) return d;
    if (ed.pts) d[e.side] += ed.pts;
    if (ed.ptsOpp) d[otherSide(e.side)] += ed.ptsOpp;
    return d;
  }

  function describe(g, e) {
    var def = sportDef(g);
    if (e.type === 'sub') {
      var inn = e.pid ? playerLabel(g, e.side, e.pid) : '';
      var outp = e.out ? playerLabel(g, e.side, e.out) : '';
      return 'SUB ' + (inn ? 'in ' + inn : '') + (inn && outp ? ', ' : '') + (outp ? 'out ' + outp : '');
    }
    if (e.type === 'adj') return 'Score corrected to match scorebug (' + (e.pts > 0 ? '+' : '') + e.pts + ')';
    var ed = def.events[e.type] || {};
    if (ed.special === 'pch') return 'Pitching change: ' + playerLabel(g, e.side, e.pid) + ' now pitching';
    var tail = '';
    if (e.yds != null && /yds/.test(JSON.stringify(ed.fx || {}))) tail += ' (' + e.yds + ' yd' + (Math.abs(e.yds) === 1 ? '' : 's') + ')';
    if (e.rbi) tail += ' (' + e.rbi + ' RBI)';
    if (e.ue) tail += ' (unearned)';
    return playerLabel(g, e.side, e.pid) + ' — ' + (ed.label || e.type) + tail;
  }

  // ---------- export ----------
  function csvCell(v) {
    v = String(v == null ? '' : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }

  function boxRows(g, comp, side) {
    var st = comp.sides[side];
    return g.teams[side].players.slice().sort(function (a, b) {
      return (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0);
    }).map(function (p) { return { id: p.id, num: p.num, name: p.name, pos: p.pos, l: st.players[p.id] }; });
  }

  function csvHead(tb) {
    var h = [];
    tb.cols.forEach(function (c) { (c.csv || [c.h]).forEach(function (x) { h.push(x); }); });
    return h;
  }
  function csvVals(tb, l, isTeam) {
    var r = [];
    tb.cols.forEach(function (c) {
      var n = (c.csv || [c.h]).length;
      if (isTeam && c.team === false) { for (var i = 0; i < n; i++) r.push(''); return; }
      var v = c.cv ? c.cv(l) : c.v(l);
      if (Array.isArray(v)) v.forEach(function (x) { r.push(x); }); else r.push(v);
    });
    return r;
  }

  function toCSV(g, nowT) {
    var def = sportDef(g), comp = compute(g, nowT), out = [];
    def.tables.forEach(function (tb, ti) {
      if (ti) out.push('');
      if (tb.title && def.tables.length > 1) out.push(csvCell(tb.title));
      out.push((['Team', '#', 'Player'].concat(csvHead(tb))).map(csvCell).join(','));
      ['home', 'away'].forEach(function (side) {
        var nm = g.teams[side].name;
        boxRows(g, comp, side).forEach(function (r) {
          if (tb.show && !tb.show(r.l)) return;
          out.push([nm, r.num, r.name].concat(csvVals(tb, r.l, false)).map(csvCell).join(','));
        });
        out.push([nm, '', 'TEAM (unassigned)'].concat(csvVals(tb, comp.sides[side].team, true)).map(csvCell).join(','));
        out.push([nm, '', 'TOTAL'].concat(csvVals(tb, comp.sides[side].totals, true)).map(csvCell).join(','));
      });
    });
    return out.join('\r\n');
  }

  var api = {
    TEAM: TEAM, SPORTS: SPORTS, ORDER: ORDER, sportDef: sportDef,
    uid: uid, defaultSettings: defaultSettings, newGame: newGame,
    elapsed: elapsed, within: within, baseSec: baseSec, periodLenSec: periodLenSec, periodLabel: periodLabel, clockLabel: clockLabel, matchClock: matchClock,
    stamp: stamp, half: half, battingSide: battingSide, outsNow: outsNow,
    findPlayer: findPlayer, otherSide: otherSide, playerLabel: playerLabel,
    compute: compute, fouls: fouls, pct: pct, fmtPct: fmtPct, fmtMin: fmtMin, reb: reb, blank: blank, ip: ip,
    makeEvent: makeEvent, addEvents: addEvents, undo: undo, removeEvent: removeEvent, describe: describe, scoreDelta: scoreDelta,
    boxRows: boxRows, toCSV: toCSV
  };
  // backwards-compatible handles used by older code / tests
  api.LABEL = (function () { var o = {}; Object.keys(SPORTS.basketball.events).forEach(function (k) { o[k] = SPORTS.basketball.events[k].label; }); o.sub = 'Substitution'; return o; })();
  api.SHOT = (function () { var o = {}; ['2m', '2x', '3m', '3x', 'ftm', 'ftx'].forEach(function (k) { var d = SPORTS.basketball.events[k], x = {}; Object.keys(d.fx).forEach(function (f) { x[f] = d.fx[f]; }); if (d.pts) x.pts = d.pts; o[k] = x; }); return o; })();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StatEngine = api;
})(typeof window !== 'undefined' ? window : this);
