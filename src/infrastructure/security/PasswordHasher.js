const crypto = require('crypto');

class PasswordHasher {
  static hash(senha) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(senha, salt, 64).toString('hex');
    return `${salt}:${derived}`;
  }

  static verify(senha, hashArmazenado) {
    if (!hashArmazenado || !hashArmazenado.includes(':')) return false;
    const [salt, key] = hashArmazenado.split(':');
    const derived = crypto.scryptSync(senha, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derived, 'hex'));
  }

  static hashCpf(cpf) {
    if (!cpf) return null;
    const limpo = String(cpf).replace(/\D/g, '');
    return crypto.createHash('sha256').update(`lgpd_salt_${limpo}`).digest('hex');
  }
}

module.exports = PasswordHasher;
