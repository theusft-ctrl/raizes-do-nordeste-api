PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS unidades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cidade TEXT NOT NULL,
    estado TEXT NOT NULL,
    tipo_cozinha TEXT NOT NULL CHECK (tipo_cozinha IN ('COMPLETA', 'REDUZIDA')),
    ativa INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    cpf_hash TEXT,
    telefone TEXT,
    senha_hash TEXT NOT NULL,
    perfil TEXT NOT NULL CHECK (perfil IN ('CLIENTE', 'ATENDENTE', 'COZINHA', 'GERENTE', 'ADMIN')),
    consentimento_lgpd INTEGER NOT NULL DEFAULT 0,
    finalidade_lgpd TEXT DEFAULT 'Execucao de contrato de pedido e programa de fidelizacao',
    data_consentimento TEXT,
    anonimizado INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT NOT NULL,
    preco_base REAL NOT NULL CHECK (preco_base >= 0),
    sazonal_junino INTEGER NOT NULL DEFAULT 0,
    exige_cozinha_completa INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS estoques (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    unidade_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL,
    quantidade_disponivel INTEGER NOT NULL DEFAULT 0 CHECK (quantidade_disponivel >= 0),
    estoque_minimo INTEGER NOT NULL DEFAULT 5,
    preco_regional REAL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(unidade_id, produto_id),
    FOREIGN KEY (unidade_id) REFERENCES unidades(id) ON DELETE CASCADE,
    FOREIGN KEY (produto_id) REFERENCES produtos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    estoque_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA', 'RESERVA', 'ESTORNO')),
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    motivo TEXT NOT NULL,
    usuario_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (estoque_id) REFERENCES estoques(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_pedido TEXT NOT NULL UNIQUE,
    cliente_id INTEGER NOT NULL,
    unidade_id INTEGER NOT NULL,
    canal_pedido TEXT NOT NULL CHECK (canal_pedido IN ('APP', 'TOTEM', 'BALCAO', 'PICKUP', 'WEB')),
    status TEXT NOT NULL CHECK (status IN ('AGUARDANDO_PAGAMENTO', 'PAGAMENTO_RECUSADO', 'EM_PREPARO', 'PRONTO', 'ENTREGUE', 'CANCELADO')),
    subtotal REAL NOT NULL CHECK (subtotal >= 0),
    desconto REAL NOT NULL DEFAULT 0 CHECK (desconto >= 0),
    total REAL NOT NULL CHECK (total >= 0),
    forma_pagamento TEXT NOT NULL,
    cupom_promocional TEXT,
    pontos_resgatados INTEGER NOT NULL DEFAULT 0,
    observacoes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (cliente_id) REFERENCES usuarios(id),
    FOREIGN KEY (unidade_id) REFERENCES unidades(id)
);

CREATE TABLE IF NOT EXISTS itens_pedido (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    produto_id INTEGER NOT NULL,
    nome_produto TEXT NOT NULL,
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    preco_unitario REAL NOT NULL CHECK (preco_unitario >= 0),
    subtotal REAL NOT NULL CHECK (subtotal >= 0),
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
);

CREATE TABLE IF NOT EXISTS pagamentos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    transacao_externa_id TEXT NOT NULL UNIQUE,
    provedor_mock TEXT NOT NULL DEFAULT 'GATEWAY_NORDESTE_PAY_MOCK',
    metodo TEXT NOT NULL,
    valor REAL NOT NULL CHECK (valor >= 0),
    status TEXT NOT NULL CHECK (status IN ('PENDENTE', 'APROVADO', 'RECUSADO', 'ESTORNADO')),
    mensagem_retorno TEXT,
    payload_resposta TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fidelidade_contas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL UNIQUE,
    saldo_pontos INTEGER NOT NULL DEFAULT 0 CHECK (saldo_pontos >= 0),
    categoria_cliente TEXT NOT NULL DEFAULT 'BRONZE',
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (cliente_id) REFERENCES usuarios(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS fidelidade_historico (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conta_id INTEGER NOT NULL,
    pedido_id INTEGER,
    tipo TEXT NOT NULL CHECK (tipo IN ('ACUMULO', 'RESGATE', 'BONIFICACAO')),
    pontos INTEGER NOT NULL,
    descricao TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (conta_id) REFERENCES fidelidade_contas(id) ON DELETE CASCADE,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS logs_auditoria (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER,
    perfil_usuario TEXT,
    acao TEXT NOT NULL,
    recurso TEXT NOT NULL,
    recurso_id TEXT,
    detalhes TEXT,
    ip_origem TEXT DEFAULT '127.0.0.1',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
