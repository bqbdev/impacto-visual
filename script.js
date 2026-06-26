import { getQuotes, saveQuote, updateQuoteStatus } from "./firebase-config.js";

const WHATSAPP_URL = "https://wa.me/5519994971866?text=Ol%C3%A1%20gostaria%20de%20um%20or%C3%A7amento";
const ADMIN_PASSWORD = "impacto2026";
const STATUS_LABELS = {
  em_andamento: "Em andamento",
  fechado: "Fechado",
  desistiu: "Desistiu"
};

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormat = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" });

document.addEventListener("DOMContentLoaded", () => {
  setupNavigation();
  setupReveal();

  const page = document.body.dataset.page;
  if (page === "orcamento") setupQuotePage();
  if (page === "admin") setupAdminPage();
});

function setupNavigation() {
  const toggle = document.querySelector("[data-menu-toggle]");
  const menu = document.querySelector("[data-menu]");
  if (!toggle || !menu) return;

  toggle.addEventListener("click", () => {
    menu.classList.toggle("is-open");
    toggle.classList.toggle("is-open");
  });
}

function setupReveal() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  items.forEach((item) => observer.observe(item));
}

function setupQuotePage() {
  const form = document.querySelector("#quoteForm");
  const materialsList = document.querySelector("#materialsList");
  const whatsappOutput = document.querySelector("#whatsappText");
  const printArea = document.querySelector("#printArea");
  let lastQuote = null;

  const addMaterial = (name = "", value = "") => {
    const row = document.createElement("div");
    row.className = "material-row";
    row.innerHTML = `
      <label>Material<input data-material-name value="${escapeHtml(name)}" placeholder="Ex.: ACM, lona, adesivo"></label>
      <label>Valor pago<input data-material-value type="number" min="0" step="0.01" value="${value}"></label>
      <button class="icon-button" type="button" aria-label="Remover material" data-remove-material>×</button>
    `;
    row.querySelector("[data-remove-material]").addEventListener("click", () => {
      row.remove();
      updateQuoteState();
    });
    row.querySelectorAll("input").forEach((input) => input.addEventListener("input", updateQuoteState));
    materialsList.appendChild(row);
  };

  const updateQuoteState = () => {
    lastQuote = buildQuote(form);
    renderSummary(lastQuote);
    whatsappOutput.value = buildWhatsappText(lastQuote);
    renderPrintDocument(printArea, lastQuote);
  };

  document.querySelector("[data-add-material]").addEventListener("click", () => addMaterial());
  document.querySelector("[data-calculate]").addEventListener("click", updateQuoteState);
  document.querySelector("[data-whatsapp]").addEventListener("click", () => {
    updateQuoteState();
    window.open(`https://wa.me/5519994971866?text=${encodeURIComponent(whatsappOutput.value)}`, "_blank", "noopener");
  });
  document.querySelector("[data-copy]").addEventListener("click", async () => {
    updateQuoteState();
    await navigator.clipboard.writeText(whatsappOutput.value);
    toast("Texto copiado.");
  });
  document.querySelector("[data-print]").addEventListener("click", () => {
    updateQuoteState();
    window.print();
  });
  document.querySelector("[data-pdf]").addEventListener("click", () => {
    updateQuoteState();
    toast("Na janela de impressão, escolha 'Salvar como PDF'.");
    window.print();
  });
  document.querySelector("[data-clear]").addEventListener("click", () => {
    form.reset();
    materialsList.innerHTML = "";
    addMaterial();
    updateQuoteState();
  });
  document.querySelector("[data-save]").addEventListener("click", async () => {
    updateQuoteState();
    if (!form.reportValidity()) return;
    try {
      const id = await saveQuote(lastQuote);
      toast(`Orçamento salvo: ${id}`);
    } catch (error) {
      console.error(error);
      toast("Não foi possível salvar. Confira o Firebase.");
    }
  });

  form.addEventListener("input", updateQuoteState);
  addMaterial();
  updateQuoteState();
}

function buildQuote(form) {
  const data = new FormData(form);
  const issuedAt = new Date();
  const validUntil = addDays(issuedAt, 30);
  const materials = getMaterials();
  const costs = calculateCosts(materials);
  const downPayment = number(data.get("downPayment"));
  const installments = Math.max(1, parseInt(data.get("installments"), 10) || 1);
  const remainingBalance = Math.max(0, costs.finalValue - downPayment);
  const installmentValue = remainingBalance / installments;

  return {
    client: {
      name: text(data.get("clientName")),
      phone: text(data.get("phone")),
      whatsapp: text(data.get("whatsapp")),
      address: text(data.get("address"))
    },
    service: {
      description: text(data.get("serviceDescription")),
      deadline: text(data.get("deadline")),
      notes: text(data.get("notes"))
    },
    materials,
    internalCosts: costs,
    payment: {
      downPayment,
      installments,
      remainingBalance,
      installmentValue
    },
    status: "em_andamento",
    dates: {
      issuedAt: issuedAt.toISOString(),
      validUntil: validUntil.toISOString()
    },
    whatsappText: "",
    observations: text(data.get("notes"))
  };
}

