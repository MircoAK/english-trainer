// Business English Trainer. Deine Daten (Satzbausteine, Tage) liegen nur im Handy (localStorage).
// Aufnahme und Text gehen an die PC-Brücke (bridge/server.py). Das Feedback läuft dort über dein ChatGPT-Konto (Codex).
const $ = s => document.querySelector(s);
const dstr = d => d.toLocaleDateString('sv'); // YYYY-MM-DD, lokale Zeit
const today = () => dstr(new Date());
const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return dstr(d); };
const KEY = 'bt';
const IV = [0, 1, 3, 7, 14, 30, 60]; // Tage bis zur nächsten Wiederholung pro Stufe

function load() { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
const S = Object.assign({ bridge: '', token: '', deck: [], days: [], level: 1, runs: {}, newToday: { d: '', n: 0 } }, load());
const okCard = c => c && typeof c.de === 'string' && typeof c.en === 'string';
const fixDeck = d => (Array.isArray(d) ? d : []).filter(okCard).map(c => ({ de: c.de, en: c.en, box: Number.isInteger(c.box) ? Math.min(Math.max(c.box, 0), IV.length - 1) : 0, due: typeof c.due === 'string' ? c.due : today() }));
S.deck = fixDeck(S.deck);
if (typeof S.bridge !== 'string') S.bridge = '';
if (typeof S.token !== 'string') S.token = '';
S.days = (Array.isArray(S.days) ? S.days : []).filter(x => typeof x === 'string');
if (![1, 2, 3].includes(S.level)) S.level = 1;
if (!S.runs || typeof S.runs !== 'object') S.runs = {};
if (!S.newToday || typeof S.newToday !== 'object') S.newToday = { d: '', n: 0 };
// Fortschrittszahlen (nur im Handy): Gespräche, zweite Versuche, Spiele, häufigste Fehlerarten
const st0 = S.stats && typeof S.stats === 'object' ? S.stats : {};
S.stats = { turns: 0, retryTries: 0, retryFixed: 0, games: 0, types: Object.create(null) };
for (const k of ['turns', 'retryTries', 'retryFixed', 'games']) if (Number.isFinite(st0[k]) && st0[k] >= 0) S.stats[k] = Math.floor(st0[k]);
if (st0.types && typeof st0.types === 'object') for (const [k, v] of Object.entries(st0.types)) if (Number.isFinite(v) && v > 0) S.stats.types[String(k).slice(0, 40)] = Math.floor(v);
if (!Number.isInteger(S.goal) || S.goal < 1 || S.goal > 7) S.goal = 5; // Wochenziel: Übungstage von 7
let saveFailed = false;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); saveFailed = false; } catch { saveFailed = true; } };

