# Rede "Raízes do Nordeste" — API REST Back-End

**Projeto Multidisciplinar — Trilha: Back-End (Ano 2026)**  
**Instituição:** Centro Universitário Internacional UNINTER  
**Curso:** CST em Análise e Desenvolvimento de Sistemas — Distância  
**Aluno:** Matheus Vargas de Freitas — **RU:** 5057317  
**Polo de Apoio:** Polo Uninter Canoas  
**Professora:** Prof. Me. Luciane Yanase Kanashiro  

---

## 1. Visão Geral do Projeto

Esta solução implementa o Back-End unificado da rede de franquias **Raízes do Nordeste**, atendendo à jornada omnichannel (**APP, TOTEM, BALCAO, PICKUP e WEB**), controle de cardápio e estoque regionalizado por unidade (cozinha completa vs. reduzida e itens sazonais juninos), programa de fidelização com consentimento explícito em conformidade com a **LGPD (Lei nº 13.709/2018)**, integração desacoplada com gateway de pagamento externo (**Mock**) e trilha de auditoria (`logs_auditoria`).

### Fluxo Crítico Implementado (Fluxo A — Recomendado)
`Pedido (com canalPedido obrigatório e reserva de estoque) → Solicitação de Pagamento Mock (Aprovado/Recusado) → Atualização de Status (AGUARDANDO_PAGAMENTO → EM_PREPARO → PRONTO → ENTREGUE) + Crédito Automático de Pontos de Fidelidade + Registro de Auditoria.`

---

## 2. Arquitetura em Camadas

O projeto adota **Clean Architecture / DDD Simplificado** dividido em 4 camadas explícitas:

```text
raizes-do-nordeste-api/
├── database/
│   ├── schema.sql          # DDL relacional com PK, FK, UNIQUE e CHECK constraints
│   ├── migrate.js          # Script de criacao/migracao do banco SQLite
│   └── seed.js             # Carga inicial (Unidades, Usuarios, Cardapio Regional e Estoques)
├── docs/
│   ├── openapi.json        # Especificacao OpenAPI 3.0.3 exportada
│   └── diagramas/          # DER, Casos de Uso, Diagrama de Classes, Sequencia e Arquitetura
├── postman/
│   └── Raizes_do_Nordeste.postman_collection.json  # Colecao Postman v2.1 (Cenarios T01 a T12)
├── src/
│   ├── domain/             # Entidades (Pedido), Enums (CanalPedido, StatusPedido, PerfilUsuario) e AppError
│   ├── application/        # Casos de uso / Services (Auth, CatalogoEstoque, Pedido, PagamentoMock, Auditoria)
│   ├── infrastructure/     # Persistencia SQLite (SqliteConnection), Hash scrypt/SHA-256 e JWT (HS256)
│   ├── api/                # Rotas HTTP, autenticacao/RBAC, OpenAPI/Swagger (/api-docs)
│   ├── app.js              # Configuracao da aplicacao e tratamento padronizado de erros
│   └── server.js           # Entrypoint de execucao da API
├── tests/
│   └── run_tests.js        # Suite automatizada que executa e valida os 12 cenarios (T01 a T12)
├── .env.example            # Modelo de variaveis de ambiente
└── package.json            # Scripts de execucao, migracao, seed e testes
```

---

## 3. Requisitos de Execução

- **Node.js:** `v18.0.0` ou superior (testado em `v18.20.4`)
- **Python 3 (SQLite nativo):** `v3.10` ou superior (utilizado pelo driver relacional nativo sem dependência de compiladores C++ externos)
- **Banco de Dados:** SQLite 3 persistido em arquivo local (`./database/raizes_nordeste.sqlite`)

---

## 4. Passo a Passo de Execução (Reprodutível)

### 4.1. Clonar o repositório e configurar variáveis de ambiente
```bash
git clone <URL_DO_SEU_REPOSITORIO_PUBLICO>
cd raizes-do-nordeste-api
cp .env.example .env
```

### 4.2. Criar o banco de dados, executar as Migrations e aplicar o Seed
```bash
npm run setup
# Ou separadamente:
# npm run migrate
# npm run seed
```

### 4.3. Iniciar o servidor da API
```bash
npm start
```
A API ficará disponível em:
- **URL Base:** `http://localhost:3000`
- **Documentação Interativa Swagger UI:** `http://localhost:3000/api-docs`
- **Contrato OpenAPI 3.0 (JSON):** `http://localhost:3000/openapi.json`

### 4.4. Executar a suíte de testes automatizados (Cenários T01 a T12)
```bash
npm test
```

---

## 5. Credenciais Pré-Cadastradas pelo Seed

| Perfil (Role) | E-mail | Senha | Finalidade nos Testes |
| :--- | :--- | :--- | :--- |
| `CLIENTE` | `maria.cliente@exemplo.com` | `Cliente@123` | Criar pedidos (`APP`/`TOTEM`/`WEB`), simular pagamento mock e acumular pontos |
| `GERENTE` | `carlos.gerente@raizesdonordeste.com.br` | `Gerente@123` | Movimentar estoque, atualizar status de pedidos e auditar logs |
| `COZINHA` | `severino.cozinha@raizesdonordeste.com.br` | `Cozinha@123` | Atualizar fila de preparo (`EM_PREPARO` → `PRONTO`) |
| `ADMIN` | `francisca.admin@raizesdonordeste.com.br` | `Admin@123` | Gestão global da matriz, auditoria e anonimização LGPD |

---

## 6. Como Executar a Coleção Postman / Insomnia

1. Abra o **Postman** ou **Insomnia** e clique em **Import**.
2. Selecione o arquivo `postman/Raizes_do_Nordeste.postman_collection.json`.
3. Execute primeiro a requisição **T01 - Auth/Login válido (Cliente)** e **T01b - Auth/Login válido (Gerente)** na pasta `1. Auth & Segurança` (o script de pós-requisição salva automaticamente as variáveis `{{tokenCliente}}` e `{{tokenGerente}}`).
4. Execute as demais pastas em sequência (`2. Unidades, Cardápio & Estoque`, `3. Fluxo Crítico — Pedidos & Multicanalidade`, `4. Pagamento Mock, Status & Fidelidade` e `5. Multicanalidade & Auditoria LGPD`).
