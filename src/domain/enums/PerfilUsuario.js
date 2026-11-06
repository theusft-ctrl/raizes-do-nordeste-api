const PerfilUsuario = Object.freeze({
  CLIENTE: 'CLIENTE',
  ATENDENTE: 'ATENDENTE',
  COZINHA: 'COZINHA',
  GERENTE: 'GERENTE',
  ADMIN: 'ADMIN',

  values() {
    return ['CLIENTE', 'ATENDENTE', 'COZINHA', 'GERENTE', 'ADMIN'];
  },

  isValid(perfil) {
    return this.values().includes(perfil);
  }
});

module.exports = PerfilUsuario;
