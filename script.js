const ADMIN_PASSWORD = "impacto2026";
const WHATSAPP_COMPANY = "5519994971866";

const STATUS_LABELS = {
  em_andamento: "Em andamento",
  fechado: "Fechado",
  desistiu: "Desistiu"
};

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

let firebaseApi = null;

document.addEventListener("DOMContentLoaded", () => {
  setupSite();
  setupQuotePage();
  setupAdminPage();
  setupPortfolioLightbox();
});

function setupSite() {
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener("click", (event) => {
      const target = document.querySelector(link.getAttribute("href"));
      if (!target) return;

      event.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

async function loadFirebase() {
  if (firebaseApi) return firebaseApi;
  firebaseApi = await import("./firebase-config.js");
  return firebaseApi;
}

function setupQuotePage() {
  const form = document.querySelector("#quoteForm");
  if (!form) return;

  const materialsList = document.querySelector("#materialsList");
  const whatsappOutput = document.querySelector("#whatsappText");

  let lastQuote = buildQuoteData();

  addMaterialRow();
  updateQuoteState();

  document.querySelector("#addMaterial")?.addEventListener("click", () => {
    addMaterialRow();
    updateQuoteState();
  });

  document.querySelector("#calculateQuote")?.addEventListener("click", () => {
    updateQuoteState();
    toast("Orçamento calculado.");
  });

  document.querySelector("#generateWhatsapp")?.addEventListener("click", () => {
    updateQuoteState();
    toast("Texto gerado.");
  });

  document.querySelector("#copyWhatsapp")?.addEventListener("click", async () => {
    updateQuoteState();

    try {
      await navigator.clipboard.writeText(whatsappOutput.value);
      toast("Texto copiado.");
    } catch {
      whatsappOutput.select();
      document.execCommand("copy");
      toast("Texto copiado.");
    }
  });

  document.querySelector("[data-whatsapp-client]")?.addEventListener("click", () => {
    updateQuoteState();

    const number = normalizeWhatsappNumber(lastQuote.cliente.whatsapp || lastQuote.cliente.telefone);

    if (!number) {
      toast("Cadastre o WhatsApp do cliente antes de enviar.");
      return;
    }

    const url = `https://wa.me/${number}?text=${encodeURIComponent(lastQuote.textoWhatsapp)}`;
    window.open(url, "_blank", "noopener");
  });

  document.querySelector("#printQuote")?.addEventListener("click", () => {
    updateQuoteState();
    printProfessionalQuote(lastQuote);
  });

  document.querySelector("#generatePdf")?.addEventListener("click", () => {
    updateQuoteState();
    generatePdf(lastQuote);
  });

  document.querySelector("#clearForm")?.addEventListener("click", () => {
    if (!confirm("Deseja limpar todo o formulário?")) return;

    form.reset();
    materialsList.innerHTML = "";
    addMaterialRow();
    updateQuoteState();
  });

  document.querySelector("#saveQuote")?.addEventListener("click", async () => {
    updateQuoteState();

    if (!lastQuote.cliente.nome) {
      toast("Informe o nome do cliente.");
      return;
    }

    try {
      const fb = await loadFirebase();

      await fb.addDoc(fb.collection(fb.db, "orcamentos"), {
        ...lastQuote,
        createdAt: fb.serverTimestamp(),
        updatedAt: fb.serverTimestamp()
      });

      toast("Orçamento salvo no Firestore.");
    } catch (error) {
      console.error(error);
      toast("Erro ao salvar. Verifique Firebase e regras do Firestore.");
    }
  });

  form.addEventListener("input", updateQuoteState);

  function addMaterialRow(material = { nome: "", valorPago: "" }) {
    const row = document.createElement("div");
    row.className = "material-row";

    row.innerHTML = `
      <label>
        Nome do material
        <input type="text" class="material-name" value="${escapeHtml(material.nome)}" placeholder="Ex: ACM, lona, adesivo">
      </label>

      <label>
        Valor pago
        <input type="number" class="material-value" min="0" step="0.01" value="${material.valorPago}" placeholder="0,00">
      </label>

      <button class="btn btn-danger btn-sm" type="button">Remover</button>
    `;

    row.querySelector("button").addEventListener("click", () => {
      row.remove();

      if (!materialsList.children.length) {
        addMaterialRow();
      }

      updateQuoteState();
    });

    materialsList.appendChild(row);
  }

  function updateQuoteState() {
    lastQuote = buildQuoteData();
    renderQuoteSummary(lastQuote);

    if (whatsappOutput) {
      whatsappOutput.value = lastQuote.textoWhatsapp;
    }
  }

  function buildQuoteData() {
    const materiais = [...document.querySelectorAll(".material-row")].map((row) => {
      const nome = row.querySelector(".material-name").value.trim();
      const valorPago = toNumber(row.querySelector(".material-value").value);
      const acrescimo22 = valorPago * 0.22;
      const materialComAcrescimo = valorPago + acrescimo22;

      return {
        nome,
        valorPago,
        acrescimo22,
        materialComAcrescimo
      };
    }).filter((material) => material.nome || material.valorPago > 0);

    const totalMaterialPago = sum(materiais.map((material) => material.valorPago));
    const totalAcrescimo = sum(materiais.map((material) => material.acrescimo22));
    const totalMaterialComAcrescimo = totalMaterialPago + totalAcrescimo;
    const maoDeObra = totalMaterialComAcrescimo * 2;
    const valorFinalCliente = maoDeObra;

    const entrada = toNumber(document.querySelector("#entryValue")?.value);
    const parcelas = Math.max(1, parseInt(document.querySelector("#installments")?.value || "1", 10));
    const saldoRestante = Math.max(valorFinalCliente - entrada, 0);
    const valorParcela = saldoRestante / parcelas;

    const dataEmissao = new Date();
    const validade = addDays(dataEmissao, 30);

    const cliente = {
      nome: document.querySelector("#clientName")?.value.trim() || "",
      telefone: document.querySelector("#clientPhone")?.value.trim() || "",
      whatsapp: document.querySelector("#clientWhatsapp")?.value.trim() || "",
      endereco: document.querySelector("#clientAddress")?.value.trim() || ""
    };

    const servico = {
      descricao: document.querySelector("#serviceDescription")?.value.trim() || "Serviço de comunicação visual",
      prazo: document.querySelector("#deadline")?.value.trim() || ""
    };

    const observacoes = document.querySelector("#notes")?.value.trim() || "";

    const custosInternos = {
      totalMaterialPago,
      totalAcrescimo,
      totalMaterialComAcrescimo,
      maoDeObra
    };

    const pagamento = {
      entrada,
      parcelas,
      saldoRestante,
      valorParcela
    };

    const datas = {
      emissao: dataEmissao.toISOString(),
      validade: validade.toISOString()
    };

    const textoWhatsapp = buildWhatsappText({
      cliente,
      servico,
      observacoes,
      valorFinalCliente,
      pagamento,
      datas
    });

    return {
      cliente,
      servico,
      materiais,
      custosInternos,
      valorFinalCliente,
      pagamento,
      observacoes,
      status: "em_andamento",
      datas,
      textoWhatsapp
    };
  }

  function renderQuoteSummary(quote) {
    setText("#sumPaid", formatMoney(quote.custosInternos.totalMaterialPago));
    setText("#sumIncrease", formatMoney(quote.custosInternos.totalAcrescimo));
    setText("#sumWithIncrease", formatMoney(quote.custosInternos.totalMaterialComAcrescimo));
    setText("#sumFinal", formatMoney(quote.valorFinalCliente));
    setText("#sumBalance", formatMoney(quote.pagamento.saldoRestante));
    setText("#sumInstallment", formatMoney(quote.pagamento.valorParcela));
    setText("#sumValidity", formatDate(quote.datas.validade));
  }
}

function setupAdminPage() {
  const loginScreen = document.querySelector("#loginScreen");
  const adminApp = document.querySelector("#adminApp");
  const loginForm = document.querySelector("#loginForm");
  const loginButton = document.querySelector("#adminLoginButton");
  const passwordInput = document.querySelector("#adminPassword");
  const error = document.querySelector("#loginError");

  if (!loginScreen || !adminApp || !loginForm) return;

  cleanPasswordFromUrl();

  if (sessionStorage.getItem("impacto-admin") === "ok") {
    unlockAdmin();
    loadAdminData();
  }

  loginForm.setAttribute("method", "post");
  loginForm.setAttribute("action", "javascript:void(0)");

  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();
    tryLogin();
    return false;
  });

  loginButton?.addEventListener("click", () => {
    tryLogin();
  });

  passwordInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      tryLogin();
    }
  });

  document.querySelector("#logoutAdmin")?.addEventListener("click", () => {
    sessionStorage.removeItem("impacto-admin");
    window.location.href = "admin.html";
  });

  document.querySelector("#reloadAdmin")?.addEventListener("click", loadAdminData);

  ["filterClient", "filterStart", "filterEnd", "filterStatus", "filterSearch"].forEach((id) => {
    document.querySelector(`#${id}`)?.addEventListener("input", () => renderAdmin(window.__quotes || []));
    document.querySelector(`#${id}`)?.addEventListener("change", () => renderAdmin(window.__quotes || []));
  });

  function tryLogin() {
    const password = passwordInput?.value.trim() || "";

    if (password !== ADMIN_PASSWORD) {
      if (error) error.hidden = false;

      if (passwordInput) {
        passwordInput.value = "";
        passwordInput.focus();
      }

      return;
    }

    if (error) error.hidden = true;

    sessionStorage.setItem("impacto-admin", "ok");
    cleanPasswordFromUrl();
    unlockAdmin();
    loadAdminData();
  }

  function unlockAdmin() {
    loginScreen.hidden = true;
    loginScreen.classList.add("is-hidden");
    loginScreen.style.display = "none";

    adminApp.hidden = false;
    adminApp.style.display = "block";

    document.body.classList.add("admin-logged");
    window.scrollTo(0, 0);
  }

  function cleanPasswordFromUrl() {
    if (window.location.search) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
}

