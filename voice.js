// 노선 표시 정보 + 음성(안내방송)
// - 영어 방송 속 역 이름은 기본적으로 한국어 음성으로 읽음 (실제 지하철처럼 자연스러운 발음)
// - 기기마다 음성이 달라서, 설정에서 한국어/영어 음성을 직접 고를 수 있음

// ── 노선 표시 정보 ─────────────────────────────
const META = {
  '1':        { ko:'1호선', badge:'1', color:'#0052A4', tts:'일호선', en:'Line Number 1' },
  '2':        { ko:'2호선', badge:'2', color:'#00A84D', tts:'이호선', en:'Line Number 2' },
  '3':        { ko:'3호선', badge:'3', color:'#EF7C1C', tts:'삼호선', en:'Line Number 3' },
  '4':        { ko:'4호선', badge:'4', color:'#00A5DE', tts:'사호선', en:'Line Number 4' },
  '5':        { ko:'5호선', badge:'5', color:'#996CAC', tts:'오호선', en:'Line Number 5' },
  '6':        { ko:'6호선', badge:'6', color:'#CD7C2F', tts:'육호선', en:'Line Number 6' },
  '7':        { ko:'7호선', badge:'7', color:'#747F00', tts:'칠호선', en:'Line Number 7' },
  '8':        { ko:'8호선', badge:'8', color:'#E6186C', tts:'팔호선', en:'Line Number 8' },
  '9':        { ko:'9호선', badge:'9', color:'#BDB092', tts:'구호선', en:'Line Number 9' },
  '경의중앙': { ko:'경의중앙선', badge:'경중', color:'#77C4A3', tts:'경의중앙선', en:'Gyung-we Joong-ang Line' },
  '공항철도': { ko:'공항철도', badge:'공항', color:'#0090D2', tts:'공항철도', en:'Airport Railroad' },
  '경춘':     { ko:'경춘선', badge:'경춘', color:'#0C8E72', tts:'경춘선', en:'Gyung-choon Line' },
  '우이신설': { ko:'우이신설선', badge:'우이', color:'#B7C450', tts:'우이신설선', en:'Oo-ee Shin-seol Line' },
  '신림':     { ko:'신림선', badge:'신림', color:'#6789CA', tts:'신림선', en:'Shil-lim Line' },
  '서해':     { ko:'서해선', badge:'서해', color:'#8BC53F', tts:'서해선', en:'Suh-hae Line' },
  '인천1':    { ko:'인천1호선', badge:'인1', color:'#7CA8D5', tts:'인천일호선', en:'Incheon Line Number 1' },
  '인천2':    { ko:'인천2호선', badge:'인2', color:'#ED8B00', tts:'인천이호선', en:'Incheon Line Number 2' },
  '신분당':   { ko:'신분당선', badge:'신분당', color:'#D4003B', tts:'신분당선', en:'Shin-boon-dang Line' },
  '수인분당': { ko:'수인분당선', badge:'수분', color:'#FABE00', tts:'수인분당선', en:'Soo-in Boon-dang Line' },
  'GTX-A':    { ko:'GTX-A', badge:'GTX', color:'#9A6292', tts:'지티엑스에이', en:'GTX-A' }
};
const meta = k => META[Net.baseOf(k)] || { ko:k, badge:k, color:'#9ca3af', tts:k, en:k };

// ── 설정 (localStorage) ─────────────────────────
const Settings = {
  koVoice: '', enVoice: '', rate: 1.0, english: true, enNameKo: true, safety: true,
  load() {
    try { Object.assign(this, JSON.parse(localStorage.getItem('settings') || '{}')); } catch (_) {}
    try { const r = localStorage.getItem('speechRate'); if (r && !localStorage.getItem('settings')) this.rate = parseFloat(r); } catch (_) {}
  },
  save() {
    const { koVoice, enVoice, rate, english, enNameKo, safety } = this;
    try { localStorage.setItem('settings', JSON.stringify({ koVoice, enVoice, rate, english, enNameKo, safety })); } catch (_) {}
  }
};

