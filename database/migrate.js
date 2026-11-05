const fs = require('fs');
const path = require('path');
const db = require('../src/infrastructure/database/SqliteConnection');

function runMigrations() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');
  db.execScript(sql);
  console.log('[MIGRATE] Tabelas e restricoes de integridade criadas/validadas com sucesso em:', db.getDbPath());
}

if (require.main === module) {
  runMigrations();
}

module.exports = runMigrations;
