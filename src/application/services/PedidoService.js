const db = require('../../infrastructure/database/SqliteConnection');
const Pedido = require('../../domain/entities/Pedido');
const CanalPedido = require('../../domain/enums/CanalPedido');
const StatusPedido = require('../../domain/enums/StatusPedido');
const AppError = require('../../domain/errors/AppError');
const AuditoriaService = require('./AuditoriaService');

class PedidoService {
  static criarPedido(payload, usuarioLogado, ip) {
    const clienteId = payload.clienteId || usuarioLogado.sub;
    const pedidoDomain = new Pedido({
      unidadeId: payload.unidadeId,
      clienteId,
      canalPedido: payload.canalPedido,
      itens: payload.itens,
      formaPagamento: payload.formaPagamento || 'MOCK',
      cupomPromocional: payload.cupomPromocional || null,
      pontosResgatados: payload.pontosResgatados || 0,
      observacoes: payload.observacoes || null
    });

    pedidoDomain.validarContrato();

    const unidade = db.get('SELECT id, nome, tipo_cozinha, ativa FROM unidades WHERE id = ?', [pedidoDomain.unidadeId]);
    if (!unidade || !unidade.ativa) {
      throw new AppError(404, 'UNIDADE_NAO_ENCONTRADA', `A unidade ${pedidoDomain.unidadeId} nao existe ou esta inativa.`);
    }

    const cliente = db.get('SELECT id, nome, consentimento_lgpd FROM usuarios WHERE id = ?', [clienteId]);
    if (!cliente) {
      throw new AppError(404, 'CLIENTE_NAO_ENCONTRADO', `Cliente ${clienteId} nao encontrado.`);
    }

    const itensCalculados = [];
    const falhasEstoque = [];
    let subtotalPedido = 0;

    for (let i = 0; i < pedidoDomain.itens.length; i++) {
      const itemReq = pedidoDomain.itens[i];
      const prodEstoque = db.get(
        `SELECT p.id AS produtoId, p.nome, p.ativo, p.exige_cozinha_completa,
                COALESCE(e.preco_regional, p.preco_base) AS precoUnitario,
                e.id AS estoqueId, e.quantidade_disponivel AS disponivel
         FROM produtos p
         LEFT JOIN estoques e ON e.produto_id = p.id AND e.unidade_id = ?
         WHERE p.id = ?`,
        [pedidoDomain.unidadeId, itemReq.produtoId]
      );

      if (!prodEstoque || !prodEstoque.ativo || prodEstoque.estoqueId === null) {
        throw new AppError(
          404,
          'PRODUTO_NAO_ENCONTRADO_NA_UNIDADE',
          `O produto ${itemReq.produtoId} nao existe ou nao e comercializado na unidade ${unidade.nome}.`,
          [{ field: `itens[${i}].produtoId`, issue: `Produto ${itemReq.produtoId} inexistente na unidade ${pedidoDomain.unidadeId}` }]
        );
      }

      if (prodEstoque.exige_cozinha_completa && unidade.tipo_cozinha === 'REDUZIDA') {
        throw new AppError(
          409,
          'PRODUTO_INDISPONIVEL_COZINHA_REDUZIDA',
          `O produto '${prodEstoque.nome}' exige cozinha completa e nao pode ser preparado na unidade '${unidade.nome}'.`,
          [{ field: `itens[${i}].produtoId`, issue: 'Unidade opera com cozinha reduzida' }]
        );
      }

      if (prodEstoque.disponivel < itemReq.quantidade) {
        falhasEstoque.push({
          field: `itens[${i}].quantidade`,
          issue: `Disponivel: ${prodEstoque.disponivel}`
        });
      }

      const subtotalItem = Number((prodEstoque.precoUnitario * itemReq.quantidade).toFixed(2));
      subtotalPedido = Number((subtotalPedido + subtotalItem).toFixed(2));
      itensCalculados.push({
        produtoId: prodEstoque.produtoId,
        estoqueId: prodEstoque.estoqueId,
        nomeProduto: prodEstoque.nome,
        quantidade: itemReq.quantidade,
        precoUnitario: Number(prodEstoque.precoUnitario.toFixed(2)),
        subtotal: subtotalItem
      });
    }

    if (falhasEstoque.length > 0) {
      throw new AppError(
        409,
        'ESTOQUE_INSUFICIENTE',
        'Nao ha quantidade suficiente para um ou mais itens.',
        falhasEstoque
      );
    }

    // Calculo de descontos promocionais e programa de fidelidade
    let desconto = 0;
    if (pedidoDomain.cupomPromocional === 'SAOJOAO10') {
      desconto = Number((subtotalPedido * 0.10).toFixed(2));
    }

    if (pedidoDomain.pontosResgatados > 0) {
      if (!cliente.consentimento_lgpd) {
        throw new AppError(409, 'FIDELIDADE_SEM_CONSENTIMENTO_LGPD', 'O resgate de pontos exige consentimento explicito da LGPD.');
      }
      const contaFid = db.get('SELECT id, saldo_pontos FROM fidelidade_contas WHERE cliente_id = ?', [clienteId]);
      if (!contaFid || contaFid.saldo_pontos < pedidoDomain.pontosResgatados) {
        throw new AppError(409, 'SALDO_PONTOS_INSUFICIENTE', 'Saldo de pontos insuficiente para resgate.');
      }
      const descontoFidelidade = Number(((pedidoDomain.pontosResgatados / 100) * 5.0).toFixed(2));
      desconto = Number((desconto + descontoFidelidade).toFixed(2));
      db.run('UPDATE fidelidade_contas SET saldo_pontos = saldo_pontos - ? WHERE id = ?', [
        pedidoDomain.pontosResgatados,
        contaFid.id
      ]);
    }

    const totalPedido = Math.max(0, Number((subtotalPedido - desconto).toFixed(2)));
    const codigoPedido = `RN-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    const insertPedido = db.run(
      `INSERT INTO pedidos (
        codigo_pedido, cliente_id, unidade_id, canal_pedido, status,
        subtotal, desconto, total, forma_pagamento, cupom_promocional, pontos_resgatados, observacoes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        codigoPedido,
        clienteId,
        pedidoDomain.unidadeId,
        pedidoDomain.canalPedido,
        StatusPedido.AGUARDANDO_PAGAMENTO,
        subtotalPedido,
        desconto,
        totalPedido,
        pedidoDomain.formaPagamento,
        pedidoDomain.cupomPromocional,
        pedidoDomain.pontosResgatados,
        pedidoDomain.observacoes
      ]
    );

