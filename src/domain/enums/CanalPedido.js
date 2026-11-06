const CanalPedido = Object.freeze({
  APP: 'APP',
  TOTEM: 'TOTEM',
  BALCAO: 'BALCAO',
  PICKUP: 'PICKUP',
  WEB: 'WEB',

  values() {
    return ['APP', 'TOTEM', 'BALCAO', 'PICKUP', 'WEB'];
  },

  isValid(valor) {
    return this.values().includes(valor);
  }
});

module.exports = CanalPedido;
