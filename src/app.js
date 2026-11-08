const http = require('http');
const url = require('url');
const crypto = require('crypto');
const JwtProvider = require('./infrastructure/security/JwtProvider');
const AppError = require('./domain/errors/AppError');
const AuthService = require('./application/services/AuthService');
const CatalogoEstoqueService = require('./application/services/CatalogoEstoqueService');
const PedidoService = require('./application/services/PedidoService');
const PagamentoMockService = require('./application/services/PagamentoMockService');
const AuditoriaService = require('./application/services/AuditoriaService');
const openapiSpec = require('./api/swagger/openapiSpec');

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new AppError(400, 'JSON_MALFORMADO', 'O corpo da requisicao nao e um JSON valido.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(payload);
}

function sendError(res, req, err, requestId) {
  const parsedUrl = url.parse(req.url, true);
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const errorCode = err instanceof AppError ? err.errorCode : 'ERRO_INTERNO_SERVIDOR';
  const message = err.message || 'Erro inesperado no servidor.';
  const details = err instanceof AppError ? err.details : [];

  sendJson(res, statusCode, {
    error: errorCode,
    message,
    details,
    timestamp: new Date().toISOString(),
    path: parsedUrl.pathname,
    requestId
  });
}

function authenticate(req, allowedRoles = null) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError(401, 'NAO_AUTENTICADO', 'Token de autenticacao JWT ausente ou malformado.');
  }
  const token = authHeader.slice(7).trim();
  let decoded;
  try {
    decoded = JwtProvider.verify(token);
  } catch (err) {
    throw new AppError(401, 'TOKEN_INVALIDO', `Falha na validacao do token JWT: ${err.message}`);
  }
  if (allowedRoles && !allowedRoles.includes(decoded.perfil)) {
    throw new AppError(
      403,
      'PERMISSAO_INSUFICIENTE',
      `O perfil '${decoded.perfil}' nao possui permissao para acessar este recurso. Perfis exigidos: ${allowedRoles.join(', ')}.`
    );
  }
  return decoded;
}

