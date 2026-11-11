// Mini-Spiele und Fortschrittsseite. Wird nach app.js geladen und nutzt dessen Funktionen (show, micButton, api, bump, ...).
// Jedes Spiel erklärt, zeigt andere Möglichkeiten und gibt auf Wunsch persönliches Feedback (das kostet einen Codex-Aufruf, darum nur auf Knopfdruck).

// ---------- Inhalte ----------
// [deutsch, englisch, englische Kurzdefinition, zwei Beispiel-Erklärungen]
const WORDS = [
  ['Anzahlung', 'down payment', 'a part of the total price that is paid in advance', ["It's money you pay before the work starts.", "It's the first part of the payment, paid in advance."]],
  ['Rabatt', 'discount', 'a reduction in the normal price', ["It's when the price is lower than normal.", "It's an amount we take off the price."]],
  ['Frist', 'deadline', 'the latest date by which something must be done', ["It's the last day by which something must be finished.", "It's the date when the work has to be ready."]],
  ['Angebot', 'quote', 'a document that states the price you offer for a job', ["It's a document that shows what we will do and what it costs.", "It's the price we offer for a job, written down."]],
  ['Haftung', 'liability', 'legal responsibility for damage or loss', ['It means who has to pay if something goes wrong.', "It's the legal responsibility for damage or loss."]],
  ['Kündigung', 'termination', 'officially ending a contract', ["It's when someone officially ends the contract.", "It's when a contract ends because one side decides to end it."]],
  ['Zahlungsziel', 'payment term', 'the number of days a customer has to pay an invoice', ["It's how many days the customer has to pay the invoice.", "It's the time you give the customer to pay."]],
  ['Mehrkosten', 'additional costs', 'extra costs on top of the agreed price', ["It's extra money on top of the agreed price.", "It's the extra money we have to pay on top of the plan."]],
  ['Rechnung', 'invoice', 'a document asking a customer to pay for goods or services', ["It's a document that asks the customer to pay.", "It's what we send after the work is done to get our money."]],
  ['Vertragsstrafe', 'contractual penalty', 'money that must be paid if a contract rule is broken', ["It's money you must pay if you break a rule in the contract.", "It's a fine for not keeping the agreement."]],
  ['Lieferverzug', 'delay in delivery', 'goods are delivered, or work is completed, later than agreed', ["It's when the delivery comes later than agreed.", 'It means the goods are late.']],
  ['Preiserhöhung', 'price increase', 'raising the price of something', ["It's when something becomes more expensive.", "It's when we raise the price."]],
  ['Verhandlungsspielraum', 'room to negotiate', 'how much both sides can still move on price or terms', ["It's how much we can still change the price or terms.", "It's how much each side can change its position."]],
  ['Vertragslaufzeit', 'contract duration', 'how long a contract is valid', ["It's how long the contract is valid.", "It's the period from the start until the end of the contract."]]
];

