import { auth, db } from "./firebase.js";
import {
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* ====== Referencias DOM ====== */
const btnLogout = document.getElementById("btnLogout");
const userNameEl = document.getElementById("userName");
const tablaBitacora = document.getElementById("tablaBitacora");

const fechaInicioEl = document.getElementById("fechaInicio");
const fechaFinEl = document.getElementById("fechaFin");
const rangoRapidoEl = document.getElementById("rangoRapido");
const usuarioFiltroEl = document.getElementById("usuarioFiltro");
const accionFiltroEl = document.getElementById("accionFiltro");

const filtroForm = document.getElementById("filtroForm");
const btnReset = document.getElementById("btnReset");
const btnExportPDF = document.getElementById("btnExportPDF");

/* ====== Estado ====== */
let logs = [];
let logsFiltrados = [];

/* ====== Utils de fechas (local) ====== */
function parseYYYYMMDD(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return { y, m, d };
}
function dayStartLocal(str) {
  const p = parseYYYYMMDD(str);
  if (!p) return null;
  return new Date(p.y, p.m - 1, p.d, 0, 0, 0, 0);
}
function nextDayStartLocal(str) {
  const p = parseYYYYMMDD(str);
  if (!p) return null;
  return new Date(p.y, p.m - 1, p.d + 1, 0, 0, 0, 0);
}
function toLocalDateOnlyString(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/* ====== Sesión ====== */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    userNameEl.textContent = user.email || "Usuario";
    cargarBitacora();
  }
});

btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

/* ====== Escuchar Bitácora ====== */
function cargarBitacora() {
  const q = query(collection(db, "bitacora"), orderBy("fecha", "desc"));
  onSnapshot(q, (snapshot) => {
    logs = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        usuario: d.usuario || "",
        accion: d.accion || "",
        fecha: d.fecha?.toDate?.() || null, // Date local
      };
    });

    llenarFiltros();
    aplicarFiltros();
  });
}

/* ====== Llenar filtros ====== */
function llenarFiltros() {
  // Usuarios
  const usuariosUnicos = [...new Set(logs.map((x) => x.usuario).filter(Boolean))];
  usuarioFiltroEl.innerHTML = "<option value=''>Todos</option>";
  usuariosUnicos.forEach((u) => {
    const opt = document.createElement("option");
    opt.value = u;
    opt.textContent = u;
    usuarioFiltroEl.appendChild(opt);
  });

  // Acciones (solo la primera palabra)
  const accionesUnicas = [
    ...new Set(
      logs
        .map((x) => (x.accion ? x.accion.split(" ")[0] : ""))
        .filter(Boolean)
    ),
  ];
  accionFiltroEl.innerHTML = "<option value=''>Todas</option>";
  accionesUnicas.forEach((a) => {
    const opt = document.createElement("option");
    opt.value = a;
    opt.textContent = a;
    accionFiltroEl.appendChild(opt);
  });
}

/* ====== Filtros ====== */
function aplicarFiltros() {
  const fIniStr = fechaInicioEl.value || "";
  const fFinStr = fechaFinEl.value || "";

  let start = null;
  let endExclusive = null;

  if (fIniStr && fFinStr) {
    start = dayStartLocal(fIniStr);
    endExclusive = nextDayStartLocal(fFinStr);
  } else if (fIniStr && !fFinStr) {
    start = dayStartLocal(fIniStr);
    endExclusive = nextDayStartLocal(fIniStr);
  } else if (!fIniStr && fFinStr) {
    start = dayStartLocal(fFinStr);
    endExclusive = nextDayStartLocal(fFinStr);
  }

  // Rango rápido (sobrescribe manual)
  const hoy = new Date();
  const hoyStr = toLocalDateOnlyString(hoy);
  if (rangoRapidoEl.value) {
    if (rangoRapidoEl.value === "hoy") {
      start = dayStartLocal(hoyStr);
      endExclusive = nextDayStartLocal(hoyStr);
    } else if (rangoRapidoEl.value === "ayer") {
      const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
      const ayerStr = toLocalDateOnlyString(ayer);
      start = dayStartLocal(ayerStr);
      endExclusive = nextDayStartLocal(ayerStr);
    } else if (rangoRapidoEl.value === "7" || rangoRapidoEl.value === "30") {
      const dias = Number(rangoRapidoEl.value);
      const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (dias - 1));
      start = dayStartLocal(toLocalDateOnlyString(inicio));
      endExclusive = nextDayStartLocal(hoyStr);
    } else if (rangoRapidoEl.value === "mes") {
      const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const finMesMasUno = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
      start = dayStartLocal(toLocalDateOnlyString(inicioMes));
      endExclusive = dayStartLocal(toLocalDateOnlyString(finMesMasUno));
    }
  }

  logsFiltrados = logs.filter((x) => {
    if (!x.fecha) return false;
    let ok = true;
    if (start && x.fecha < start) ok = false;
    if (endExclusive && x.fecha >= endExclusive) ok = false;
    if (usuarioFiltroEl.value && x.usuario !== usuarioFiltroEl.value) ok = false;
    if (accionFiltroEl.value && !x.accion.startsWith(accionFiltroEl.value)) ok = false;
    return ok;
  });

  renderTabla();
}

