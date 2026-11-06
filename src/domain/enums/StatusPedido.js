const StatusPedido = Object.freeze({
  AGUARDANDO_PAGAMENTO: 'AGUARDANDO_PAGAMENTO',
  PAGAMENTO_RECUSADO: 'PAGAMENTO_RECUSADO',
  EM_PREPARO: 'EM_PREPARO',
  PRONTO: 'PRONTO',
  ENTREGUE: 'ENTREGUE',
  CANCELADO: 'CANCELADO',

  values() {
    return [
      'AGUARDANDO_PAGAMENTO',
      'PAGAMENTO_RECUSADO',
      'EM_PREPARO',
      'PRONTO',
      'ENTREGUE',
      'CANCELADO'
    ];
  },

  canTransition(atual, novo) {
    const transicoesValidas = {
      AGUARDANDO_PAGAMENTO: ['EM_PREPARO', 'PAGAMENTO_RECUSADO', 'CANCELADO'],
      PAGAMENTO_RECUSADO: ['EM_PREPARO', 'CANCELADO'],
      EM_PREPARO: ['PRONTO', 'CANCELADO'],
      PRONTO: ['ENTREGUE', 'CANCELADO'],
      ENTREGUE: [],
      CANCELADO: []
    };
    return (transicoesValidas[atual] || []).includes(novo);
  }
});

module.exports = StatusPedido;