// [Situation, Satzrahmen, Erklärung auf Deutsch, Beispielsatz]
const FRAMES = [
  ['Du willst einen Rabatt gegen eine Gegenleistung anbieten', 'We could offer a discount if you ...', 'Bedingter Rabatt: Du gibst etwas, wenn der andere etwas gibt. Das wirkt freundlich und fest zugleich.', 'We could offer a 5% discount if you confirm the order this week.'],
  ['Du erklärst, dass etwas nicht im Angebot enthalten ist', 'That would be outside the scope of ...', 'Höfliche Grenze: Nicht "nein", sondern "das gehört nicht dazu".', 'That would be outside the scope of our current agreement, but I can send a separate quote.'],
  ['Du bietest nach einem Nein eine Alternative an', 'What I can offer instead is ...', 'Nach einem Nein sofort eine Alternative nennen, damit das Gespräch weitergeht.', 'What I can offer instead is a smaller package at a lower price.'],
  ['Du zeigst Verständnis, bevor du widersprichst', 'I understand your concern, but ...', 'Erst Verständnis, dann dein Punkt. Der andere fühlt sich gehört, das hilft meistens.', 'I understand your concern, but the price reflects the quality we deliver.'],
  ['Du fragst nach einem Zugeständnis', 'Would you be open to ... if we ...?', 'Eine weiche Frage statt einer Forderung. "Wären Sie offen für ..., wenn wir ...?"', 'Would you be open to a longer contract if we lower the monthly fee?'],
  ['Du schlägst einen Kompromiss vor', 'How about we meet in the middle at ...?', 'Der Klassiker für Kompromisse bei Preis oder Termin.', 'How about we meet in the middle at 8,000 euros?'],
  ['Du brauchst Zeit zum Prüfen', 'I need to check ... and get back to you by ...', 'Zeit gewinnen, ohne unsicher zu wirken: Nenne am besten einen Zeitpunkt.', 'I need to check the details with my team and get back to you by Friday.'],
  ['Du bestätigst am Ende, was vereinbart wurde', 'Just to confirm, we agreed that ...', 'Eine Zusammenfassung am Ende vermeidet Missverständnisse.', 'Just to confirm, we agreed that delivery is in March and payment is within 30 days.'],
  ['Du bittest um Klärung', 'Could you clarify what you mean by ...?', 'Nachfragen ist stark, nicht schwach. So bekommst du die Details.', 'Could you clarify what you mean by "flexible payment"?'],
  ['Du lehnst höflich ab', 'Unfortunately, we are not able to ... because ...', 'Ein höfliches Nein mit Grund. Der Grund macht es leichter anzunehmen.', 'Unfortunately, we are not able to start before May because our team is fully booked.'],
  ['Du stimmst unter einer Bedingung zu', 'We could agree to that, provided that ...', 'Zustimmung mit Bedingung: "unter der Voraussetzung, dass".', 'We could agree to that, provided that the payment is made upfront.'],
  ['Du erklärst den Nutzen', 'The main benefit for you would be ...', 'Verhandeln heißt Nutzen zeigen, nicht nur den Preis nennen.', 'The main benefit for you would be a faster delivery time.'],
  ['Du bittest um mehr Zeit, zum Beispiel eine längere Frist', 'Would it be possible to extend ... by ...?', 'Eine höfliche Bitte um eine Verlängerung. Für mehr Budget sagst du: "increase the budget by ...".', 'Would it be possible to extend the deadline by two weeks?'],
  ['Du schlägst die nächsten Schritte vor', 'As a next step, I suggest that we ...', 'Gespräch abschließen: konkrete nächste Schritte vorschlagen.', 'As a next step, I suggest that we schedule a call on Tuesday.'],
  ['Du widersprichst höflich', 'I see it a bit differently. In my view, ...', 'Höflicher Widerspruch ohne "Du hast Unrecht".', 'I see it a bit differently. In my view, the risk is lower than you think.'],
  ['Du nennst den Preis und begründest ihn', 'The price includes ..., which means ...', 'Verbinde den Preis am besten mit dem Inhalt.', 'The price includes training and support, which means you save time later.']
].map(([de, en, why, ex]) => ({ de, en, why, ex }));