async function loadAdminData() {
  try {
    const fb = await loadFirebase();
    const q = fb.query(fb.collection(fb.db, "orcamentos"), fb.orderBy("createdAt", "desc"));
    const snapshot = await fb.getDocs(q);

    const quotes = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));

    window.__quotes = quotes;
    renderAdmin(quotes);
    toast("Dados atualizados.");
  } catch (error) {
    console.error(error);
    toast("Erro ao carregar dados do Firestore.");
  }
}

function renderAdmin(quotes) {
  const filtered = applyFilters(quotes);

  renderMetrics(filtered);
  renderQuotesTable(filtered);
  renderMaterialsTable(filtered);
}

function applyFilters(quotes) {
  const client = document.querySelector("#filterClient")?.value.toLowerCase().trim() || "";
  const start = document.querySelector("#filterStart")?.value || "";
  const end = document.querySelector("#filterEnd")?.value || "";
  const status = document.querySelector("#filterStatus")?.value || "";
  const search = document.querySelector("#filterSearch")?.value.toLowerCase().trim() || "";

  return quotes.filter((quote) => {
    const name = quote.cliente?.nome?.toLowerCase() || "";
    const phone = quote.cliente?.telefone?.toLowerCase() || "";
    const service = quote.servico?.descricao?.toLowerCase() || "";
    const materials = (quote.materiais || []).map((item) => item.nome).join(" ").toLowerCase();
    const date = quote.datas?.emissao ? quote.datas.emissao.slice(0, 10) : "";

    const matchClient = !client || name.includes(client);
    const matchStart = !start || date >= start;
    const matchEnd = !end || date <= end;
    const matchStatus = !status || quote.status === status;
    const matchSearch = !search || `${name} ${phone} ${service} ${materials}`.includes(search);

    return matchClient && matchStart && matchEnd && matchStatus && matchSearch;
  });
}

