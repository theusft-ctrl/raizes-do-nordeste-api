const http = require('http');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const server = require('../src/app');
const runSeed = require('../database/seed');

const TEST_PORT = 3456;

function request(method, routePath, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request(
      { hostname: '127.0.0.1', port: TEST_PORT, path: routePath, method, headers },
      res => {
        let raw = '';
        res.on('data', chunk => (raw += chunk));
        res.on('end', () => {
          let parsed = raw;
          try {
            parsed = JSON.parse(raw);
          } catch (_) {}
          resolve({ status: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runAllTests() {
  console.log('====================================================================');
  console.log(' INICIANDO PLANO DE TESTES AUTOMATIZADO — REDE RAIZES DO NORDESTE');
  console.log('====================================================================');
  runSeed();

  await new Promise(resolve => server.listen(TEST_PORT, resolve));
  const results = [];

  try {
    // T01 - Login valido (Cliente) + Login Admin/Gerente
    const resLoginCliente = await request('POST', '/auth/login', {
      email: 'maria.cliente@exemplo.com',
      senha: 'Cliente@123'
    });
    assert.strictEqual(resLoginCliente.status, 200, 'T01 deve retornar 200');
    assert.ok(resLoginCliente.body.accessToken, 'T01 deve retornar accessToken JWT');
    const tokenCliente = resLoginCliente.body.accessToken;
    results.push({
      id: 'T01',
      tipo: 'POSITIVO',
      cenario: 'Autenticacao com credenciais validas (JWT)',
      endpoint: 'POST /auth/login',
      statusEsperado: 200,
      statusObtido: resLoginCliente.status,
      resultado: 'PASSOU',
      resumoResposta: { tokenType: resLoginCliente.body.tokenType, user: resLoginCliente.body.user }
    });

    const resLoginGerente = await request('POST', '/auth/login', {
      email: 'carlos.gerente@raizesdonordeste.com.br',
      senha: 'Gerente@123'
    });
    const tokenGerente = resLoginGerente.body.accessToken;

    // T02 - Acesso sem token (401)
    const resSemToken = await request('GET', '/pedidos');
    assert.strictEqual(resSemToken.status, 401, 'T02 deve retornar 401');
    assert.strictEqual(resSemToken.body.error, 'NAO_AUTENTICADO');
    results.push({
      id: 'T02',
      tipo: 'NEGATIVO',
      cenario: 'Acesso a endpoint protegido sem token JWT (401)',
      endpoint: 'GET /pedidos',
      statusEsperado: 401,
      statusObtido: resSemToken.status,
      resultado: 'PASSOU',
      resumoResposta: resSemToken.body
    });

    // T03 - Acesso com perfil sem permissao (403)
    const resSemPermissao = await request(
      'POST',
      '/estoque/movimentacoes',
      { unidadeId: 1, produtoId: 1, tipo: 'ENTRADA', quantidade: 10, motivo: 'Tentativa indevida por cliente' },
      tokenCliente
    );
    assert.strictEqual(resSemPermissao.status, 403, 'T03 deve retornar 403');
    assert.strictEqual(resSemPermissao.body.error, 'PERMISSAO_INSUFICIENTE');
    results.push({
      id: 'T03',
      tipo: 'NEGATIVO',
      cenario: 'Acesso a operacao restrita com perfil sem permissao (CLIENTE tentando movimentar estoque - 403)',
      endpoint: 'POST /estoque/movimentacoes',
      statusEsperado: 403,
      statusObtido: resSemPermissao.status,
      resultado: 'PASSOU',
      resumoResposta: resSemPermissao.body
    });

    // T04 - Validacao de dados: campo obrigatorio canalPedido ausente/invalido (422)
    const resSemCanal = await request(
      'POST',
      '/pedidos',
      {
        unidadeId: 1,
        itens: [{ produtoId: 1, quantidade: 1 }],
        formaPagamento: 'PIX'
      },
      tokenCliente
    );
    assert.strictEqual(resSemCanal.status, 422, 'T04 deve retornar 422');
    assert.strictEqual(resSemCanal.body.error, 'ERRO_VALIDACAO_CONTRATO');
    results.push({
      id: 'T04',
      tipo: 'NEGATIVO',
      cenario: 'Criacao de pedido sem o campo obrigatorio canalPedido (422)',
      endpoint: 'POST /pedidos',
      statusEsperado: 422,
      statusObtido: resSemCanal.status,
      resultado: 'PASSOU',
      resumoResposta: resSemCanal.body
    });

    // T05 - Validacao de dados: quantidade negativa em item do pedido (422)
    const resQtdNegativa = await request(
      'POST',
      '/pedidos',
      {
        unidadeId: 1,
        canalPedido: 'APP',
        itens: [{ produtoId: 1, quantidade: -3 }],
        formaPagamento: 'PIX'
      },
      tokenCliente
    );
    assert.strictEqual(resQtdNegativa.status, 422, 'T05 deve retornar 422');
    results.push({
      id: 'T05',
      tipo: 'NEGATIVO',
      cenario: 'Criacao de pedido com quantidade negativa de itens (422)',
      endpoint: 'POST /pedidos',
      statusEsperado: 422,
      statusObtido: resQtdNegativa.status,
      resultado: 'PASSOU',
      resumoResposta: resQtdNegativa.body
    });

    // T06 - Consulta de cardapio regionalizado por unidade (200)
    const resCardapio = await request('GET', '/unidades/1/cardapio?apenasDisponiveis=true');
    assert.strictEqual(resCardapio.status, 200, 'T06 deve retornar 200');
    assert.ok(Array.isArray(resCardapio.body.cardapio) && resCardapio.body.cardapio.length > 0);
    results.push({
      id: 'T06',
      tipo: 'POSITIVO',
      cenario: 'Consulta de cardapio disponivel na Unidade Matriz Recife (200)',
      endpoint: 'GET /unidades/1/cardapio?apenasDisponiveis=true',
      statusEsperado: 200,
      statusObtido: resCardapio.status,
      resultado: 'PASSOU',
      resumoResposta: {
        unidade: resCardapio.body.unidade.nome,
        totalItensDisponiveis: resCardapio.body.cardapio.length
      }
    });

    // T07 - Criacao de pedido valido no canal TOTEM com reserva automatica de estoque (201)
    const resPedidoValido = await request(
      'POST',
      '/pedidos',
      {
        unidadeId: 1,
        canalPedido: 'TOTEM',
        itens: [
          { produtoId: 1, quantidade: 2 },
          { produtoId: 4, quantidade: 2 }
        ],
        formaPagamento: 'PIX',
        cupomPromocional: 'SAOJOAO10'
      },
      tokenCliente
    );
    assert.strictEqual(resPedidoValido.status, 201, 'T07 deve retornar 201');
    assert.strictEqual(resPedidoValido.body.canalPedido, 'TOTEM');
    assert.strictEqual(resPedidoValido.body.status, 'AGUARDANDO_PAGAMENTO');
    const pedidoCriadoId = resPedidoValido.body.pedidoId;
    results.push({
      id: 'T07',
      tipo: 'POSITIVO',
      cenario: 'Criacao de pedido valido com canalPedido=TOTEM, calculo de desconto e reserva de estoque (201)',
      endpoint: 'POST /pedidos',
      statusEsperado: 201,
      statusObtido: resPedidoValido.status,
      resultado: 'PASSOU',
      resumoResposta: {
        pedidoId: resPedidoValido.body.pedidoId,
        codigoPedido: resPedidoValido.body.codigoPedido,
        canalPedido: resPedidoValido.body.canalPedido,
        status: resPedidoValido.body.status,
        subtotal: resPedidoValido.body.subtotal,
        desconto: resPedidoValido.body.desconto,
        total: resPedidoValido.body.total
      }
    });

    // T08 - Criacao de pedido com produto inexistente na unidade (404)
    const resProdutoInexistente = await request(
      'POST',
      '/pedidos',
      {
        unidadeId: 1,
        canalPedido: 'WEB',
        itens: [{ produtoId: 9999, quantidade: 1 }],
        formaPagamento: 'PIX'
      },
      tokenCliente
    );
    assert.strictEqual(resProdutoInexistente.status, 404, 'T08 deve retornar 404');
    assert.strictEqual(resProdutoInexistente.body.error, 'PRODUTO_NAO_ENCONTRADO_NA_UNIDADE');
    results.push({
      id: 'T08',
      tipo: 'NEGATIVO',
      cenario: 'Criacao de pedido com produto inexistente no catalogo da unidade (404)',
      endpoint: 'POST /pedidos',
      statusEsperado: 404,
      statusObtido: resProdutoInexistente.status,
      resultado: 'PASSOU',
      resumoResposta: resProdutoInexistente.body
    });

    // T09 - Criacao de pedido com estoque insuficiente na unidade (409)
    const resSemEstoque = await request(
      'POST',
      '/pedidos',
      {
        unidadeId: 1,
        canalPedido: 'APP',
        itens: [{ produtoId: 5, quantidade: 50 }],
        formaPagamento: 'PIX'
      },
      tokenCliente
    );
    assert.strictEqual(resSemEstoque.status, 409, 'T09 deve retornar 409');
    assert.strictEqual(resSemEstoque.body.error, 'ESTOQUE_INSUFICIENTE');
    results.push({
      id: 'T09',
      tipo: 'NEGATIVO',
      cenario: 'Bloqueio de venda por estoque insuficiente na unidade (409 Conflict)',
      endpoint: 'POST /pedidos',
      statusEsperado: 409,
      statusObtido: resSemEstoque.status,
      resultado: 'PASSOU',
      resumoResposta: resSemEstoque.body
    });

    // T10 - Pagamento Mock Recusado -> status PAGAMENTO_RECUSADO (200)
    const resPagRecusado = await request(
      'POST',
      '/pagamentos/mock',
      {
        pedidoId: pedidoCriadoId,
        metodo: 'CARTAO_CREDITO',
        simulacao: 'RECUSADO',
        cartaoFinal: '0000'
      },
      tokenCliente
    );
    assert.strictEqual(resPagRecusado.status, 200, 'T10 deve retornar 200 com statusPagamento=RECUSADO');
    assert.strictEqual(resPagRecusado.body.statusPagamento, 'RECUSADO');
    assert.strictEqual(resPagRecusado.body.statusPedidoAtualizado, 'PAGAMENTO_RECUSADO');
    results.push({
      id: 'T10',
      tipo: 'POSITIVO',
      cenario: 'Simulacao de Pagamento Mock RECUSADO atualizando pedido para PAGAMENTO_RECUSADO',
      endpoint: 'POST /pagamentos/mock',
      statusEsperado: 200,
      statusObtido: resPagRecusado.status,
      resultado: 'PASSOU',
      resumoResposta: {
        transacaoExternaId: resPagRecusado.body.transacaoExternaId,
        statusPagamento: resPagRecusado.body.statusPagamento,
        statusPedidoAtualizado: resPagRecusado.body.statusPedidoAtualizado,
        mensagem: resPagRecusado.body.mensagem
      }
    });

    // T11 - Pagamento Mock Aprovado -> EM_PREPARO + Acumulo Fidelidade + Evolucao para PRONTO e ENTREGUE (200)
    const resPagAprovado = await request(
      'POST',
      '/pagamentos/mock',
      {
        pedidoId: pedidoCriadoId,
        metodo: 'PIX',
        simulacao: 'APROVADO'
      },
      tokenCliente
    );
    assert.strictEqual(resPagAprovado.status, 200, 'T11 deve retornar 200');
    assert.strictEqual(resPagAprovado.body.statusPagamento, 'APROVADO');
    assert.strictEqual(resPagAprovado.body.statusPedidoAtualizado, 'EM_PREPARO');
    assert.ok(resPagAprovado.body.pontosFidelidadeCreditados > 0);

    const resStatusPronto = await request(
      'PATCH',
      `/pedidos/${pedidoCriadoId}/status`,
      { status: 'PRONTO', motivo: 'Pedido finalizado na cozinha' },
      tokenGerente
    );
    assert.strictEqual(resStatusPronto.status, 200);
    assert.strictEqual(resStatusPronto.body.status, 'PRONTO');

    const resStatusEntregue = await request(
      'PATCH',
      `/pedidos/${pedidoCriadoId}/status`,
      { status: 'ENTREGUE', motivo: 'Retirado pelo cliente no balcao de pick-up' },
      tokenGerente
    );
    assert.strictEqual(resStatusEntregue.status, 200);
    assert.strictEqual(resStatusEntregue.body.status, 'ENTREGUE');

    results.push({
      id: 'T11',
      tipo: 'POSITIVO',
      cenario: 'Fluxo A Completo: Pagamento Mock APROVADO -> EM_PREPARO -> PRONTO -> ENTREGUE + Credito de Fidelidade',
      endpoint: 'POST /pagamentos/mock + PATCH /pedidos/{id}/status',
      statusEsperado: 200,
      statusObtido: 200,
      resultado: 'PASSOU',
      resumoResposta: {
        transacaoExternaId: resPagAprovado.body.transacaoExternaId,
        statusFinalPedido: resStatusEntregue.body.status,
        pontosFidelidadeCreditados: resPagAprovado.body.pontosFidelidadeCreditados
      }
    });

    // T12 - Filtro por multicanalidade (?canalPedido=TOTEM) e Verificacao de Logs de Auditoria
    const resFiltroCanal = await request('GET', '/pedidos?canalPedido=TOTEM&page=1&limit=10', null, tokenGerente);
    assert.strictEqual(resFiltroCanal.status, 200);
    assert.strictEqual(resFiltroCanal.body.data.length, 1);
    assert.strictEqual(resFiltroCanal.body.data[0].canalPedido, 'TOTEM');

    const resAuditoria = await request('GET', '/auditoria?page=1&limit=15', null, tokenGerente);
    assert.strictEqual(resAuditoria.status, 200);
    assert.ok(resAuditoria.body.total >= 6, 'Deve conter registros de auditoria das acoes sensiveis');

    results.push({
      id: 'T12',
      tipo: 'POSITIVO',
      cenario: 'Filtro de pedidos por multicanalidade (?canalPedido=TOTEM) e rastreabilidade em /auditoria',
      endpoint: 'GET /pedidos?canalPedido=TOTEM & GET /auditoria',
      statusEsperado: 200,
      statusObtido: 200,
      resultado: 'PASSOU',
      resumoResposta: {
        pedidosFiltradosNoCanalTotem: resFiltroCanal.body.total,
        totalLogsAuditoriaRegistrados: resAuditoria.body.total,
        ultimasAcoesAuditadas: resAuditoria.body.data.slice(0, 4).map(l => l.acao)
      }
    });

    console.log(`\n[SUCESSO] Todos os ${results.length} cenarios de teste (T01 a T12) passaram com exito!`);
    fs.writeFileSync(
      path.join(__dirname, 'evidencia_execucao_testes.json'),
      JSON.stringify({ executadosEm: new Date().toISOString(), totalCenarios: results.length, cenarios: results }, null, 2)
    );
  } finally {
    server.close();
  }
}

runAllTests().catch(err => {
  console.error('[FALHA NOS TESTES]:', err);
  process.exit(1);
});
