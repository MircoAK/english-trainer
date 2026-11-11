// Business English Trainer. Deine Daten (Satzbausteine, Tage) liegen nur im Handy (localStorage).
// Aufnahme und Text gehen an die PC-Brücke (bridge/server.py). Das Feedback läuft dort über dein ChatGPT-Konto (Codex).
const $ = s => document.querySelector(s);
const dstr = d => d.toLocaleDateString('sv'); // YYYY-MM-DD, lokale Zeit
const today = () => dstr(new Date());
const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return dstr(d); };
const KEY = 'bt';

function load() { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch { return {}; } }
const S = Object.assign({ bridge: '', token: '', deck: [], days: [], level: 1, runs: {}, newToday: { d: '', n: 0 } }, load());
const okCard = c => c && typeof c.de === 'string' && typeof c.en === 'string';
const fixDeck = d => (Array.isArray(d) ? d : []).filter(okCard).map(c => ({ de: c.de, en: c.en, box: Number.isInteger(c.box) ? c.box : 0, due: typeof c.due === 'string' ? c.due : today() }));
S.deck = fixDeck(S.deck);
S.days = (Array.isArray(S.days) ? S.days : []).filter(x => typeof x === 'string');
if (![1, 2, 3].includes(S.level)) S.level = 1;
if (!S.runs || typeof S.runs !== 'object') S.runs = {};
if (!S.newToday || typeof S.newToday !== 'object') S.newToday = { d: '', n: 0 };
let saveFailed = false;
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); saveFailed = false; } catch { saveFailed = true; } };

function mark() { if (!S.days.includes(today())) { S.days.push(today()); save(); } }
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
const show = (...n) => { if (cleanup) { cleanup(); cleanup = null; } speechSynthesis.cancel(); $('#app').replaceChildren(...n); window.scrollTo(0, 0); };
const say = t => { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'en-US'; u.rate = .95; speechSynthesis.speak(u); };
const speakBtn = t => el('button', { class: 'sm', onclick: () => say(t) }, '🔊 anhören');
const back = () => el('button', { class: 'back', onclick: home }, '← Zurück');

// ---------- Brücke zum PC ----------
// Läuft die App von der Brücke selbst (*.ts.net), ist deren Adresse automatisch die eigene.
const base = () => (S.bridge || (location.hostname.endsWith('.ts.net') ? location.origin : '')).replace(/\/+$/, '');
async function api(path, body, raw, ms = 45000) {
  if (!base() || !S.token) throw new Error('Brücke nicht eingerichtet. Unter Einstellungen eintragen.');
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  let r;
  try {
    r = await fetch(base() + path, { method: 'POST', signal: ctl.signal, headers: { 'X-Token': S.token, ...(raw ? {} : { 'Content-Type': 'application/json' }) }, body: raw ? body : JSON.stringify(body) });
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'Zeitüberschreitung. PC zu langsam oder Brücke hängt.' : 'PC nicht erreichbar. Läuft die Brücke und ist Tailscale an?'); }
  finally { clearTimeout(t); }
  let j; try { j = await r.json(); } catch { throw new Error('Komische Antwort vom PC (' + r.status + ')'); }
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}
const stt = async blob => (await api('/stt', blob, true, 60000)).text;
const reply = (sc, history, text, variant) => api('/reply', { scenario: sc.setup, history, text, level: S.level, variant: !!variant }).then(j => j.reply);
const feedbackFor = (sc, text) => api('/feedback', { scenario: sc.setup, text }, false, 150000);

