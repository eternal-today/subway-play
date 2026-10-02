// 퀴즈 (4지선다) + 초성퀴즈
// 규칙은 이전과 같고, 화면만 가로 태블릿에 맞게 2단으로 배치

const CHOSUNG_LIST = ['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ'];
function getChosung(str) {
  let out = '';
  for (const ch of str) {
    const c = ch.charCodeAt(0);
    out += (c >= 0xAC00 && c <= 0xD7A3) ? CHOSUNG_LIST[Math.floor((c - 0xAC00) / 588)] : ch;
  }
  return out;
}
const isPureHangul = s => [...s].every(ch => { const c = ch.charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3; });

const Quiz = (function () {
  const BASE12 = ['1','2','3','4','5','6','7','8','9','경의중앙','경춘','공항철도'];
  const LINES_1_9 = ['1','2','3','4','5','6','7','8','9'];
  const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const escQ = s => String(s).replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c]));
  const lineLabel = k => /^\d$/.test(k) ? k + '호선' : meta(k).ko;
  const badge = k => `<span class="tb" style="background:${meta(k).color}">${escQ(meta(k).badge)}</span>`;
  let el = null, state = null, timer = null;
  const api = { onExit: null };

  function pips(cur, total) {
    return `<div class="qprog"><span>문제 ${cur + 1} / ${total}</span><span class="pips">${
      Array.from({ length: total }, (_, i) => `<i class="${i < cur ? 'done' : i === cur ? 'now' : ''}"></i>`).join('')}</span><span>맞힘 ${state.score}개</span></div>`;
  }
  function resultHTML(again) {
    const { score, questions } = state, total = questions.length;
    const msg = score === total ? '🎉 완벽해요!' : score >= Math.ceil(total * 0.6) ? '👍 잘했어요!' : score >= Math.ceil(total * 0.3) ? '🚇 거의 다 왔어요!' : '💪 다시 도전해볼까요?';
    return `<div class="qwrap"><div class="qresult"><div class="msg">${msg}</div><div class="score">${score} / ${total}</div>
      <button class="go" data-act="${again}">다시 도전</button><button class="go ghost" data-act="exit">처음으로</button></div></div>`;
  }
  function bindResult() {
    el.querySelector('[data-act="again-choice"], [data-act="again-chosung"]').addEventListener('click', e =>
      e.target.dataset.act === 'again-choice' ? api.startChoice(el) : api.startChosung(el));
    el.querySelector('[data-act="exit"]').addEventListener('click', () => api.onExit && api.onExit());
  }

  // ── 4지선다 ──────────────────────────────
  function stationLineMap() {
    const map = {}, seen = {}, dup = new Set();
    Net.stations.forEach(s => {
      const lines = s.lines.concat(s.ext).filter(l => BASE12.includes(l));
      if (!lines.length) return;
      if (seen[s.name]) dup.add(s.name);
      seen[s.name] = true;
      (map[s.name] = map[s.name] || new Set());
      lines.forEach(l => map[s.name].add(l));
    });
    return { map, dup };
  }
  function genTransferIn() {
    const { map } = stationLineMap();
    const nm = pick(Object.keys(map)), correct = [...map[nm]], disp = pick(correct);
    const wrongs = shuffle(BASE12.filter(b => !correct.includes(b))).slice(0, 3);
    return { mode: 'in', stationName: nm, display: disp, options: shuffle([...wrongs, disp]), accepted: correct };
  }
  function genTransferOut() {
    const { map, dup } = stationLineMap();
    const eligible = Object.keys(map).filter(n => map[n].size >= 3 && !dup.has(n));
    if (!eligible.length) return null;
    const nm = pick(eligible), ok = [...map[nm]];
    const wrongPool = BASE12.filter(b => !ok.includes(b));
    const ans = pick(wrongPool);
    return { mode: 'out', stationName: nm, options: shuffle([...shuffle(ok).slice(0, 3), ans]), accepted: [ans] };
  }
  function genTerminal() {
    const lines = ['3','4','6','7','8','9','경의중앙','경춘','공항철도'];
    const k = pick(lines), st = lineData[k].stations, first = Math.random() < 0.5;
    const correct = first ? st[0].name : st[st.length - 1].name;
    const all = new Set(); lines.forEach(l => { const s = lineData[l].stations; all.add(s[0].name); all.add(s[s.length - 1].name); });
    all.delete(correct);
    return { mode: 'terminal', lineKey: k, dirWord: first ? '첫' : '마지막', options: shuffle([...shuffle([...all]).slice(0, 3), correct]), accepted: [correct] };
  }
  function genColor() {
    const k = pick(BASE12);
    return { mode: 'color', color: meta(k).color, options: shuffle([...shuffle(BASE12.filter(b => b !== k)).slice(0, 3), k]), accepted: [k] };
  }
  function genQuestions(n) {
    const gens = [genTransferIn, genTransferOut, genTerminal, genColor], qs = [];
    for (let t = 0; qs.length < n && t < n * 4; t++) { const q = pick(gens)(); if (q) qs.push(q); }
    return qs;
  }

  api.startChoice = function (container) {
    api.stop(); el = container;
    state = { kind: 'choice', questions: genQuestions(5), cur: 0, score: 0 };
    renderChoice();
  };
  function renderChoice() {
    if (state.cur >= state.questions.length) { el.innerHTML = resultHTML('again-choice'); bindResult(); return; }
    const q = state.questions[state.cur];
    let ask = '', big = '';
    if (q.mode === 'in') { ask = '이 역은 어느 노선일까요?'; big = `<div class="qbig">${escQ(q.stationName)}</div>`; }
    else if (q.mode === 'out') { ask = '이 역에서 갈아탈 수 <b>없는</b> 노선은?'; big = `<div class="qbig">${escQ(q.stationName)}</div>`; }
    else if (q.mode === 'terminal') { ask = `이 노선의 <b>${q.dirWord} 역</b>은?`; big = `<div class="qbig line">${badge(q.lineKey)}${escQ(lineData[q.lineKey].name)}</div>`; }
    else { ask = '이 색은 어느 노선일까요?'; big = `<div class="qcolor" style="background:${q.color}"></div>`; }
    const opts = q.options.map(o => q.mode === 'terminal'
      ? `<button class="qopt" data-o="${escQ(o)}">${escQ(o)}</button>`
      : `<button class="qopt" data-o="${escQ(o)}">${badge(o)}${escQ(lineLabel(o))}</button>`).join('');
    el.innerHTML = `<div class="qwrap">${pips(state.cur, state.questions.length)}
      <div class="qcol"><div class="qcard"><div class="qask">${ask}</div>${big}</div></div>
      <div class="qcol"><div class="qopts">${opts}</div><div class="qfb" id="qfb"></div></div></div>`;
    el.querySelectorAll('.qopt').forEach(b => b.addEventListener('click', () => answerChoice(b)));
  }
  function answerChoice(btn) {
    const q = state.questions[state.cur], sel = btn.dataset.o, right = q.accepted.includes(sel);
    el.querySelectorAll('.qopt').forEach(b => { b.disabled = true; if (q.accepted.includes(b.dataset.o)) b.classList.add('right'); });
    const fb = el.querySelector('#qfb');
    if (right) { state.score++; fb.className = 'qfb right'; fb.textContent = '✅ 정답이에요!'; }
    else {
      btn.classList.add('wrong');
      const label = q.mode === 'terminal' ? q.accepted[0] + ' 역' : lineLabel(q.mode === 'in' ? q.display : q.accepted[0]);
      fb.className = 'qfb wrong'; fb.textContent = `❌ 아쉬워요! 정답은 ${label}이에요`;
    }
    timer = setTimeout(() => { state.cur++; renderChoice(); }, 1800);
  }

  // ── 초성퀴즈 ─────────────────────────────
  function chosungPool() {
    const pool = {};
    Net.stations.forEach(s => {
      const in19 = s.plats.some(p => LINES_1_9.includes(Net.baseOf(p.line)));
      if (!in19 || !isPureHangul(s.name) || pool[s.name]) return;
      const nb = Net.neighbors(s.sid, LINES_1_9).map(i => Net.station(i).name).filter(isPureHangul);
      pool[s.name] = { lines: s.lines.concat(s.ext), neighbors: [...new Set(nb)] };
    });
    return pool;
  }
  // 힌트 순서 고정: 1) 노선·환승  2) 첫 글자  3) 이웃 역
  function hintsFor(nm, info) {
    const h = [];
    const labels = info.lines.map(lineLabel);
    h.push(labels.length >= 2 ? `${labels.join(', ')}에서 만날 수 있어요` : `${labels[0]} 역이에요`);
    h.push(`첫 글자는 '${nm[0]}'이에요`);
    h.push(info.neighbors.length ? `${pick(info.neighbors)} 옆에 있는 역이에요` : `${nm.length}글자 역이에요`);
    return h;
  }
  const normalize = s => { let t = s.trim().replace(/\s+/g, ''); if (t.length > 1 && t.endsWith('역')) t = t.slice(0, -1); return t; };

  api.startChosung = function (container) {
    api.stop(); el = container;
    const pool = chosungPool();
    const qs = shuffle(Object.keys(pool)).slice(0, 5).map(n => ({ answer: n, cho: getChosung(n), hints: hintsFor(n, pool[n]) }));
    state = { kind: 'chosung', questions: qs, cur: 0, score: 0, shown: 1, locked: false };
    renderChosung();
  };
  function hintHTML(q, i) { return `<div class="hintx">💡 힌트${i + 1}. ${escQ(q.hints[i])}</div>`; }
  function moreLabel() { const q = state.questions[state.cur]; return state.shown < q.hints.length ? `힌트 더 보기 (${state.shown}/${q.hints.length})` : '힌트를 모두 봤어요'; }
  function renderChosung() {
    if (state.cur >= state.questions.length) { el.innerHTML = resultHTML('again-chosung'); bindResult(); return; }
    const q = state.questions[state.cur];
    state.locked = false;
    el.innerHTML = `<div class="qwrap">${pips(state.cur, state.questions.length)}
      <div class="qcol cho-main">
        <div class="cho">${escQ(q.cho)}</div>
        <div class="cho-in"><input id="choInput" type="text" inputmode="text" placeholder="역 이름을 써보세요" autocomplete="off" autocapitalize="off" spellcheck="false" /><button class="go" id="choOk">확인</button></div>
        <div class="qfb" id="qfb"></div>
        <button class="skip" id="choSkip">모르겠어요, 넘어갈래요</button>
      </div>
      <div class="qcol cho-side">
        <div class="hints" id="choHints">${Array.from({ length: state.shown }, (_, i) => hintHTML(q, i)).join('')}</div>
        <button class="hint-more" id="choMore"${state.shown >= q.hints.length ? ' disabled' : ''}>${moreLabel()}</button>
      </div></div>`;
    const input = el.querySelector('#choInput');
    // 자동 포커스 없음: 아이가 입력칸을 눌렀을 때만 키보드가 올라옴
    // 키보드가 올라오면 한 번에 '입력 화면'(초성+입력칸+힌트를 위쪽에 작게)으로 바꿈 → 화면이 흔들리지 않음
    input.addEventListener('focus', () => typing(true));
    input.addEventListener('blur', () => typing(false));
    // 확인·힌트 버튼을 눌러도 키보드가 내려가지 않게 (입력칸 포커스 유지)
    ['#choOk', '#choMore'].forEach(sel => el.querySelector(sel).addEventListener('pointerdown', e => {
      if (document.activeElement === input) e.preventDefault();
    }));
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) submit(); });
    el.querySelector('#choOk').addEventListener('click', submit);
    el.querySelector('#choSkip').addEventListener('click', () => reveal(false));
    el.querySelector('#choMore').addEventListener('click', e => {
      if (state.locked || state.shown >= q.hints.length) return;
      el.querySelector('#choHints').insertAdjacentHTML('beforeend', hintHTML(q, state.shown));
      state.shown++;
      e.currentTarget.textContent = moreLabel();
      e.currentTarget.disabled = state.shown >= q.hints.length;
    });
  }
  function submit() {
    if (state.locked) return;
    const input = el.querySelector('#choInput'), q = state.questions[state.cur];
    const g = normalize(input.value);
    if (!g) { input.focus(); return; }
    if (g === normalize(q.answer)) { reveal(true); return; }
    const fb = el.querySelector('#qfb');
    fb.className = 'qfb wrong'; fb.textContent = '❌ 아니에요, 다시 해볼까요?';
    input.focus(); input.select();   // 입력한 글자는 그대로 두고 고치기 쉽게 선택
  }
  function reveal(right) {
    state.locked = true;
    const q = state.questions[state.cur], fb = el.querySelector('#qfb');
    el.querySelector('#choInput').disabled = true; el.querySelector('#choOk').disabled = true;
    el.querySelector('#choSkip').style.visibility = 'hidden'; el.querySelector('#choMore').disabled = true;
    if (document.activeElement) document.activeElement.blur();
    if (right) { state.score++; fb.className = 'qfb right'; fb.textContent = '✅ 정답이에요!'; }
    else { fb.className = 'qfb wrong'; fb.textContent = `정답은 '${q.answer}' 이에요`; }
    timer = setTimeout(() => { state.cur++; state.shown = 1; renderChosung(); }, 1800);
  }

  // 입력 화면 전환: 키보드가 다 올라온 뒤가 아니라 누르는 순간 한 번만 배치를 바꿈
  let vvBase = 0, kbdSeen = false;
  function typing(on) {
    document.body.classList.toggle('typing', on);
    if (on) {
      vvBase = window.visualViewport ? window.visualViewport.height : window.innerHeight;
      kbdSeen = false;
      if (el) el.scrollTop = 0;
      window.scrollTo(0, 0);
    }
  }
  // 안드로이드 '뒤로' 버튼으로 키보드만 내리면 입력칸이 포커스를 유지하므로, 그때도 원래 화면으로 복귀
  if (window.visualViewport) window.visualViewport.addEventListener('resize', () => {
    if (!document.body.classList.contains('typing')) return;
    const h = window.visualViewport.height;
    if (h < vvBase * 0.8) kbdSeen = true;
    else if (kbdSeen && h > vvBase * 0.9 && document.activeElement) document.activeElement.blur();
    window.scrollTo(0, 0);
  });

  api.stop = function () { clearTimeout(timer); state = null; document.body.classList.remove('typing'); if (el) el.innerHTML = ''; };
  return api;
})();