function mark() { if (!S.days.includes(today())) { S.days.push(today()); save(); } }
const bump = (k, n = 1) => { S.stats[k] += n; save(); };
const noteType = t => { const k = String(t).slice(0, 40); S.stats.types[k] = (S.stats.types[k] || 0) + 1; save(); }; // types hat keinen Prototyp: "constructor" o. ä. ist ein ganz normaler Schlüssel
function weekDays() { let n = 0; for (let k = 0; k < 7; k++) if (S.days.includes(inDays(-k))) n++; return n; } // Übungstage der letzten 7 Tage
const bar = (v, max) => el('div', { class: 'bar' }, el('div', { style: `width:${Math.min(100, Math.round(v / max * 100))}%` }));
function streak() {
  const d = new Date(); let n = 0;
  if (!S.days.includes(dstr(d))) d.setDate(d.getDate() - 1); // heute noch offen zählt nicht als Abbruch
  while (S.days.includes(dstr(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

const el = (t, a = {}, ...k) => {
  const e = document.createElement(t);
  for (const [x, v] of Object.entries(a)) x.startsWith('on') ? (e[x] = v) : e.setAttribute(x, v);
  e.append(...k); return e;
};
let cleanup = null; // räumt die aktuelle Ansicht auf (Mikrofon, Sprachausgabe, Bildschirmsperre)
// show() räumt die alte Ansicht auf. Neue Aufräumfunktion immer NACH show() setzen (setView), sonst räumt show() sie sofort selbst ab.
const show = (...n) => { if (cleanup) { cleanup(); cleanup = null; } viewId++; speechSynthesis.cancel(); $('#app').replaceChildren(...n); window.scrollTo(0, 0); };
const setView = fn => { cleanup = fn; };
// Sprachausgabe darf nie den Ablauf stören (fehlt oder blockiert auf manchen Geräten); es gibt immer den 🔊-Knopf zum Wiederholen
const say = t => { try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'en-US'; u.rate = .95; speechSynthesis.speak(u); } catch {} };
const speakBtn = t => el('button', { class: 'sm', onclick: () => say(t) }, '🔊 anhören');
const back = () => el('button', { class: 'back', onclick: home }, '← Zurück');

// ---------- Brücke zum PC ----------
// Läuft die App von der Brücke selbst (*.ts.net), ist deren Adresse automatisch die eigene.
const base = () => (S.bridge || (location.hostname.endsWith('.ts.net') ? location.origin : '')).replace(/\/+$/, '');
async function api(path, body, raw, ms = 45000) {
  if (!base() || !S.token) throw new Error('Brücke nicht eingerichtet. Unter Einstellungen eintragen.');
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try { // der Timer läuft bis der Antwortkörper komplett gelesen ist
    let r;
    try { r = await fetch(base() + path, { method: 'POST', signal: ctl.signal, headers: { 'X-Token': S.token, ...(raw ? {} : { 'Content-Type': 'application/json' }) }, body: raw ? body : JSON.stringify(body) }); }
    catch (e) { if (e.name === 'AbortError') throw e; throw new Error('PC nicht erreichbar. Läuft die Brücke und ist Tailscale an?'); }
    let j; try { j = await r.json(); } catch (e) { if (e.name === 'AbortError') throw e; throw new Error('Komische Antwort vom PC (' + r.status + ')'); }
    if (!r.ok) throw new Error(j.error || r.status);
    return j;
  } catch (e) { throw e.name === 'AbortError' ? new Error('Zeitüberschreitung. PC zu langsam, Modell lädt vielleicht gerade, oder die Brücke hängt.') : e; }
  finally { clearTimeout(t); }
}
const stt = async blob => (await api('/stt', blob, true, 60000)).text;
const reply = (sc, history, text, variant) => api('/reply', { scenario: sc.setup, history, text, level: S.level, variant: !!variant }, false, 60000).then(j => j.reply);
const feedbackFor = (sc, text) => api('/feedback', { scenario: sc.setup, text }, false, 150000);

// ---------- Mikrofon ----------
// Jede Aufnahme ist ein eigenes Objekt. micOwner = wer das Mikrofon gerade hält. Epoch ändert sich bei jedem Abbruch,
// damit eine verspätete Mikrofonfreigabe nach einem Ansichtswechsel keinen Recorder mehr startet.
let rec = null, micOwner = null, epoch = 0;
const stopTracks = st => st && st.getTracks().forEach(t => t.stop());
async function recStart() {
  const my = epoch;
  let st;
  try { st = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { throw new Error('Mikrofon nicht erlaubt. In den iOS-Einstellungen unter Safari das Mikrofon erlauben.'); }
  if (my !== epoch) { stopTracks(st); throw new Error('abgebrochen'); }
  try {
    const r = { st, chunks: [], mr: new MediaRecorder(st) };
    r.mr.ondataavailable = e => r.chunks.push(e.data);
    r.mr.start(); rec = r;
  } catch { stopTracks(st); throw new Error('Aufnahme konnte nicht starten.'); }
}
const recStop = () => new Promise((res, rej) => {
  const r = rec; rec = null;
  if (!r) return rej(new Error('Keine Aufnahme aktiv.'));
  r.mr.onstop = () => { stopTracks(r.st); res(new Blob(r.chunks, { type: r.mr.mimeType })); };
  r.mr.onerror = () => { stopTracks(r.st); rej(new Error('Aufnahmefehler.')); };
  try { r.mr.stop(); } catch { stopTracks(r.st); rej(new Error('Aufnahmefehler.')); }
});
function recAbort() { epoch++; micOwner = null; if (rec) { const r = rec; rec = null; r.mr.onstop = null; try { r.mr.stop(); } catch {} stopTracks(r.st); } }

// Ein Knopf mit klaren Zuständen: idle -> starting -> recording -> busy -> idle. Nur ein Mikrofon gleichzeitig.
function micButton(btn, idleText, recText, h) {
  const me = Symbol(); let st = 'idle';
  const set = s => { st = s; btn.classList.toggle('rec', s === 'recording'); btn.textContent = s === 'recording' ? recText : s === 'idle' ? idleText : '…'; btn.disabled = s === 'starting' || s === 'busy'; };
  const free = () => { if (micOwner === me) micOwner = null; };
  set('idle');
  btn.onclick = async () => {
    if (st === 'idle') {
      if (micOwner) return;
      micOwner = me; set('starting');
      try { await recStart(); set('recording'); } catch (e) { free(); set('idle'); if (e.message !== 'abgebrochen') h.error(e); }
    } else if (st === 'recording') {
      set('busy'); const my = epoch; // epoch ändert sich beim Verlassen der Ansicht: dann kein Handler mehr (kein Feedback, keine Karten)
      try { const text = (await stt(await recStop())).trim(); if (my === epoch) await h.text(text); } catch (e) { if (my === epoch) h.error(e); } finally { free(); set('idle'); }
    }
  };
}

let wake = null, viewId = 0;
const lockScreen = async () => { // Bildschirm anlassen, solange diese Ansicht offen ist
  const my = viewId;
  try { const w = await navigator.wakeLock.request('screen'); if (my !== viewId) { w.release(); return; } wake = w; w.addEventListener('release', () => { if (wake === w) wake = null; }); } catch {}
};
const unlockScreen = () => { try { wake && wake.release(); } catch {} wake = null; };
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && wake === null && lockWanted) lockScreen(); });
let lockWanted = false;

// ---------- Szenarien (Titel, Rolle des Gegenübers, Satzanfänge als Starthilfe) ----------
const SCENARIOS = [
  { id: 'preis', t: 'Angebot: "Zu teuer"', setup: 'You are the managing director of a mid-size manufacturing company. The user is a consultant presenting a project quote. You say it is too expensive and push for a discount, but are open to a reduced scope.',
    st: ['I understand your concern about the price, but …', 'What if we reduce the scope and …', 'I could offer a discount if you …'] },
  { id: 'scope', t: 'Projektumfang erweitert sich', setup: 'You are a client who keeps asking for extra work outside the agreed scope. The user is a consultant who must defend the scope and negotiate a change request with extra budget.',
    st: ['That would be outside the agreed scope, so …', "I'm happy to do that if we adjust the budget.", 'Could we handle this as a separate change request?'] },
  { id: 'zahlung', t: 'Zahlungsbedingungen', setup: 'You are a CFO. The user wants 50% upfront payment. You prefer payment after delivery, 60 days. Negotiate payment terms.',
    st: ['Could we agree on a down payment of …?', 'We usually ask for … upfront because …', 'Would 30 days work for you?'] },
  { id: 'frist', t: 'Frist verschieben', setup: 'You are a client whose deadline is fixed. The user needs two more weeks. You are unhappy but negotiable if given a clear plan and a concession.',
    st: ["I'm afraid we need two more weeks because …", 'To make up for the delay, I could …', 'Here is what I suggest: …'] },
  { id: 'provision', t: 'Provision verhandeln (Partnerprogramm)', setup: 'You are a partnerships manager at a software company. The user runs a comparison website and wants a higher affiliate commission and a longer cookie duration. You have limited room.',
    st: ['We would like to discuss the commission rate.', 'Our visitors convert well, so …', 'Would you be open to … if we deliver …?'] },
  { id: 'vertrag', t: 'Vertragsklauseln', setup: 'You are a lawyer of the other party. The user wants to change the liability and termination clauses of a service contract. Negotiate firmly but fairly.',
    st: ["I'd like to propose a change to the liability clause.", 'Could we limit … to …?', 'We could accept this, provided that …'] },
  { id: 'absage', t: 'Höflich absagen', setup: 'You are a potential client who wants a custom project that does not fit the user. The user must decline politely and keep the relationship, maybe proposing an alternative.',
    st: ['Thank you for thinking of us, but unfortunately …', "This isn't the right fit for us because …", 'What I can offer instead is …'] },
  { id: 'anbieter', t: 'Einwand: "Wir haben schon einen Anbieter"', setup: 'You are a skeptical buyer who already works with a competitor. The user must create interest and negotiate a small pilot project.',
    st: ['I understand you already work with someone.', 'Would you be open to a small pilot project?', 'We could start with …, and then you decide.'] }
];

// neue Satzbausteine speichern; an jedem Tag sind höchstens 4 neue (Stufe 0) fällig, der Rest rutscht auf den nächsten freien Tag
function saveChunks(list) {
  let n = 0;
  for (const c of list || []) {
    if (!c || typeof c.en !== 'string' || typeof c.de !== 'string' || !c.en || !c.de || S.deck.some(x => x.en === c.en)) continue;
    let k = 0;
    while (S.deck.filter(x => x.box === 0 && x.due === inDays(k)).length >= 4) k++;
    S.deck.push({ de: c.de, en: c.en, box: 0, due: inDays(k) });
    n++;
  }
  if (n) save();
  return n;
}

// ---------- Ansichten ----------
function home() {
  const due = S.deck.filter(c => c.due <= today()).length;
  const lv = el('select', { onchange: () => { S.level = +lv.value; save(); } },
    ...[['1', 'Einfach (B1)'], ['2', 'Normal (B2)'], ['3', 'Fordernd']].map(([v, l]) => el('option', { value: v }, l)));
  lv.value = String(S.level);
  show(
    el('h1', {}, 'Business English'),
    el('div', { class: 'streak' }, `🔥 ${streak()} ${streak() === 1 ? 'Tag' : 'Tage'}`),
    el('p', { class: 'mut' }, `${S.deck.length} Satzbausteine gespeichert`),
    ...(saveFailed ? [el('p', { class: 'err' }, 'Achtung: Speichern im Handy ist fehlgeschlagen. Mach eine Sicherung unter Einstellungen.')] : []),
    el('div', { class: 'mut' }, `Letzte 7 Tage: ${weekDays()} von ${S.goal} Tagen`), bar(weekDays(), S.goal),
    el('button', { class: 'pri', onclick: review }, `Wiederholen (${due} fällig)`),
    el('div', { class: 'row' }, el('button', { onclick: () => games() }, 'Mini-Spiele'), el('button', { onclick: () => progress() }, 'Fortschritt')), // erst beim Klick aufrufen: games.js lädt nach app.js
    el('h2', {}, 'Gespräch üben'),
    el('p', { class: 'mut' }, 'Wie schwer soll das Gegenüber sein?'), lv,
    ...SCENARIOS.map(sc => el('button', { onclick: () => session(sc) }, sc.t)),
    el('h2', {}, ' '),
    el('button', { onclick: settings }, 'Einstellungen')
  );
}

function feedbackCard(j, n) {
  const fb = el('div', { class: 'fb' });
  // Erst der Fokus und ein eigener zweiter Versuch, die korrigierte Version erst danach (Selbstkorrektur vor Lösung)
  const better = j.better ? el('details', {}, el('summary', {}, 'Korrigierte Version zeigen'), j.better, el('div', {}, speakBtn(j.better)),
    ...(j.c1 ? [el('details', {}, el('summary', {}, 'Alternative für später (C1)'), j.c1, el('div', {}, speakBtn(j.c1)))] : [])) : null;
  if (j.focus) {
    const f = j.focus, res = el('div', { class: 'mut' }), model = el('div');
    const retry = el('button', { class: 'sm' });
    micButton(retry, '🎤 Nochmal sagen', '■ Fertig', {
      text: async t => {
        if (!t) { res.textContent = 'Nichts verstanden. Nochmal.'; return; }
        const c = await api('/check', { focus: f, text: t }, false, 60000);
        bump('retryTries'); if (c.fixed === true) bump('retryFixed');
        res.textContent = c.fixed === true ? `✓ ${c.comment}`
          : c.fixed === false ? `Fast. ${c.comment} Probier den Anfang: "${f.starter} …"`
          : 'Das konnte ich nicht sicher beurteilen. Vergleiche mit der korrigierten Version.';
      },
      error: e => { res.textContent = 'Fehler: ' + e.message; }
    });
    fb.append(el('b', {}, 'Dein Fokus'), f.de, ...(f.starter ? [el('div', { class: 'mut' }, `Beginne mit: "${f.starter} …"`)] : []),
      el('div', { class: 'row' }, retry, el('button', { class: 'sm', onclick: e => { e.target.remove(); model.append(`Lösung: ${f.model} `, speakBtn(f.model)); } }, 'Lösung zeigen')), res, model);
  }
  if (j.gaps && j.gaps.length) fb.append(el('b', {}, 'Fehlende Wörter'), ...j.gaps.map(g => el('div', {}, `${g.de} → ${g.en}`)));
  if (j.note) fb.append(el('b', {}, 'Satzbau'), j.note);
  if (better) fb.append(el('b', {}, 'Deine Version'), better);
  if (n) fb.append(el('b', {}, 'Neue Satzbausteine gespeichert'), `${n} neu im Wiederholen`);
  return fb;
}

function session(sc, opts = {}) {
  let alive = true, opening = opts.opening || null;
  const hist = [], runs = S.runs[sc.id] || 0; // runs zählt nur Durchgänge, in denen das Gegenüber wirklich geantwortet hat
  const log = el('div'), stat = el('p', { class: 'mut' }, 'Ich eröffne das Gespräch …');
  const btn = el('button', { class: 'big' });
  const add = (cls, txt) => { const d = el('div', { class: 'bub ' + cls }, txt); log.append(d); d.scrollIntoView({ block: 'end', behavior: 'smooth' }); return d; };
  const addAI = r => { const d = add('ai', r); d.append(el('div', {}, speakBtn(r))); say(r); };
  const fail = e => { add('err', 'Fehler: ' + e.message); stat.textContent = ''; };

  micButton(btn, '● Aufnehmen', '■ Fertig', {
    text: async text => {
      if (!text) { stat.textContent = 'Nichts verstanden. Nochmal.'; return; }
      add('me', text); mark(); bump('turns');
      const slot = el('div'); log.append(slot); // Feedback kommt später (ca. 10 s) und landet hier
      feedbackFor(sc, text).then(j => { const n = saveChunks(j.chunks); if (j.focus && j.focus.type) noteType(j.focus.type); if (alive) slot.append(feedbackCard(j, n)); })
        .catch(e => { if (alive) slot.append(el('div', { class: 'err' }, 'Feedback: ' + e.message)); });
      stat.textContent = 'Denke nach …';
      const r = await reply(sc, hist, text, false);
      if (!alive) return;
      hist.push({ role: 'user', content: text }, { role: 'assistant', content: r });
      addAI(r); stat.textContent = '';
    },
    error: e => { if (alive) fail(e); }
  });
  btn.disabled = true;

  const help = el('details', {}, el('summary', {}, 'Satzanfänge als Starthilfe'), ...sc.st.map(x => el('div', {}, x)));
  if (runs < 3) help.open = true; // die ersten 3 Durchgänge offen, danach nur auf Wunsch
  const again = el('div', { class: 'row' },
    el('button', { class: 'sm', onclick: () => session(sc, { opening }) }, 'Nochmal, gleiche Aufgabe'),
    el('button', { class: 'sm', onclick: () => session(sc, { variant: true }) }, 'Variante'));
  show(back(), el('h1', {}, sc.t), help, log, again, stat, btn);
  setView(() => { alive = false; recAbort(); speechSynthesis.cancel(); lockWanted = false; unlockScreen(); }); // erst NACH show()
  lockWanted = true; lockScreen();

  const start = opening ? Promise.resolve(opening) : reply(sc, [], '[START]', opts.variant);
  start.then(r => {
    if (!alive) return;
    S.runs[sc.id] = runs + 1; save();
    opening = r; hist.push({ role: 'user', content: 'Open the scene.' }, { role: 'assistant', content: r });
    addAI(r); stat.textContent = ''; btn.disabled = false;
  }).catch(e => { if (alive) { fail(e); btn.disabled = false; } });
}

const NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const ONES = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const TENS_ONES = /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[\s-](one|two|three|four|five|six|seven|eight|nine)\b/g;
const words = s => s.toLowerCase().replace(TENS_ONES, (_, t, o) => String(TENS[t] + ONES.indexOf(o) + 1)).replace(/[’‘`´]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean).map(w => (w in NUM ? String(NUM[w]) : w));
// ponytail: milde Wortprüfung. Ignoriert Reihenfolge und Bedeutung, andere richtige Formulierungen können durchfallen.
// Darum nur ein Hinweis, die Selbstbewertung entscheidet. Zahlen müssen stimmen, sonst zählt "15" statt "50" als richtig.
function matches(en, said) {
  const have = new Set(words(said)), need = words(en.replace(/\.\.\./g, ' '));
  if (!need.length || need.filter(w => /^\d+$/.test(w)).some(w => !have.has(w))) return false;
  return need.filter(w => have.has(w)).length / need.length >= 0.8;
}

function review() {
  const q = S.deck.filter(c => c.due <= today());
  const step = () => {
    if (!q.length) return show(back(), el('h1', {}, 'Wiederholen'), el('p', {}, S.deck.length ? 'Für heute fertig. 🎉' : 'Noch nichts da. Übe zuerst ein Gespräch.'));
    const c = q[0], ans = el('div'), hint = el('div', { class: 'mut' });
    // Starthilfe nur auf den unteren Stufen, später ohne
    const head = c.en.includes('...') ? c.en.split('...')[0].trim() : '';
    const start = c.box <= 1 ? (head || c.en.split(/\s+/).slice(0, 3).join(' ')) : '';
    const reveal = () => {
      if (!ans.childNodes.length) {
        say(c.en);
        ans.append(el('div', { class: 'en' }, c.en),
          el('div', { class: 'row' },
            el('button', { onclick: () => { c.box = 0; c.due = today(); save(); q.push(q.shift()); step(); } }, 'Nochmal'),
            el('button', { class: 'pri', onclick: () => { c.box = Math.min(c.box + 1, IV.length - 1); c.due = inDays(IV[c.box]); save(); mark(); q.shift(); step(); } }, 'Gewusst')));
      }
    };
    const showBtn = el('button', { class: 'pri', onclick: () => { showBtn.remove(); reveal(); } }, 'Antwort zeigen');
    const speak = el('button', { class: 'sm' });
    micButton(speak, '🎤 Sagen', '■ Fertig', {
      text: async t => {
        if (!t) { hint.textContent = 'Nichts verstanden. Nochmal.'; return; }
        hint.textContent = matches(c.en, t) ? `✓ Erkannt: "${t}"` : `Noch nicht ganz. Du sagtest: "${t}"`;
        showBtn.remove(); reveal();
      },
      error: e => { hint.textContent = 'Fehler: ' + e.message; }
    });
    show(back(), el('h1', {}, 'Wiederholen'), el('p', { class: 'mut' }, `${q.length} offen. Sag den Satz laut auf Englisch:`),
      el('div', { class: 'en' }, c.de), ...(start ? [el('div', { class: 'mut' }, `Anfang: "${start} …"`)] : []), el('div', {}, speak), hint, showBtn, ans);
    setView(() => { recAbort(); speechSynthesis.cancel(); }); // erst NACH show()
  };
  step();
}

function settings() {
  const noFix = { autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', autocomplete: 'off' }; // iOS-Tastatur verändert sonst Adressen
  const br = el('input', { type: 'url', placeholder: 'leer lassen, wenn die App von der Brücke geladen wurde', value: S.bridge, ...noFix });
  const tk = el('input', { type: 'password', placeholder: 'BRIDGE_TOKEN aus bridge/.env', value: S.token, ...noFix });
  const msg = el('p', { class: 'mut' });
  const validShape = o => o && Array.isArray(o.deck) && o.deck.every(okCard) && Array.isArray(o.days) && o.days.every(x => typeof x === 'string');
  show(back(), el('h1', {}, 'Einstellungen'),
    el('p', { class: 'mut' }, 'Spracherkennung und Gegenüber laufen auf deinem PC. Das Feedback geht über dein ChatGPT-Konto (Codex) an OpenAI. Dein PC schreibt deine Sätze (nur Text) in ein lokales Übungsprotokoll.'),
    el('h2', {}, 'Adresse der PC-Brücke'), br,
    el('h2', {}, 'Token'), tk,
    el('button', { class: 'pri', onclick: async () => {
      S.bridge = br.value.trim().replace(/\/+$/, ''); S.token = tk.value.trim(); save();
      msg.textContent = 'Teste …';
      try { await api('/auth', {}); msg.textContent = 'Gespeichert. PC erreichbar, Token stimmt. ✓'; }
      catch (e) { msg.textContent = `Gespeichert, aber: ${e.message} (Adresse "${base()}")`; } // Adresse ist kein Geheimnis, Token wird nie angezeigt
    } }, 'Speichern und testen'),
    el('h2', {}, 'Sicherung'),
    el('button', { onclick: async () => { try { await navigator.clipboard.writeText(JSON.stringify({ deck: S.deck, days: S.days })); msg.textContent = 'In die Zwischenablage kopiert.'; } catch { msg.textContent = 'Kopieren nicht erlaubt.'; } } }, 'Sicherung kopieren'),
    el('button', { onclick: () => {
      const t = prompt('Sicherung einfügen'); if (!t) return;
      let o; try { o = JSON.parse(t); } catch {}
      if (!validShape(o)) { msg.textContent = 'Ungültige Sicherung. Nichts geändert.'; return; }
      const old = { deck: S.deck, days: S.days };
      try { localStorage.setItem(KEY + '_backup', JSON.stringify(old)); } catch { msg.textContent = 'Konnte den alten Stand nicht als Vorversion sichern. Nichts geändert.'; return; }
      S.deck = fixDeck(o.deck); S.days = o.days; save();
      if (saveFailed) { S.deck = old.deck; S.days = old.days; msg.textContent = 'Speichern im Handy fehlgeschlagen. Nichts geändert.'; return; }
      msg.textContent = `Wiederhergestellt (${S.deck.length} Satzbausteine). Der alte Stand liegt als Vorversion bereit.`;
    } }, 'Sicherung einfügen'),
    el('button', { onclick: () => {
      let o; try { o = JSON.parse(localStorage.getItem(KEY + '_backup')); } catch {}
      if (!validShape(o)) { msg.textContent = 'Keine Vorversion vorhanden.'; return; }
      S.deck = fixDeck(o.deck); S.days = o.days; save(); msg.textContent = saveFailed ? 'Speichern im Handy fehlgeschlagen.' : 'Vorversion zurückgeholt.';
    } }, 'Vorversion zurückholen'),
    msg);
}

home();
