Zwei Prüfungen ohne Server, Handy oder Zugangsdaten (alles Attrappen, nur ein Platzhalter-Token):

- `node tests/logic.js` prüft die reine Logik (Karten, Limits, Wortprüfung). Ausgabe `LOGIC_OK`.
- `tests/smoke.html` bedient die ganze Oberfläche (Szenario, Aufnahme, Feedback, Wiederholen, Einstellungen).
  Start mit headless Edge/Chrome: `msedge --headless=new --allow-file-access-from-files --virtual-time-budget=15000 --dump-dom file:///<pfad>/tests/smoke.html`
  und in der Ausgabe `RESULT {...}` lesen. Kein Eintrag darf `false` sein, `error` muss fehlen.