// Einwand + drei Strategien (Name, Beispielsatz)
const OBJECTIONS = [
  { q: "That's too expensive for us.", opts: [['Verständnis + Nutzen', "I understand, and that's why I'd like to show you what the price includes."], ['Bedingter Rabatt', 'We could lower the price if you commit to a longer contract.'], ['Umfang anpassen', 'What if we reduce the scope so it fits your budget?']] },
  { q: 'We already work with another provider.', opts: [['Ergänzen statt ersetzen', "That's great. I'm not asking you to replace them, only to try us on a small project."], ['Nachfragen', 'What do you like most about your current provider, and what could be better?'], ['Pilotprojekt', 'Would you be open to a small pilot project, so you can compare us with your current provider?']] },
  { q: "We don't have the budget this quarter.", opts: [['Zeit schaffen', 'No problem. Could we plan the start for next quarter and agree on the price now?'], ['In Phasen teilen', 'We could split the project into two phases, so the first phase costs less.'], ['Zahlungsplan', 'Would a payment plan over several months help?']] },
  { q: 'Can you do it faster?', opts: [['Mit Bedingung', 'Yes, if we reduce the scope or if you give us feedback within two days.'], ['Priorität klären', 'What is the most important part? I can deliver that first.'], ['Ehrlich begrenzen', "Faster would affect quality, so I'd suggest keeping the original timeline."]] },
  { q: 'I need to discuss this with my team first.', opts: [['Unterstützen', 'Of course. Shall I send you a short summary for your team?'], ['Termin festhalten', 'That makes sense. When can we speak again?'], ['Dabei sein', 'Would it help if I joined the call to answer questions?']] },
  { q: 'Why should we choose you?', opts: [['Nutzen nennen', 'We focus on small companies, so you get fast answers and clear prices.'], ['Beleg zeigen', 'We have done similar projects, and I can show you the results.'], ['Risiko senken', 'We start with a small step, so your risk stays low.']] },
  { q: 'Your competitor offers the same for less.', opts: [['Unterschied zeigen', "Possibly, but let's compare what is included, because the details often differ."], ['Wert betonen', "Price is one part. Reliability and support matter too, and that's where we're strong."], ['Angebot ansehen', 'Could you show me their offer? Then I can tell you exactly where we differ.']] },
  { q: "We can't pay upfront.", opts: [['Teilbetrag', 'Understood. Would 30% at the start and the rest on delivery work?'], ['Meilensteine', 'We could agree on milestones, with a payment after each one.'], ['Grund + Entgegenkommen', "An upfront payment covers our material costs, but I'm open to a smaller amount."]] }
];

// ---------- Helfer ----------
const pick = (arr, n = 1) => [...arr].sort(() => Math.random() - .5).slice(0, n);
const backTo = fn => el('button', { class: 'back', onclick: fn }, '← Zurück');
const gameView = (...n) => { show(...n); setView(() => { recAbort(); speechSynthesis.cancel(); }); }; // Aufräumen NACH show()
const examples = list => [el('b', {}, 'Andere Möglichkeiten, das zu sagen'), ...list.map(([label, ex]) => el('div', { class: 'opt' }, ...(label ? [el('div', { class: 'mut' }, label)] : []), el('div', {}, ex), speakBtn(ex)))];
// Persönliches Feedback nur auf Knopfdruck (ein Codex-Aufruf, ca. 10 s). Zeigt auch Fokus und neue Satzbausteine wie im Gespräch.
function feedbackButton(setup, getText, slot, viewAtStart) {
  return el('button', { class: 'sm', onclick: async e => {
    const b = e.target; b.disabled = true; b.textContent = 'Feedback kommt (ca. 10 s) …';
    try {
      const j = await feedbackFor({ setup }, getText()); const n = saveChunks(j.chunks); if (j.focus && j.focus.type) noteType(j.focus.type);
      if (viewAtStart === viewId) { slot.replaceChildren(feedbackCard(j, n)); b.remove(); }
    } catch (err) { if (viewAtStart === viewId) { slot.replaceChildren(el('div', { class: 'err' }, 'Feedback: ' + err.message)); b.disabled = false; b.textContent = 'Nochmal versuchen'; } }
  } }, 'Persönliches Feedback zu meiner Antwort');
}
// Jede Aufgabe zählt nur einmal, auch bei mehrfachem Einsprechen
const countOnce = () => { let done = false; return () => { if (!done) { done = true; bump('games'); mark(); } }; };

// ---------- Menü ----------
function games() {
  gameView(back(), el('h1', {}, 'Mini-Spiele'), el('p', { class: 'mut' }, 'Je ca. 2 Minuten, freiwillig, ohne Zeitdruck. Jedes Spiel erklärt dir, was es übt, und zeigt dir andere Möglichkeiten.'),
    el('button', { onclick: gameCirc }, 'Wort umschreiben: Dir fehlt ein Wort? Erkläre es.'),
    el('button', { onclick: gameFrame }, 'Satzrahmen sprechen: Typische Verhandlungssätze mit eigenem Inhalt füllen'),
    el('button', { onclick: gameBlitz }, 'Einwand-Blitzrunde: 3 Einwände, du antwortest'));
}

