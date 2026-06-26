const ADMIN_PASSWORD = "impacto2026";

const STATUS_LABELS = {
  em_andamento: "Em andamento",
  fechado: "Fechado",
  desistiu: "Desistiu"
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

const dateFormat = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo"
});

let firebaseModule = null;

document.addEventListener("DOMContentLoaded", () => {
  setupNavigation();
  setupReveal();

  const page = document.body.dataset.page;
  const hasAdminLogin = document.querySelector("[data-login-form]");
  const hasQuoteForm = document.querySelector("#quoteForm");

  if (page === "orcamento" || hasQuoteForm) {
    setupQuotePage();
  }

  if (page === "admin" || hasAdminLogin) {
    setupAdminPage();
  }
});

async function loadFirebaseModule() {
  if (!firebaseModule) {
    firebaseModule = await import("./firebase-config.js");
  }

  return firebaseModule;
}

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
  }, {
    threshold: 0.15
  });

  items.forEach((item) => observer.observe(item));
}

function setupQuotePage() {
  const form = document.querySelector("#quoteForm");
  const materialsList = document.querySelector("#materialsList");
  const whatsappOutput = document.querySelector("#whatsappText");
  const printArea = document.querySelector("#printArea");

  if (!form || !materialsList || !whatsappOutput || !printArea) return;

  let lastQuote = null;

  const addMaterial = (name = "", value = "") => {
    const row = document.createElement("div");
    row.className = "material-row";

    row.innerHTML = `
      <label>
        Material
        <input data-material-name value="${escapeHtml(name)}" placeholder="Ex.: ACM, lona, adesivo">
      </label>

      <label>
        Valor pago
        <input data-material-value type="number" min="0" step="0.01" value="${value}">
      </label>

      <button class="icon-button" type="button" aria-label="Remover material" data-remove-material>×</button>
    `;

    row.querySelector("[data-remove-material]").addEventListener("click", () => {
      row.remove();
      updateQuoteState();
    });

    row.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", updateQuoteState);
    });

    materialsList.appendChild(row);
  };

  const updateQuoteState = () => {
    lastQuote = buildQuote(form);
    renderSummary(lastQuote);
    whatsappOutput.value = buildWhatsappText(lastQuote);
    renderPrintDocument(printArea, lastQuote);
  };

  document.querySelector("[data-add-material]")?.addEventListener("click", () => addMaterial());
  document.querySelector("[data-calculate]")?.addEventListener("click", updateQuoteState);

  document.querySelector("[data-whatsapp]")?.addEventListener("click", () => {
    updateQuoteState();

    window.open(
      `https://wa.me/5519994971866?text=${encodeURIComponent(whatsappOutput.value)}`,
      "_blank",
      "noopener"
    );
  });

  document.querySelector("[data-copy]")?.addEventListener("click", async () => {
    updateQuoteState();

    try {
      await navigator.clipboard.writeText(whatsappOutput.value);
      toast("Texto copiado.");
    } catch (error) {
      toast("Não foi possível copiar automaticamente.");
    }
  });

  document.querySelector("[data-print]")?.addEventListener("click", () => {
    updateQuoteState();
    window.print();
  });

  document.querySelector("[data-pdf]")?.addEventListener("click", () => {
    updateQuoteState();
    toast("Na janela de impressão, escolha 'Salvar como PDF'.");
    window.print();
  });

  document.querySelector("[data-clear]")?.addEventListener("click", () => {
    form.reset();
    materialsList.innerHTML = "";
    addMaterial();
    updateQuoteState();
  });

  document.querySelector("[data-save]")?.addEventListener("click", async () => {
    updateQuoteState();

    if (!form.reportValidity()) return;

    try {
      const firebase = await loadFirebaseModule();
      const id = await firebase.saveQuote(lastQuote);
      toast(`Orçamento salvo: ${id}`);
    } catch (error) {
      console.error(error);
      toast("Não foi possível salvar. Confira o Firebase e as regras do Firestore.");
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
      const paidValue = number(row.querySelector("[data-material-value]")?.value);

      return {
        name: text(row.querySelector("[data-material-name]")?.value),
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

  if (balanceInput) {
    balanceInput.value = money.format(quote.payment.remainingBalance);
  }

  if (installmentInput) {
    installmentInput.value = money.format(quote.payment.installmentValue);
  }
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
        <div>
          <strong>Orçamento</strong>
          <span>${dateFormat.format(new Date(quote.dates.issuedAt))}</span>
        </div>
      </header>

      <section>
        <h2>Cliente</h2>
        <p>${escapeHtml(quote.client.name || "-")}</p>
        <p>${escapeHtml(quote.client.phone || quote.client.whatsapp || "-")}</p>
        <p>${escapeHtml(quote.client.address || "-")}</p>
      </section>

      <section>
        <h2>Descrição</h2>
        <p>${escapeHtml(quote.service.description || "-")}</p>
      </section>

      <section class="print-value">
        <span>Valor total</span>
        <strong>${money.format(quote.internalCosts.finalValue)}</strong>
      </section>

      <section>
        <h2>Pagamento</h2>
        <p>Entrada: ${money.format(quote.payment.downPayment)}</p>
        <p>Saldo: ${money.format(quote.payment.remainingBalance)}</p>
        <p>Parcelas: ${quote.payment.installments}x de ${money.format(quote.payment.installmentValue)}</p>
      </section>

      <section>
        <h2>Observações</h2>
        <p>${escapeHtml(quote.service.notes || "Sem observações adicionais.")}</p>
        <p>Este orçamento é válido por 30 dias a partir da data de emissão.</p>
      </section>
    </div>
  `;
}

async function setupAdminPage() {
  const loginScreen = document.querySelector("#loginScreen");
  const adminApp = document.querySelector("#adminApp");
  const loginForm = document.querySelector("[data-login-form]");
  const error = document.querySelector("[data-login-error]");

  let quotes = [];

  if (!loginScreen || !adminApp || !loginForm) {
    console.error("Elementos do login admin não encontrados.");
    return;
  }

  const unlock = async () => {
    loginScreen.hidden = true;
    adminApp.hidden = false;

    try {
      const firebase = await loadFirebaseModule();
      quotes = await firebase.getQuotes();
      renderAdmin(quotes);
    } catch (firebaseError) {
      console.error(firebaseError);
      toast("Entrou, mas não foi possível carregar os dados do Firebase.");
      renderAdmin([]);
    }
  };

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const typedPassword = String(new FormData(loginForm).get("password") || "").trim();

    if (typedPassword !== ADMIN_PASSWORD) {
      if (error) error.textContent = "Senha incorreta.";
      return;
    }

    if (error) error.textContent = "";

    sessionStorage.setItem("impactoAdmin", "ok");
    await unlock();
  });

  if (sessionStorage.getItem("impactoAdmin") === "ok") {
    await unlock();
  }

  document.querySelector("[data-logout]")?.addEventListener("click", () => {
    sessionStorage.removeItem("impactoAdmin");
    location.reload();
  });

  document.querySelector("[data-refresh]")?.addEventListener("click", async () => {
    try {
      const firebase = await loadFirebaseModule();
      quotes = await firebase.getQuotes();
      renderAdmin(applyFilters(quotes));
      toast("Dados atualizados.");
    } catch (error) {
      console.error(error);
      toast("Não foi possível atualizar.");
    }
  });

  document.querySelectorAll("[data-filter]").forEach((input) => {
    input.addEventListener("input", () => renderAdmin(applyFilters(quotes)));
  });

  document.querySelector("[data-quotes-table]")?.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-status-select]");
    if (!select) return;

    try {
      const firebase = await loadFirebaseModule();
      await firebase.updateQuoteStatus(select.dataset.id, select.value);

      quotes = quotes.map((quote) =>
        quote.id === select.dataset.id
          ? { ...quote, status: select.value }
          : quote
      );

      renderAdmin(applyFilters(quotes));
      toast("Status atualizado.");
    } catch (error) {
      console.error(error);
      toast("Não foi possível alterar o status.");
    }
  });
}

function applyFilters(quotes) {
  const filters = Object.fromEntries(
    [...document.querySelectorAll("[data-filter]")].map((input) => [
      input.dataset.filter,
      input.value.toLowerCase()
    ])
  );

  return quotes.filter((quote) => {
    const created = toDate(quote.dates?.issuedAt || quote.createdAt);

    const textBlob = `
      ${quote.client?.name || ""}
      ${quote.client?.phone || ""}
      ${quote.client?.whatsapp || ""}
      ${quote.service?.description || ""}
      ${(quote.materials || []).map((material) => material.name).join(" ")}
    `.toLowerCase();

    if (filters.client && !String(quote.client?.name || "").toLowerCase().includes(filters.client)) {
      return false;
    }

    if (filters.status && quote.status !== filters.status) {
      return false;
    }

    if (filters.search && !textBlob.includes(filters.search)) {
      return false;
    }

    if (filters.start && created && created < new Date(`${filters.start}T00:00:00`)) {
      return false;
    }

    if (filters.end && created && created > new Date(`${filters.end}T23:59:59`)) {
      return false;
    }

    return true;
  });
}

function renderAdmin(quotes) {
  renderDashboard(quotes);
  renderQuotesTable(quotes);
  renderMaterialsTable(quotes);
}

function renderDashboard(quotes) {
  const dashboard = document.querySelector("[data-dashboard]");
  if (!dashboard) return;

  const metrics = calculateMetrics(quotes);

  const cards = [
    ["Total enviados", metrics.total],
    ["Total fechados", metrics.closed],
    ["Total desistiu", metrics.lost],
    ["Total em andamento", metrics.inProgress],
    ["Valor orçado", money.format(metrics.quotedValue)],
    ["Valor fechado", money.format(metrics.closedValue)],
    ["Gasto em materiais", money.format(metrics.materialCost)],
    ["Lucro bruto", money.format(metrics.grossProfit)],
    ["Ticket médio", money.format(metrics.averageTicket)],
    ["Taxa de conversão", `${metrics.conversionRate.toFixed(1)}%`]
  ];

  dashboard.innerHTML = cards.map(([label, value]) => `
    <article class="metric-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </article>
  `).join("");
}

function renderQuotesTable(quotes) {
  const table = document.querySelector("[data-quotes-table]");
  if (!table) return;

  if (!quotes.length) {
    table.innerHTML = `
      <tr>
        <td colspan="12">Nenhum orçamento encontrado.</td>
      </tr>
    `;
    return;
  }

  table.innerHTML = quotes.map((quote) => {
    const costs = quote.internalCosts || {};
    const payment = quote.payment || {};
    const materials = quote.materials || [];

    return `
      <tr>
        <td>${escapeHtml(quote.client?.name || "-")}</td>
        <td>${escapeHtml(quote.client?.phone || quote.client?.whatsapp || "-")}</td>
        <td>${formatDate(quote.dates?.issuedAt || quote.createdAt)}</td>
        <td>${escapeHtml(quote.service?.description || "-")}</td>
        <td>${money.format(costs.finalValue || 0)}</td>
        <td>${money.format(costs.totalMaterialPaid || 0)}</td>
        <td>${escapeHtml(materials.map((item) => item.name).join(", ") || "-")}</td>
        <td>${money.format(payment.downPayment || 0)}</td>
        <td>${money.format(payment.remainingBalance || 0)}</td>
        <td>${payment.installments || 1}x</td>
        <td>${formatDate(quote.dates?.validUntil)}</td>
        <td>
          <select data-status-select data-id="${quote.id}">
            ${Object.entries(STATUS_LABELS).map(([value, label]) => `
              <option value="${value}" ${quote.status === value ? "selected" : ""}>${label}</option>
            `).join("")}
          </select>
        </td>
      </tr>
    `;
  }).join("");
}

function renderMaterialsTable(quotes) {
  const table = document.querySelector("[data-materials-table]");
  if (!table) return;

  const rows = quotes.flatMap((quote) => {
    return (quote.materials || []).map((material) => `
      <tr>
        <td>${escapeHtml(quote.client?.name || "-")}</td>
        <td>${escapeHtml(material.name || "-")}</td>
        <td>${money.format(material.paidValue || 0)}</td>
        <td>${formatDate(quote.dates?.issuedAt || quote.createdAt)}</td>
        <td>${STATUS_LABELS[quote.status] || "Em andamento"}</td>
      </tr>
    `);
  });

  table.innerHTML = rows.length
    ? rows.join("")
    : `<tr><td colspan="5">Nenhum material encontrado.</td></tr>`;
}

function calculateMetrics(quotes) {
  const total = quotes.length;
  const closedQuotes = quotes.filter((quote) => quote.status === "fechado");
  const closed = closedQuotes.length;
  const lost = quotes.filter((quote) => quote.status === "desistiu").length;
  const inProgress = quotes.filter((quote) => quote.status === "em_andamento").length;

  const quotedValue = quotes.reduce((totalValue, quote) => {
    return totalValue + (quote.internalCosts?.finalValue || 0);
  }, 0);

  const closedValue = closedQuotes.reduce((totalValue, quote) => {
    return totalValue + (quote.internalCosts?.finalValue || 0);
  }, 0);

  const materialCost = quotes.reduce((totalValue, quote) => {
    return totalValue + (quote.internalCosts?.totalMaterialPaid || 0);
  }, 0);

  const grossProfit = quotes.reduce((totalValue, quote) => {
    return totalValue + (quote.internalCosts?.grossProfit || 0);
  }, 0);

  return {
    total,
    closed,
    lost,
    inProgress,
    quotedValue,
    closedValue,
    materialCost,
    grossProfit,
    averageTicket: closed ? closedValue / closed : 0,
    conversionRate: total ? (closed / total) * 100 : 0
  };
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatDate(value) {
  const date = toDate(value);
  return date ? dateFormat.format(date) : "-";
}

function toDate(value) {
  if (!value) return null;

  if (typeof value.toDate === "function") {
    return value.toDate();
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function number(value) {
  return Number(String(value || 0).replace(",", ".")) || 0;
}

function text(value) {
  return String(value || "").trim();
}

function sum(items, key) {
  return items.reduce((total, item) => total + (item[key] || 0), 0);
}

function setText(selector, value) {
  const element = document.querySelector(selector);

  if (element) {
    element.textContent = value;
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(message) {
  const element = document.createElement("div");
  element.className = "toast";
  element.textContent = message;

  document.body.appendChild(element);

  requestAnimationFrame(() => {
    element.classList.add("is-visible");
  });

  setTimeout(() => {
    element.classList.remove("is-visible");

    setTimeout(() => {
      element.remove();
    }, 250);
  }, 2600);
}