function renderSwaggerHtml() {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Swagger UI — API Rede Raízes do Nordeste</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; background: #f8fafc; color: #1e293b; }
    header { background: #1e3a5f; color: #fff; padding: 20px 32px; display: flex; justify-content: space-between; align-items: center; border-bottom: 4px solid #d97706; }
    header h1 { margin: 0; font-size: 20px; }
    header span { background: #d97706; color: #fff; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: bold; }
    .container { max-width: 1080px; margin: 24px auto; padding: 0 24px; }
    .info-box { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px 20px; margin-bottom: 20px; }
    .endpoint { background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; margin-bottom: 12px; overflow: hidden; }
    .ep-header { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #f1f5f9; }
    .method { font-weight: 800; font-size: 12px; padding: 4px 10px; border-radius: 4px; color: #fff; min-width: 60px; text-align: center; }
    .POST { background: #16a34a; }
    .GET { background: #2563eb; }
    .PATCH { background: #d97706; }
    .path { font-family: monospace; font-size: 14px; font-weight: 700; color: #0f172a; }
    .summary { font-size: 13px; color: #475569; margin-left: auto; }
    .tag { font-size: 11px; font-weight: 700; color: #1e3a5f; background: #e0f2fe; padding: 2px 8px; border-radius: 4px; }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>API Rede "Raízes do Nordeste" — OpenAPI 3.0.3 (Swagger)</h1>
      <div style="font-size: 13px; color: #cbd5e1; margin-top: 4px;">Projeto Multidisciplinar UNINTER 2026 • Trilha Back-End • Matheus Vargas de Freitas (RU 5057317)</div>
    </div>
    <span>OAS 3.0.3 • /openapi.json</span>
  </header>
  <div class="container">
    <div class="info-box">
      <strong>Contrato Oficial da API RESTful:</strong> Todos os endpoints seguem padronização REST, autenticação Bearer JWT, controle de acesso por Roles (<code>CLIENTE</code>, <code>ATENDENTE</code>, <code>COZINHA</code>, <code>GERENTE</code>, <code>ADMIN</code>), suporte obrigatório a multicanalidade (<code>canalPedido</code>) e padrão único de erro JSON.
    </div>
    ${Object.entries(openapiSpec.paths).map(([p, methods]) =>
      Object.entries(methods).map(([m, details]) => `
        <div class="endpoint">
          <div class="ep-header">
            <span class="method ${m.toUpperCase()}">${m.toUpperCase()}</span>
            <span class="path">${p}</span>
            <span class="tag">${(details.tags && details.tags[0]) || 'API'}</span>
            <span class="summary">${details.summary || ''}</span>
          </div>
        </div>
      `).join('')
    ).join('')}
  </div>
</body>
</html>`;
}

const server = http.createServer(async (req, res) => {
  const requestId = `req-${crypto.randomBytes(4).toString('hex')}`;
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const method = req.method.toUpperCase();
  const ip = req.socket.remoteAddress || '127.0.0.1';

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  try {
    // Health & Root
    if (method === 'GET' && (pathname === '/' || pathname === '/health')) {
      return sendJson(res, 200, {
        status: 'UP',
        service: 'raizes-do-nordeste-api',
        version: '1.0.0',
        docs: '/api-docs',
        openapi: '/openapi.json',
        timestamp: new Date().toISOString()
      });
    }

    // OpenAPI JSON & Swagger UI
    if (method === 'GET' && pathname === '/openapi.json') {
      return sendJson(res, 200, openapiSpec);
    }
    if (method === 'GET' && pathname === '/api-docs') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(renderSwaggerHtml());
    }

    // 1. /auth/login
    if (method === 'POST' && pathname === '/auth/login') {
      const body = await parseBody(req);
      const result = AuthService.login({ ...body, ip });
      return sendJson(res, 200, result);
    }

    // 2. /usuarios (Cadastro)
    if (method === 'POST' && pathname === '/usuarios') {
      const body = await parseBody(req);
      const result = AuthService.cadastrarUsuario({ ...body, ip });
      return sendJson(res, 201, result);
    }

    // 2b. /usuarios/:id/anonimizar (LGPD)
    const matchAnon = pathname.match(/^\/usuarios\/(\d+)\/anonimizar$/);
    if (method === 'POST' && matchAnon) {
      const user = authenticate(req);
      const result = AuthService.anonimizarTitular({
        targetUserId: Number(matchAnon[1]),
        solicitante: user,
        ip
      });
      return sendJson(res, 200, result);
    }

    // 3. /unidades
    if (method === 'GET' && pathname === '/unidades') {
      const unidades = CatalogoEstoqueService.listarUnidades();
      return sendJson(res, 200, { data: unidades });
    }

    // 3b. /unidades/:id/cardapio
    const matchCardapio = pathname.match(/^\/unidades\/(\d+)\/cardapio$/);
    if (method === 'GET' && matchCardapio) {
      const result = CatalogoEstoqueService.consultarCardapioUnidade(Number(matchCardapio[1]), {
        apenasDisponiveis: parsedUrl.query.apenasDisponiveis === 'true'
      });
      return sendJson(res, 200, result);
    }

    // 4. /produtos
    if (method === 'GET' && pathname === '/produtos') {
      const result = CatalogoEstoqueService.listarProdutos(parsedUrl.query);
      return sendJson(res, 200, result);
    }

    // 5. /estoque/movimentacoes
    if (method === 'POST' && pathname === '/estoque/movimentacoes') {
      const user = authenticate(req, ['GERENTE', 'ADMIN']);
      const body = await parseBody(req);
      const result = CatalogoEstoqueService.movimentarEstoque({ ...body, usuario: user, ip });
      return sendJson(res, 200, result);
    }

    // 6. /pedidos (POST criar, GET listar com filtro ?canalPedido=)
    if (method === 'POST' && pathname === '/pedidos') {
      const user = authenticate(req, ['CLIENTE', 'ATENDENTE', 'GERENTE', 'ADMIN']);
      const body = await parseBody(req);
      const result = PedidoService.criarPedido(body, user, ip);
      return sendJson(res, 201, result);
    }

    if (method === 'GET' && pathname === '/pedidos') {
      const user = authenticate(req);
      const result = PedidoService.listarPedidos(parsedUrl.query, user);
      return sendJson(res, 200, result);
    }

    const matchPedidoId = pathname.match(/^\/pedidos\/(\d+)$/);
    if (method === 'GET' && matchPedidoId) {
      const user = authenticate(req);
      const result = PedidoService.obterPedidoPorId(Number(matchPedidoId[1]), user);
      return sendJson(res, 200, result);
    }

    const matchPedidoStatus = pathname.match(/^\/pedidos\/(\d+)\/status$/);
    if (method === 'PATCH' && matchPedidoStatus) {
      const user = authenticate(req, ['COZINHA', 'ATENDENTE', 'GERENTE', 'ADMIN']);
      const body = await parseBody(req);
      const result = PedidoService.atualizarStatusPedido(
        Number(matchPedidoStatus[1]),
        { novoStatus: body.status, motivo: body.motivo },
        user,
        ip
      );
      return sendJson(res, 200, result);
    }

    // 7. /pagamentos/mock
    if (method === 'POST' && pathname === '/pagamentos/mock') {
      const user = authenticate(req, ['CLIENTE', 'ATENDENTE', 'GERENTE', 'ADMIN']);
      const body = await parseBody(req);
      const result = PagamentoMockService.processarPagamentoMock(body, user, ip);
      return sendJson(res, 200, result);
    }

    // 8. /fidelidade/:clienteId
    const matchFidelidade = pathname.match(/^\/fidelidade\/(\d+)$/);
    if (method === 'GET' && matchFidelidade) {
      const user = authenticate(req);
      const result = PagamentoMockService.consultarSaldoFidelidade(Number(matchFidelidade[1]), user);
      return sendJson(res, 200, result);
    }

    // 9. /auditoria
    if (method === 'GET' && pathname === '/auditoria') {
      authenticate(req, ['GERENTE', 'ADMIN']);
      const result = AuditoriaService.listar(parsedUrl.query);
      return sendJson(res, 200, result);
    }

    throw new AppError(404, 'ROTA_NAO_ENCONTRADA', `O endpoint '${method} ${pathname}' nao existe nesta API.`);
  } catch (err) {
    return sendError(res, req, err, requestId);
  }
});

module.exports = server;