// ---------- Wort umschreiben ----------
function gameCirc() {
  const [de, en, def, exs] = pick(WORDS)[0];
  const res = el('div', { class: 'mut' }), reveal = el('div'), btn = el('button', { class: 'big' }), count = countOnce();
  let my = 0;
  micButton(btn, '● Umschreiben', '■ Fertig', {
    text: async t => {
      if (!t) { res.textContent = 'Nichts verstanden. Nochmal.'; return; }
      // ganze Wörter prüfen, nicht Wortteile
      if ((' ' + words(t).join(' ') + ' ').includes(' ' + words(en).join(' ') + ' ')) { res.textContent = `Versuch es ohne das Wort selbst ("${en}").`; return; }
      const c = await api('/circ', { de, en, def, text: t }, false, 60000);
      if (my !== viewId) return; // Ansicht wurde inzwischen verlassen
      count();
      // Das kleine Prüfmodell irrt sich oft. Nur ein Lob wird angezeigt, sonst kein Urteil, nur Definition und Beispiele zum Vergleichen.
      res.textContent = c.ok === true ? `✓ ${c.comment}` : 'Danke fürs Erklären. Vergleiche mit den Beispielen unten.';
      const slot = el('div');
      reveal.replaceChildren(el('div', {}, `Gesucht war: ${en} `, speakBtn(en)), el('div', { class: 'mut' }, `Bedeutung: ${def}`), ...examples(exs.map(x => ['', x])),
        el('div', { class: 'row' }, feedbackButton(`Business English practice: the learner explains the term "${en}" without saying it.`, () => t, slot, my), el('button', { class: 'sm', onclick: gameCirc }, 'Nächstes Wort')), slot);
    },
    error: e => { res.textContent = 'Fehler: ' + e.message; }
  });
  gameView(backTo(games), el('h1', {}, 'Wort umschreiben'),
    el('p', { class: 'mut' }, 'Wenn dir im Gespräch ein Wort fehlt, erkläre es mit anderen Wörtern. Das ist eine echte Profi-Technik. Erkläre auf Englisch, was gemeint ist, ohne das Wort selbst zu sagen:'),
    el('div', { class: 'en' }, de), res, reveal, btn);
  my = viewId;
}

// ---------- Satzrahmen sprechen ----------
function gameFrame() {
  const fromDeck = S.deck.filter(c => c.en.includes('...')).map(c => ({ de: c.de, en: c.en, why: 'Das ist ein Satzbaustein aus deinen eigenen Gesprächen. Sag den Satz mit deinem eigenen Inhalt.', ex: '' })); // eigene Rahmen aus deinen Gesprächen
  const f = pick([...FRAMES, ...fromDeck])[0];
  const res = el('div', { class: 'mut' }), extra = el('div'), btn = el('button', { class: 'big' }), count = countOnce();
  let my = 0;
  micButton(btn, '● Sprechen', '■ Fertig', {
    text: async t => {
      if (!t) { res.textContent = 'Nichts verstanden. Nochmal.'; return; }
      count();
      res.textContent = matches(f.en, t) ? `✓ Rahmen getroffen: "${t}"` : `Noch nicht ganz. Du sagtest: "${t}". Probier den Rahmen noch einmal.`;
      const slot = el('div');
      extra.replaceChildren(...(f.ex ? [el('b', {}, 'Beispiel'), el('div', { class: 'opt' }, el('div', {}, f.ex), speakBtn(f.ex))] : []),
        el('div', { class: 'row' }, feedbackButton(`Business negotiation practice with the sentence frame "${f.en}".`, () => t, slot, my), el('button', { class: 'sm', onclick: gameFrame }, 'Nächster Satz')), slot);
    },
    error: e => { res.textContent = 'Fehler: ' + e.message; }
  });
  gameView(backTo(games), el('h1', {}, 'Satzrahmen sprechen'),
    el('p', { class: 'mut' }, 'Feste Satzrahmen sparen dir das Nachdenken über den Satzbau. Du lernst den Rahmen und füllst die Lücken mit deinem eigenen Inhalt.'),
    el('div', {}, f.de), ...(f.why ? [el('div', { class: 'opt' }, `So geht's: ${f.why}`)] : []),
    el('div', { class: 'en' }, f.en.replace(/\.\.\./g, '___')), el('p', { class: 'mut' }, 'Sprich den ganzen Satz mit eigenem Inhalt:'), res, extra, btn);
  my = viewId;
}

