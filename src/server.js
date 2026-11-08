const server = require('./app');
const SqliteConnection = require('./infrastructure/database/SqliteConnection');

const PORT = Number(process.env.PORT || 3000);

server.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(` API Rede "Raizes do Nordeste" iniciada com sucesso!`);
  console.log(` -> URL Base:        http://localhost:${PORT}`);
  console.log(` -> Swagger UI:      http://localhost:${PORT}/api-docs`);
  console.log(` -> OpenAPI JSON:    http://localhost:${PORT}/openapi.json`);
  console.log(` -> Banco SQLite:    ${SqliteConnection.getDbPath()}`);
  console.log(`================================================================`);
});
