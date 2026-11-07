const db = require('../../infrastructure/database/SqliteConnection');
const StatusPedido = require('../../domain/enums/StatusPedido');
const AppError = require('../../domain/errors/AppError');
const AuditoriaService = require('./AuditoriaService');

class PagamentoMockService {
  static processarPagamentoMock({ pedidoId, metodo = 'PIX', simulacao = 'APROVADO', cartaoFinal = '4321' }, usuarioLogado, ip) {
    const details = [];
    if (!pedidoId || typeof pedidoId !== 'number') {
      details.push({ field: 'pedidoId', issue: 'O campo pedidoId e obrigatorio e numerico.' });
    }
    if (!['APROVADO', 'RECUSADO'].includes(simulacao)) {
      details.push({ field: 'simulacao', issue: 'O campo simulacao deve ser APROVADO ou RECUSADO.' });
    }
    if (details.length > 0) {
      throw new AppError(422, 'ERRO_VALIDACAO_PAGAMENTO', 'Dados invalidos para processamento do pagamento mock.', details);
    }

    const pedido = db.get(
      `SELECT id, codigo_pedido, cliente_id, unidade_id, status, total, canal_pedido
       FROM pedidos WHERE id = ?`,
      [pedidoId]
    );

    if (!pedido) {
      throw new AppError(404, 'PEDIDO_NAO_ENCONTRADO', `Pedido ${pedidoId} nao encontrado.`);
    }

    if (![StatusPedido.AGUARDANDO_PAGAMENTO, StatusPedido.PAGAMENTO_RECUSADO].includes(pedido.status)) {
      throw new AppError(
        409,
        'PEDIDO_NAO_AGUARDA_PAGAMENTO',
        `O pedido #${pedidoId} encontra-se com status '${pedido.status}' e nao pode receber novo pagamento.`
      );
    }

    const transacaoExternaId = `GW-MOCK-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const aprovado = simulacao === 'APROVADO';
    const statusPagamento = aprovado ? 'APROVADO' : 'RECUSADO';
    const novoStatusPedido = aprovado ? StatusPedido.EM_PREPARO : StatusPedido.PAGAMENTO_RECUSADO;
    const mensagemRetorno = aprovado
      ? 'Transacao autorizada pelo servico externo de pagamento (Mock).'
      : 'Pagamento negado pelo emissor/gateway externo (Mock): saldo/limite insuficiente.';

    const payloadGateway = {
      gateway: 'GATEWAY_NORDESTE_PAY_MOCK',
      externalTransactionId: transacaoExternaId,
      orderCode: pedido.codigo_pedido,
      channel: pedido.canal_pedido,
      method: metodo,
      cardLastDigits: metodo.startsWith('CARTAO') ? cartaoFinal : null,
      amount: pedido.total,
      status: statusPagamento,
      processedAt: new Date().toISOString()
    };

    const insertPag = db.run(
      `INSERT INTO pagamentos (pedido_id, transacao_externa_id, provedor_mock, metodo, valor, status, mensagem_retorno, payload_resposta)
       VALUES (?, ?, 'GATEWAY_NORDESTE_PAY_MOCK', ?, ?, ?, ?, ?)`,
      [
        pedidoId,
        transacaoExternaId,
        metodo,
        pedido.total,
        statusPagamento,
        mensagemRetorno,
        JSON.stringify(payloadGateway)
      ]
    );

    db.run(`UPDATE pedidos SET status = ?, updated_at = datetime('now') WHERE id = ?`, [novoStatusPedido, pedidoId]);

    let pontosCreditados = 0;
    if (aprovado) {
      // Se o cliente consentiu com a LGPD, acumula 1 ponto por real gasto
      const cliente = db.get('SELECT id, consentimento_lgpd FROM usuarios WHERE id = ?', [pedido.cliente_id]);
      if (cliente && cliente.consentimento_lgpd) {
        let conta = db.get('SELECT id, saldo_pontos FROM fidelidade_contas WHERE cliente_id = ?', [pedido.cliente_id]);
        if (!conta) {
          const novaConta = db.run(
            `INSERT INTO fidelidade_contas (cliente_id, saldo_pontos, categoria_cliente) VALUES (?, 0, 'BRONZE')`,
            [pedido.cliente_id]
          );
          conta = { id: novaConta.lastID, saldo_pontos: 0 };
        }
        pontosCreditados = Math.floor(pedido.total);
        const novoSaldo = conta.saldo_pontos + pontosCreditados;
        const novaCategoria = novoSaldo >= 500 ? 'OURO' : novoSaldo >= 200 ? 'PRATA' : 'BRONZE';

        db.run(
          `UPDATE fidelidade_contas SET saldo_pontos = ?, categoria_cliente = ?, updated_at = datetime('now') WHERE id = ?`,
          [novoSaldo, novaCategoria, conta.id]
        );
        db.run(
          `INSERT INTO fidelidade_historico (conta_id, pedido_id, tipo, pontos, descricao)
           VALUES (?, ?, 'ACUMULO', ?, ?)`,
          [conta.id, pedido.id, pontosCreditados, `Acumulo pelo pedido ${pedido.codigo_pedido} (${pedido.canal_pedido})`]
        );
      }
    } else {
      // Em caso de recusa do pagamento, registra auditoria especifica de falha de integracao/pagamento
    }

    AuditoriaService.registrar({
      usuarioId: usuarioLogado.sub,
      perfilUsuario: usuarioLogado.perfil,
      acao: aprovado ? 'PAGAMENTO_MOCK_APROVADO' : 'PAGAMENTO_MOCK_RECUSADO',
      recurso: '/pagamentos/mock',
      recursoId: insertPag.lastID,
      detalhes: {
        pedidoId,
        transacaoExternaId,
        valor: pedido.total,
        statusPagamento,
        novoStatusPedido,
        pontosCreditados
      },
      ipOrigem: ip
    });

    return {
      pagamentoId: insertPag.lastID,
      pedidoId,
      codigoPedido: pedido.codigo_pedido,
      canalPedido: pedido.canal_pedido,
      transacaoExternaId,
      statusPagamento,
      statusPedidoAtualizado: novoStatusPedido,
      valor: pedido.total,
      pontosFidelidadeCreditados: pontosCreditados,
      mensagem: mensagemRetorno,
      gatewayPayload: payloadGateway
    };
  }

  static consultarSaldoFidelidade(clienteId, usuarioLogado) {
    if (usuarioLogado.perfil === 'CLIENTE' && Number(usuarioLogado.sub) !== Number(clienteId)) {
      throw new AppError(403, 'ACESSO_NEGADO', 'Voce so pode consultar seu proprio extrato de fidelidade.');
    }
    const cliente = db.get('SELECT id, nome, consentimento_lgpd, data_consentimento FROM usuarios WHERE id = ?', [clienteId]);
    if (!cliente) {
      throw new AppError(404, 'CLIENTE_NAO_ENCONTRADO', `Cliente ${clienteId} nao encontrado.`);
    }
    const conta = db.get(
      `SELECT id, saldo_pontos AS saldoPontos, categoria_cliente AS categoriaCliente, updated_at AS updatedAt
       FROM fidelidade_contas WHERE cliente_id = ?`,
      [clienteId]
    );
    const historico = conta
      ? db.all(
          `SELECT id, pedido_id AS pedidoId, tipo, pontos, descricao, created_at AS createdAt
           FROM fidelidade_historico WHERE conta_id = ? ORDER BY id DESC`,
          [conta.id]
        )
      : [];

    return {
      clienteId: cliente.id,
      nomeCliente: cliente.nome,
      consentimentoLgpd: Boolean(cliente.consentimento_lgpd),
      dataConsentimento: cliente.data_consentimento,
      contaFidelidade: conta || { saldoPontos: 0, categoriaCliente: 'SEM_ADESAO_LGPD' },
      historico
    };
  }
}

module.exports = PagamentoMockService;