// 한국어 조사 '으로/로'
function roParticle(word) {
  if (!word) return '로';
  const c = word.charCodeAt(word.length - 1);
  if (c >= 0xAC00 && c <= 0xD7A3) { const j = (c - 0xAC00) % 28; return (j === 0 || j === 8) ? '로' : '으로'; }
  return '로';
}

// 영어 음성으로 역 이름을 읽을 때의 발음 보정 (설정에서 '영어로 읽기'를 고른 경우만 사용)
function phoneticEn(nameEn) {
  let s = nameEn;
  s = s.replace(/1\(il\)-ga|1-ga/gi, 'il-ga').replace(/2\(i\)-ga|2-ga/gi, 'ee-ga').replace(/3\(sam\)-ga|3-ga/gi, 'sam-ga')
       .replace(/4\(sa\)-ga|4-ga/gi, 'sa-ga').replace(/5\(o\)-ga|5-ga/gi, 'oh-ga');
  s = s.replace(/yeo/g, 'yuh').replace(/Yeo/g, 'Yuh').replace(/eong/g, 'ung').replace(/Eong/g, 'Ung')
       .replace(/eo/g, 'uh').replace(/Eo/g, 'Uh').replace(/eu/g, 'oo').replace(/Eu/g, 'Oo').replace(/ui/g, 'we').replace(/Ui/g, 'We');
  return s;
}

const Voice = (function () {
  let ko = null, en = null, all = [];
  const has = () => typeof speechSynthesis !== 'undefined';

  function load() {
    if (!has()) return;
    all = speechSynthesis.getVoices();
    const pick = (prefix, saved, prefer) => {
      const list = all.filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(prefix));
      return list.find(v => v.voiceURI === saved) || list.find(v => prefer.test(v.name)) || list[0] || null;
    };
    ko = pick('ko', Settings.koVoice, /google|yuna|heami|여성|female/i);
    en = pick('en-us', Settings.enVoice, /google|samantha|female/i) || pick('en', Settings.enVoice, /google/i);
  }
  function init() { load(); if (has()) speechSynthesis.onvoiceschanged = () => { load(); if (Voice.onchange) Voice.onchange(); }; }
  const list = prefix => all.filter(v => v.lang.replace('_', '-').toLowerCase().startsWith(prefix));

  function utter(text, lang) {
    return new Promise(res => {
      if (!has() || !text) { setTimeout(res, 300); return; }
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang === 'ko' ? 'ko-KR' : 'en-US';
      const v = lang === 'ko' ? ko : en; if (v) u.voice = v;
      u.rate = Settings.rate;
      let done = false;
      const fin = () => { if (!done) { done = true; clearTimeout(t); res(); } };
      u.onend = fin; u.onerror = fin;
      // 일부 안드로이드 기기에서 onend가 안 오는 경우 대비
      const t = setTimeout(fin, 2500 + text.length * 230 / Settings.rate);
      speechSynthesis.speak(u);
    });
  }

  // parts: [{t, lang, gap}] — alive(): false면 즉시 중단
  async function say(parts, alive = () => true) {
    for (const p of parts) {
      if (!alive()) return false;
      if (p.lang === 'en' && !Settings.english) continue;
      if (p.lang === 'ko-in-en' && !Settings.english) continue;
      await utter(p.t, p.lang === 'ko-in-en' ? 'ko' : p.lang);
      if (!alive()) return false;
      await new Promise(r => setTimeout(r, p.gap != null ? p.gap : 260));
    }
    return alive();
  }
  function stop() { if (has()) speechSynthesis.cancel(); }

  return { init, load, list, say, stop, get ko() { return ko; }, get en() { return en; } };
})();

