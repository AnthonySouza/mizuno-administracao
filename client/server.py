"""Primeira etapa do Mizuno Flow: kanban local de propostas.

Executa só em 127.0.0.1 e guarda os registros em data/propostas.sqlite3.
"""
from __future__ import annotations

import json
import mimetypes
import ntpath
import os
import secrets
import sqlite3
import subprocess
import threading
import uuid
import webbrowser
from contextlib import contextmanager
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("MIZUNO_DATA_DIR", ROOT / "data"))
DB_FILE = DATA_DIR / "propostas.sqlite3"
HOST = "127.0.0.1"
PORT = int(os.environ.get("MIZUNO_PORT", "8766"))
CSRF_TOKEN = secrets.token_urlsafe(32)
STATUSES = (
    "Novo contato",
    "Em avaliação",
    "Proposta enviada",
    "Aguardando",
    "Aprovada",
    "Recusada",
)
EDITABLE = {"title", "author_id", "book_format", "cover_type", "printing", "pages", "difficulty", "priority", "notes", "status", "folder_path"}
PRIORITIES = ("Baixo", "Médio", "Alto", "Urgente", "Extremo")
PRIORITY_RANK = {name: index for index, name in enumerate(reversed(PRIORITIES))}
DEFAULT_OPTIONS = {
    "book_format": ("14x21 cm", "16x23 cm", "17x24 cm"),
    "cover_type": ("Brochura", "Capa dura", "Capa flexível"),
}
FOLDER_DIALOG_LOCK = threading.Lock()


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


@contextmanager
def connection():
    con = sqlite3.connect(DB_FILE, timeout=10)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA busy_timeout=10000")
    con.execute("PRAGMA foreign_keys=ON")
    try:
        with con:
            yield con
    finally:
        con.close()


def init_db():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with connection() as con:
        con.execute("PRAGMA journal_mode=WAL")
        con.execute("""CREATE TABLE IF NOT EXISTS proposals (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            author_name TEXT NOT NULL,
            email TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT '',
            book_format TEXT NOT NULL DEFAULT '',
            pages INTEGER,
            difficulty TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL,
            position INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )""")
        con.execute("CREATE INDEX IF NOT EXISTS idx_proposals_status_position ON proposals(status,position)")
        con.execute("""CREATE TABLE IF NOT EXISTS authors (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )""")
        columns = {row[1] for row in con.execute("PRAGMA table_info(proposals)")}
        if "author_id" not in columns:
            con.execute("ALTER TABLE proposals ADD COLUMN author_id TEXT REFERENCES authors(id)")
        if "cover_type" not in columns:
            con.execute("ALTER TABLE proposals ADD COLUMN cover_type TEXT NOT NULL DEFAULT ''")
        if "printing" not in columns:
            con.execute("ALTER TABLE proposals ADD COLUMN printing TEXT NOT NULL DEFAULT ''")
        if "priority" not in columns:
            con.execute("ALTER TABLE proposals ADD COLUMN priority TEXT NOT NULL DEFAULT ''")
        if "folder_path" not in columns:
            con.execute("ALTER TABLE proposals ADD COLUMN folder_path TEXT NOT NULL DEFAULT ''")
        author_columns = {row[1] for row in con.execute("PRAGMA table_info(authors)")}
        if "folder_path" not in author_columns:
            con.execute("ALTER TABLE authors ADD COLUMN folder_path TEXT NOT NULL DEFAULT ''")
        con.execute("CREATE INDEX IF NOT EXISTS idx_proposals_author ON proposals(author_id)")
        con.execute("""CREATE TABLE IF NOT EXISTS proposal_options (
            kind TEXT NOT NULL, value TEXT NOT NULL,
            UNIQUE(kind, value COLLATE NOCASE)
        )""")
        for kind, options in DEFAULT_OPTIONS.items():
            for value in options:
                con.execute("INSERT OR IGNORE INTO proposal_options(kind,value) VALUES (?,?)", (kind, value))
            for row in con.execute(f"SELECT DISTINCT {kind} FROM proposals WHERE {kind} <> ''"):
                con.execute("INSERT OR IGNORE INTO proposal_options(kind,value) VALUES (?,?)", (kind, row[0]))
        # Vincula registros criados antes da guia Autores sem alterar o conteúdo da proposta.
        legacy = con.execute("SELECT id,author_name,email,phone FROM proposals WHERE author_id IS NULL").fetchall()
        for row in legacy:
            author = con.execute("SELECT id FROM authors WHERE name = ? COLLATE NOCASE AND email = ? COLLATE NOCASE LIMIT 1",
                                 (row["author_name"], row["email"])).fetchone()
            author_id = author["id"] if author else insert_author(con, {"name": row["author_name"], "email": row["email"], "phone": row["phone"]})
            con.execute("UPDATE proposals SET author_id=? WHERE id=?", (author_id, row["id"]))


