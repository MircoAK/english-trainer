"""Brücke PC <-> Handy. Spracherkennung lokal (faster-whisper), schnelle Antwort lokal (Ollama),
Feedback über das Codex-CLI (dein ChatGPT-Plus-Login). Start: python server.py"""
import glob, json, os, shutil, subprocess, sys, tempfile, threading, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = 8787
ORIGIN = "https://mircoak.github.io"
OLLAMA_MODEL = "qwen2.5:7b"
WHISPER_MODEL = "large-v3-turbo"
TOKEN = open(os.path.join(HERE, "token.txt")).read().strip()  # nicht im Repo, siehe .gitignore

# CUDA-DLLs aus den pip-Paketen (nvidia-cublas/cudnn) auffindbar machen
for d in glob.glob(os.path.join(sys.prefix, "Lib", "site-packages", "nvidia", "*", "bin")):
    os.add_dll_directory(d)
    os.environ["PATH"] = d + os.pathsep + os.environ["PATH"]

from faster_whisper import WhisperModel
try:
    whisper = WhisperModel(WHISPER_MODEL, device="cuda", compute_type="float16")
except Exception as e:  # ponytail: CPU-Fallback ist langsam; GPU-Treiber/DLLs prüfen
    print("GPU nicht nutzbar, CPU:", e)
    whisper = WhisperModel("small", device="cpu", compute_type="int8")

CODEX = shutil.which("codex")
codex_lock = threading.Lock()  # ponytail: ein Feedback gleichzeitig; mehr nötig -> Lock weg


def ollama(messages):
    req = urllib.request.Request("http://localhost:11434/api/chat", json.dumps(
        {"model": OLLAMA_MODEL, "stream": False, "keep_alive": -1, "messages": messages}).encode(),
        {"Content-Type": "application/json"})
    return json.load(urllib.request.urlopen(req, timeout=300))["message"]["content"].strip()


def reply(scenario, history, text):
    sys_p = (f"You are a role-play partner in a business negotiation. Scenario: {scenario}\n"
             "Stay in role. Answer in 1-3 sentences of natural, fluent business English. "
             "The user is a German speaker; their text is a speech transcript, German words are vocabulary gaps: "
             "understand them and just continue. Never correct them, never break role, no German.")
    first = "Open the scene with your first line." if text == "[START]" else text
    return ollama([{"role": "system", "content": sys_p}, *history, {"role": "user", "content": first}])


def feedback(scenario, text):
    prompt = f"""You are a business English coach. Scenario: {scenario}
The user (German native, speaking level ~B1, goal C1 business negotiation) said this (speech transcript; German words mark vocabulary they were missing):
\"\"\"{text}\"\"\"
Return ONLY a JSON object, no markdown:
{{"corrected": "their utterance as ONE natural, fluent C1 business English version, same meaning",
 "gaps": [{{"de": "German word/phrase they were missing or got wrong", "en": "best English"}}],
 "chunks": [{{"de": "short German description of the situation/intention", "en": "reusable English sentence frame, with ... for the variable part"}}],
 "note": "one short German sentence about their biggest sentence-structure problem, or empty"}}
Max 3 gaps, max 3 chunks. Chunks are sentence patterns, not single words."""
    with tempfile.TemporaryDirectory() as tmp, codex_lock:
        out = os.path.join(tmp, "out.txt")
        r = subprocess.run([CODEX, "exec", "--skip-git-repo-check", "--ephemeral", "-s", "read-only",
                            "-m", "gpt-6-luna", "-c", "model_reasoning_effort=low", "-o", out, "-"],
                           input=prompt, text=True, encoding="utf-8", cwd=tmp, timeout=120, capture_output=True)
        if not os.path.exists(out):
            raise RuntimeError("Codex: " + (r.stderr or r.stdout)[-400:])
        raw = open(out, encoding="utf-8").read().strip()
    raw = raw.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(raw)


def transcribe(data):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".audio") as f:
        f.write(data)
    try:
        segs, _ = whisper.transcribe(f.name, beam_size=1, vad_filter=False,
                                     initial_prompt="Business negotiation in English, with some German words.")
        return " ".join(s.text.strip() for s in segs).strip()
    finally:
        os.unlink(f.name)


class H(BaseHTTPRequestHandler):
    def _send(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", ORIGIN)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", ORIGIN)
        self.send_header("Access-Control-Allow-Headers", "X-Token, Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET")
        self.end_headers()

    def do_GET(self):
        self._send(200, {"ok": True})

    def do_POST(self):
        if self.headers.get("X-Token") != TOKEN:
            return self._send(401, {"error": "Token falsch"})
        try:
            body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
            if self.path == "/stt":
                return self._send(200, {"text": transcribe(body)})
            j = json.loads(body)
            if self.path == "/reply":
                return self._send(200, {"reply": reply(j["scenario"], j["history"], j["text"])})
            if self.path == "/feedback":
                return self._send(200, feedback(j["scenario"], j["text"]))
            self._send(404, {"error": "unbekannt"})
        except Exception as e:
            self._send(500, {"error": str(e)})


if __name__ == "__main__":
    threading.Thread(target=lambda: ollama([{"role": "user", "content": "hi"}]), daemon=True).start()  # Modell vorwärmen
    print(f"Brücke läuft auf Port {PORT}")
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
