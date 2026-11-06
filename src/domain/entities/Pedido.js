const CanalPedido = require('../enums/CanalPedido');
const StatusPedido = require('../enums/StatusPedido');
const AppError = require('../errors/AppError');

class Pedido {
  constructor({
    unidadeId,
    clienteId,
    canalPedido,
    itens,
    formaPagamento,
    cupomPromocional = null,
    pontosResgatados = 0,
    observacoes = null
  }) {
    this.unidadeId = unidadeId;
    this.clienteId = clienteId;
    this.canalPedido = canalPedido;
    this.itens = itens;
    this.formaPagamento = formaPagamento;
    this.cupomPromocional = cupomPromocional;
    this.pontosResgatados = pontosResgatados || 0;
    this.observacoes = observacoes;
    this.status = StatusPedido.AGUARDANDO_PAGAMENTO;
  }

  validarContrato() {
    const details = [];

    if (!this.canalPedido) {
      details.push({
        field: 'canalPedido',
        issue: 'O campo canalPedido e obrigatorio (valores aceitos: APP, TOTEM, BALCAO, PICKUP, WEB).'
      });
    } else if (!CanalPedido.isValid(this.canalPedido)) {
      details.push({
        field: 'canalPedido',
        issue: `Valor invalido '${this.canalPedido}'. Valores permitidos: ${CanalPedido.values().join(', ')}.`
      });
    }

    if (!this.unidadeId || typeof this.unidadeId !== 'number' || this.unidadeId <= 0) {
      details.push({
        field: 'unidadeId',
        issue: 'O campo unidadeId e obrigatorio e deve ser um inteiro positivo.'
      });
    }

    if (!Array.isArray(this.itens) || this.itens.length === 0) {
      details.push({
        field: 'itens',
        issue: 'O pedido deve conter ao menos 1 item.'
      });
    } else {
      this.itens.forEach((item, idx) => {
        if (!item.produtoId || typeof item.produtoId !== 'number') {
          details.push({
            field: `itens[${idx}].produtoId`,
            issue: 'produtoId obrigatorio e numerico.'
          });
        }
        if (typeof item.quantidade !== 'number' || item.quantidade <= 0 || !Number.isInteger(item.quantidade)) {
          details.push({
            field: `itens[${idx}].quantidade`,
            issue: 'A quantidade deve ser um numero inteiro maior que zero.'
          });
        }
      });
    }

    if (!this.formaPagamento || !['PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO', 'MOCK'].includes(this.formaPagamento)) {
      details.push({
        field: 'formaPagamento',
        issue: 'Forma de pagamento invalida. Utilize PIX, CARTAO_CREDITO, CARTAO_DEBITO ou MOCK.'
      });
    }

    if (details.length > 0) {
      throw new AppError(422, 'ERRO_VALIDACAO_CONTRATO', 'Os dados informados no pedido sao invalidos.', details);
    }
  }
}

module.exports = Pedido;
