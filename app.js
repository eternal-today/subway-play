// 지하철 놀이 — 화면, 자동운행, 여행
Settings.load();
Net.build(lineData);
Voice.init();

const LINE_KEYS = ['1','1_2','2','3','4','5','5_2','6','7','8','9','경의중앙','경춘','공항철도'];
const BASE_LINES = ['1','2','3','4','5','6','7','8','9','경의중앙','경춘','공항철도'];
const BRANCH_LABEL = { '1':'인천', '1_2':'신창', '5':'하남', '5_2':'마천' };
const LED_IDLE = '안전하고 편리한 지하철을 이용해 주셔서 감사합니다.';

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
};
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));

const App = {
  line: '6', viewLine: '6', mode: 'line', sel: 0,
  ridden: store.get('riddenLines', []), completions: store.get('lineCompletions', {}), recent: store.get('recentTrips', []),
  playCount: 0, nextRandom: 5 + Math.floor(Math.random() * 4),
  run: null, speaking: null,
  routeSids: null, routeMarks: {},          // 지도에 경로 표시용
  trip: { from: null, to: null, route: null }
};
try { const s = localStorage.getItem('lastLine'); if (s && lineData[s.replace(/"/g, '')]) App.line = App.viewLine = s.replace(/"/g, ''); } catch (_) {}

let token = 0;
const aliveFn = t => () => t === token;

// ── 공통 그리기 ───────────────────────────────
function badgeHTML(key, opts = {}) {
  const m = meta(key);
  const tag = opts.button ? 'button' : 'span';
  return `<${tag} class="tb${opts.button ? ' go-line' : ''}" ${opts.data || ''} style="background:${m.color}" title="${esc(m.ko)}">${esc(m.badge)}</${tag}>`;
}
const lineBadgeHTML = key => `<span class="tb" style="background:${lineData[key].color}">${esc(lineData[key].badge)}</span>`;
function setLineColor(key) { document.documentElement.style.setProperty('--c', lineData[key].color); }

function setLed(text) {
  const el = $('ledText'), box = el.parentElement;
  el.classList.remove('scroll'); el.textContent = text;
  requestAnimationFrame(() => {
    if (el.scrollWidth > box.clientWidth - 30) {
      el.style.setProperty('--from', box.clientWidth + 'px');
      el.style.setProperty('--dur', Math.max(8, text.length * 0.3) + 's');
      el.classList.add('scroll');
    }
  });
}

function renderBrand() {
  const b = $('brandBadge'), ld = lineData[App.viewLine];
  b.textContent = ld.badge; b.style.background = ld.color;
  if (App.ridden.includes(Net.baseOf(App.viewLine))) b.insertAdjacentHTML('beforeend', '<span class="star">⭐</span>');
}

function renderChips() {
  $('lineChips').innerHTML = LINE_KEYS.map(k => {
    const ld = lineData[k], star = App.ridden.includes(Net.baseOf(k)) ? '<span class="star">⭐</span>' : '';
    const label = BRANCH_LABEL[k] || (ld.badge.length > 1 ? '' : '');
    return `<button class="chip${k === App.viewLine ? ' on' : ''}" data-line="${k}" style="--cc:${ld.color}" title="${esc(ld.name)}">
      <span class="cb">${esc(ld.badge)}</span>${label ? esc(label) : ''}${star}</button>`;
  }).join('');
}

// ── 세로 노선도 ───────────────────────────────
function stationRowHTML(line, idx, flags) {
  const s = lineData[line].stations[idx], sid = Net.sidOf(line, idx);
  const trs = Net.transfersAt(line, sid);
  const cls = ['st'];
  if (trs.length) cls.push('xfer');
  if (flags.end) cls.push('end');
  if (flags.first) cls.push('first');
  if (flags.last) cls.push('last');
  if (App.routeSids) cls.push(App.routeSids.has(sid) ? 'route' : 'off');
  const mark = App.routeMarks[sid] ? `<span class="route-tag">${App.routeMarks[sid]}</span>` : '';
  const branch = s.branchKo ? ' 🔀' : '';
  const badges = trs.map(t => {
    const target = targetLineFor(t, sid);
    return badgeHTML(t, target ? { button: true, data: `data-go="${target}" data-sid="${sid}"` } : {});
  }).join('');
  return `<div class="${cls.join(' ')}" data-idx="${idx}">
    <div class="dot"></div>
    <div class="nm"><div class="ko">${esc(s.name)}${branch}${mark}</div><div class="en">${esc(s.nameEn)}</div>
    ${badges ? `<div class="trs">${badges}</div>` : ''}</div></div>`;
}
// 환승 뱃지를 눌렀을 때 갈 노선 (그 역이 들어있는 노선 우선)
function targetLineFor(base, sid) {
  const keys = LINE_KEYS.filter(k => Net.baseOf(k) === base);
  if (!keys.length) return null;
  return keys.find(k => Net.idxOn(k, sid) >= 0) || keys[0];
}

function renderRail() {
  const L = App.viewLine, ld = lineData[L], N = ld.stations.length;
  setLineColor(L); renderBrand(); renderChips();
  const lp = Net.loopInfo(L);
  let html = '';
  if (L === '2') html += `<div class="loop-note" style="margin:6px 0 4px 20px">🔁 순환선이에요. 충정로 다음은 다시 시청이에요.</div>`;
  if (lp) {
    html += `<div class="loop-box"><div class="loop-label">🔁 응암순환 (한 방향)</div>`;
    for (let i = lp.ls; i <= lp.le; i++) html += stationRowHTML(L, i, { first: i === lp.ls, last: i === lp.le });
    html += `</div><div class="loop-note">↕ 응암과 새절이 이어져 있어요</div>`;
    for (let i = lp.mf; i < N; i++) html += stationRowHTML(L, i, { first: i === lp.mf, last: i === N - 1, end: i === N - 1 });
  } else {
    for (let i = 0; i < N; i++) {
      const loop = L === '2';
      html += stationRowHTML(L, i, { first: !loop && i === 0, last: !loop && i === N - 1, end: !loop && (i === 0 || i === N - 1) });
    }
  }
  $('map').innerHTML = html;
  renderRailTitle();
}

function renderRailTitle() {
  const ld = lineData[App.viewLine];
  if (App.mode === 'trip' && App.trip.route) {
    const segLines = [...new Set(App.trip.route.segments.map(s => s.line))];
    $('railTitle').innerHTML = `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">여행 경로 노선 보기 ${
      segLines.map(k => `<button class="chip${k === App.viewLine ? ' on' : ''}" data-view="${k}" style="--cc:${lineData[k].color}"><span class="cb">${esc(lineData[k].badge)}</span>${BRANCH_LABEL[k] ? esc(BRANCH_LABEL[k]) : ''}</button>`).join('')}</div>`;
  } else {
    $('railTitle').textContent = `${ld.name} · ${ld.stations.length}개 역`;
  }
}

function rowOf(idx) { return $('map').querySelector(`.st[data-idx="${idx}"]`); }
function markRow(idx, cls, scroll) {
  $('map').querySelectorAll('.st.' + cls).forEach(el => el.classList.remove(cls));
  const r = rowOf(idx);
  if (r) { r.classList.add(cls); if (scroll) r.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
}
function showLine(line, force) {
  if (App.viewLine !== line || force) { App.viewLine = line; renderRail(); }
}

// ── 역명판 ───────────────────────────────────
function renderSign(line, idx, o = {}) {
  const ld = lineData[line], s = ld.stations[idx], sid = Net.sidOf(line, idx);
  setLineColor(line);
  const b = $('signBadge'); b.textContent = ld.badge; b.classList.toggle('small', ld.badge.length > 1);
  $('signName').textContent = s.name;
  $('signEn').textContent = s.nameEn;
  $('signTr').innerHTML = Net.transfersAt(line, sid).map(t => badgeHTML(t)).join('');
  $('signPrev').textContent = o.prev ? '‹ ' + o.prev : '';
  $('signNext').textContent = o.next ? o.next + ' ›' : '';
  $('signDir').textContent = o.dir || '';
  const sign = $('sign'); sign.classList.remove('flash'); void sign.offsetWidth; sign.classList.add('flash');
}
function renderSignIdle() {
  const L = App.viewLine, idx = Math.min(App.sel, lineData[L].stations.length - 1);
  const nb = Net.displayNeighbors(L, idx), st = lineData[L].stations;
  renderSign(L, idx, { prev: nb.prev != null ? st[nb.prev].name : '', next: nb.next != null ? st[nb.next].name : '' });
  renderIdleStrip(L, idx);
}

// ── 가로 노선 띠 ───────────────────────────────
function renderStrip(items, curPos) {
  const el = $('strip');
  el.innerHTML = items.map((it, k) => `<div class="sp ${it.cls || ''}" style="--pc:${it.color}">
      ${k < items.length - 1 ? `<span class="seg" style="--sc:${items[k + 1].segColor || 'transparent'}"></span>` : ''}
      <span class="d"></span><span class="n">${esc(it.name)}</span></div>`).join('') + '<span class="train-chip" id="trainChip">🚇</span>';
  placeChip(curPos, false);
}
function placeChip(pos, animate) {
  const chip = $('trainChip'), sp = $('strip').querySelectorAll('.sp')[pos];
  if (!chip || !sp) return;
  if (!animate) chip.style.transition = 'none';
  chip.style.left = (sp.offsetLeft + sp.offsetWidth / 2) + 'px';
  if (!animate) { void chip.offsetWidth; chip.style.transition = ''; }
}
function renderIdleStrip(line, idx) {
  const st = lineData[line].stations, color = lineData[line].color, items = [];
  const back = Net.displayNeighbors(line, idx).prev;
  if (back != null) items.push({ name: st[back].name, color, cls: 'past', segColor: color });
  const curPos = items.length;
  let i = idx;
  for (let k = 0; k < 6 && i != null; k++) {
    items.push({ name: st[i].name, color, cls: (k === 0 ? 'cur' : '') + (Net.transfersAt(line, Net.sidOf(line, i)).length ? ' xfer' : ''), segColor: color });
    i = Net.displayNeighbors(line, i).next;
    if (i === idx) break;
  }
  renderStrip(items, curPos);
}
function renderRunStrip(route, i) {
  const steps = route.steps, from = Math.max(0, i - 1), to = Math.min(steps.length - 1, i + 5), items = [];
  for (let k = from; k <= to; k++) {
    const s = steps[k], ln = s.arrive || s.depart, color = lineData[ln].color;
    const cls = [k < i ? 'past' : '', k === i ? 'cur' : '', (s.arrive && s.depart && s.arrive !== s.depart) ? 'xfer' : ''].join(' ');
    items.push({ name: Net.station(s.sid).name, color: k === i && s.depart ? lineData[s.depart].color : color, cls, segColor: s.arrive ? lineData[s.arrive].color : color });
  }
  renderStrip(items, i - from);
  return i - from;
}

// ── 노선 모드: 역 누르기 ───────────────────────
async function tapStation(idx) {
  const L = App.viewLine;
  if (App.speaking && App.speaking.line === L && App.speaking.idx === idx) { stopAll(); return; }
  stopAll();
  const t = ++token, ok = aliveFn(t);
  App.sel = idx; App.speaking = { line: L, idx };
  document.body.classList.add('speaking');
  markRow(idx, 'sel', false);
  renderSignIdle();
  const st = Net.station(Net.sidOf(L, idx)), sd = lineData[L].stations[idx];
  if (await maybeSafety(ok) === false) return;
  setLed(`이번 역은 ${st.name} 역입니다. This stop is ${st.nameEn}.`);
  await Voice.say(Ann.arrival(st, Net.transfersAt(L, st.sid), sd.branchKo ? { ko: sd.branchKo, en: sd.branchEn } : null), ok);
  if (!ok()) return;
  App.speaking = null; document.body.classList.remove('speaking'); setLed(LED_IDLE);
}

async function maybeSafety(ok) {
  if (!Settings.safety) return true;
  if (++App.playCount < App.nextRandom) return true;
  App.playCount = 0; App.nextRandom = 5 + Math.floor(Math.random() * 4);
  const msg = Ann.safety();
  setLed(msg);
  await Voice.say([{ t: msg, lang: 'ko', gap: 500 }], ok);
  return ok();
}

// ── 멈추기 ───────────────────────────────────
function stopAll() {
  const wasRunning = !!App.run;
  token++;
  Voice.stop();
  App.speaking = null;
  document.body.classList.remove('speaking', 'running');
  $('doors').classList.remove('closed');
  $('transferOverlay').classList.remove('on');
  wakeOff();
  if (wasRunning) {
    App.run = null;
    setLed('운행을 멈췄어요.');
    setTimeout(() => { if (!App.run && !App.speaking) setLed(LED_IDLE); }, 1800);
    $('map').querySelectorAll('.st.here').forEach(el => el.classList.remove('here'));
    if (App.mode === 'line') clearLineRoute();
  } else setLed(LED_IDLE);
}

// ── 자동운행 / 여행 공통 엔진 ─────────────────
const name = sid => Net.station(sid).name;
async function doors(close) { $('doors').classList.toggle('closed', close); await sleep(750); }
function wait(ms) { return sleep(ms / Settings.rate); }

async function runRoute(route, kind) {
  stopAll();
  const t = ++token, ok = aliveFn(t);
  const steps = route.steps, last = steps.length - 1;
  App.run = { route, kind };
  document.body.classList.add('running');
  wakeOn();
  App.routeSids = new Set(steps.map(s => s.sid));
  App.routeMarks = { [steps[0].sid]: '출발', [steps[last].sid]: '도착' };
  steps.forEach((s, i) => { if (s.arrive && s.depart && s.arrive !== s.depart) App.routeMarks[s.sid] = '환승'; });
  const segFrom = i => route.segments.find(sg => i >= sg.from && i < sg.to);

  const place = (i, ln) => {
    const idx = Net.idxOn(ln, steps[i].sid), seg = segFrom(i);
    renderSign(ln, idx, {
      prev: i > 0 ? name(steps[i - 1].sid) : '',
      next: i < last ? name(steps[i + 1].sid) : '',
      dir: seg && seg.line === ln ? seg.dir.ko : ''
    });
    markRow(idx, 'here', true);
    renderRunStrip(route, i);
    $('runStatus').innerHTML = `<b>${esc(name(steps[0].sid))} → ${esc(name(steps[last].sid))}</b>
      <span class="progress"><i style="width:${Math.round(i / last * 100)}%"></i></span><span>${i}/${last}역</span>`;
  };

  let line = steps[0].depart;
  showLine(line, true);
  place(0, line);
  $('doors').classList.remove('closed');
  setLed(`${name(steps[0].sid)}에서 ${route.segments[0].dir.ko} 열차를 탔어요`);
  if (!await Voice.say(Ann.boarding(route.segments[0].dir), ok)) return;

  for (let i = 0; i <= last; i++) {
    if (i > 0) {
      line = steps[i].arrive;
      showLine(line);
      place(i, line);
      await doors(false);
      if (!ok()) return;
      if (await maybeSafety(ok) === false) return;
      const st = Net.station(steps[i].sid), idx = steps[i].arriveIdx, trs = Net.transfersAt(line, st.sid);
      if (i === last) {
        if (Net.isRealTerminal(line, idx)) {
          setLed(`이번 역은 우리 열차의 종착역, ${st.name} 역입니다. This is the last stop, ${st.nameEn}.`);
          await Voice.say(Ann.terminal(st, trs), ok);
        } else {
          setLed(`이번 역은 ${st.name} 역입니다. This stop is ${st.nameEn}.`);
          await Voice.say(Ann.arrival(st, trs, null), ok);
        }
        break;
      }
      const sd = lineData[line].stations[idx];
      const branch = kind === 'line' && sd.branchKo ? { ko: sd.branchKo, en: sd.branchEn } : null;
      setLed(`이번 역은 ${st.name} 역입니다. This stop is ${st.nameEn}.`);
      if (!await Voice.say(Ann.arrival(st, trs, branch), ok)) return;

      if (steps[i].depart !== line) {          // 환승
        const to = steps[i].depart, sameBase = Net.baseOf(to) === Net.baseOf(line), nseg = segFrom(i);
        setLed(sameBase ? `여기서 ${nseg.dir.ko} 열차로 갈아타요` : `여기서 ${meta(to).ko}${roParticle(meta(to).ko)} 갈아타요`);
        if (!await Voice.say(Ann.transferHere(to, sameBase, nseg.dir), ok)) return;
        await showTransfer(line, to, nseg.dir, st.name, sameBase, ok);
        if (!ok()) return;
        line = to;
        showLine(line);
        place(i, line);
        setLed(`${nseg.dir.ko} 열차를 탔어요`);
        if (!await Voice.say(Ann.boarding(nseg.dir), ok)) return;
      }
    }
    // 출발
    await wait(400); if (!ok()) return;
    setLed('출입문 닫습니다. 열차가 곧 출발합니다.');
    await doors(true); if (!ok()) return;
    const nx = Net.station(steps[i + 1].sid);
    const pos = [...$('strip').querySelectorAll('.sp')].findIndex(el => el.classList.contains('cur'));
    placeChip(pos + 1, true);
    setLed(`다음 역은 ${nx.name} 역입니다. The next stop is ${nx.nameEn}.`);
    if (!await Voice.say(Ann.next(nx), ok)) return;
    await wait(700); if (!ok()) return;
  }
  if (!ok()) return;
  await finishRun(route, kind, ok);
}

async function finishRun(route, kind, ok) {
  const steps = route.steps, lastS = steps[steps.length - 1];
  $('runStatus').querySelector('.progress i').style.width = '100%';
  if (kind === 'line') {
    const L = steps[0].depart, N = lineData[L].stations.length;
    const a = steps[0].departIdx, b = lastS.arriveIdx;
    if (L !== '2' && ((a === 0 && b === N - 1) || (a === N - 1 && b === 0))) {
      const base = Net.baseOf(L);
      App.completions[base] = (App.completions[base] || 0) + 1;
      store.set('lineCompletions', App.completions);
    }
    setLed(`${name(lastS.sid)} 역에 도착했습니다. 안녕히 가십시오.`);
  } else {
    saveRecent(route);
    setLed(`${name(lastS.sid)} 역에 도착했어요! 여행 끝!`);
    $('arriveTitle').textContent = `${name(lastS.sid)} 도착!`;
    $('arriveSub').textContent = `${name(steps[0].sid)}에서 ${route.hops}개 역을 지나왔어요 · 환승 ${route.transfers}번`;
    $('arriveOverlay').classList.add('on');
  }
  await sleep(2000);
  if (!ok()) return;
  App.run = null;
  document.body.classList.remove('running');
  wakeOff();
  App.sel = lastS.arriveIdx;
  if (kind === 'line') clearLineRoute();
  renderTripPanel();
  setTimeout(() => { if (!App.run && !App.speaking) setLed(LED_IDLE); }, 3000);
}

async function showTransfer(fromLine, toLine, dir, stName, sameBase, ok) {
  $('trFrom').innerHTML = lineBadgeHTML(fromLine);
  $('trTo').innerHTML = lineBadgeHTML(toLine);
  $('trTitle').textContent = sameBase ? `${dir.ko} 열차로 갈아타요` : `${meta(toLine).ko}${roParticle(meta(toLine).ko)} 갈아타요`;
  $('trSub').textContent = `${stName}역 · ${dir.ko} 타는 곳으로 가는 중`;
  $('transferOverlay').classList.add('on');
  await wait(2800);
  $('transferOverlay').classList.remove('on');
  return ok();
}

// 노선 모드 자동운행이 끝나면 흐리게 표시한 역을 원래대로
function clearLineRoute() {
  App.routeSids = null; App.routeMarks = {};
  showLine(App.viewLine, true);
  markRow(App.sel, 'sel', false);
}

// ── 노선 모드: 자동운행 패널 ───────────────────
function renderAutoSelects() {
  const st = lineData[App.viewLine].stations;
  const opts = st.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join('');
  $('autoStart').innerHTML = opts; $('autoEnd').innerHTML = opts;
  $('autoStart').value = 0; $('autoEnd').value = App.viewLine === '2' ? Math.floor(st.length / 2) : st.length - 1;  // 2호선은 순환이라 반대편 역을 기본으로
}
function startLineRun() {
  const L = App.viewLine, a = +$('autoStart').value, b = +$('autoEnd').value;
  if (a === b) { setLed('출발역과 도착역을 다르게 골라주세요!'); return; }
  const route = Net.findRoute(Net.sidOf(L, a), Net.sidOf(L, b), { onlyLine: L });
  if (route) runRoute(route, 'line');
}

function selectLine(k) {
  if (App.run || App.speaking) stopAll();
  App.line = k; App.sel = 0; App.routeSids = null; App.routeMarks = {};
  try { localStorage.setItem('lastLine', k); } catch (_) {}
  showLine(k, true);
  renderAutoSelects();
  renderSignIdle();
  $('map').scrollTop = 0;
}

// ── 여행 모드 ─────────────────────────────────
function findByNameBase(nm, base) { const s = Net.stations.find(x => x.name === nm && x.lines.includes(base)); return s ? s.sid : null; }
function endBtnHTML(label, sid) {
  if (sid == null) return `<small>${label}</small><b>역 고르기</b>`;
  const st = Net.station(sid);
  return `<small>${label}</small><b>${st.lines.map(l => `<i class="mini" style="background:${meta(l).color}"></i>`).join('')}${esc(st.name)}</b>`;
}
function renderTripPanel() {
  const T = App.trip;
  $('tripFrom').innerHTML = endBtnHTML('출발', T.from); $('tripFrom').classList.toggle('empty', T.from == null);
  $('tripTo').innerHTML = endBtnHTML('도착', T.to); $('tripTo').classList.toggle('empty', T.to == null);
  $('tripGo').disabled = !T.route;
  const card = $('routeCard');
  if (T.from != null && T.to != null && T.from === T.to) card.innerHTML = '<p class="hint">출발역과 도착역이 같아요. 다른 역을 골라주세요.</p>';
  else if (!T.route) card.innerHTML = T.from != null || T.to != null ? '<p class="hint">출발역과 도착역을 모두 고르면 길을 찾아줄게요.</p>' : '';
  else {
    const r = T.route, mins = r.hops * 2 + r.transfers * 4;
    let html = `<div class="route-sum"><span><b>${r.hops}</b>개 역</span><span>환승 <b>${r.transfers}</b>번</span><span>약 <b>${mins}</b>분</span></div>`;
    r.segments.forEach((sg, k) => {
      if (k > 0) {
        const prev = r.segments[k - 1], same = Net.baseOf(prev.line) === Net.baseOf(sg.line);
        html += `<div class="walk">🚶 ${esc(name(r.steps[sg.from].sid))}에서 ${same ? esc(sg.dir.ko) + ' 열차로' : esc(meta(sg.line).ko) + roParticle(meta(sg.line).ko)} 갈아타기</div>`;
      }
      html += `<div class="leg">${lineBadgeHTML(sg.line)}<div><div class="t1">${esc(name(r.steps[sg.from].sid))} → ${esc(name(r.steps[sg.to].sid))}</div>
        <div class="t2">${esc(lineData[sg.line].name)} · ${esc(sg.dir.ko)} · ${sg.to - sg.from}개 역</div></div></div>`;
    });
    card.innerHTML = html;
  }
  const rec = App.recent.map((r, i) => `<button data-recent="${i}">${esc(r.f[0])} → ${esc(r.t[0])}</button>`).join('');
  $('recentTrips').innerHTML = rec ? `<span class="lbl">최근 여행</span>${rec}` : '';
}
function updateTrip() {
  const T = App.trip;
  T.route = (T.from != null && T.to != null && T.from !== T.to) ? Net.findRoute(T.from, T.to) : null;
  if (T.route) {
    const r = T.route;
    App.routeSids = new Set(r.steps.map(s => s.sid));
    App.routeMarks = { [r.from]: '출발', [r.to]: '도착' };
    r.steps.forEach(s => { if (s.arrive && s.depart && s.arrive !== s.depart) App.routeMarks[s.sid] = '환승'; });
    showLine(r.segments[0].line, true);
    App.sel = r.steps[0].departIdx;
    markRow(App.sel, 'sel', true);
  } else {
    App.routeSids = null; App.routeMarks = {};
    const sid = T.from != null ? T.from : T.to;
    if (sid != null) {
      const p = Net.station(sid).plats[0];
      showLine(p.line, true); App.sel = p.idx; markRow(p.idx, 'sel', true);
    } else showLine(App.viewLine, true);
  }
  if (!App.run) renderSignIdle();
  renderTripPanel();
}
function saveRecent(route) {
  const f = Net.station(route.from), t = Net.station(route.to);
  const item = { f: [f.name, f.lines[0]], t: [t.name, t.lines[0]] };
  App.recent = [item, ...App.recent.filter(r => !(r.f[0] === item.f[0] && r.t[0] === item.t[0]))].slice(0, 6);
  store.set('recentTrips', App.recent);
}

// 역 고르기 시트
const Picker = { which: 'from', base: '2' };
function openPicker(which) {
  Picker.which = which;
  const cur = App.trip[which];
  Picker.base = cur != null ? Net.station(cur).lines[0] : Net.baseOf(App.viewLine);
  $('pickerTitle').textContent = which === 'from' ? '어디서 출발할까요?' : '어디까지 갈까요?';
  $('pickerSearch').value = '';
  renderPicker();
  $('pickerOverlay').classList.add('on');
}
function renderPicker() {
  $('pickerLines').innerHTML = BASE_LINES.map(b => `<button class="chip${b === Picker.base ? ' on' : ''}" data-pbase="${b}" style="--cc:${meta(b).color}"><span class="cb">${esc(meta(b).badge)}</span>${esc(meta(b).ko)}</button>`).join('');
  const q = $('pickerSearch').value.trim();
  let list;
  if (q) {
    const isCho = /^[ㄱ-ㅎ]+$/.test(q);
    list = Net.stations.filter(s => s.lines.some(l => BASE_LINES.includes(l)) && (isCho ? getChosung(s.name).startsWith(q) : s.name.includes(q)))
      .sort((a, b) => (a.name.length - b.name.length) || a.name.localeCompare(b.name, 'ko')).slice(0, 80).map(s => s.sid);
  } else list = Net.stationsOfBase(Picker.base);
  const cur = App.trip[Picker.which];
  $('pickerGrid').innerHTML = list.length ? list.map(sid => {
    const s = Net.station(sid);
    return `<button class="pick${sid === cur ? ' cur' : ''}" data-pick="${sid}">${esc(s.name)}<span class="dots">${s.lines.map(l => `<i style="background:${meta(l).color}"></i>`).join('')}</span></button>`;
  }).join('') : '<p class="hint">찾는 역이 없어요.</p>';
}

// ── 내가 탄 호선 ─────────────────────────────
function renderRidden() {
  $('riddenList').innerHTML = BASE_LINES.map(b => `<div class="ridden-row">${badgeHTML(b)}<span>${esc(meta(b).ko)}${App.completions[b] ? ` <small style="color:var(--muted)">· 끝까지 ${App.completions[b]}번</small>` : ''}</span>
    <button class="toggle${App.ridden.includes(b) ? ' on' : ''}" data-ride="${b}" aria-label="${esc(meta(b).ko)} 탔어요"></button></div>`).join('');
}

// ── 설정 ─────────────────────────────────────
function renderSettings() {
  const fill = (sel, prefix, saved) => {
    const vs = Voice.list(prefix);
    sel.innerHTML = vs.length ? vs.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)}</option>`).join('') : '<option value="">기본 목소리</option>';
    const cur = prefix === 'ko' ? Voice.ko : Voice.en;
    sel.value = cur ? cur.voiceURI : '';
  };
  fill($('setKoVoice'), 'ko', Settings.koVoice);
  fill($('setEnVoice'), 'en', Settings.enVoice);
  $('setRate').querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v === Settings.rate));
  $('setEnglish').classList.toggle('on', Settings.english);
  $('setEnNameKo').classList.toggle('on', Settings.enNameKo);
  $('setSafety').classList.toggle('on', Settings.safety);
}
Voice.onchange = () => { if ($('settingsOverlay').classList.contains('on')) renderSettings(); };

// ── 화면 꺼짐 방지 ────────────────────────────
let wakeLock = null;
async function wakeOn() { try { if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (_) { wakeLock = null; } }
function wakeOff() { try { if (wakeLock) wakeLock.release(); } catch (_) {} wakeLock = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && App.run) { wakeLock = null; wakeOn(); } });

// ── 모드 전환 ─────────────────────────────────
function setMode(m) {
  if (App.run || App.speaking) stopAll();
  if (App.mode === 'quiz' || App.mode === 'chosung') Quiz.stop();
  App.mode = m;
  document.body.dataset.mode = m;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.mode === m));
  if (m === 'line') {
    App.routeSids = null; App.routeMarks = {};
    showLine(App.line, true); App.sel = Math.min(App.sel, lineData[App.line].stations.length - 1);
    renderAutoSelects(); renderSignIdle();
  } else if (m === 'trip') {
    updateTrip();
  } else if (m === 'quiz') Quiz.startChoice($('quizView'));
  else if (m === 'chosung') Quiz.startChosung($('quizView'));
}
Quiz.onExit = () => setMode('line');

// ── 이벤트 ───────────────────────────────────
document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => setMode(t.dataset.mode)));
$('lineChips').addEventListener('click', e => { const c = e.target.closest('[data-line]'); if (c) selectLine(c.dataset.line); });
$('railTitle').addEventListener('click', e => {
  const c = e.target.closest('[data-view]'); if (!c || App.run) return;
  showLine(c.dataset.view, true);
  const r = App.trip.route, sg = r && r.segments.find(s => s.line === c.dataset.view);
  if (sg) { App.sel = Net.idxOn(sg.line, r.steps[sg.from].sid); markRow(App.sel, 'sel', true); renderSignIdle(); }
});
$('map').addEventListener('click', e => {
  const go = e.target.closest('[data-go]');
  if (go) {
    e.stopPropagation();
    if (App.run) return;
    const target = go.dataset.go, sid = +go.dataset.sid;
    if (App.mode !== 'line') setMode('line');
    selectLine(target);
    const idx = Net.idxOn(target, sid);
    if (idx >= 0) { App.sel = idx; markRow(idx, 'sel', true); renderSignIdle(); }
    return;
  }
  const row = e.target.closest('.st');
  if (!row || App.run) return;
  tapStation(+row.dataset.idx);
});
$('stopBtn').addEventListener('click', stopAll);
$('autoGo').addEventListener('click', startLineRun);
$('autoSwap').addEventListener('click', () => { const a = $('autoStart').value; $('autoStart').value = $('autoEnd').value; $('autoEnd').value = a; });
$('tripFrom').addEventListener('click', () => openPicker('from'));
$('tripTo').addEventListener('click', () => openPicker('to'));
$('tripSwap').addEventListener('click', () => { const T = App.trip; [T.from, T.to] = [T.to, T.from]; updateTrip(); });
$('tripGo').addEventListener('click', () => { if (App.trip.route) runRoute(App.trip.route, 'trip'); });
$('recentTrips').addEventListener('click', e => {
  const b = e.target.closest('[data-recent]'); if (!b) return;
  const r = App.recent[+b.dataset.recent];
  App.trip.from = findByNameBase(r.f[0], r.f[1]); App.trip.to = findByNameBase(r.t[0], r.t[1]);
  updateTrip();
});
$('pickerLines').addEventListener('click', e => { const c = e.target.closest('[data-pbase]'); if (c) { Picker.base = c.dataset.pbase; $('pickerSearch').value = ''; renderPicker(); $('pickerGrid').scrollTop = 0; } });
$('pickerSearch').addEventListener('input', renderPicker);
$('pickerGrid').addEventListener('click', e => {
  const p = e.target.closest('[data-pick]'); if (!p) return;
  App.trip[Picker.which] = +p.dataset.pick;
  $('pickerOverlay').classList.remove('on');
  updateTrip();
});
$('arriveOk').addEventListener('click', () => $('arriveOverlay').classList.remove('on'));
$('arriveOverlay').addEventListener('click', e => { if (e.target.id === 'arriveOverlay') e.currentTarget.classList.remove('on'); });
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $(b.dataset.close).classList.remove('on')));
document.querySelectorAll('.sheet-overlay').forEach(o => o.addEventListener('click', e => { if (e.target === o) o.classList.remove('on'); }));

$('riddenBtn').addEventListener('click', () => { renderRidden(); $('riddenOverlay').classList.add('on'); });
$('riddenList').addEventListener('click', e => {
  const t = e.target.closest('[data-ride]'); if (!t) return;
  const b = t.dataset.ride;
  App.ridden = App.ridden.includes(b) ? App.ridden.filter(x => x !== b) : [...App.ridden, b];
  store.set('riddenLines', App.ridden);
  t.classList.toggle('on'); renderChips(); renderBrand();
});

$('settingsBtn').addEventListener('click', () => { Voice.load(); renderSettings(); $('settingsOverlay').classList.add('on'); });
$('setKoVoice').addEventListener('change', e => { Settings.koVoice = e.target.value; Settings.save(); Voice.load(); });
$('setEnVoice').addEventListener('change', e => { Settings.enVoice = e.target.value; Settings.save(); Voice.load(); });
$('setRate').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; Settings.rate = +b.dataset.v; Settings.save(); renderSettings(); });
[['setEnglish', 'english'], ['setEnNameKo', 'enNameKo'], ['setSafety', 'safety']].forEach(([id, key]) =>
  $(id).addEventListener('click', () => { Settings[key] = !Settings[key]; Settings.save(); renderSettings(); }));
$('setTest').addEventListener('click', async () => {
  stopAll(); const t = ++token;
  const sid = Net.stations.find(s => s.name === '강남').sid;
  await Voice.say(Ann.arrival(Net.station(sid), Net.transfersAt('2', sid), null), aliveFn(t));
});

// 홈 화면 설치 (안드로이드 크롬)
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $('installBtn').hidden = false; });
$('installBtn').addEventListener('click', async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; $('installBtn').hidden = true; });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// ── 시작 ─────────────────────────────────────
setMode('line');
setLed(LED_IDLE);
window.addEventListener('resize', () => { if (!App.run) { const cur = $('strip').querySelector('.sp.cur'); if (cur) placeChip([...$('strip').children].indexOf(cur), false); } });