def normalize_author(data):
    if not isinstance(data, dict):
        raise ValueError("Informe os dados do autor.")
    result = {}
    for key in ("name", "email", "phone", "notes", "folder_path"):
        value = str(data.get(key) or "").strip()
        if len(value) > (4000 if key == "notes" else 1024 if key == "folder_path" else 240):
            raise ValueError("Um campo do autor ultrapassou o tamanho permitido.")
        result[key] = value
    if not result["name"]:
        raise ValueError("O nome do autor é obrigatório.")
    return result


def insert_author(con, data):
    values = normalize_author(data)
    author_id, stamp = str(uuid.uuid4()), utc_now()
    con.execute("INSERT INTO authors (id,name,email,phone,notes,folder_path,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
                (author_id, values["name"], values["email"], values["phone"], values["notes"], values["folder_path"], stamp, stamp))
    return author_id


def all_authors():
    with connection() as con:
        return [dict(row) for row in con.execute("""SELECT a.*,
            (SELECT COUNT(*) FROM proposals p WHERE p.author_id=a.id) AS proposal_count
            FROM authors a ORDER BY a.name COLLATE NOCASE, a.created_at""")]


def all_options():
    with connection() as con:
        return {kind: [row[0] for row in con.execute(
            "SELECT value FROM proposal_options WHERE kind=? ORDER BY rowid", (kind,))]
            for kind in DEFAULT_OPTIONS}


def save_options(con, values):
    for kind in DEFAULT_OPTIONS:
        value = values.get(kind, "")
        if value:
            con.execute("INSERT OR IGNORE INTO proposal_options(kind,value) VALUES (?,?)", (kind, value))


def create_author(data):
    with connection() as con:
        return insert_author(con, data)


def update_author(author_id, data):
    values = normalize_author(data)
    with connection() as con:
        con.execute("BEGIN IMMEDIATE")
        result = con.execute("UPDATE authors SET name=?,email=?,phone=?,notes=?,folder_path=?,updated_at=? WHERE id=?",
                             (values["name"], values["email"], values["phone"], values["notes"], values["folder_path"], utc_now(), author_id))
        return result.rowcount > 0


def resolve_author(con, data):
    if isinstance(data.get("new_author"), dict):
        return insert_author(con, data["new_author"])
    author_id = data.get("author_id")
    if not isinstance(author_id, str) or not con.execute("SELECT 1 FROM authors WHERE id=?", (author_id,)).fetchone():
        raise ValueError("Selecione um autor cadastrado ou cadastre um novo.")
    return author_id


def normalize_record(data, creating=False):
    if not isinstance(data, dict):
        raise ValueError("Envie os dados do livro em formato válido.")
    result = {}
    for key in EDITABLE:
        if key not in data:
            continue
        value = data[key]
        if key == "pages":
            if value in (None, ""):
                result[key] = None
                continue
            try:
                value = int(value)
            except (TypeError, ValueError):
                raise ValueError("A paginação deve ser um número inteiro.") from None
            if not 1 <= value <= 5000:
                raise ValueError("A paginação deve estar entre 1 e 5000.")
            result[key] = value
        elif key == "author_id":
            result[key] = value
        else:
            text = str(value or "").strip()
            if len(text) > (4000 if key == "notes" else 1024 if key == "folder_path" else 240):
                raise ValueError("Um campo ultrapassou o tamanho permitido.")
            result[key] = text
    if creating:
        result.setdefault("status", STATUSES[0])
    if result.get("status") not in (None, *STATUSES):
        raise ValueError("Status inválido.")
    if result.get("printing") not in (None, "", "P&B", "Colorido"):
        raise ValueError("Selecione P&B ou Colorido para a impressão.")
    if result.get("difficulty") not in (None, "", "Fácil", "Média", "Difícil", *(str(level) for level in range(1, 11))):
        raise ValueError("A dificuldade deve ser um nível de 1 a 10.")
    if result.get("priority") not in (None, "", *PRIORITIES):
        raise ValueError("Prioridade inválida.")
    for required in ("title",):
        if required in result and not result[required]:
            raise ValueError("O título é obrigatório.")
        if creating and required not in result:
            raise ValueError("O título é obrigatório.")
    return result


