const dinheiro = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const dataBrasil = new Intl.DateTimeFormat("pt-BR");

const qs = (selector) => document.querySelector(selector);

const menuToggle = qs(".menu-toggle");
const menu = qs("[data-menu]");

if (menuToggle && menu) {
  menuToggle.addEventListener("click", () => {
    const aberto = menu.classList.toggle("is-open");
    menuToggle.setAttribute("aria-expanded", String(aberto));
  });
}

const camposOrcamento = {
  clienteNome: qs("#clienteNome"),
  clienteWhatsapp: qs("#clienteWhatsapp"),
  clienteEndereco: qs("#clienteEndereco"),
  descricaoServico: qs("#descricaoServico"),
  prazoExecucao: qs("#prazoExecucao"),
  observacoes: qs("#observacoes"),
  nomeMaterial: qs("#nomeMaterial"),
  valorMaterial: qs("#valorMaterial"),
  valorEntrada: qs("#valorEntrada"),
  quantidadeParcelas: qs("#quantidadeParcelas")
};

function numeroCampo(campo) {
  return Number(campo?.value || 0);
}

function textoCampo(campo, fallback = "-") {
  const valor = campo?.value?.trim();
  return valor || fallback;
}

function calcularOrcamento() {
  const valorMaterial = numeroCampo(camposOrcamento.valorMaterial);
  const entradaInformada = numeroCampo(camposOrcamento.valorEntrada);
  const quantidadeParcelas = Math.max(1, Math.floor(numeroCampo(camposOrcamento.quantidadeParcelas) || 1));

  // Regra interna obrigatória do orçamento.
  const acrescimo = valorMaterial * 0.22;
  const materialComAcrescimo = valorMaterial + acrescimo;
  const maoDeObra = materialComAcrescimo * 2;
  const valorFinalCliente = maoDeObra;

  const entrada = Math.min(Math.max(entradaInformada, 0), valorFinalCliente);
  const saldoRestante = Math.max(valorFinalCliente - entrada, 0);
  const valorParcela = saldoRestante / quantidadeParcelas;

  const emissao = new Date();
  const validade = new Date(emissao);
  validade.setDate(validade.getDate() + 30);

  return {
    valorMaterial,
    acrescimo,
    materialComAcrescimo,
    maoDeObra,
    valorFinalCliente,
    entrada,
    saldoRestante,
    quantidadeParcelas,
    valorParcela,
    emissao,
    validade
  };
}

function atualizarTexto(id, valor) {
  const el = qs(id);
  if (el) el.textContent = valor;
}

function atualizarPreview() {
  if (!camposOrcamento.valorMaterial) return null;

  const resultado = calcularOrcamento();
  const prazo = textoCampo(camposOrcamento.prazoExecucao);
  const observacoes = textoCampo(camposOrcamento.observacoes);

  atualizarTexto("#acrescimoTexto", dinheiro.format(resultado.acrescimo));
  atualizarTexto("#materialComAcrescimoTexto", dinheiro.format(resultado.materialComAcrescimo));
  atualizarTexto("#maoDeObraTexto", dinheiro.format(resultado.maoDeObra));
  atualizarTexto("#valorFinalTexto", dinheiro.format(resultado.valorFinalCliente));
  atualizarTexto("#saldoRestanteTexto", dinheiro.format(resultado.saldoRestante));
  atualizarTexto("#valorParcelaTexto", dinheiro.format(resultado.valorParcela));
  atualizarTexto("#validadeTexto", dataBrasil.format(resultado.validade));

  atualizarTexto("#previewCliente", textoCampo(camposOrcamento.clienteNome));
  atualizarTexto("#previewWhatsapp", textoCampo(camposOrcamento.clienteWhatsapp));
  atualizarTexto("#previewEndereco", textoCampo(camposOrcamento.clienteEndereco));
  atualizarTexto("#previewDescricao", textoCampo(camposOrcamento.descricaoServico));
  atualizarTexto("#previewPrazo", prazo === "-" ? "-" : `${prazo} dias úteis`);
  atualizarTexto("#previewValorFinal", dinheiro.format(resultado.valorFinalCliente));
  atualizarTexto("#previewEntrada", dinheiro.format(resultado.entrada));
  atualizarTexto("#previewSaldo", dinheiro.format(resultado.saldoRestante));
  atualizarTexto("#previewParcelamento", `${resultado.quantidadeParcelas}x de ${dinheiro.format(resultado.valorParcela)}`);
  atualizarTexto("#previewObservacoes", observacoes);
  atualizarTexto("#previewDatas", `Emissão: ${dataBrasil.format(resultado.emissao)} | Validade: ${dataBrasil.format(resultado.validade)}`);

  return resultado;
}

function gerarTextoWhatsapp() {
  const resultado = atualizarPreview();
  if (!resultado) return "";

  const prazo = textoCampo(camposOrcamento.prazoExecucao);
  const texto = `*IMPACTO VISUAL COMUNICAÇÃO VISUAL*

*ORÇAMENTO*

Cliente: ${textoCampo(camposOrcamento.clienteNome)}

Serviço:
${textoCampo(camposOrcamento.descricaoServico)}

Prazo de execução:
${prazo === "-" ? "-" : `${prazo} dias úteis`}

Valor total:
${dinheiro.format(resultado.valorFinalCliente)}

Entrada:
${dinheiro.format(resultado.entrada)}

Saldo restante:
${dinheiro.format(resultado.saldoRestante)}

Parcelamento:
${resultado.quantidadeParcelas}x de ${dinheiro.format(resultado.valorParcela)}

Observações:
${textoCampo(camposOrcamento.observacoes)}

Este orçamento é válido por 30 dias a partir da data de emissão.

Impacto Visual Comunicação Visual`;

  const areaTexto = qs("#whatsappTexto");
  if (areaTexto) areaTexto.value = texto;
  return texto;
}

function limparFormulario() {
  const form = qs("#budgetForm");
  if (form) form.reset();

  const areaTexto = qs("#whatsappTexto");
  if (areaTexto) areaTexto.value = "";

  const feedback = qs("#copyFeedback");
  if (feedback) feedback.textContent = "";

  atualizarPreview();
}

const calcularBtn = qs("#calcularBtn");
const gerarWhatsappBtn = qs("#gerarWhatsappBtn");
const copiarWhatsappBtn = qs("#copiarWhatsappBtn");
const imprimirBtn = qs("#imprimirBtn");
const limparBtn = qs("#limparBtn");

if (calcularBtn) {
  calcularBtn.addEventListener("click", atualizarPreview);
}

if (gerarWhatsappBtn) {
  gerarWhatsappBtn.addEventListener("click", gerarTextoWhatsapp);
}

if (copiarWhatsappBtn) {
  copiarWhatsappBtn.addEventListener("click", async () => {
    const texto = gerarTextoWhatsapp();
    const feedback = qs("#copyFeedback");

    try {
      await navigator.clipboard.writeText(texto);
      if (feedback) feedback.textContent = "Texto copiado com sucesso.";
    } catch {
      const areaTexto = qs("#whatsappTexto");
      areaTexto?.select();
      document.execCommand("copy");
      if (feedback) feedback.textContent = "Texto selecionado e copiado.";
    }
  });
}

if (imprimirBtn) {
  imprimirBtn.addEventListener("click", () => {
    atualizarPreview();
    window.print();
  });
}

if (limparBtn) {
  limparBtn.addEventListener("click", limparFormulario);
}

Object.values(camposOrcamento).forEach((campo) => {
  campo?.addEventListener("input", atualizarPreview);
});

atualizarPreview();