function renderMetrics(quotes) {
  const total = quotes.length;
  const closed = quotes.filter((quote) => quote.status === "fechado").length;
  const lost = quotes.filter((quote) => quote.status === "desistiu").length;
  const progress = quotes.filter((quote) => quote.status === "em_andamento").length;

  const quotedValue = sum(quotes.map((quote) => quote.valorFinalCliente));
  const closedValue = sum(quotes.filter((quote) => quote.status === "fechado").map((quote) => quote.valorFinalCliente));
  const materials = sum(quotes.map((quote) => quote.custosInternos?.totalMaterialPago || 0));
  const closedMaterials = sum(quotes.filter((quote) => quote.status === "fechado").map((quote) => quote.custosInternos?.totalMaterialPago || 0));
  const profit = closedValue - closedMaterials;
  const ticket = closed ? closedValue / closed : 0;
  const conversion = total ? (closed / total) * 100 : 0;

  setText("#metricTotal", total);
  setText("#metricClosed", closed);
  setText("#metricLost", lost);
  setText("#metricProgress", progress);
  setText("#metricQuoted", formatMoney(quotedValue));
  setText("#metricClosedValue", formatMoney(closedValue));
  setText("#metricMaterials", formatMoney(materials));
  setText("#metricProfit", formatMoney(profit));
  setText("#metricTicket", formatMoney(ticket));
  setText("#metricConversion", `${conversion.toFixed(1)}%`);
}