// ---------- Mikrofon ----------
let rec = null, parts = [], micInUse = false;
async function recStart() {
  let st;
  try { st = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch { throw new Error('Mikrofon nicht erlaubt. In den iOS-Einstellungen unter Safari das Mikrofon erlauben.'); }
  const r = new MediaRecorder(st); parts = [];
  r.ondataavailable = e => parts.push(e.data);
  r.start(); rec = r;
}
const recStop = () => new Promise(res => {
  const r = rec; rec = null;
  r.onstop = () => { r.stream.getTracks().forEach(t => t.stop()); res(new Blob(parts, { type: r.mimeType })); };
  r.stop();
});
function recAbort() { if (rec) { const r = rec; rec = null; r.onstop = null; try { r.stop(); } catch {} r.stream.getTracks().forEach(t => t.stop()); } micInUse = false; }

// Ein Knopf mit klaren Zuständen: idle -> starting -> recording -> busy -> idle. Nur ein Mikrofon gleichzeitig.
function micButton(btn, idleText, recText, h) {
  let st = 'idle';
  const set = s => { st = s; btn.classList.toggle('rec', s === 'recording'); btn.textContent = s === 'recording' ? recText : s === 'idle' ? idleText : '…'; btn.disabled = s === 'starting' || s === 'busy'; };
  set('idle');
  btn.onclick = async () => {
    if (st === 'idle') {
      if (micInUse) return;
      micInUse = true; set('starting');
      try { await recStart(); set('recording'); } catch (e) { micInUse = false; set('idle'); h.error(e); }
    } else if (st === 'recording') {
      set('busy');
      try { await h.text((await stt(await recStop())).trim()); } catch (e) { h.error(e); } finally { micInUse = false; set('idle'); }
    }
  };
}

let wake = null;
const lockScreen = async () => { try { wake = await navigator.wakeLock.request('screen'); } catch {} };
const unlockScreen = () => { try { wake && wake.release(); } catch {} wake = null; };

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

// neue Satzbausteine speichern; höchstens 4 pro Tag sind sofort fällig, der Rest morgen
function saveChunks(list) {
  let n = 0;
  for (const c of list || []) {
    if (!c.en || !c.de || S.deck.some(x => x.en === c.en)) continue;
    if (S.newToday.d !== today()) S.newToday = { d: today(), n: 0 };
    S.deck.push({ de: c.de, en: c.en, box: 0, due: S.newToday.n < 4 ? today() : inDays(1) });
    S.newToday.n++; n++;
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
    el('button', { class: 'pri', onclick: review }, `Wiederholen (${due} fällig)`),
    el('h2', {}, 'Gespräch üben'),
    el('p', { class: 'mut' }, 'Wie schwer soll das Gegenüber sein?'), lv,
    ...SCENARIOS.map(sc => el('button', { onclick: () => session(sc) }, sc.t)),
    el('h2', {}, ' '),
    el('button', { onclick: settings }, 'Einstellungen')
  );
}

function feedbackCard(j, n) {
  const fb = el('div', { class: 'fb' });
  if (j.better) fb.append(el('b', {}, 'Deine Version, verständlich korrigiert'), j.better, el('div', {}, speakBtn(j.better)));
  if (j.c1) fb.append(el('details', {}, el('summary', {}, 'Alternative für später (C1)'), j.c1, el('div', {}, speakBtn(j.c1))));
  if (j.gaps && j.gaps.length) fb.append(el('b', {}, 'Fehlende Wörter'), ...j.gaps.map(g => el('div', {}, `${g.de} → ${g.en}`)));
  if (j.note) fb.append(el('b', {}, 'Satzbau'), j.note);
  if (j.focus) {
    const f = j.focus, res = el('div', { class: 'mut' }), model = el('div');
    const retry = el('button', { class: 'sm' });
    micButton(retry, '🎤 Nochmal sagen', '■ Fertig', {
      text: async t => {
        if (!t) { res.textContent = 'Nichts verstanden. Nochmal.'; return; }
        const c = await api('/check', { focus: f, text: t });
        res.textContent = (c.fixed ? '✓ ' : 'Fast. ') + c.comment + (c.fixed ? '' : ` Probier den Anfang: "${f.starter} …"`);
      },
      error: e => { res.textContent = 'Fehler: ' + e.message; }
    });
    fb.append(el('b', {}, 'Dein Fokus'), f.de, ...(f.starter ? [el('div', { class: 'mut' }, `Beginne mit: "${f.starter} …"`)] : []),
      el('div', { class: 'row' }, retry, el('button', { class: 'sm', onclick: e => { e.target.remove(); model.append(`Lösung: ${f.model} `, speakBtn(f.model)); } }, 'Lösung zeigen')), res, model);
  }
  if (n) fb.append(el('b', {}, 'Neue Satzbausteine gespeichert'), `${n} neu im Wiederholen`);
  return fb;
}

function session(sc, opts = {}) {
  let alive = true, opening = opts.opening || null;
  const hist = [];
  S.runs[sc.id] = (S.runs[sc.id] || 0) + 1; save();
  const log = el('div'), stat = el('p', { class: 'mut' }, 'Ich eröffne das Gespräch …');
  const btn = el('button', { class: 'big' });
  const say2 = t => { say(t); };
  const add = (cls, txt) => { const d = el('div', { class: 'bub ' + cls }, txt); log.append(d); d.scrollIntoView({ block: 'end', behavior: 'smooth' }); return d; };
  const addAI = r => { const d = add('ai', r); d.append(el('div', {}, speakBtn(r))); say2(r); };
  const fail = e => { add('err', 'Fehler: ' + e.message); stat.textContent = ''; };
  cleanup = () => { alive = false; recAbort(); speechSynthesis.cancel(); unlockScreen(); };

  micButton(btn, '● Aufnehmen', '■ Fertig', {
    text: async text => {
      if (!text) { stat.textContent = 'Nichts verstanden. Nochmal.'; return; }
      add('me', text); mark();
      const slot = el('div'); log.append(slot); // Feedback kommt später (ca. 10 s) und landet hier
      feedbackFor(sc, text).then(j => { const n = saveChunks(j.chunks); if (alive) slot.append(feedbackCard(j, n)); })
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
  if (S.runs[sc.id] <= 3) help.open = true; // die ersten 3 Durchgänge offen, danach nur auf Wunsch
  const again = el('div', { class: 'row' },
    el('button', { class: 'sm', onclick: () => session(sc, { opening }) }, 'Nochmal, gleiche Aufgabe'),
    el('button', { class: 'sm', onclick: () => session(sc, { variant: true }) }, 'Variante'));
  show(back(), el('h1', {}, sc.t), help, log, again, stat, btn);
  lockScreen();

  const start = opening ? Promise.resolve(opening) : reply(sc, [], '[START]', opts.variant);
  start.then(r => {
    if (!alive) return;
    opening = r; hist.push({ role: 'user', content: 'Open the scene.' }, { role: 'assistant', content: r });
    addAI(r); stat.textContent = ''; btn.disabled = false;
  }).catch(e => { if (alive) { fail(e); btn.disabled = false; } });
}

const IV = [0, 1, 3, 7, 14, 30, 60]; // Tage bis zur nächsten Wiederholung pro Stufe
const words = s => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean);
// ponytail: milde Wortprüfung. Andere richtige Formulierungen können durchfallen, darum ist das nur ein Hinweis, die Selbstbewertung entscheidet.
function matches(en, said) {
  const have = new Set(words(said)), need = words(en.replace(/\.\.\./g, ' '));
  return need.length > 0 && need.filter(w => have.has(w)).length / need.length >= 0.8;
}

function review() {
  const q = S.deck.filter(c => c.due <= today());
  const step = () => {
    if (!q.length) return show(back(), el('h1', {}, 'Wiederholen'), el('p', {}, S.deck.length ? 'Für heute fertig. 🎉' : 'Noch nichts da. Übe zuerst ein Gespräch.'));
    const c = q[0], ans = el('div'), hint = el('div', { class: 'mut' });
    // Starthilfe nur auf den unteren Stufen, später ohne
    const start = c.box <= 1 ? (c.en.split('...')[0].trim() || c.en.split(/\s+/).slice(0, 3).join(' ')) : '';
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
    cleanup = () => { recAbort(); speechSynthesis.cancel(); };
    show(back(), el('h1', {}, 'Wiederholen'), el('p', { class: 'mut' }, `${q.length} offen. Sag den Satz laut auf Englisch:`),
      el('div', { class: 'en' }, c.de), ...(start ? [el('div', { class: 'mut' }, `Anfang: "${start} …"`)] : []), el('div', {}, speak), hint, showBtn, ans);
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
    el('p', { class: 'mut' }, 'Spracherkennung und Gegenüber laufen auf deinem PC. Das Feedback geht über dein ChatGPT-Konto (Codex) an OpenAI.'),
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
      try { localStorage.setItem(KEY + '_backup', JSON.stringify({ deck: S.deck, days: S.days })); } catch {}
      S.deck = fixDeck(o.deck); S.days = o.days; save(); msg.textContent = `Wiederhergestellt (${S.deck.length} Satzbausteine). Der alte Stand liegt als Vorversion bereit.`;
    } }, 'Sicherung einfügen'),
    el('button', { onclick: () => {
      let o; try { o = JSON.parse(localStorage.getItem(KEY + '_backup')); } catch {}
      if (!validShape(o)) { msg.textContent = 'Keine Vorversion vorhanden.'; return; }
      S.deck = fixDeck(o.deck); S.days = o.days; save(); msg.textContent = 'Vorversion zurückgeholt.';
    } }, 'Vorversion zurückholen'),
    msg);
}

home();