def all_proposals():
    with connection() as con:
        records = [dict(row) for row in con.execute("""SELECT p.*, COALESCE(a.name,p.author_name) AS display_author,
            COALESCE(a.email,p.email) AS author_email, COALESCE(a.phone,p.phone) AS author_phone
            FROM proposals p LEFT JOIN authors a ON a.id=p.author_id ORDER BY p.position,p.created_at""")]
    rank = {name: i for i, name in enumerate(STATUSES)}
    return sorted(records, key=lambda row: (
        rank[row["status"]], PRIORITY_RANK.get(row["priority"], len(PRIORITIES)),
        row["position"], row["created_at"]
    ))


def create_proposal(data):
    values = normalize_record(data, creating=True)
    proposal_id = str(uuid.uuid4())
    stamp = utc_now()
    with connection() as con:
        con.execute("BEGIN IMMEDIATE")
        author_id = resolve_author(con, data)
        save_options(con, values)
        author = con.execute("SELECT name,email,phone FROM authors WHERE id=?", (author_id,)).fetchone()
        position = con.execute("SELECT COALESCE(MAX(position),-1)+1 FROM proposals WHERE status=?", (values["status"],)).fetchone()[0]
        con.execute("""INSERT INTO proposals
            (id,title,author_id,author_name,email,phone,book_format,cover_type,printing,pages,difficulty,priority,notes,status,position,folder_path,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
                proposal_id, values["title"], author_id, author["name"], author["email"],
                author["phone"], values.get("book_format", ""), values.get("cover_type", ""),
                values.get("printing", ""), values.get("pages"),
                values.get("difficulty", ""), values.get("priority", ""), values.get("notes", ""), values["status"], position,
                values.get("folder_path", ""), stamp, stamp,
            ))
    return proposal_id


def update_proposal(proposal_id, data):
    values = normalize_record(data)
    if not values and "new_author" not in data:
        raise ValueError("Nenhuma alteração informada.")
    with connection() as con:
        con.execute("BEGIN IMMEDIATE")
        current = con.execute("SELECT status FROM proposals WHERE id=?", (proposal_id,)).fetchone()
        if not current:
            return False
        if "author_id" in values or "new_author" in data:
            author_id = resolve_author(con, data)
            author = con.execute("SELECT name,email,phone FROM authors WHERE id=?", (author_id,)).fetchone()
            values.update(author_id=author_id, author_name=author["name"], email=author["email"], phone=author["phone"])
        save_options(con, values)
        if "status" in values and values["status"] != current["status"]:
            values["position"] = con.execute("SELECT COALESCE(MAX(position),-1)+1 FROM proposals WHERE status=?", (values["status"],)).fetchone()[0]
        values["updated_at"] = utc_now()
        con.execute("UPDATE proposals SET " + ",".join(key + "=?" for key in values) + " WHERE id=?", (*values.values(), proposal_id))
    return True


def move_proposal(data):
    if not isinstance(data, dict):
        raise ValueError("Movimento inválido.")
    proposal_id, status, order = data.get("id"), data.get("status"), data.get("order")
    if (status not in STATUSES or not isinstance(order, list)
            or not all(isinstance(item, str) for item in order)
            or len(order) != len(set(order))):
        raise ValueError("Coluna ou ordem inválida.")
    with connection() as con:
        con.execute("BEGIN IMMEDIATE")
        current = con.execute("SELECT status FROM proposals WHERE id=?", (proposal_id,)).fetchone()
        if not current:
            return False
        old_status = current["status"]
        existing = [row[0] for row in con.execute("SELECT id FROM proposals WHERE status=? ORDER BY position", (status,))]
        expected = set(existing) if old_status == status else set((*existing, proposal_id))
        if set(order) != expected:
            raise RuntimeError("O quadro mudou. Atualize a página e tente novamente.")
        if old_status != status:
            con.execute("UPDATE proposals SET status=?,updated_at=? WHERE id=?", (status, utc_now(), proposal_id))
        for index, item_id in enumerate(order):
            con.execute("UPDATE proposals SET position=?,updated_at=? WHERE id=?", (index, utc_now(), item_id))
        if old_status != status:
            old_ids = [row[0] for row in con.execute("SELECT id FROM proposals WHERE status=? ORDER BY position", (old_status,))]
            for index, item_id in enumerate(old_ids):
                con.execute("UPDATE proposals SET position=? WHERE id=?", (index, item_id))
    return True


def pick_folder(initial=""):
    """Abre o seletor no computador que executa este servidor local."""
    if not isinstance(initial, str):
        raise ValueError("Pasta inicial inválida.")
    try:
        import tkinter as tk
        from tkinter import filedialog
        with FOLDER_DIALOG_LOCK:
            root = tk.Tk()
            try:
                root.withdraw()
                root.attributes("-topmost", True)
                root.update()
                options = {"parent": root, "title": "Selecione a pasta", "mustexist": True}
                if initial and os.path.isdir(initial):
                    options["initialdir"] = initial
                selected = filedialog.askdirectory(**options)
            finally:
                root.destroy()
        return ntpath.normpath(selected) if selected else ""
    except Exception as error:
        raise RuntimeError("Não foi possível abrir o seletor de pastas neste computador.") from error


def open_record_folder(kind, record_id):
    if kind not in ("author", "proposal") or not isinstance(record_id, str):
        raise ValueError("Cadastro inválido.")
    table = "authors" if kind == "author" else "proposals"
    with connection() as con:
        row = con.execute(f"SELECT folder_path FROM {table} WHERE id=?", (record_id,)).fetchone()
    if not row:
        return False
    raw_path = row["folder_path"]
    if not raw_path:
        raise ValueError("Selecione e salve uma pasta antes de abrir.")
    path = ntpath.normpath(raw_path)
    try:
        os.startfile(path)
    except OSError:
        try:
            subprocess.Popen(["explorer.exe", path], close_fds=True)
        except OSError as error:
            raise RuntimeError("O Windows não conseguiu abrir a pasta salva. Confira o acesso à rede e o caminho.") from error
    return True


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        if not self.path.startswith("/health"):
            super().log_message(format, *args)

    def respond(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def parse_body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= 65536:
            raise ValueError("Tamanho da solicitação inválido.")
        try:
            return json.loads(self.rfile.read(length))
        except json.JSONDecodeError:
            raise ValueError("JSON inválido.") from None

    def authorized(self):
        return secrets.compare_digest(self.headers.get("X-CSRF-Token", ""), CSRF_TOKEN)

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/health":
            return self.respond(200, {"ok": True})
        if path == "/api/proposals":
            return self.respond(200, {"api_version": 6, "statuses": STATUSES, "proposals": all_proposals()})
        if path == "/api/authors":
            return self.respond(200, {"authors": all_authors()})
        if path == "/api/options":
            return self.respond(200, all_options())
        files = {"/": "index.html", "/app.js": "app.js", "/style.css": "style.css"}
        name = files.get(path)
        if not name:
            return self.respond(404, {"error": "Página não encontrada."})
        content = (ROOT / name).read_bytes()
        if name == "index.html":
            content = content.replace(b"__CSRF_TOKEN__", CSRF_TOKEN.encode("ascii"))
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(content)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(content)

    def do_POST(self):
        self.mutate("POST")

    def do_PATCH(self):
        self.mutate("PATCH")

    def mutate(self, method):
        if not self.authorized():
            return self.respond(403, {"error": "Acesso não autorizado."})
        path = urlparse(self.path).path
        try:
            data = self.parse_body()
            if method == "POST" and path == "/api/proposals":
                return self.respond(201, {"id": create_proposal(data)})
            if method == "POST" and path == "/api/authors":
                return self.respond(201, {"id": create_author(data)})
            if method == "POST" and path == "/api/move":
                if not move_proposal(data):
                    return self.respond(404, {"error": "Livro não encontrado."})
                return self.respond(200, {"ok": True})
            if method == "POST" and path == "/api/pick-folder":
                selected = pick_folder(data.get("initial", "") if isinstance(data, dict) else "")
                return self.respond(200, {"path": selected, "cancelled": not bool(selected)})
            if method == "POST" and path == "/api/open-folder":
                if not isinstance(data, dict):
                    raise ValueError("Cadastro inválido.")
                if not open_record_folder(data.get("kind"), data.get("id")):
                    return self.respond(404, {"error": "Cadastro não encontrado."})
                return self.respond(200, {"ok": True})
            if method == "PATCH" and path.startswith("/api/proposals/"):
                proposal_id = path.removeprefix("/api/proposals/")
                if not update_proposal(proposal_id, data):
                    return self.respond(404, {"error": "Livro não encontrado."})
                return self.respond(200, {"ok": True})
            if method == "PATCH" and path.startswith("/api/authors/"):
                author_id = path.removeprefix("/api/authors/")
                if not update_author(author_id, data):
                    return self.respond(404, {"error": "Autor não encontrado."})
                return self.respond(200, {"ok": True})
            return self.respond(404, {"error": "Ação não encontrada."})
        except RuntimeError as error:
            return self.respond(409, {"error": str(error)})
        except ValueError as error:
            return self.respond(400, {"error": str(error)})


def main():
    init_db()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    url = f"http://{HOST}:{PORT}"
    print(f"Mizuno Propostas: {url}")
    print(f"Dados locais: {DB_FILE}")
    print("Pressione Ctrl+C para encerrar.")
    if "--no-browser" not in os.sys.argv:
        threading.Timer(0.6, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