function renderQuotesTable(quotes) {
  const tbody = document.querySelector("#quotesTable");
  if (!tbody) return;

  tbody.innerHTML = quotes.map((quote) => {
    const materials = (quote.materiais || []).map((item) => item.nome).filter(Boolean).join(", ") || "-";
    const parcelas = `${quote.pagamento?.parcelas || 1}x de ${formatMoney(quote.pagamento?.valorParcela || 0)}`;

    return `
      <tr>
        <td>${escapeHtml(quote.cliente?.nome || "-")}</td>
        <td>${escapeHtml(quote.cliente?.telefone || quote.cliente?.whatsapp || "-")}</td>
        <td>${formatDate(quote.datas?.emissao)}</td>
        <td>${escapeHtml(quote.servico?.descricao || "-")}</td>
        <td>${formatMoney(quote.valorFinalCliente || 0)}</td>
        <td>${formatMoney(quote.custosInternos?.totalMaterialPago || 0)}</td>
        <td>${escapeHtml(materials)}</td>
        <td>${formatMoney(quote.pagamento?.entrada || 0)}</td>
        <td>${formatMoney(quote.pagamento?.saldoRestante || 0)}</td>
        <td>${escapeHtml(parcelas)}</td>
        <td>${formatDate(quote.datas?.validade)}</td>
        <td>
          <select data-status-id="${quote.id}">
            <option value="em_andamento" ${quote.status === "em_andamento" ? "selected" : ""}>Em andamento</option>
            <option value="fechado" ${quote.status === "fechado" ? "selected" : ""}>Fechado</option>
            <option value="desistiu" ${quote.status === "desistiu" ? "selected" : ""}>Desistiu</option>
          </select>
        </td>
      </tr>
    `;
  }).join("") || `
    <tr>
      <td colspan="12">Nenhum orçamento encontrado.</td>
    </tr>
  `;

  tbody.querySelectorAll("[data-status-id]").forEach((select) => {
    select.addEventListener("change", async () => {
      const id = select.dataset.statusId;
      const status = select.value;

      try {
        const fb = await loadFirebase();

        await fb.updateDoc(fb.doc(fb.db, "orcamentos", id), {
          status,
          updatedAt: fb.serverTimestamp()
        });

        const quote = window.__quotes.find((item) => item.id === id);
        if (quote) quote.status = status;

        renderAdmin(window.__quotes);
        toast("Status atualizado.");
      } catch (error) {
        console.error(error);
        toast("Erro ao atualizar status.");
      }
    });
  });
}

