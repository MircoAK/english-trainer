// Business English Trainer. Daten lokal im Handy (localStorage). Audio/Text gehen nur an deinen PC (bridge/server.py).
const $ = s => document.querySelector(s);
const S = Object.assign({ bridge: '', token: '', deck: [], days: [] },
  JSON.parse(localStorage.getItem('bt') || '{}'));
const save = () => localStorage.setItem('bt', JSON.stringify(S));
const dstr = d => d.toLocaleDateString('sv'); // YYYY-MM-DD, lokale Zeit
const today = () => dstr(new Date());
const inDays = n => { const d = new Date(); d.setDate(d.getDate() + n); return dstr(d); };

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
const show = (...n) => { speechSynthesis.cancel(); $('#app').replaceChildren(...n); window.scrollTo(0, 0); };
const say = t => { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.lang = 'en-US'; u.rate = .95; speechSynthesis.speak(u); };
const back = () => el('button', { class: 'back', onclick: home }, '← Zurück');

// ---------- Brücke zum PC ----------
// Läuft die App von der Brücke selbst (*.ts.net), ist deren Adresse automatisch die eigene.
const base = () => (S.bridge || (location.hostname.endsWith('.ts.net') ? location.origin : '')).replace(/\/+$/, '');
async function api(path, body, raw) {
  if (!base() || !S.token) throw new Error('Brücke nicht eingerichtet. Unter Einstellungen eintragen.');
  let r;
  try {
    r = await fetch(base() + path, { method: 'POST', headers: { 'X-Token': S.token, ...(raw ? {} : { 'Content-Type': 'application/json' }) }, body: raw ? body : JSON.stringify(body) });
  } catch { throw new Error('PC nicht erreichbar. Läuft die Brücke und ist Tailscale an?'); }
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || r.status);
  return j;
}
const stt = async blob => (await api('/stt', blob, true)).text;
const reply = (sc, history, text) => api('/reply', { scenario: sc[1], history, text }).then(j => j.reply);
const feedbackFor = (sc, text) => api('/feedback', { scenario: sc[1], text });

let rec, parts = [];
async function recStart() {
  const st = await navigator.mediaDevices.getUserMedia({ audio: true });
  rec = new MediaRecorder(st); parts = [];
  rec.ondataavailable = e => parts.push(e.data);
  rec.start();
}
const recStop = () => new Promise(res => {
  rec.onstop = () => { rec.stream.getTracks().forEach(t => t.stop()); res(new Blob(parts, { type: rec.mimeType })); };
  rec.stop();
});

// ---------- Szenarien ----------
const SCENARIOS = [
  ['Angebot: "Zu teuer"', 'You are the managing director of a mid-size manufacturing company. The user is a consultant presenting a project quote. You say it is too expensive and push for a discount, but are open to a reduced scope.'],
  ['Projektumfang erweitert sich', 'You are a client who keeps asking for extra work outside the agreed scope. The user is a consultant who must defend the scope and negotiate a change request with extra budget.'],
  ['Zahlungsbedingungen', 'You are a CFO. The user wants 50% upfront payment. You prefer payment after delivery, 60 days. Negotiate payment terms.'],
  ['Frist verschieben', 'You are a client whose deadline is fixed. The user needs two more weeks. You are unhappy but negotiable if given a clear plan and a concession.'],
  ['Provision verhandeln (Partnerprogramm)', 'You are a partnerships manager at a software company. The user runs a comparison website and wants a higher affiliate commission and a longer cookie duration. You have limited room.'],
  ['Vertragsklauseln', 'You are a lawyer of the other party. The user wants to change the liability and termination clauses of a service contract. Negotiate firmly but fairly.'],
  ['Höflich absagen', 'You are a potential client who wants a custom project that does not fit the user. The user must decline politely and keep the relationship, maybe proposing an alternative.'],
  ['Einwand: "Wir haben schon einen Anbieter"', 'You are a skeptical buyer who already works with a competitor. The user must create interest and negotiate a small pilot project.']
];
// ---------- Views ----------
function home() {
  const due = S.deck.filter(c => c.due <= today()).length;
  show(
    el('h1', {}, 'Business English'),
    el('div', { class: 'streak' }, `🔥 ${streak()} ${streak() === 1 ? 'Tag' : 'Tage'}`),
    el('p', { class: 'mut' }, `${S.deck.length} Satzbausteine gespeichert`),
    el('button', { class: 'pri', onclick: review }, `Wiederholen (${due} fällig)`),
    el('h2', {}, 'Gespräch üben'),
    ...SCENARIOS.map(sc => el('button', { onclick: () => session(sc) }, sc[0])),
    el('h2', {}, ' '),
    el('button', { onclick: settings }, 'Einstellungen')
  );
}