// ── 안내방송 문구 ───────────────────────────────
// 영어 문장 안의 역 이름: 한국어 음성(기본) 또는 영어 음성
function enName(st, gap) {
  return Settings.enNameKo ? { t: st.name, lang: 'ko-in-en', gap: gap != null ? gap : 60 }
                           : { t: phoneticEn(st.nameEn), lang: 'en', gap: gap != null ? gap : 60 };
}
function trTts(list) { const names = list.map(k => meta(k).tts); return { text: names.join(', '), ro: roParticle(names[names.length - 1]) }; }
const enLines = list => list.map(k => meta(k).en).join(', ');

const Ann = {
  // 이번 역은 ~ (transfers: 갈아탈 수 있는 노선 키 목록)
  arrival(st, transfers, branch) {
    const p = [];
    if (transfers.length) {
      const tr = trTts(transfers);
      p.push({ t: `이번 역은, ${tr.text}${tr.ro} 갈아타실 수 있는, ${st.name}. ${st.name} 역입니다.${branch && branch.ko ? ' ' + branch.ko : ''}`, lang: 'ko' });
    } else {
      p.push({ t: `이번 역은, ${st.name}. ${st.name} 역입니다.${branch && branch.ko ? ' ' + branch.ko : ''}`, lang: 'ko' });
    }
    p.push({ t: 'This stop is', lang: 'en', gap: 40 }, enName(st, 220));
    if (transfers.length) p.push({ t: `You can transfer to, ${enLines(transfers)}.`, lang: 'en' });
    if (branch && branch.en) p.push({ t: branch.en, lang: 'en' });
    return p;
  },
  terminal(st, transfers) {
    const tr = transfers.length ? trTts(transfers) : null;
    const p = [{ t: `이번 역은 우리 열차의 종착역인, ${tr ? tr.text + tr.ro + ' 갈아타실 수 있는, ' : ''}${st.name}. ${st.name} 역입니다. 내리실 때 두고 내리시는 물건이 없는지 다시 한 번 확인하시기 바랍니다.`, lang: 'ko' }];
    p.push({ t: 'This is the last stop,', lang: 'en', gap: 40 }, enName(st, 220));
    if (transfers.length) p.push({ t: `You can transfer to, ${enLines(transfers)}.`, lang: 'en' });
    p.push({ t: 'Please make sure you have all your belongings before leaving the train. Thank you for riding with us.', lang: 'en' });
    return p;
  },
  next(st) {
    return [{ t: `다음 역은, ${st.name}. ${st.name} 역입니다.`, lang: 'ko' },
            { t: 'The next stop is', lang: 'en', gap: 40 }, enName(st)];
  },
  boarding(dir) {
    const p = [{ t: `이번 열차는 ${dir.ko} 열차입니다.`, lang: 'ko' }];
    p.push({ t: dir.kind === 'toward' ? 'This train is heading for' : 'This train is bound for', lang: 'en', gap: 40 }, enName(dir.dest));
    return p;
  },
  // 여행 중 환승역에서 갈아타기 안내
  transferHere(toLine, sameBase, dir) {
    if (sameBase) {
      return [{ t: `${dir.ko} 열차로 갈아타실 분은 이번 역에서 내리시기 바랍니다.`, lang: 'ko' },
              { t: 'Passengers for', lang: 'en', gap: 40 }, enName(dir.dest, 60), { t: 'please change trains here.', lang: 'en' }];
    }
    const m = meta(toLine);
    return [{ t: `${m.tts}${roParticle(m.tts)} 갈아타실 분은 이번 역에서 내리시기 바랍니다.`, lang: 'ko' },
            { t: `Passengers transferring to ${m.en}, please get off here.`, lang: 'en' }];
  },
  safety() {
    const msgs = ['안전선 안쪽으로 한 걸음 물러서 주십시오.', '출입문에 기대지 마세요.', '노약자 임산부 자리를 양보해 주십시오.',
      '휴대전화는 진동으로 부탁드립니다.', '이 역은 전동차와 승강장 사이가 넓습니다. 내리실 때 발빠짐에 주의하세요.'];
    return msgs[Math.floor(Math.random() * msgs.length)];
  }
};