function getMaterials() {
  return [...document.querySelectorAll(".material-row")]
    .map((row) => {
      const paidValue = number(row.querySelector("[data-material-value]").value);
      return {
        name: text(row.querySelector("[data-material-name]").value),
        paidValue,
        increase22: paidValue * 0.22,
        valueWithIncrease: paidValue * 1.22
      };
    })
    .filter((item) => item.name || item.paidValue > 0);
}

function calculateCosts(materials) {
  const totalMaterialPaid = sum(materials, "paidValue");
  const totalIncrease = sum(materials, "increase22");
  const totalMaterialWithIncrease = totalMaterialPaid + totalIncrease;
  const labor = totalMaterialWithIncrease * 2;

  return {
    totalMaterialPaid,
    totalIncrease,
    totalMaterialWithIncrease,
    labor,
    finalValue: labor,
    grossProfit: labor - totalMaterialPaid
  };
}

function renderSummary(quote) {
  setText("[data-summary='paid']", money.format(quote.internalCosts.totalMaterialPaid));
  setText("[data-summary='increase']", money.format(quote.internalCosts.totalIncrease));
  setText("[data-summary='withIncrease']", money.format(quote.internalCosts.totalMaterialWithIncrease));
  setText("[data-summary='final']", money.format(quote.internalCosts.finalValue));
  setText("[data-summary='validUntil']", dateFormat.format(new Date(quote.dates.validUntil)));
  const balanceInput = document.querySelector("[name='remainingBalance']");
  const installmentInput = document.querySelector("[name='installmentValue']");
  if (balanceInput) balanceInput.value = money.format(quote.payment.remainingBalance);
  if (installmentInput) installmentInput.value = money.format(quote.payment.installmentValue);
}

function buildWhatsappText(quote) {
  const lines = [
    `Olá, ${quote.client.name || "cliente"}. Tudo bem?`,
    "",
    "Segue o orçamento solicitado pela Impacto Visual Comunicação Visual.",
    "",
    `Serviço: ${quote.service.description || "Serviço de comunicação visual"}`,
    `Valor total: ${money.format(quote.internalCosts.finalValue)}`,
    `Entrada: ${money.format(quote.payment.downPayment)}`,
    `Saldo restante: ${money.format(quote.payment.remainingBalance)}`,
    `Parcelamento: ${quote.payment.installments}x de ${money.format(quote.payment.installmentValue)}`,
    "",
    "Este orçamento é válido por 30 dias a partir da data de emissão.",
    `Validade: ${dateFormat.format(new Date(quote.dates.validUntil))}`
  ];

  if (quote.service.notes) {
    lines.push("", `Observações: ${quote.service.notes}`);
  }

  const textValue = lines.join("\n");
  quote.whatsappText = textValue;
  return textValue;
}

function renderPrintDocument(container, quote) {
  container.innerHTML = `
    <div class="print-page">
      <header>
        <img src="logo.png" alt="Impacto Visual">
        <div><strong>Orçamento</strong><span>${dateFormat.format(new Date(quote.dates.issuedAt))}</span></div>
      </header>
      <section><h2>Cliente</h2><p>${escapeHtml(quote.client.name || "-")}</p><p>${escapeHtml(quote.client.phone || quote.client.whatsapp || "-")}</p><p>${escapeHtml(quote.client.address || "-")}</p></section>
      <section><h2>Descrição</h2><p>${escapeHtml(quote.service.description || "-")}</p></section>
      <section class="print-value"><span>Valor total</span><strong>${money.format(quote.internalCosts.finalValue)}</strong></section>
      <section><h2>Pagamento</h2><p>Entrada: ${money.format(quote.payment.downPayment)}</p><p>Saldo: ${money.format(quote.payment.remainingBalance)}</p><p>Parcelas: ${quote.payment.installments}x de ${money.format(quote.payment.installmentValue)}</p></section>
      <section><h2>Observações</h2><p>${escapeHtml(quote.service.notes || "Sem observações adicionais.")}</p><p>Este orçamento é válido por 30 dias a partir da data de emissão.</p></section>
    </div>
  `;
}
