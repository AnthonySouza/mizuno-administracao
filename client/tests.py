import tempfile
import json
import re
import threading
import unittest
from unittest.mock import patch
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.request import Request, urlopen
from urllib.error import URLError

import server


class ProposalTests(unittest.TestCase):
    def setUp(self):
        test_root = Path(__file__).resolve().parents[2] / "work" / "mizuno-test-temp"
        test_root.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=test_root)
        server.DATA_DIR = Path(self.temp.name)
        server.DB_FILE = server.DATA_DIR / "test.sqlite3"
        server.init_db()

    def tearDown(self):
        self.temp.cleanup()

    def test_create_edit_and_drag_between_columns(self):
        author = server.create_author({"name":"Diego Cordeiro Pinheiro", "email":"diego@example.com", "folder_path":self.temp.name})
        first = server.create_proposal({"title":"Município Sob Pressão", "author_id":author, "folder_path":self.temp.name})
        second = server.create_proposal({"title":"Outro livro", "new_author":{"name":"Outro autor"}})
        self.assertEqual(len(server.all_authors()), 2)
        self.assertEqual(server.all_proposals()[0]["author_email"], "diego@example.com")
        self.assertEqual(server.all_authors()[0]["folder_path"], self.temp.name)
        self.assertEqual(server.all_proposals()[0]["folder_path"], self.temp.name)
        with patch.object(server.os, "startfile") as launch:
            self.assertTrue(server.open_record_folder("author", author))
            self.assertTrue(server.open_record_folder("proposal", first))
            self.assertEqual(launch.call_count, 2)
        server.update_proposal(first, {"folder_path":"//editoramizuno/Usuários/Vitor Grossklauss/Vitor Pessoal"})
        with patch.object(server.os, "startfile", side_effect=OSError("shell")), patch.object(server.subprocess, "Popen") as explorer:
            self.assertTrue(server.open_record_folder("proposal", first))
            self.assertEqual(explorer.call_args.args[0], ["explorer.exe", "\\\\editoramizuno\\Usuários\\Vitor Grossklauss\\Vitor Pessoal"])
        self.assertEqual([r["id"] for r in server.all_proposals()], [first,second])
        self.assertTrue(server.update_proposal(first,{"pages":448,"book_format":"16x23 cm","cover_type":"Brochura","printing":"P&B","difficulty":"7","priority":"Urgente","notes":"Avaliar miolo"}))
        self.assertTrue(server.move_proposal({"id":second,"status":server.STATUSES[0],"order":[second,first]}))
        self.assertEqual([r["id"] for r in server.all_proposals()], [first,second])
        self.assertTrue(server.move_proposal({"id":first,"status":server.STATUSES[1],"order":[first]}))
        records = server.all_proposals()
        self.assertEqual([(r["id"],r["status"]) for r in records],[(second,server.STATUSES[0]),(first,server.STATUSES[1])])
        self.assertEqual(records[1]["pages"],448)
        self.assertEqual(records[1]["cover_type"], "Brochura")
        self.assertEqual(records[1]["printing"], "P&B")
        self.assertEqual(records[1]["difficulty"], "7")
        self.assertEqual(records[1]["priority"], "Urgente")

    def test_custom_format_and_cover_are_saved_as_options(self):
        author = server.create_author({"name":"Autora"})
        proposal_id = server.create_proposal({"title":"Livro", "author_id":author,
            "book_format":"20x25 cm", "cover_type":"Espiral", "printing":"Colorido"})
        self.assertIn("20x25 cm", server.all_options()["book_format"])
        self.assertIn("Espiral", server.all_options()["cover_type"])
        self.assertEqual(server.all_proposals()[0]["printing"], "Colorido")
        server.init_db()
        self.assertEqual(server.all_proposals()[0]["id"], proposal_id)
        self.assertEqual(server.all_options()["cover_type"].count("Espiral"), 1)

    def test_proposals_always_sort_by_priority_within_status(self):
        author = server.create_author({"name":"Autora"})
        low = server.create_proposal({"title":"Baixo", "author_id":author, "priority":"Baixo"})
        high = server.create_proposal({"title":"Alto", "author_id":author, "priority":"Alto"})
        none = server.create_proposal({"title":"Sem prioridade", "author_id":author})
        extreme = server.create_proposal({"title":"Extremo", "author_id":author, "priority":"Extremo"})
        self.assertEqual([row["id"] for row in server.all_proposals()], [extreme,high,low,none])
        server.move_proposal({"id": low, "status":"Em avaliação", "order":[low]})
        server.move_proposal({"id": high, "status":"Em avaliação", "order":[low,high]})
        self.assertEqual([row["id"] for row in server.all_proposals() if row["status"] == "Em avaliação"], [high,low])
        server.update_proposal(low,{"priority":"Urgente"})
        self.assertEqual([row["id"] for row in server.all_proposals() if row["status"] == "Em avaliação"], [low,high])

    def test_rejects_invalid_and_stale_moves(self):
        author = server.create_author({"name":"Autor"})
        record = server.create_proposal({"title":"Livro", "author_id":author})
        with self.assertRaises(ValueError):
            server.create_proposal({"title":"", "author_id":author})
        with self.assertRaises(ValueError):
            server.create_proposal({"title":"Livro sem autor"})
        with self.assertRaises(ValueError):
            server.update_proposal(record,{"pages":-4})
        with self.assertRaises(ValueError):
            server.update_proposal(record,{"difficulty":"11"})
        with self.assertRaises(ValueError):
            server.update_proposal(record,{"priority":"Máxima"})
        with self.assertRaises(RuntimeError):
            server.move_proposal({"id":record,"status":server.STATUSES[1],"order":[]})
        self.assertEqual(server.all_proposals()[0]["status"],server.STATUSES[0])

    def test_author_updates_and_legacy_migration(self):
        with server.connection() as con:
            con.execute("""INSERT INTO proposals (id,title,author_name,email,phone,status,position,created_at,updated_at)
                VALUES ('old','Livro antigo','Autora antiga','old@example.com','11 1234','Novo contato',0,'2026','2026')""")
        server.init_db()
        proposal = server.all_proposals()[0]
        self.assertIsNotNone(proposal["author_id"])
        self.assertEqual(proposal["display_author"], "Autora antiga")
        self.assertEqual(proposal["priority"], "")
        self.assertEqual(proposal["folder_path"], "")
        self.assertTrue(server.update_author(proposal["author_id"], {"name":"Autora atualizada","email":"new@example.com"}))
        self.assertEqual(server.all_proposals()[0]["display_author"], "Autora atualizada")
        self.assertEqual(server.all_proposals()[0]["author_email"], "new@example.com")

    def test_http_create_edit_and_move(self):
        httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        base = f"http://127.0.0.1:{httpd.server_port}"

        def request(path, method="GET", payload=None, token=""):
            body = None if payload is None else json.dumps(payload).encode("utf-8")
            headers = {"X-CSRF-Token": token}
            if body is not None:
                headers["Content-Type"] = "application/json"
            with urlopen(Request(base + path, data=body, headers=headers, method=method)) as response:
                return response.read().decode("utf-8")

        try:
            try:
                html = request("/")
            except URLError as error:
                if isinstance(error.reason, PermissionError):
                    self.skipTest("O ambiente de testes bloqueia conexões locais.")
                raise
            token = re.search(r'<meta name="csrf-token" content="([^"]+)"', html).group(1)
            author_id = json.loads(request("/api/authors", "POST", {"name": "Diego Cordeiro Pinheiro"}, token))["id"]
            book_id = json.loads(request("/api/proposals", "POST", {
                "title": "Município Sob Pressão", "author_id": author_id, "priority": "Alto"
            }, token))["id"]
            request(f"/api/proposals/{book_id}", "PATCH", {"pages": 448, "priority": "Extremo"}, token)
            request("/api/move", "POST", {
                "id": book_id, "status": "Em avaliação", "order": [book_id]
            }, token)
            result = json.loads(request("/api/proposals"))
            self.assertEqual(result["api_version"], 6)
            self.assertEqual(result["statuses"], list(server.STATUSES))
            self.assertEqual(result["proposals"][0]["status"], "Em avaliação")
            self.assertEqual(result["proposals"][0]["pages"], 448)
            self.assertEqual(result["proposals"][0]["priority"], "Extremo")
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