filtroForm.addEventListener("submit", (e) => {
  e.preventDefault();
  aplicarFiltros();
});

btnReset.addEventListener("click", () => {
  fechaInicioEl.value = "";
  fechaFinEl.value = "";
  rangoRapidoEl.value = "";
  usuarioFiltroEl.value = "";
  accionFiltroEl.value = "";
  aplicarFiltros();
});

/* ====== Render tabla ====== */
function renderTabla() {
  tablaBitacora.innerHTML = "";
  logsFiltrados.forEach((x) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${x.usuario}</td>
      <td>${x.accion}</td>
      <td>${x.fecha ? x.fecha.toLocaleString() : "-"}</td>
    `;
    tablaBitacora.appendChild(tr);
  });
}

/* ====== Exportar PDF ====== */
btnExportPDF.addEventListener("click", exportarPDF);

async function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();

  // Logo
  const logo = await toBase64("assets/icons/logo.jpg").catch(() => null);
  if (logo) {
    doc.addImage(logo, "PNG", 15, 10, 28, 28);
  }

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Hospital Puerto Cortes", pageWidth / 2, 18, { align: "center" });

  doc.setFontSize(12);
  doc.text("SIT - Sistema Inteligente de Tickets", pageWidth / 2, 25, { align: "center" });

  doc.setFontSize(12);
  doc.text("BITÁCORA DE ACTIVIDADES", pageWidth / 2, 32, { align: "center" });

  const hoy = new Date();
  doc.setFontSize(10);
  doc.text("Fecha de exportación: " + hoy.toLocaleString(), pageWidth / 2, 39, { align: "center" });

  // Detectar si hay filtros activos
  const hayFiltroActivo =
    fechaInicioEl.value ||
    fechaFinEl.value ||
    usuarioFiltroEl.value ||
    accionFiltroEl.value;

  const dataParaExportar = hayFiltroActivo ? logsFiltrados : logs;

  const body = dataParaExportar.map((x) => [
    x.usuario || "-",
    x.accion || "-",
    x.fecha ? x.fecha.toLocaleString() : "-"
  ]);

  if (!body.length) {
    doc.setFontSize(12);
    doc.text("Sin registros para exportar.", pageWidth / 2, 60, { align: "center" });
  } else {
    doc.autoTable({
      startY: 50,
      head: [["Usuario", "Acción", "Fecha"]],
      body,
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [17, 24, 39], textColor: 255 },
      theme: "grid",
      margin: { left: 10, right: 10 },
      didDrawPage: function () {
        const pageSize = doc.internal.pageSize;
        const pageHeight = pageSize.getHeight();
        const pageWidth = pageSize.getWidth();
        const pageCurrent = doc.internal.getCurrentPageInfo().pageNumber;

        doc.setFontSize(9);
        doc.text(
          `Página ${pageCurrent} de {total_pages_count_string}`,
          pageWidth / 2,
          pageHeight - 10,
          { align: "center" }
        );
      },
    });

    // Reemplazar marcador con total real
    if (typeof doc.putTotalPages === "function") {
      doc.putTotalPages("{total_pages_count_string}");
    }
  }

  doc.save(`bitacora_${toLocalDateOnlyString(hoy)}.pdf`);
}

/* ====== Helpers ====== */
function toBase64(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = reject;
    img.src = url;
  });
}
