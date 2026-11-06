const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET || 'raizes_do_nordeste_uninter_2026_secret_key_5057317';
const EXPIRES_IN = Number(process.env.JWT_EXPIRES_IN || 3600);

function base64UrlEncode(strOrBuf) {
  return Buffer.from(strOrBuf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  return Buffer.from(base64, 'base64').toString('utf-8');
}

class JwtProvider {
  static sign(payload) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const body = { ...payload, iat: now, exp: now + EXPIRES_IN };
    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(body));
    const data = `${encodedHeader}.${encodedPayload}`;
    const signature = crypto
      .createHmac('sha256', SECRET)
      .update(data)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    return {
      accessToken: `${data}.${signature}`,
      tokenType: 'Bearer',
      expiresIn: EXPIRES_IN
    };
  }

  static verify(token) {
    if (!token || typeof token !== 'string') {
      throw new Error('Token ausente');
    }
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Formato de token invalido');
    }
    const [encodedHeader, encodedPayload, signature] = parts;
    const data = `${encodedHeader}.${encodedPayload}`;
    const expectedSig = crypto
      .createHmac('sha256', SECRET)
      .update(data)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
    if (signature !== expectedSig) {
      throw new Error('Assinatura do token invalida');
    }
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new Error('Token expirado');
    }
    return payload;
  }
}

module.exports = JwtProvider;