    const pedidoId = insertPedido.lastID;

    for (const item of itensCalculados) {
      db.run(
        `INSERT INTO itens_pedido (pedido_id, produto_id, nome_produto, quantidade, preco_unitario, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [pedidoId, item.produtoId, item.nomeProduto, item.quantidade, item.precoUnitario, item.subtotal]
      );
      db.run(
        `UPDATE estoques SET quantidade_disponivel = quantidade_disponivel - ?, updated_at = datetime('now')
         WHERE id = ?`,
        [item.quantidade, item.estoqueId]
      );
      db.run(
        `INSERT INTO movimentacoes_estoque (estoque_id, tipo, quantidade, motivo, usuario_id)
         VALUES (?, 'RESERVA', ?, ?, ?)`,
        [item.estoqueId, item.quantidade, `Reserva automatica do pedido #${pedidoId} (${pedidoDomain.canalPedido})`, usuarioLogado.sub]
      );
    }

    AuditoriaService.registrar({
      usuarioId: usuarioLogado.sub,
      perfilUsuario: usuarioLogado.perfil,
      acao: 'PEDIDO_CRIADO',
      recurso: '/pedidos',
      recursoId: pedidoId,
      detalhes: {
        codigoPedido,
        unidadeId: pedidoDomain.unidadeId,
        canalPedido: pedidoDomain.canalPedido,
        total: totalPedido
      },
      ipOrigem: ip
    });

