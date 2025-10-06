import { auth, db } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
    collection,
    query,
    orderBy,
    onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* ============================
   Estado & Referencias
============================ */
let ticketsCache = [];
let charts = {};
let fechaInicio = null;
let fechaFin = null;

const btnLogout = document.getElementById("btnLogout");
const filtroInfo = document.getElementById("filtroInfo");
const rangoRapidoEl = document.getElementById("rangoRapido");
const fInicioEl = document.getElementById("fechaInicio");
const fFinEl = document.getElementById("fechaFin");

/* ============================
   Utils
============================ */
const toDate = (v) => {
    if (!v) return null;
    if (typeof v?.toDate === "function") return v.toDate();
    if (v instanceof Date) return v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
};

const norm = (s) =>
    (s || "").toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const normEstado = (s) => {
    const e = norm(s);
    if (e.includes("proceso")) return "proceso";
    if (e.includes("pend") || e.includes("abiert")) return "pendiente";
    if (e.includes("cerr")) return "cerrado";
    return e || "desconocido";
};

const getFechaCreacion = (t) => toDate(t.fecha) || toDate(t.createdAt);
const getFechaCierre = (t) => toDate(t.fechaCierre) || toDate(t.cerrado);
const getFechaPrimerRespuesta = (t) => toDate(t.fechaPrimerRespuesta) || toDate(t.primerRespuesta);

const duracionHumana = (ms) => {
    if (!ms || isNaN(ms)) return "N/A";
    const min = Math.floor(ms / 60000);
    const h = Math.floor(min / 60);
    const d = Math.floor(h / 24);
    if (d > 0) return `${d}d ${h % 24}h`;
    if (h > 0) return `${h}h ${min % 60}m`;
    return `${min}m`;
};

const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (k) => {
    const [y, m] = k.split("-");
    return new Date(y, m - 1).toLocaleDateString("es-ES", { month: "short", year: "numeric" });
};
const sortMonthKeys = (keys) =>
    keys.sort((a, b) => {
        const [ya, ma] = a.split("-").map(Number);
        const [yb, mb] = b.split("-").map(Number);
        return ya === yb ? ma - mb : ya - yb;
    });

function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

/* ============================
   Sesión & Carga
============================ */
onAuthStateChanged(auth, (user) => {
    if (!user) window.location.href = "index.html";
    else suscribirTickets();
});

btnLogout.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
});

function suscribirTickets() {
    const q = query(collection(db, "tickets"), orderBy("fecha", "desc"));
    onSnapshot(q, (snap) => {
        ticketsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (!fechaInicio && !fechaFin) {
            rangoRapidoEl.value = "mes";
            aplicarRangoRapido("mes");
        } else aplicarFiltro();
    });
}

/* ============================
   Filtros
============================ */
function aplicarFiltro(origen = "") {
    let lista = ticketsCache
        .map((t) => ({ ...t, _estado: normEstado(t.estado) }))
        .filter((t) => t._estado === "cerrado" && getFechaCierre(t));

    if (fechaInicio) lista = lista.filter((t) => getFechaCierre(t) >= fechaInicio);
    if (fechaFin) lista = lista.filter((t) => getFechaCierre(t) <= fechaFin);

    filtroInfo.textContent = `Tickets cerrados: ${lista.length}`;
    calcularMetricas(lista);
    renderTabla(lista);
    renderGraficas(lista);
}

function aplicarRangoRapido(val) {
    const hoy = new Date();
    let ini = null, fin = new Date();
    if (val === "7d") ini = new Date(hoy.setDate(hoy.getDate() - 7));
    if (val === "30d") ini = new Date(hoy.setDate(hoy.getDate() - 30));
    if (val === "90d") ini = new Date(hoy.setDate(hoy.getDate() - 90));
    if (val === "mes") ini = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    if (val === "anio") ini = new Date(new Date().getFullYear(), 0, 1);

    fechaInicio = ini ? new Date(ini.setHours(0, 0, 0)) : null;
    fechaFin = fin ? new Date(fin.setHours(23, 59, 59)) : null;

    fInicioEl.value = fechaInicio ? fechaInicio.toISOString().slice(0, 10) : "";
    fFinEl.value = fechaFin ? fechaFin.toISOString().slice(0, 10) : "";

    aplicarFiltro("rango rápido");
}

rangoRapidoEl.addEventListener("change", (e) => aplicarRangoRapido(e.target.value));

document.getElementById("btnFiltrar").addEventListener("click", () => {
    fechaInicio = fInicioEl.value ? new Date(fInicioEl.value + "T00:00:00") : null;
    fechaFin = fFinEl.value ? new Date(fFinEl.value + "T23:59:59") : null;
    rangoRapidoEl.value = "";
    aplicarFiltro("manual");
});

/* ============================
   Métricas
============================ */
function calcularMetricas(lista) {
    document.getElementById("totalTickets").textContent = lista.length;
    document.getElementById("ticketsProceso").textContent =
        ticketsCache.filter((t) => normEstado(t.estado) === "proceso").length;

    const resp = lista.map((t) => (getFechaPrimerRespuesta(t) - getFechaCreacion(t)) / 60000).filter((v) => v > 0);
    const res = lista.map((t) => (getFechaCierre(t) - getFechaCreacion(t)) / 3600000).filter((v) => v > 0);

    document.getElementById("promRespuesta").textContent = resp.length
        ? (resp.reduce((a, b) => a + b, 0) / resp.length).toFixed(1) + " min"
        : "N/A";

    document.getElementById("promResolucion").textContent = res.length
        ? (res.reduce((a, b) => a + b, 0) / res.length).toFixed(1) + " h"
        : "N/A";
}

