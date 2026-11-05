const db = require('../src/infrastructure/database/SqliteConnection');
const PasswordHasher = require('../src/infrastructure/security/PasswordHasher');
const runMigrations = require('./migrate');

function runSeed() {
  runMigrations();

  // Limpa tabelas na ordem correta para garantir idempotencia do seed
  db.execScript(`
    DELETE FROM logs_auditoria;
    DELETE FROM fidelidade_historico;
    DELETE FROM fidelidade_contas;
    DELETE FROM pagamentos;
    DELETE FROM itens_pedido;
    DELETE FROM pedidos;
    DELETE FROM movimentacoes_estoque;
    DELETE FROM estoques;
    DELETE FROM produtos;
    DELETE FROM usuarios;
    DELETE FROM unidades;
    DELETE FROM sqlite_sequence;
  `);

  // 1. Unidades da Franquia (Recife Matriz - Cozinha Completa; Olinda Express - Cozinha Reduzida; Fortaleza Aldeota - Cozinha Completa)
  db.run(`INSERT INTO unidades (nome, cidade, estado, tipo_cozinha, ativa) VALUES (?, ?, ?, ?, 1)`, [
    'Unidade Matriz - Boa Viagem', 'Recife', 'PE', 'COMPLETA'
  ]);
  db.run(`INSERT INTO unidades (nome, cidade, estado, tipo_cozinha, ativa) VALUES (?, ?, ?, ?, 1)`, [
    'Unidade Express - Carmo', 'Olinda', 'PE', 'REDUZIDA'
  ]);
  db.run(`INSERT INTO unidades (nome, cidade, estado, tipo_cozinha, ativa) VALUES (?, ?, ?, ?, 1)`, [
    'Unidade Filial - Aldeota', 'Fortaleza', 'CE', 'COMPLETA'
  ]);

  // 2. Usuarios (Perfis: ADMIN, GERENTE, COZINHA, ATENDENTE, CLIENTE)
  const usuariosSeed = [
    {
      nome: 'Dona Francisca (Fundadora / Matriz)',
      email: 'francisca.admin@raizesdonordeste.com.br',
      cpf: '11122233344',
      telefone: '81999990001',
      senha: 'Admin@123',
      perfil: 'ADMIN',
      consentimento: 1
    },
    {
      nome: 'Carlos Eduardo (Gerente Recife)',
      email: 'carlos.gerente@raizesdonordeste.com.br',
      cpf: '22233344455',
      telefone: '81999990002',
      senha: 'Gerente@123',
      perfil: 'GERENTE',
      consentimento: 1
    },
    {
      nome: 'Maria Clara (Cliente Fidelidade)',
      email: 'maria.cliente@exemplo.com',
      cpf: '33344455566',
      telefone: '81988887777',
      senha: 'Cliente@123',
      perfil: 'CLIENTE',
      consentimento: 1
    },
    {
      nome: 'Severino (Chefe de Cozinha)',
      email: 'severino.cozinha@raizesdonordeste.com.br',
      cpf: '44455566677',
      telefone: '81999990004',
      senha: 'Cozinha@123',
      perfil: 'COZINHA',
      consentimento: 1
    }
  ];

  for (const u of usuariosSeed) {
    const res = db.run(
      `INSERT INTO usuarios (nome, email, cpf_hash, telefone, senha_hash, perfil, consentimento_lgpd, data_consentimento)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        u.nome,
        u.email,
        PasswordHasher.hashCpf(u.cpf),
        u.telefone,
        PasswordHasher.hash(u.senha),
        u.perfil,
        u.consentimento
      ]
    );
    if (u.perfil === 'CLIENTE') {
      db.run(
        `INSERT INTO fidelidade_contas (cliente_id, saldo_pontos, categoria_cliente) VALUES (?, 120, 'BRONZE')`,
        [res.lastID]
      );
    }
  }

  // 3. Produtos Regionais
  const produtosSeed = [
    {
      sku: 'RN-CUS-001',
      nome: 'Cuscuz Recheado com Carne de Sol e Queijo Coalho',
      descricao: 'Cuscuz de milho flocao cozido no vapor com manteiga de garrafa, carne de sol desfiada e queijo coalho.',
      categoria: 'PRATOS_QUENTES',
      precoBase: 28.90,
      sazonalJunino: 0,
      exigeCozinhaCompleta: 1
    },
    {
      sku: 'RN-TAP-002',
      nome: 'Tapioca Tradicional de Coco Fresco com Queijo Coalho',
      descricao: 'Goma de mandioca artesanal hidratada na hora com recheio de coco ralado e queijo coalho.',
      categoria: 'TAPIOCAS',
      precoBase: 18.50,
      sazonalJunino: 0,
      exigeCozinhaCompleta: 0
    },
    {
      sku: 'RN-BOL-003',
      nome: 'Bolo de Macaxeira Caramelizado (Fatia Generosa)',
      descricao: 'Receita tradicional de Dona Francisca feita com macaxeira fresca ralada e leite de coco.',
      categoria: 'CONFEITARIA_REGIONAL',
      precoBase: 14.00,
      sazonalJunino: 0,
      exigeCozinhaCompleta: 0
    },
    {
      sku: 'RN-SUC-004',
      nome: 'Suco Natural de Caja com Hortela (500ml)',
      descricao: 'Polpa fresca regional de caja batida na hora.',
      categoria: 'BEBIDAS',
      precoBase: 11.90,
      sazonalJunino: 0,
      exigeCozinhaCompleta: 0
    },
    {
      sku: 'RN-JUN-005',
      nome: 'Combo Arraia Raizes (Canjica + Pamonha + Cafe Passado)',
      descricao: 'Edicao especial do calendario sazonal junino.',
      categoria: 'SAZONAIS_JUNINOS',
      precoBase: 34.90,
      sazonalJunino: 1,
      exigeCozinhaCompleta: 1
    }
  ];

  for (const p of produtosSeed) {
    db.run(
      `INSERT INTO produtos (sku, nome, descricao, categoria, preco_base, sazonal_junino, exige_cozinha_completa, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [p.sku, p.nome, p.descricao, p.categoria, p.precoBase, p.sazonalJunino, p.exigeCozinhaCompleta]
    );
  }

  // 4. Estoques por Unidade
  // Unidade 1 (Recife - Cozinha Completa)
  db.run(`INSERT INTO estoques (unidade_id, produto_id, quantidade_disponivel, estoque_minimo, preco_regional) VALUES (1, 1, 25, 5, 28.90)`);
  db.run(`INSERT INTO estoques (unidade_id, produto_id, quantidade_disponivel, estoque_minimo, preco_regional) VALUES (1, 2, 40, 10, 18.50)`);
  db.run(`INSERT INTO estoques (unidade_id, produto_id, quantidade_disponivel, estoque_minimo, preco_regional) VALUES (1, 3, 15, 5, 14.00)`);
  db.run(`INSERT INTO estoques (unidade_id, produto_id, quantidade_disponivel, estoque_minimo, preco_regional) VALUES (1, 4, 30, 8, 11.90)`);
  db.run(`INSERT INTO estoques (unidade_id, produto_id, quantidade_disponivel, estoque_minimo, preco_regional) VALUES (1, 5, 3, 5, 34.90)`);

  // Unidade 2 (Olinda Express - Cozinha Reduzida)
  db.run(`INSERT INTO estoques (unidade_id, produto_id, quantidade_disponivel, estoque_minimo, preco_regional) VALUES (2, 2, 20, 5, 18.00)`);
  db.run(`INSERT INTO estoques (unidade_id, produto_id, quantidade_disponivel, estoque_minimo, preco_regional) VALUES (2, 3, 12, 4, 14.00)`);
  db.run(`INSERT INTO estoques (unidade_id, produto_id, quantidade_disponivel, estoque_minimo, preco_regional) VALUES (2, 4, 18, 5, 11.50)`);

  console.log('[SEED] Dados iniciais da Rede Raizes do Nordeste populados com sucesso!');
}

if (require.main === module) {
  runSeed();
}

module.exports = runSeed;
