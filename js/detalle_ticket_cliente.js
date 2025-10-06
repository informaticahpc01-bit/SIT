import { auth, db } from "./firebase.js";
import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

/* ==== DOM ==== */
const detalleTicket = document.getElementById("detalleTicket");
const btnVolver = document.getElementById("btnVolver");

const listaComentarios = document.getElementById("listaComentarios");
const btnReimprimir = document.getElementById("btnReimprimir");

/* Estado */
let ticketId = null;
let currentUser = null;
let ticketData = null;

/* ===== Helpers ===== */
function getTicketId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

function formatFecha(v) {
  try {
    if (!v) return "-";
    if (typeof v.toDate === "function") return v.toDate().toLocaleString("es-HN");
    if (typeof v === "number") return new Date(v).toLocaleString("es-HN");
    return new Date(v).toLocaleString("es-HN");
  } catch {
    return "-";
  }
}

function estadoColor(estado = "") {
  estado = estado.toLowerCase();
  if (estado === "pendiente") return [59, 130, 246]; // azul
  if (estado === "proceso") return [250, 204, 21]; // amarillo
  if (estado === "cerrado") return [16, 185, 129]; // verde
  return [239, 68, 68]; // rojo / eliminado
}

/* ===== Sesión ===== */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUser = user;
  ticketId = getTicketId();

  if (!ticketId) {
    detalleTicket.innerHTML = "<p class='error'>❌ No se proporcionó ID de ticket</p>";
    return;
  }

  await cargarDetalle(ticketId);
  cargarComentarios(ticketId);
});

/* ===== Cargar ticket ===== */
async function cargarDetalle(id) {
  try {
    const snap = await getDoc(doc(db, "tickets", id));
    if (!snap.exists()) {
      detalleTicket.innerHTML = "<p class='error'>❌ Ticket no encontrado</p>";
      return;
    }

    ticketData = { id, ...snap.data() };
    const t = ticketData;

    detalleTicket.innerHTML = `
      <div class="ticket-detalle">
        <h2>${t.asunto || "Sin asunto"}</h2>
        <p>${t.descripcion || "Sin descripción"}</p>
        <p><b>Departamento:</b> ${t.departamento || "-"}</p>
        <p><b>Prioridad:</b> ${t.prioridad || "-"}</p>
        <p><b>Estado:</b> ${t.estado || "-"}</p>
        <p><b>Asignado a:</b> ${t.tecnicoAsignado || "-"}</p>
        <p><b>Fecha:</b> ${formatFecha(t.fecha)}</p>
        ${t.solucion ? `<p><b>Solución:</b> ${t.solucion}</p>` : ""}
      </div>
      <button id="btnReimprimir">🖨️ Reimprimir Ticket</button>
    `;

    // Activar impresión
    document.getElementById("btnReimprimir").addEventListener("click", async () => {
      const comentarios = [];
      const snapCom = await getDocs(collection(db, "tickets", ticketId, "comentarios"));
      snapCom.forEach((docSnap) => comentarios.push(docSnap.data()));

      await generarPDFTicket(t, t.solucion || "", comentarios);
    });
  } catch (err) {
    console.error("Error al cargar detalle:", err);
    detalleTicket.innerHTML = "<p class='error'>⚠️ Error al cargar ticket</p>";
  }
}

/* ===== Comentarios ===== */
function cargarComentarios(id) {
  const qRef = query(
    collection(db, "tickets", id, "comentarios"),
    orderBy("fecha", "asc")
  );

  onSnapshot(qRef, (snap) => {
    listaComentarios.innerHTML = "";
    if (snap.empty) {
      listaComentarios.innerHTML = `<p class="empty">Sin comentarios aún</p>`;
      return;
    }
    snap.forEach((docSnap) => {
      const c = docSnap.data();
      const div = document.createElement("div");
      div.className = "comentario";
      div.innerHTML = `<p><b>${c.usuario}</b>: ${c.texto}</p>
                       <small>${formatFecha(c.fecha)}</small>`;
      listaComentarios.appendChild(div);
    });
  });
}

/* ===== PDF ===== */
async function generarPDFTicket(t, solucionTexto, comentarios = []) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();

  // Logo
  const logo = await toBase64("assets/logo.png").catch(() => null);
  if (logo) doc.addImage(logo, "PNG", 15, 10, 28, 28);

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("SIT - SISTEMA INTELIGENTE DE TICKETS", pageWidth / 2, 15, { align: "center" });
  doc.setFontSize(11);
  doc.text("Puerto Cortés, Honduras", pageWidth / 2, 22, { align: "center" });
  doc.setFontSize(12);
  doc.text(`TICKET N° ${t.numero ?? t.id}`, pageWidth / 2, 30, { align: "center" });

  // Datos del solicitante
  const filas1 = [
    ["Fecha", formatFecha(t.fecha)],
    ["Departamento", t.departamento || "-"],
    ["Responsable", t.creadoPor || "-"],
    ["Descripción", (t.descripcion || "-").replace(/\s+/g, " ")]
  ];

  doc.autoTable({
    startY: 38,
    head: [["Datos del solicitante", ""]],
    body: filas1,
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [17, 24, 39], textColor: 255 },
    columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: pageWidth - 55 - 20 } },
    margin: { left: 10, right: 10 }
  });

  // Estado con color
  const [r, g, b] = estadoColor(t.estado);
  doc.setTextColor(r, g, b);
  doc.setFontSize(12);
  doc.text(`Estado: ${t.estado || "-"}`, 20, doc.lastAutoTable.finalY + 10);
  doc.setTextColor(0, 0, 0);

  // Datos de mantenimiento
  const ahora = new Date();
  const filas2 = [
    ["Inicio", "-"],
    ["Fin", ahora.toLocaleString("es-HN")],
    ["Observaciones / Solución", (solucionTexto || "-").replace(/\s+/g, " ")]
  ];

  doc.autoTable({
    head: [["Datos de mantenimiento", ""]],
    body: filas2,
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [17, 24, 39], textColor: 255 },
    columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: pageWidth - 55 - 20 } },
    margin: { left: 10, right: 10 }
  });

  // Comentarios
  if (comentarios.length > 0) {
    const filasComentarios = comentarios.map((c) => [
      `${c.usuario || "Anon"} (${formatFecha(c.fecha)})`,
      (c.texto || "-").replace(/\s+/g, " ")
    ]);

    doc.autoTable({
      head: [["Usuario / Fecha", "Comentario"]],
      body: filasComentarios,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      columnStyles: { 0: { cellWidth: 65 }, 1: { cellWidth: pageWidth - 65 - 20 } },
      margin: { left: 10, right: 10 }
    });
  }

  // Firmas
  const y = doc.lastAutoTable ? doc.lastAutoTable.finalY + 30 : 250;
  const mid = pageWidth / 2;
  doc.line(20, y, mid - 10, y);
  doc.line(mid + 10, y, pageWidth - 20, y);
  doc.setFontSize(10);
  doc.text("Firma Responsable de Mantenimiento", (20 + mid - 10) / 2, y + 6, { align: "center" });
  doc.text("Firma del Solicitante", (mid + 10 + pageWidth - 20) / 2, y + 6, { align: "center" });

  // Pie
  doc.setFontSize(9);
  doc.text("Generado por SIT • " + ahora.toLocaleString("es-HN"), pageWidth / 2, 287, { align: "center" });

  doc.save(`ticket_${t.numero ?? t.id}_cierre.pdf`);
}

function toBase64(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/* ===== Volver ===== */
btnVolver.addEventListener("click", () => {
  window.history.back();
});