/* ============================
   Tabla
============================ */
function renderTabla(lista) {
    const tbody = document.querySelector("#tablaResolucion tbody");
    tbody.innerHTML = "";
    lista.forEach((t) => {
        const fCre = getFechaCreacion(t);
        const fCie = getFechaCierre(t);
        const diff = fCre && fCie ? fCie - fCre : null;
        tbody.innerHTML += `
      <tr>
        <td>${t.numero || t.id}</td>
        <td>${t.asunto || ""}</td>
        <td>${fCre?.toLocaleString() || "-"}</td>
        <td>${fCie?.toLocaleString() || "-"}</td>
        <td>${diff ? duracionHumana(diff) : "N/A"}</td>
      </tr>`;
    });
}

/* ============================
   Gráficas (4 en total)
============================ */
function renderGraficas(lista) {
    const ctxEstado = document.getElementById("chartEstado").getContext("2d");
    const ctxDepto = document.getElementById("chartDepto").getContext("2d");
    const ctxResp = document.getElementById("chartRespuestaMes").getContext("2d");
    const ctxRes = document.getElementById("chartResolucionMes").getContext("2d");

    // 1️⃣ Estados
    const allEstados = { pendiente: 0, proceso: 0, cerrado: 0 };
    ticketsCache.forEach((t) => { const e = normEstado(t.estado); if (e in allEstados) allEstados[e]++; });
    chartFactory("estado", ctxEstado, "doughnut", {
        labels: ["Pendiente", "En proceso", "Cerrado"],
        datasets: [{ data: [allEstados.pendiente, allEstados.proceso, allEstados.cerrado], backgroundColor: ["#f59e0b", "#3b82f6", "#10b981"] }]
    });

    // 2️⃣ Departamentos
    const deptoCounts = {};
    lista.forEach((t) => { const d = t.departamento || "N/D"; deptoCounts[d] = (deptoCounts[d] || 0) + 1; });
    chartFactory("depto", ctxDepto, "bar", {
        labels: Object.keys(deptoCounts),
        datasets: [{ label: "Tickets", data: Object.values(deptoCounts), backgroundColor: "#8b5cf6" }]
    }, axisOptions());

    // 3️⃣ Promedio de Respuesta por mes
    const respByMonth = {};
    lista.forEach((t) => {
        const fCre = getFechaCreacion(t); const fPri = getFechaPrimerRespuesta(t);
        if (fCre && fPri) (respByMonth[monthKey(fCre)] ||= []).push((fPri - fCre) / 60000);
    });
    const respKeys = sortMonthKeys(Object.keys(respByMonth));
    chartFactory("respMes", ctxResp, "bar", {
        labels: respKeys.map(monthLabel),
        datasets: [{ label: "Promedio (min)", data: respKeys.map((k) => avg(respByMonth[k])), backgroundColor: "#f59e0b" }]
    }, axisOptions("min"));

    // 4️⃣ Promedio de Resolución por mes
    const resByMonth = {};
    lista.forEach((t) => {
        const fCre = getFechaCreacion(t); const fCie = getFechaCierre(t);
        if (fCre && fCie) (resByMonth[monthKey(fCie)] ||= []).push((fCie - fCre) / 3600000);
    });
    const resKeys = sortMonthKeys(Object.keys(resByMonth));
    chartFactory("resMes", ctxRes, "bar", {
        labels: resKeys.map(monthLabel),
        datasets: [{ label: "Promedio (h)", data: resKeys.map((k) => avg(resByMonth[k])), backgroundColor: "#10b981" }]
    }, axisOptions("h"));
}

function axisOptions(unit = "") {
    return {
        plugins: { legend: { labels: { color: "#e5e7eb" } } },
        scales: {
            x: { ticks: { color: "#e5e7eb" } },
            y: { ticks: { color: "#e5e7eb", callback: (v) => v + (unit ? " " + unit : "") }, beginAtZero: true }
        }
    };
}

function chartFactory(key, ctx, type, data, options = { responsive: true }) {
    if (charts[key]) charts[key].destroy();
    charts[key] = new Chart(ctx, { type, data, options });
}

/* ============================
   Exportar PDF (solo logo + encabezado + tabla)
============================ */
document.getElementById("btnExportPDF").addEventListener("click", async () => {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    const logo = await toBase64("assets/logo.jpg").catch(() => null);
    if (logo) doc.addImage(logo, "PNG", (pageWidth - 30) / 2, 10, 30, 30);

    doc.setFontSize(14).text("Hospital Puerto Cortes", pageWidth / 2, 50, { align: "center" });
    doc.setFontSize(10).text("Dirección: Puerto Cortes, Honduras", pageWidth / 2, 56, { align: "center" });
     doc.setFontSize(12).text("Reporte de Tickets Cerrados", pageWidth / 2, 64, { align: "center" });

    const filas = [];
    document.querySelectorAll("#tablaResolucion tbody tr").forEach((tr) => {
        const fila = Array.from(tr.querySelectorAll("td")).map((td) => td.innerText);
        filas.push(fila);
    });

    doc.autoTable({
        head: [["ID", "Asunto", "Fecha Creación", "Fecha Cierre", "Tiempo Resolución"]],
        body: filas,
        startY: 70,
        styles: { fontSize: 9 }
    });

    doc.save("tickets_cerrados.pdf");
});

function toBase64(url) {
    return new Promise((res, rej) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width; canvas.height = img.height;
            canvas.getContext("2d").drawImage(img, 0, 0);
            res(canvas.toDataURL("image/png"));
        };
        img.onerror = rej;
        img.src = url;
    });
}

/* ============================
   Init
============================ */
window.addEventListener("DOMContentLoaded", () => {
    rangoRapidoEl.value = "mes";
    aplicarRangoRapido("mes");
});