    return this.obterPedidoPorId(pedidoId, usuarioLogado);
  }

  static obterPedidoPorId(pedidoId, usuarioLogado) {
    const pedido = db.get(
      `SELECT p.id AS pedidoId, p.codigo_pedido AS codigoPedido, p.cliente_id AS clienteId,
              u.nome AS nomeCliente, p.unidade_id AS unidadeId, un.nome AS nomeUnidade,
              p.canal_pedido AS canalPedido, p.status, p.subtotal, p.desconto, p.total,
              p.forma_pagamento AS formaPagamento, p.cupom_promocional AS cupomPromocional,
              p.pontos_resgatados AS pontosResgatados, p.created_at AS createdAt, p.updated_at AS updatedAt
       FROM pedidos p
       INNER JOIN usuarios u ON u.id = p.cliente_id
       INNER JOIN unidades un ON un.id = p.unidade_id
       WHERE p.id = ?`,
      [pedidoId]
    );

    if (!pedido) {
      throw new AppError(404, 'PEDIDO_NAO_ENCONTRADO', `Pedido ${pedidoId} nao encontrado.`);
    }

    if (usuarioLogado.perfil === 'CLIENTE' && Number(pedido.clienteId) !== Number(usuarioLogado.sub)) {
      throw new AppError(403, 'ACESSO_NEGADO', 'Clientes podem consultar apenas seus proprios pedidos.');
    }

    const itens = db.all(
      `SELECT produto_id AS produtoId, nome_produto AS nomeProduto, quantidade,
              preco_unitario AS precoUnitario, subtotal
       FROM itens_pedido WHERE pedido_id = ?`,
      [pedidoId]
    );

    const pagamentos = db.all(
      `SELECT id AS pagamentoId, transacao_externa_id AS transacaoExternaId,
              provedor_mock AS provedorMock, metodo, valor, status,
              mensagem_retorno AS mensagemRetorno, created_at AS createdAt
       FROM pagamentos WHERE pedido_id = ? ORDER BY id DESC`,
      [pedidoId]
    );

    return {
      ...pedido,
      itens,
      pagamentos
    };
  }

  static listarPedidos({ canalPedido, status, unidadeId, page = 1, limit = 10 }, usuarioLogado) {
    const clauses = [];
    const params = [];

    if (canalPedido) {
      if (!CanalPedido.isValid(canalPedido)) {
        throw new AppError(422, 'CANAL_PEDIDO_INVALIDO', `O filtro canalPedido '${canalPedido}' e invalido.`, [
          { field: 'canalPedido', issue: `Valores aceitos: ${CanalPedido.values().join(', ')}` }
        ]);
      }
      clauses.push('p.canal_pedido = ?');
      params.push(canalPedido);
    }

    if (status) {
      clauses.push('p.status = ?');
      params.push(status);
    }

    if (unidadeId) {
      clauses.push('p.unidade_id = ?');
      params.push(Number(unidadeId));
    }

    if (usuarioLogado.perfil === 'CLIENTE') {
      clauses.push('p.cliente_id = ?');
      params.push(Number(usuarioLogado.sub));
    }

    const whereSql = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const countRow = db.get(`SELECT COUNT(*) AS total FROM pedidos p ${whereSql}`, params);
    const pedidos = db.all(
      `SELECT p.id AS pedidoId, p.codigo_pedido AS codigoPedido, p.cliente_id AS clienteId,
              p.unidade_id AS unidadeId, p.canal_pedido AS canalPedido, p.status,
              p.subtotal, p.desconto, p.total, p.forma_pagamento AS formaPagamento,
              p.created_at AS createdAt
       FROM pedidos p
       ${whereSql}
       ORDER BY p.id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    return {
      page: Number(page),
      limit: Number(limit),
      total: countRow ? countRow.total : 0,
      filtrosAplicados: { canalPedido: canalPedido || null, status: status || null, unidadeId: unidadeId || null },
      data: pedidos
    };
  }

  static atualizarStatusPedido(pedidoId, { novoStatus, motivo }, usuarioLogado, ip) {
    if (!StatusPedido.values().includes(novoStatus)) {
      throw new AppError(422, 'STATUS_INVALIDO', `Status '${novoStatus}' nao e reconhecido.`, [
        { field: 'status', issue: `Valores permitidos: ${StatusPedido.values().join(', ')}` }
      ]);
    }

    const pedido = db.get('SELECT id, status, unidade_id, total FROM pedidos WHERE id = ?', [pedidoId]);
    if (!pedido) {
      throw new AppError(404, 'PEDIDO_NAO_ENCONTRADO', `Pedido ${pedidoId} nao encontrado.`);
    }

    if (!StatusPedido.canTransition(pedido.status, novoStatus)) {
      throw new AppError(
        409,
        'TRANSICAO_STATUS_INVALIDA',
        `Nao e permitido alterar o status de '${pedido.status}' para '${novoStatus}'.`
      );
    }

    if (novoStatus === StatusPedido.CANCELADO) {
      const itens = db.all('SELECT produto_id, quantidade FROM itens_pedido WHERE pedido_id = ?', [pedidoId]);
      for (const item of itens) {
        const est = db.get('SELECT id FROM estoques WHERE unidade_id = ? AND produto_id = ?', [
          pedido.unidade_id,
          item.produto_id
        ]);
        if (est) {
          db.run('UPDATE estoques SET quantidade_disponivel = quantidade_disponivel + ? WHERE id = ?', [
            item.quantidade,
            est.id
          ]);
          db.run(
            `INSERT INTO movimentacoes_estoque (estoque_id, tipo, quantidade, motivo, usuario_id)
             VALUES (?, 'ESTORNO', ?, ?, ?)`,
            [est.id, item.quantidade, `Estorno por cancelamento do pedido #${pedidoId}`, usuarioLogado.sub]
          );
        }
      }
    }

    db.run(`UPDATE pedidos SET status = ?, updated_at = datetime('now') WHERE id = ?`, [novoStatus, pedidoId]);

    AuditoriaService.registrar({
      usuarioId: usuarioLogado.sub,
      perfilUsuario: usuarioLogado.perfil,
      acao: 'PEDIDO_MUDANCA_STATUS',
      recurso: `/pedidos/${pedidoId}/status`,
      recursoId: pedidoId,
      detalhes: { statusAnterior: pedido.status, novoStatus, motivo: motivo || 'Evolucao operacional do pedido' },
      ipOrigem: ip
    });

    return this.obterPedidoPorId(pedidoId, usuarioLogado);
  }
}

module.exports = PedidoService;