function session(sc) {
  const hist = [];
  const log = el('div'), stat = el('p', { class: 'mut' }, 'Ich eröffne das Gespräch …');
  const btn = el('button', { class: 'big' }, '● Aufnehmen');
  btn.disabled = true;
  let on = false;
  const add = (cls, txt) => { const d = el('div', { class: 'bub ' + cls }, txt); log.append(d); d.scrollIntoView({ block: 'end', behavior: 'smooth' }); return d; };
  const fail = e => { add('err', 'Fehler: ' + e.message); stat.textContent = ''; };

  function feedback(j, slot) {
    const fb = el('div', { class: 'fb' });
    if (j.corrected) fb.append(el('b', {}, 'So klingt es auf C1'), j.corrected,
      el('button', { class: 'sm', onclick: () => say(j.corrected) }, '🔊 anhören'));
    if (j.gaps && j.gaps.length) fb.append(el('b', {}, 'Fehlende Wörter'), ...j.gaps.map(g => el('div', {}, `${g.de} → ${g.en}`)));
    if (j.note) fb.append(el('b', {}, 'Satzbau'), j.note);
    let n = 0;
    for (const c of j.chunks || []) {
      if (!c.en || !c.de || S.deck.some(x => x.en === c.en)) continue;
      S.deck.push({ de: c.de, en: c.en, box: 0, due: today() }); n++;
    }
    if (n) { save(); fb.append(el('b', {}, 'Neue Satzbausteine gespeichert'), `${n} neu im Wiederholen`); }
    slot.append(fb);
  }

  btn.onclick = async () => {
    try {
      if (!on) {
        await recStart(); on = true;
        btn.textContent = '■ Fertig'; btn.classList.add('rec'); stat.textContent = 'Ich höre zu. Nimm dir Zeit.';
        return;
      }
      on = false; btn.disabled = true; btn.classList.remove('rec'); btn.textContent = '…'; stat.textContent = 'Verstehe dich …';
      const text = (await stt(await recStop())).trim();
      if (!text) { stat.textContent = 'Nichts verstanden. Nochmal.'; return; }
      add('me', text);
      const slot = el('div'); log.append(slot); // Feedback kommt später (ca. 10 s) und landet hier
      feedbackFor(sc, text).then(j => { feedback(j, slot); mark(); }).catch(e => slot.append(el('div', { class: 'err' }, 'Feedback: ' + e.message)));
      stat.textContent = 'Denke nach …';
      const r = await reply(sc, hist, text);
      hist.push({ role: 'user', content: text }, { role: 'assistant', content: r });
      add('ai', r); say(r);
      stat.textContent = '';
    } catch (e) { on = false; fail(e); }
    finally { btn.disabled = false; btn.classList.remove('rec'); btn.textContent = '● Aufnehmen'; }
  };

  show(back(), el('h1', {}, sc[0]), log, stat, btn);
  reply(sc, [], '[START]').then(r => {
    hist.push({ role: 'user', content: 'Open the scene.' }, { role: 'assistant', content: r });
    add('ai', r); say(r); stat.textContent = ''; btn.disabled = false;
  }).catch(e => { fail(e); btn.disabled = false; });
}

const IV = [0, 1, 3, 7, 14, 30, 60]; // Tage bis zur nächsten Wiederholung pro Stufe
function review() {
  const q = S.deck.filter(c => c.due <= today());
  const step = () => {
    if (!q.length) return show(back(), el('h1', {}, 'Wiederholen'), el('p', {}, S.deck.length ? 'Für heute fertig. 🎉' : 'Noch nichts da. Übe zuerst ein Gespräch.'));
    const c = q[0];
    const ans = el('div');
    const showBtn = el('button', { class: 'pri', onclick: () => {
      showBtn.remove(); say(c.en);
      ans.append(el('div', { class: 'en' }, c.en),
        el('div', { class: 'row' },
          el('button', { onclick: () => { q.push(q.shift()); step(); } }, 'Nochmal'),
          el('button', { class: 'pri', onclick: () => { c.box = Math.min(c.box + 1, IV.length - 1); c.due = inDays(IV[c.box]); save(); mark(); q.shift(); step(); } }, 'Gewusst')));
    } }, 'Antwort zeigen');
    c.box = c.box || 0;
    show(back(), el('h1', {}, 'Wiederholen'), el('p', { class: 'mut' }, `${q.length} offen. Sag den Satz laut auf Englisch:`),
      el('div', { class: 'en' }, c.de), showBtn, ans);
  };
  step();
}

function settings() {
  const noFix = { autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', autocomplete: 'off' }; // iOS-Tastatur verändert sonst Adressen
  const br = el('input', { type: 'url', placeholder: 'https://dein-pc.tailnet.ts.net', value: S.bridge, ...noFix });
  const tk = el('input', { type: 'password', placeholder: 'BRIDGE_TOKEN aus bridge/.env', value: S.token, ...noFix });
  const msg = el('p', { class: 'mut' });
  show(back(), el('h1', {}, 'Einstellungen'),
    el('h2', {}, 'Adresse der PC-Brücke'), br,
    el('h2', {}, 'Token'), tk,
    el('button', { class: 'pri', onclick: async () => {
      S.bridge = br.value.trim().replace(/\/+$/, ''); S.token = tk.value.trim(); save();
      msg.textContent = 'Teste …';
      try { const r = await fetch(base() + '/health'); msg.textContent = (await r.json()).ok ? 'Gespeichert. PC erreichbar. ✓' : 'Gespeichert, aber komische Antwort.'; }
      catch (e) { msg.textContent = `Gespeichert, aber Fehler (${e.name}: ${e.message}) bei Adresse "${base()}"`; } // Adresse ist kein Geheimnis, Token wird nie angezeigt
    } }, 'Speichern und testen'),
    el('h2', {}, 'Sicherung'),
    el('button', { onclick: async () => { await navigator.clipboard.writeText(JSON.stringify({ deck: S.deck, days: S.days })); msg.textContent = 'In die Zwischenablage kopiert.'; } }, 'Sicherung kopieren'),
    el('button', { onclick: () => { const t = prompt('Sicherung einfügen'); if (!t) return; try { const o = JSON.parse(t); S.deck = o.deck; S.days = o.days; save(); msg.textContent = 'Wiederhergestellt.'; } catch { msg.textContent = 'Ungültig.'; } } }, 'Sicherung einfügen'),
    msg);
}

home();