function renderMaterialsTable(quotes) {
  const tbody = document.querySelector("#materialsTable");
  if (!tbody) return;

  const rows = quotes.flatMap((quote) => {
    return (quote.materiais || []).map((material) => `
      <tr>
        <td>${escapeHtml(quote.cliente?.nome || "-")}</td>
        <td>${escapeHtml(material.nome || "-")}</td>
        <td>${formatMoney(material.valorPago || 0)}</td>
        <td>${formatDate(quote.datas?.emissao)}</td>
        <td>${escapeHtml(STATUS_LABELS[quote.status] || quote.status || "-")}</td>
      </tr>
    `);
  });

  tbody.innerHTML = rows.join("") || `
    <tr>
      <td colspan="5">Nenhum material encontrado.</td>
    </tr>
  `;
}

function setupPortfolioLightbox() {
  const galleryImages = document.querySelectorAll(
    ".featured-work img, .real-gallery-item img"
  );

  if (!galleryImages.length) return;

  const lightbox = document.createElement("div");
  lightbox.className = "lightbox";
  lightbox.innerHTML = `
    <button class="lightbox-close" type="button" aria-label="Fechar imagem">×</button>
    <div class="lightbox-content">
      <img class="lightbox-image" src="" alt="">
      <div class="lightbox-caption"></div>
    </div>
    <div class="lightbox-hint">Clique fora da imagem ou pressione ESC para voltar ao site</div>
  `;

  document.body.appendChild(lightbox);

  const lightboxImage = lightbox.querySelector(".lightbox-image");
  const lightboxCaption = lightbox.querySelector(".lightbox-caption");
  const closeButton = lightbox.querySelector(".lightbox-close");

  galleryImages.forEach((image) => {
    image.addEventListener("click", () => {
      const caption =
        image.closest("figure")?.querySelector("figcaption")?.textContent ||
        image.closest(".featured-work")?.querySelector("strong")?.textContent ||
        image.alt ||
        "Trabalho Impacto Visual";

      lightboxImage.src = image.src;
      lightboxImage.alt = image.alt || caption;
      lightboxCaption.textContent = caption;

      lightbox.classList.add("is-open");
      document.body.style.overflow = "hidden";
    });
  });

  function closeLightbox() {
    lightbox.classList.remove("is-open");
    lightboxImage.src = "";
    document.body.style.overflow = "";
  }

  closeButton.addEventListener("click", closeLightbox);

  lightbox.addEventListener("click", (event) => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && lightbox.classList.contains("is-open")) {
      closeLightbox();
    }
  });
}

function buildWhatsappText({ cliente, servico, observacoes, valorFinalCliente, pagamento, datas }) {
  const name = cliente.nome ? ` ${cliente.nome}` : "";

  return [
    `Olá${name}, tudo bem?`,
    ``,
    `Segue o orçamento solicitado pela Impacto Visual Comunicação Visual.`,
    ``,
    `Serviço: ${servico.descricao}`,
    servico.prazo ? `Prazo: ${servico.prazo}` : "",
    `Valor total: ${formatMoney(valorFinalCliente)}`,
    `Entrada: ${formatMoney(pagamento.entrada)}`,
    `Saldo restante: ${formatMoney(pagamento.saldoRestante)}`,
    `Parcelamento: ${pagamento.parcelas}x de ${formatMoney(pagamento.valorParcela)}`,
    observacoes ? `Observações: ${observacoes}` : "",
    ``,
    `Este orçamento é válido por 30 dias a partir da data de emissão.`,
    `Validade: ${formatDate(datas.validade)}`
  ].filter(Boolean).join("\n");
}

