const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.resolve(__dirname, '../../../database/raizes_nordeste.sqlite');

const PY_RUNNER = `
import sys, json, sqlite3

db_path = sys.argv[1]
payload = json.loads(sys.argv[2])
mode = payload.get("mode", "query")
sql = payload.get("sql", "")
params = payload.get("params", [])

conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
conn.execute("PRAGMA foreign_keys = ON;")
cur = conn.cursor()

try:
    if mode == "script":
        cur.executescript(sql)
        conn.commit()
        print(json.dumps({"ok": True}))
    elif mode == "run":
        cur.execute(sql, params)
        conn.commit()
        print(json.dumps({"ok": True, "lastID": cur.lastrowid, "changes": cur.rowcount}))
    elif mode == "get":
        cur.execute(sql, params)
        row = cur.fetchone()
        print(json.dumps({"ok": True, "row": dict(row) if row else None}))
    elif mode == "all":
        cur.execute(sql, params)
        rows = [dict(r) for r in cur.fetchall()]
        print(json.dumps({"ok": True, "rows": rows}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
finally:
    conn.close()
`;

class SqliteConnection {
  static ensureDir() {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  static executePython(payload) {
    this.ensureDir();
    const pythonBins = ['python3', 'python'];
    let lastErr = null;
    for (const bin of pythonBins) {
      try {
        const stdout = execFileSync(bin, ['-c', PY_RUNNER, DB_PATH, JSON.stringify(payload)], {
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024
        });
        const res = JSON.parse(stdout.trim());
        if (!res.ok) {
          throw new Error(res.error || 'Erro na execucao SQL');
        }
        return res;
      } catch (err) {
        if (err.code === 'ENOENT') {
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr || new Error('Interpretador Python3/SQLite nao encontrado');
  }

  static execScript(sql) {
    return this.executePython({ mode: 'script', sql });
  }

  static run(sql, params = []) {
    return this.executePython({ mode: 'run', sql, params });
  }

  static get(sql, params = []) {
    return this.executePython({ mode: 'get', sql, params }).row;
  }

  static all(sql, params = []) {
    return this.executePython({ mode: 'all', sql, params }).rows;
  }

  static getDbPath() {
    return DB_PATH;
  }
}

module.exports = SqliteConnection;
