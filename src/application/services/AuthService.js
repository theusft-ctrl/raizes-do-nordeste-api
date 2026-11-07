const db = require('../../infrastructure/database/SqliteConnection');
const PasswordHasher = require('../../infrastructure/security/PasswordHasher');
const JwtProvider = require('../../infrastructure/security/JwtProvider');
const PerfilUsuario = require('../../domain/enums/PerfilUsuario');
const AppError = require('../../domain/errors/AppError');
const AuditoriaService = require('./AuditoriaService');

class AuthService {
  static login({ email, senha, ip }) {
    const details = [];
    if (!email || !String(email).includes('@')) {
      details.push({ field: 'email', issue: 'Informe um e-mail valido.' });
    }
    if (!senha) {
      details.push({ field: 'senha', issue: 'A senha e obrigatoria.' });
    }
    if (details.length > 0) {
      throw new AppError(422, 'DADOS_INVALIDOS', 'Falha na validacao dos campos de login.', details);
    }

    const user = db.get(
      `SELECT id, nome, email, senha_hash, perfil, consentimento_lgpd, anonimizado
       FROM usuarios WHERE email = ?`,
      [email.trim().toLowerCase()]
    );

    if (!user || user.anonimizado || !PasswordHasher.verify(senha, user.senha_hash)) {
      AuditoriaService.registrar({
        acao: 'LOGIN_FALHA',
        recurso: '/auth/login',
        detalhes: { emailTentativa: email },
        ipOrigem: ip
      });
      throw new AppError(401, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha invalidos.');
    }

    const tokenData = JwtProvider.sign({
      sub: user.id,
      nome: user.nome,
      email: user.email,
      perfil: user.perfil
    });

    AuditoriaService.registrar({
      usuarioId: user.id,
      perfilUsuario: user.perfil,
      acao: 'LOGIN_SUCESSO',
      recurso: '/auth/login',
      recursoId: user.id,
      detalhes: { email: user.email },
      ipOrigem: ip
    });

    return {
      ...tokenData,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        perfil: user.perfil,
        consentimentoLgpd: Boolean(user.consentimento_lgpd)
      }
    };
  }

  static cadastrarUsuario({ nome, email, senha, cpf, telefone, perfil = 'CLIENTE', consentimentoLgpd = false, ip }) {
    const details = [];
    if (!nome || String(nome).trim().length < 3) {
      details.push({ field: 'nome', issue: 'Nome deve ter no minimo 3 caracteres.' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      details.push({ field: 'email', issue: 'Formato de e-mail invalido.' });
    }
    if (!senha || String(senha).length < 6) {
      details.push({ field: 'senha', issue: 'A senha deve possuir no minimo 6 caracteres.' });
    }
    if (!PerfilUsuario.isValid(perfil)) {
      details.push({ field: 'perfil', issue: `Perfil invalido. Valores aceitos: ${PerfilUsuario.values().join(', ')}` });
    }
    if (details.length > 0) {
      throw new AppError(422, 'ERRO_VALIDACAO_CADASTRO', 'Dados de cadastro invalidos.', details);
    }

    const emailFormatado = email.trim().toLowerCase();
    const existente = db.get('SELECT id FROM usuarios WHERE email = ?', [emailFormatado]);
    if (existente) {
      throw new AppError(409, 'EMAIL_JA_CADASTRADO', 'Ja existe um usuario cadastrado com este e-mail.');
    }

    const senhaHash = PasswordHasher.hash(senha);
    const cpfHash = PasswordHasher.hashCpf(cpf);
    const dataConsentimento = consentimentoLgpd ? new Date().toISOString() : null;

    const result = db.run(
      `INSERT INTO usuarios (nome, email, cpf_hash, telefone, senha_hash, perfil, consentimento_lgpd, data_consentimento)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [nome.trim(), emailFormatado, cpfHash, telefone || null, senhaHash, perfil, consentimentoLgpd ? 1 : 0, dataConsentimento]
    );

    if (perfil === 'CLIENTE' && consentimentoLgpd) {
      db.run(
        `INSERT INTO fidelidade_contas (cliente_id, saldo_pontos, categoria_cliente) VALUES (?, 0, 'BRONZE')`,
        [result.lastID]
      );
    }

    AuditoriaService.registrar({
      usuarioId: result.lastID,
      perfilUsuario: perfil,
      acao: 'USUARIO_CADASTRADO',
      recurso: '/usuarios',
      recursoId: result.lastID,
      detalhes: { consentimentoLgpd: Boolean(consentimentoLgpd), finalidade: 'Execucao de contrato e fidelizacao' },
      ipOrigem: ip
    });

    return {
      id: result.lastID,
      nome: nome.trim(),
      email: emailFormatado,
      perfil,
      consentimentoLgpd: Boolean(consentimentoLgpd),
      dataConsentimento
    };
  }

  static anonimizarTitular({ targetUserId, solicitante, ip }) {
    if (solicitante.perfil !== 'ADMIN' && Number(solicitante.sub) !== Number(targetUserId)) {
      throw new AppError(403, 'ACESSO_NEGADO', 'Apenas o proprio titular ou um ADMIN pode solicitar anonimizacao LGPD.');
    }
    const user = db.get('SELECT id, nome, email, anonimizado FROM usuarios WHERE id = ?', [targetUserId]);
    if (!user) {
      throw new AppError(404, 'USUARIO_NAO_ENCONTRADO', 'Usuario nao localizado para anonimizacao.');
    }
    const emailAnonimo = `anonimizado_${user.id}_${Date.now()}@privacidade.raizes.com.br`;
    db.run(
      `UPDATE usuarios
       SET nome = 'TITULAR ANONIMIZADO (LGPD)',
           email = ?,
           cpf_hash = NULL,
           telefone = NULL,
           consentimento_lgpd = 0,
           anonimizado = 1
       WHERE id = ?`,
      [emailAnonimo, targetUserId]
    );

    AuditoriaService.registrar({
      usuarioId: solicitante.sub,
      perfilUsuario: solicitante.perfil,
      acao: 'ANONIMIZACAO_LGPD',
      recurso: `/usuarios/${targetUserId}/anonimizar`,
      recursoId: targetUserId,
      detalhes: { baseLegal: 'Art. 18, IV e VI da LGPD - Anonimizacao/Eliminacao de dados pessoais' },
      ipOrigem: ip
    });

    return {
      id: Number(targetUserId),
      status: 'ANONIMIZADO',
      mensagem: 'Dados pessoais anonimizados com sucesso em conformidade com a LGPD (Lei 13.709/2018), preservando registros fiscais desidentificados.'
    };
  }
}

module.exports = AuthService;
