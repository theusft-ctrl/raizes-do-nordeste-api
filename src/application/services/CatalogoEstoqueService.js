const db = require('../../infrastructure/database/SqliteConnection');
const AppError = require('../../domain/errors/AppError');
const AuditoriaService = require('./AuditoriaService');

class CatalogoEstoqueService {
  static listarUnidades() {
    return db.all(
      `SELECT id, nome, cidade, estado, tipo_cozinha AS tipoCozinha, ativa, created_at AS createdAt
       FROM unidades ORDER BY id ASC`
    ).map(u => ({ ...u, ativa: Boolean(u.ativa) }));
  }

  static consultarCardapioUnidade(unidadeId, { apenasDisponiveis = false } = {}) {
    const unidade = db.get(
      `SELECT id, nome, cidade, estado, tipo_cozinha AS tipoCozinha, ativa FROM unidades WHERE id = ?`,
      [unidadeId]
    );
    if (!unidade) {
      throw new AppError(404, 'UNIDADE_NAO_ENCONTRADA', `Unidade ${unidadeId} nao encontrada na rede.`);
    }

    const itens = db.all(
      `SELECT p.id AS produtoId, p.sku, p.nome, p.descricao, p.categoria,
              COALESCE(e.preco_regional, p.preco_base) AS precoUnitario,
              p.sazonal_junino AS sazonalJunino,
              p.exige_cozinha_completa AS exigeCozinhaCompleta,
              e.quantidade_disponivel AS quantidadeDisponivel,
              e.estoque_minimo AS estoqueMinimo
       FROM estoques e
       INNER JOIN produtos p ON p.id = e.produto_id
       WHERE e.unidade_id = ? AND p.ativo = 1
       ORDER BY p.categoria ASC, p.nome ASC`,
      [unidadeId]
    ).map(item => ({
      ...item,
      sazonalJunino: Boolean(item.sazonalJunino),
      exigeCozinhaCompleta: Boolean(item.exigeCozinhaCompleta),
      disponivelParaVenda: item.quantidadeDisponivel > 0 &&
        !(item.exigeCozinhaCompleta && unidade.tipoCozinha === 'REDUZIDA')
    }));

    return {
      unidade: { ...unidade, ativa: Boolean(unidade.ativa) },
      cardapio: apenasDisponiveis ? itens.filter(i => i.disponivelParaVenda) : itens
    };
  }

  static listarProdutos({ page = 1, limit = 10, categoria = null }) {
    const clauses = ['ativo = 1'];
    const params = [];
    if (categoria) {
      clauses.push('categoria = ?');
      params.push(categoria);
    }
    const whereSql = `WHERE ${clauses.join(' AND ')}`;
    const offset = (Number(page) - 1) * Number(limit);
    const totalRow = db.get(`SELECT COUNT(*) AS total FROM produtos ${whereSql}`, params);
    const rows = db.all(
      `SELECT id, sku, nome, descricao, categoria, preco_base AS precoBase,
              sazonal_junino AS sazonalJunino, exige_cozinha_completa AS exigeCozinhaCompleta
       FROM produtos ${whereSql}
       ORDER BY id ASC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    return {
      page: Number(page),
      limit: Number(limit),
      total: totalRow ? totalRow.total : 0,
      data: rows
    };
  }

  static movimentarEstoque({ unidadeId, produtoId, tipo, quantidade, motivo, usuario, ip }) {
    const details = [];
    if (!['ENTRADA', 'SAIDA'].includes(tipo)) {
      details.push({ field: 'tipo', issue: 'O tipo deve ser ENTRADA ou SAIDA.' });
    }
    if (typeof quantidade !== 'number' || quantidade <= 0 || !Number.isInteger(quantidade)) {
      details.push({ field: 'quantidade', issue: 'A quantidade deve ser um inteiro positivo.' });
    }
    if (!motivo || String(motivo).trim().length < 3) {
      details.push({ field: 'motivo', issue: 'Informe o motivo da movimentacao de estoque.' });
    }
    if (details.length > 0) {
      throw new AppError(422, 'ERRO_VALIDACAO_ESTOQUE', 'Dados invalidos para movimentacao de estoque.', details);
    }

    const estoque = db.get(
      `SELECT id, quantidade_disponivel FROM estoques WHERE unidade_id = ? AND produto_id = ?`,
      [unidadeId, produtoId]
    );
    if (!estoque) {
      throw new AppError(404, 'ESTOQUE_NAO_ENCONTRADO', 'Registro de estoque nao encontrado para a unidade e produto informados.');
    }

    if (tipo === 'SAIDA' && estoque.quantidade_disponivel < quantidade) {
      throw new AppError(409, 'ESTOQUE_INSUFICIENTE', 'Saldo insuficiente para realizar a baixa de estoque.', [
        { field: 'quantidade', issue: `Disponivel: ${estoque.quantidade_disponivel}` }
      ]);
    }

    const novoSaldo = tipo === 'ENTRADA'
      ? estoque.quantidade_disponivel + quantidade
      : estoque.quantidade_disponivel - quantidade;

    db.run(
      `UPDATE estoques SET quantidade_disponivel = ?, updated_at = datetime('now') WHERE id = ?`,
      [novoSaldo, estoque.id]
    );
    db.run(
      `INSERT INTO movimentacoes_estoque (estoque_id, tipo, quantidade, motivo, usuario_id)
       VALUES (?, ?, ?, ?, ?)`,
      [estoque.id, tipo, quantidade, motivo.trim(), usuario.sub]
    );

    AuditoriaService.registrar({
      usuarioId: usuario.sub,
      perfilUsuario: usuario.perfil,
      acao: `ESTOQUE_${tipo}`,
      recurso: '/estoque/movimentacoes',
      recursoId: estoque.id,
      detalhes: { unidadeId, produtoId, quantidade, saldoAnterior: estoque.quantidade_disponivel, novoSaldo, motivo },
      ipOrigem: ip
    });

    return {
      estoqueId: estoque.id,
      unidadeId,
      produtoId,
      tipo,
      quantidadeMovimentada: quantidade,
      saldoAnterior: estoque.quantidade_disponivel,
      saldoAtual: novoSaldo
    };
  }
}

module.exports = CatalogoEstoqueService;
