// Business English Trainer. Alles lokal im Handy (localStorage). Nur Audio/Text gehen an OpenAI.
const $ = s => document.querySelector(s);
const S = Object.assign({ key: '', chatModel: 'gpt-4o', sttModel: 'whisper-1', deck: [], days: [] },
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

// ---------- OpenAI ----------
async function api(path, opts) {
  if (!S.key) throw new Error('Kein API-Schlüssel. Unter Einstellungen eintragen.');
  const r = await fetch('https://api.openai.com/v1/' + path, { ...opts, headers: { ...opts.headers, Authorization: 'Bearer ' + S.key } });
  if (!r.ok) { let m = r.status; try { m = (await r.json()).error.message; } catch {} throw new Error(m); }
  return r.json();
}
async function stt(blob) {
  const f = new FormData();
  f.append('file', blob, 'a.' + (blob.type.includes('mp4') ? 'mp4' : 'webm'));
  f.append('model', S.sttModel);
  f.append('prompt', 'Business negotiation. English with some German words.'); // keine feste Sprache: Deutsch zwischendurch erlaubt
  return (await api('audio/transcriptions', { method: 'POST', body: f })).text;
}
async function chat(messages) {
  const r = await api('chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: S.chatModel, response_format: { type: 'json_object' }, messages })
  });
  return JSON.parse(r.choices[0].message.content);
}

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
const SYS = sc => `You are a business English coach and role-play partner.
Scenario: ${sc[1]}
Stay in role. The user is a German speaker at roughly B1 speaking level who must reach C1 negotiation English. Their message is a speech transcript; German words in it mark vocabulary they were missing.
Always answer with ONLY a JSON object:
{"reply": "your next line in role, natural C1 business English, 1-3 sentences, keep the negotiation moving",
 "corrected": "the user's last utterance as ONE natural, fluent C1 business English version, same meaning",
 "gaps": [{"de":"German word or phrase the user was missing or got wrong","en":"best English"}],
 "chunks": [{"de":"short German description of the situation/intention","en":"reusable English sentence frame, with ... for the variable part"}],
 "note": "one short German sentence about their biggest sentence-structure problem, or empty"}
Max 3 gaps and max 3 chunks; chunks must be useful sentence patterns, not single words.
For the very first turn the user message is [START]: return ONLY {"reply": "..."} that opens the scene.`;

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
  const hist = [{ role: 'system', content: SYS(sc) }];
  const log = el('div'), stat = el('p', { class: 'mut' }, 'Ich eröffne das Gespräch …');
  const btn = el('button', { class: 'big' }, '● Aufnehmen');
  btn.disabled = true;
  let on = false;
  const add = (cls, txt) => { const d = el('div', { class: 'bub ' + cls }, txt); log.append(d); d.scrollIntoView({ block: 'end', behavior: 'smooth' }); return d; };
  const fail = e => { add('err', 'Fehler: ' + e.message); stat.textContent = ''; };

  function feedback(j) {
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
    log.append(fb);
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
      hist.push({ role: 'user', content: text });
      stat.textContent = 'Denke nach …';
      const j = await chat(hist);
      hist.push({ role: 'assistant', content: JSON.stringify({ reply: j.reply }) });
      feedback(j); mark();
      add('ai', j.reply); say(j.reply);
      stat.textContent = '';
    } catch (e) { on = false; fail(e); }
    finally { btn.disabled = false; btn.classList.remove('rec'); btn.textContent = '● Aufnehmen'; }
  };

  show(back(), el('h1', {}, sc[0]), log, stat, btn);
  hist.push({ role: 'user', content: '[START]' });
  chat(hist).then(j => {
    hist.push({ role: 'assistant', content: JSON.stringify({ reply: j.reply }) });
    add('ai', j.reply); say(j.reply); stat.textContent = ''; btn.disabled = false;
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
  const key = el('input', { type: 'password', placeholder: 'sk-…', value: S.key });
  const cm = el('input', { value: S.chatModel }), sm = el('input', { value: S.sttModel });
  const msg = el('p', { class: 'mut' });
  show(back(), el('h1', {}, 'Einstellungen'),
    el('h2', {}, 'OpenAI API-Schlüssel'), key,
    el('h2', {}, 'Chat-Modell'), cm, el('h2', {}, 'Spracherkennung'), sm,
    el('button', { class: 'pri', onclick: () => { S.key = key.value.trim(); S.chatModel = cm.value.trim(); S.sttModel = sm.value.trim(); save(); msg.textContent = 'Gespeichert.'; } }, 'Speichern'),
    el('h2', {}, 'Sicherung (ohne Schlüssel)'),
    el('button', { onclick: async () => { await navigator.clipboard.writeText(JSON.stringify({ deck: S.deck, days: S.days })); msg.textContent = 'In die Zwischenablage kopiert.'; } }, 'Sicherung kopieren'),
    el('button', { onclick: () => { const t = prompt('Sicherung einfügen'); if (!t) return; try { const o = JSON.parse(t); S.deck = o.deck; S.days = o.days; save(); msg.textContent = 'Wiederhergestellt.'; } catch { msg.textContent = 'Ungültig.'; } } }, 'Sicherung einfügen'),
    msg);
}

home();