function printProfessionalQuote(quote) {
  const win = window.open("", "_blank");

  win.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Orçamento Impacto Visual</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #111; }
        .top { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #d8aa3c; padding-bottom: 20px; }
        img { width: 110px; height: 110px; object-fit: contain; }
        h1 { font-size: 32px; margin: 30px 0 10px; }
        h2 { margin-top: 28px; }
        p { line-height: 1.6; }
        .box { border: 1px solid #ddd; border-radius: 14px; padding: 20px; margin-top: 20px; }
        .value { font-size: 30px; font-weight: 800; color: #111; }
        .gold { color: #b98b2e; font-weight: 700; }
        @media print { button { display: none; } }
      </style>
    </head>
    <body>
      <div class="top">
        <img src="logo.png" alt="Impacto Visual">
        <div>
          <strong>Impacto Visual Comunicação Visual</strong><br>
          <span>Orçamento profissional</span>
        </div>
      </div>

      <h1>Orçamento</h1>

      <div class="box">
        <h2>Cliente</h2>
        <p>
          <strong>Nome:</strong> ${escapeHtml(quote.cliente.nome || "-")}<br>
          <strong>Telefone:</strong> ${escapeHtml(quote.cliente.telefone || quote.cliente.whatsapp || "-")}<br>
          <strong>Endereço:</strong> ${escapeHtml(quote.cliente.endereco || "-")}
        </p>
      </div>

      <div class="box">
        <h2>Descrição</h2>
        <p>${escapeHtml(quote.servico.descricao || "-")}</p>
        ${quote.servico.prazo ? `<p><strong>Prazo:</strong> ${escapeHtml(quote.servico.prazo)}</p>` : ""}
      </div>

      <div class="box">
        <h2>Valor</h2>
        <p class="value">${formatMoney(quote.valorFinalCliente)}</p>
      </div>

      <div class="box">
        <h2>Pagamento</h2>
        <p>
          <strong>Entrada:</strong> ${formatMoney(quote.pagamento.entrada)}<br>
          <strong>Saldo restante:</strong> ${formatMoney(quote.pagamento.saldoRestante)}<br>
          <strong>Parcelamento:</strong> ${quote.pagamento.parcelas}x de ${formatMoney(quote.pagamento.valorParcela)}
        </p>
      </div>

      <div class="box">
        <h2>Validade</h2>
        <p>Este orçamento é válido por 30 dias a partir da data de emissão.</p>
        <p class="gold">Validade: ${formatDate(quote.datas.validade)}</p>
      </div>

      ${quote.observacoes ? `
        <div class="box">
          <h2>Observações</h2>
          <p>${escapeHtml(quote.observacoes)}</p>
        </div>
      ` : ""}

      <script>
        window.onload = () => window.print();
      </script>
    </body>
    </html>
  `);

  win.document.close();
}

async function generatePdf(quote) {
  if (!window.jspdf) {
    toast("Biblioteca de PDF não carregada.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF("p", "mm", "a4");

  const pageWidth = 210;
  const margin = 18;
  const contentWidth = pageWidth - margin * 2;
  const fileName = `orcamento-impacto-visual-${sanitizeFileName(quote.cliente.nome || "cliente")}.pdf`;

  let logoDataUrl = "";

  try {
    logoDataUrl = await loadImageAsDataUrl("logo.png");
  } catch {
    logoDataUrl = "";
  }

  pdf.setFillColor(5, 5, 5);
  pdf.rect(0, 0, 210, 42, "F");

  if (logoDataUrl) {
    pdf.addImage(logoDataUrl, "PNG", 18, 8, 26, 26);
  }

  pdf.setTextColor(216, 170, 60);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.text("Impacto Visual", logoDataUrl ? 50 : 18, 18);

  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text("Comunicação Visual Premium", logoDataUrl ? 50 : 18, 26);

  pdf.setTextColor(20, 20, 20);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(24);
  pdf.text("Orçamento", margin, 58);

  pdf.setFontSize(10);
  pdf.setTextColor(110, 110, 110);
  pdf.text(`Emissão: ${formatDate(quote.datas.emissao)}`, margin, 66);
  pdf.text(`Validade: ${formatDate(quote.datas.validade)}`, margin + 60, 66);

  let y = 82;

  drawPdfBox(pdf, {
    title: "Cliente",
    y,
    lines: [
      `Nome: ${quote.cliente.nome || "-"}`,
      `Telefone: ${quote.cliente.telefone || quote.cliente.whatsapp || "-"}`,
      `Endereço: ${quote.cliente.endereco || "-"}`
    ]
  });

  y += 42;

  const serviceLines = pdf.splitTextToSize(quote.servico.descricao || "-", contentWidth - 14);

  drawPdfBox(pdf, {
    title: "Descrição do serviço",
    y,
    lines: [
      ...serviceLines,
      quote.servico.prazo ? `Prazo: ${quote.servico.prazo}` : ""
    ].filter(Boolean)
  });

  y += Math.max(48, serviceLines.length * 6 + 30);

  pdf.setFillColor(250, 247, 239);
  pdf.roundedRect(margin, y, contentWidth, 34, 4, 4, "F");

  pdf.setTextColor(105, 105, 105);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text("Valor total do orçamento", margin + 8, y + 11);

  pdf.setTextColor(5, 5, 5);
  pdf.setFontSize(24);
  pdf.text(formatMoney(quote.valorFinalCliente), margin + 8, y + 25);

  y += 50;

  drawPdfBox(pdf, {
    title: "Pagamento",
    y,
    lines: [
      `Entrada: ${formatMoney(quote.pagamento.entrada)}`,
      `Saldo restante: ${formatMoney(quote.pagamento.saldoRestante)}`,
      `Parcelamento: ${quote.pagamento.parcelas}x de ${formatMoney(quote.pagamento.valorParcela)}`
    ]
  });

  y += 44;

  drawPdfBox(pdf, {
    title: "Validade",
    y,
    lines: [
      "Este orçamento é válido por 30 dias a partir da data de emissão.",
      `Validade: ${formatDate(quote.datas.validade)}`
    ]
  });

  y += 42;

  if (quote.observacoes) {
    const observationLines = pdf.splitTextToSize(quote.observacoes, contentWidth - 14);

    drawPdfBox(pdf, {
      title: "Observações",
      y,
      lines: observationLines
    });
  }

  pdf.setFillColor(5, 5, 5);
  pdf.rect(0, 282, 210, 15, "F");

  pdf.setTextColor(255, 255, 255);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text("Impacto Visual Comunicação Visual", margin, 291);

  const pdfBlob = pdf.output("blob");
  const pdfFile = new File([pdfBlob], fileName, {
    type: "application/pdf"
  });

  if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    try {
      await navigator.share({
        title: "Orçamento Impacto Visual",
        text: `Orçamento para ${quote.cliente.nome || "cliente"}`,
        files: [pdfFile]
      });

      toast("PDF pronto para compartilhar.");
      return;
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error(error);
      }
    }
  }

  const pdfUrl = URL.createObjectURL(pdfBlob);
  const link = document.createElement("a");
  link.href = pdfUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(pdfUrl);
  }, 1000);

  toast("PDF gerado para download.");
}

function drawPdfBox(pdf, { title, y, lines }) {
  const margin = 18;
  const width = 174;
  const lineHeight = 6;
  const cleanLines = lines.filter(Boolean);
  const height = Math.max(28, cleanLines.length * lineHeight + 18);

  pdf.setDrawColor(226, 226, 226);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(margin, y, width, height, 4, 4, "FD");

  pdf.setTextColor(5, 5, 5);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(title, margin + 7, y + 10);

  pdf.setTextColor(70, 70, 70);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);

  cleanLines.forEach((line, index) => {
    pdf.text(String(line), margin + 7, y + 20 + index * lineHeight);
  });
}

function loadImageAsDataUrl(src) {
  return fetch(src)
    .then((response) => response.blob())
    .then((blob) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    });
}

function sanitizeFileName(value) {
  return String(value || "cliente")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function normalizeWhatsappNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function toNumber(value) {
  return Number(String(value || "0").replace(",", ".")) || 0;
}

function sum(values) {
  return values.reduce((total, value) => total + (Number(value) || 0), 0);
}

function formatMoney(value) {
  return moneyFormatter.format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "--/--/----";

  let date;

  if (value?.toDate) {
    date = value.toDate();
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return "--/--/----";

  return date.toLocaleDateString("pt-BR");
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) element.textContent = value;
}

function toast(message) {
  const element = document.querySelector("#toast");

  if (!element) {
    alert(message);
    return;
  }

  element.textContent = message;
  element.hidden = false;

  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    element.hidden = true;
  }, 3200);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