// ---------- Einwand-Blitzrunde ----------
function gameBlitz() {
  const qs = pick(OBJECTIONS, 3); let i = 0, my = 0;
  const box = el('div'), res = el('div', { class: 'mut' }), extra = el('div'), btn = el('button', { class: 'big' }), count = countOnce();
  const ask = () => {
    extra.replaceChildren(); res.textContent = ''; btn.style.display = '';
    box.replaceChildren(el('div', { class: 'mut' }, `Einwand ${i + 1} von 3`), el('div', { class: 'en' }, qs[i].q), speakBtn(qs[i].q)); say(qs[i].q);
  };
  micButton(btn, '● Antworten', '■ Fertig', {
    text: async t => {
      if (!t) { res.textContent = 'Nichts verstanden. Nochmal.'; return; }
      if (words(t).length < 4) { res.textContent = `Kurz. Versuch einen ganzen Satz, zum Beispiel "I understand …, but …" oder "What if we …?" Du sagtest: "${t}"`; return; }
      const o = qs[i]; res.textContent = `✓ Du hast geantwortet: "${t}"`; btn.style.display = 'none';
      const slot = el('div'), last = i === 2;
      if (last) count(); // die Runde zählt, sobald die dritte Antwort gegeben ist
      extra.replaceChildren(...examples(o.opts),
        el('div', { class: 'row' }, feedbackButton(`Business negotiation practice. The other side objects: "${o.q}" The user answers.`, () => t, slot, my),
          el('button', { class: 'sm', onclick: () => { if (last) finish(); else { i++; ask(); } } }, last ? 'Fertig' : 'Nächster Einwand')), slot);
    },
    error: e => { res.textContent = 'Fehler: ' + e.message; }
  });
  const finish = () => { box.replaceChildren(el('div', { class: 'en' }, 'Geschafft: 3 von 3 Einwänden beantwortet.'), el('button', { class: 'sm', onclick: gameBlitz }, 'Nochmal mit neuen Einwänden')); extra.replaceChildren(); res.textContent = ''; btn.style.display = 'none'; };
  gameView(backTo(games), el('h1', {}, 'Einwand-Blitzrunde'),
    el('p', { class: 'mut' }, 'Im echten Gespräch kommen Einwände überraschend. Hier übst du, sofort zu antworten. Ein ganzer Satz reicht, danach siehst du drei verschiedene Strategien.'), box, res, extra, btn);
  my = viewId; ask();
}

// ---------- Fortschritt ----------
function progress() {
  const wd = weekDays(), st = S.stats, mastered = S.deck.filter(c => c.box >= 3).length;
  const top = Object.entries(st.types).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const goal = el('select', { onchange: () => { S.goal = +goal.value; save(); progress(); } },
    ...[1, 2, 3, 4, 5, 6, 7].map(n => el('option', { value: String(n) }, `${n} ${n === 1 ? 'Tag' : 'Tage'} von 7`)));
  goal.value = String(S.goal);
  show(back(), el('h1', {}, 'Fortschritt'),
    el('h2', {}, 'Letzte 7 Tage'), el('div', { class: 'streak' }, `${wd} von ${S.goal} Tagen`), bar(wd, S.goal), el('p', { class: 'mut' }, 'Dein Ziel:'), goal,
    el('h2', {}, 'Insgesamt'),
    el('div', {}, `🔥 Tage in Folge: ${streak()}`),
    el('div', {}, `Gesprochene Antworten im Gespräch: ${st.turns}`),
    el('div', {}, `Zweiter Versuch geglückt: ${st.retryFixed} von ${st.retryTries}`),
    el('div', {}, `Mini-Spiele gespielt: ${st.games}`),
    el('div', {}, `Satzbausteine sicher (Stufe 3 oder höher): ${mastered} von ${S.deck.length}`),
    el('h2', {}, 'Daran arbeitest du am meisten'),
    ...(top.length ? top.map(([k, v]) => el('div', {}, `${k}: ${v}×`)) : [el('div', { class: 'mut' }, 'Noch zu wenig Daten.')]),
    el('p', { class: 'mut' }, 'Das ist nur dein eigener Verlauf, kein Vergleich. Einzelne ruhige Tage sind normal, die sieben Tage zählen.'));
}
