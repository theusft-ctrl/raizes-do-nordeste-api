const db = require('../../infrastructure/database/SqliteConnection');

class AuditoriaService {
  static registrar({ usuarioId = null, perfilUsuario = 'ANONIMO', acao, recurso, recursoId = null, detalhes = {}, ipOrigem = '127.0.0.1' }) {
    db.run(
      `INSERT INTO logs_auditoria (usuario_id, perfil_usuario, acao, recurso, recurso_id, detalhes, ip_origem)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        usuarioId,
        perfilUsuario,
        acao,
        recurso,
        recursoId ? String(recursoId) : null,
        JSON.stringify(detalhes),
        ipOrigem
      ]
    );
  }

  static listar({ acao, recurso, page = 1, limit = 20 }) {
    const clauses = [];
    const params = [];
    if (acao) {
      clauses.push('acao = ?');
      params.push(acao);
    }
    if (recurso) {
      clauses.push('recurso = ?');
      params.push(recurso);
    }
    const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);
    const totalRow = db.get(`SELECT COUNT(*) AS total FROM logs_auditoria ${whereSql}`, params);
    const rows = db.all(
      `SELECT id, usuario_id AS usuarioId, perfil_usuario AS perfilUsuario, acao, recurso,
              recurso_id AS recursoId, detalhes, ip_origem AS ipOrigem, created_at AS createdAt
       FROM logs_auditoria
       ${whereSql}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    ).map(r => ({
      ...r,
      detalhes: r.detalhes ? JSON.parse(r.detalhes) : {}
    }));

    return {
      page: Number(page),
      limit: Number(limit),
      total: totalRow ? totalRow.total : 0,
      data: rows
    };
  }
}

module.exports = AuditoriaService;
