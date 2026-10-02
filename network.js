// 노선 그래프 & 경로 계산 (화면과 무관한 순수 로직)
// - 같은 이름 + 서로 환승 관계인 역만 하나의 "실제 역"으로 합침 (5호선 양평 ≠ 경의중앙선 양평)
// - 2호선은 양방향 순환, 6호선 응암순환은 한 방향 순환
// - 1호선(인천행/신창행), 5호선(하남행/마천행)은 같은 호선의 다른 열차로 취급
const Net = (function () {
  const BASE_OF = { '1_2': '1', '5_2': '5' };
  const baseOf = k => BASE_OF[k] || k;
  const BIDI_LOOP = { '2': true };
  const TRANSFER_COST = 5;   // 다른 노선으로 갈아타기 = 약 5정거장만큼의 부담 (환승 적은 길 우선)
  const BRANCH_COST = 2;     // 같은 호선 다른 행선지 열차로 갈아타기
  const ORDER = ['1','2','3','4','5','6','7','8','9','경의중앙','경춘','공항철도','수인분당','신분당','우이신설','신림','서해','인천1','인천2','GTX-A'];
  const orderOf = k => { const i = ORDER.indexOf(k); return i < 0 ? 99 : i; };

  let data = null;
  let stations = [];   // [{ sid, name, nameEn, plats:[{line,idx}], lines:[base...], ext:[...] }]
  let plat = {};       // plat[line][idx] = sid
  let out = [];        // out[sid] = [{ to, line, fromIdx, toIdx }]

  function loopInfo(line) {
    const st = data[line].stations;
    const ls = st.findIndex(s => s.loopStart);
    const le = st.findIndex(s => s.loopEnd);
    return ls >= 0 && le > ls ? { ls, le, mf: le + 1 } : null;
  }
  const inLoop = (line, idx) => { const s = data[line].stations[idx]; return !!(s && (s.loopStart || s.inLoop || s.loopEnd)); };

  // 노선별 방향 있는 연결 [from, to]
  function lineEdges(line) {
    const N = data[line].stations.length;
    const e = [];
    const lp = loopInfo(line);
    if (lp) {
      for (let i = lp.ls; i < lp.le; i++) e.push([i, i + 1]);   // 순환 구간: 한 방향
      e.push([lp.le, lp.ls]);                                     // 구산 → 응암
      if (lp.mf < N) { e.push([lp.ls, lp.mf], [lp.mf, lp.ls]); }  // 응암 ↔ 새절
      for (let i = lp.mf; i < N - 1; i++) e.push([i, i + 1], [i + 1, i]);
      return e;
    }
    for (let i = 0; i < N - 1; i++) e.push([i, i + 1], [i + 1, i]);
    if (BIDI_LOOP[line]) e.push([N - 1, 0], [0, N - 1]);
    return e;
  }

  function build(lineData) {
    data = lineData; stations = []; plat = {}; out = [];
    const all = [];
    Object.keys(data).forEach(line => {
      plat[line] = [];
      data[line].stations.forEach((s, idx) => all.push({ line, idx, s }));
    });
    // union-find
    const parent = all.map((_, i) => i);
    const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    const byName = {};
    all.forEach((p, i) => (byName[p.s.name] = byName[p.s.name] || []).push(i));
    Object.values(byName).forEach(list => {
      for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) {
        const A = all[list[a]], B = all[list[b]];
        const same = baseOf(A.line) === baseOf(B.line)
          || A.s.transfers.includes(baseOf(B.line)) || B.s.transfers.includes(baseOf(A.line));
        if (same) parent[find(list[a])] = find(list[b]);
      }
    });
    const rootToSid = {};
    all.forEach((p, i) => {
      const r = find(i);
      if (rootToSid[r] === undefined) {
        rootToSid[r] = stations.length;
        stations.push({ sid: stations.length, name: p.s.name, nameEn: p.s.nameEn, plats: [], lines: [], ext: [] });
      }
      const st = stations[rootToSid[r]];
      st.plats.push({ line: p.line, idx: p.idx });
      plat[p.line][p.idx] = st.sid;
    });
    stations.forEach(st => {
      const own = new Set(st.plats.map(p => baseOf(p.line)));
      st.lines = [...own].sort((a, b) => orderOf(a) - orderOf(b));
      const ext = new Set();
      st.plats.forEach(p => data[p.line].stations[p.idx].transfers.forEach(t => { if (!own.has(t)) ext.add(t); }));
      st.ext = [...ext].sort((a, b) => orderOf(a) - orderOf(b));
      out[st.sid] = [];
    });
    Object.keys(data).forEach(line => {
      lineEdges(line).forEach(([i, j]) => out[plat[line][i]].push({ to: plat[line][j], line, fromIdx: i, toIdx: j }));
    });
    return stations;
  }

  const sidOf = (line, idx) => plat[line] ? plat[line][idx] : undefined;
  const station = sid => stations[sid];
  function idxOn(line, sid) { const p = stations[sid].plats.find(p => p.line === line); return p ? p.idx : -1; }
  // 이 노선에서 볼 때 갈아탈 수 있는 노선들 (뱃지/안내방송용)
  function transfersAt(line, sid) {
    const st = stations[sid];
    return st.lines.filter(b => b !== baseOf(line)).concat(st.ext).sort((a, b) => orderOf(a) - orderOf(b));
  }

  // 최단 경로 (정거장 수 + 환승 부담). opts.onlyLine: 그 노선 안에서만
  function findRoute(fromSid, toSid, opts = {}) {
    if (fromSid === toSid) return null;
    const key = (s, l) => s + '|' + (l || '');
    const dist = new Map(), prev = new Map();
    const pq = [[0, fromSid, null]];
    dist.set(key(fromSid, null), 0);
    let goal = null;
    while (pq.length) {
      let bi = 0;
      for (let i = 1; i < pq.length; i++) if (pq[i][0] < pq[bi][0]) bi = i;
      const [d, s, l] = pq.splice(bi, 1)[0];
      if (d > dist.get(key(s, l))) continue;
      if (s === toSid) { goal = key(s, l); break; }
      for (const e of out[s]) {
        if (opts.onlyLine && e.line !== opts.onlyLine) continue;
        let c = 1;
        if (l && e.line !== l) c += baseOf(e.line) === baseOf(l) ? BRANCH_COST : TRANSFER_COST;
        const nk = key(e.to, e.line), nd = d + c;
        if (nd < (dist.has(nk) ? dist.get(nk) : Infinity)) {
          dist.set(nk, nd); prev.set(nk, { k: key(s, l), e }); pq.push([nd, e.to, e.line]);
        }
      }
    }
    if (!goal) return null;
    const edges = [];
    for (let k = goal; prev.has(k); k = prev.get(k).k) edges.unshift(prev.get(k).e);
    // steps: 지나는 역 순서. arrive = 도착할 때 탄 노선, depart = 떠날 때 탈 노선
    const steps = [{ sid: fromSid, arrive: null, arriveIdx: -1, depart: edges[0].line, departIdx: edges[0].fromIdx }];
    edges.forEach((e, i) => {
      const nx = edges[i + 1];
      steps.push({ sid: e.to, arrive: e.line, arriveIdx: e.toIdx, depart: nx ? nx.line : null, departIdx: nx ? nx.fromIdx : -1 });
    });
    const segments = [];
    edges.forEach((e, i) => {
      const last = segments[segments.length - 1];
      if (last && last.line === e.line) last.to = i + 1;
      else segments.push({ line: e.line, from: i, to: i + 1, dir: directionLabel(e.line, e.fromIdx, e.toIdx) });
    });
    const transfers = segments.length - 1;
    return { from: fromSid, to: toSid, steps, segments, hops: edges.length, transfers };
  }

  // 행선지 표시 ("신내행", "응암순환", "을지로입구 방면")
  function directionLabel(line, cur, next) {
    const st = data[line].stations, N = st.length;
    if (BIDI_LOOP[line]) return { ko: st[next].name + ' 방면', dest: st[next], kind: 'toward' };
    if (loopInfo(line)) {
      // 새절→응암, 본선 내려가는 방향 = 응암순환 / 순환 구간 안·본선 올라가는 방향 = 신내행
      const lp = loopInfo(line);
      const toLoop = (next < cur && !inLoop(line, next)) || (cur === lp.mf && next === lp.ls);
      if (!toLoop) return { ko: st[N - 1].name + '행', dest: st[N - 1], kind: 'bound' };
      return { ko: st[lp.ls].name + '순환', dest: st[lp.ls], kind: 'loop' };
    }
    const d = next > cur ? st[N - 1] : st[0];
    return { ko: d.name + '행', dest: d, kind: 'bound' };
  }

  // 화면 표시용 이전/다음 역 (노선도 정방향 기준)
  function displayNeighbors(line, idx) {
    const N = data[line].stations.length;
    if (BIDI_LOOP[line]) return { prev: (idx - 1 + N) % N, next: (idx + 1) % N };
    const lp = loopInfo(line);
    if (lp) {
      let next, prev;
      if (idx >= lp.ls && idx < lp.le) next = idx + 1;
      else if (idx === lp.le) next = lp.ls;
      else next = idx + 1 < N ? idx + 1 : null;
      if (idx === lp.ls) prev = lp.le;
      else if (idx > lp.ls && idx <= lp.le) prev = idx - 1;
      else if (idx === lp.mf) prev = lp.ls;
      else prev = idx - 1;
      return { prev, next };
    }
    return { prev: idx > 0 ? idx - 1 : null, next: idx < N - 1 ? idx + 1 : null };
  }

  // 그래프상 이웃 역 (lines로 제한 가능, base 키 목록)
  function neighbors(sid, baseLines) {
    const res = new Set();
    stations.forEach(st => out[st.sid].forEach(e => {
      if (baseLines && !baseLines.includes(baseOf(e.line))) return;
      if (e.to === sid) res.add(st.sid);
      if (st.sid === sid) res.add(e.to);
    }));
    res.delete(sid);
    return [...res];
  }

  // 노선 그룹(1호선 = 인천행+신창행)의 역 목록 (sid, 중복 없이 노선도 순서)
  function stationsOfBase(base) {
    const keys = Object.keys(data).filter(k => baseOf(k) === base);
    const seen = new Set(), list = [];
    keys.forEach(k => data[k].stations.forEach((s, i) => {
      const sid = plat[k][i];
      if (!seen.has(sid)) { seen.add(sid); list.push(sid); }
    }));
    return list;
  }

  const isRealTerminal = (line, idx) => !BIDI_LOOP[line] && (idx === 0 || idx === data[line].stations.length - 1);

  return { build, baseOf, sidOf, station, idxOn, transfersAt, findRoute, directionLabel, displayNeighbors,
           neighbors, stationsOfBase, isRealTerminal, inLoop, loopInfo, ORDER,
           get stations() { return stations; } };
})();
if (typeof module !== 'undefined') module.exports = { Net };
