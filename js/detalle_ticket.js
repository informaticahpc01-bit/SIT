import { auth, db } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* ====== Referencias DOM ====== */
const btnLogout = document.getElementById("btnLogout");
const asuntoEl = document.getElementById("asunto");
const descripcionEl = document.getElementById("descripcion");
const categoriaEl = document.getElementById("categoria");
const departamentoEl = document.getElementById("departamento");
const prioridadEl = document.getElementById("prioridad");
const estadoEl = document.getElementById("estado");
const creadoPorEl = document.getElementById("creadoPor");
const fechaEl = document.getElementById("fecha");
const comentariosList = document.getElementById("comentariosList");
const comentarioInput = document.getElementById("comentarioInput");
const btnComentar = document.getElementById("btnComentar");
const stateButtons = document.getElementById("stateButtons");

// Modal solución
const modalSolucion = document.getElementById("modalSolucion");
const inputSolucion = document.getElementById("inputSolucion");
const btnGuardarSolucion = document.getElementById("btnGuardarSolucion");
const btnCancelarSolucion = document.getElementById("btnCancelarSolucion");

/* ====== Estado ====== */
let ticketId = null;
let currentUser = null;
let ticketData = null;

/* ====== Helpers ====== */
function normEstado(s) {
  const e = (s || "").toLowerCase();
  if (e.includes("cerr")) return "cerrado";
  if (e.includes("proceso")) return "proceso";
  return "pendiente";
}

// 🔹 Toast para mensajes visuales
function showToast(msg, ok = true) {
  const toast = document.createElement("div");
  toast.textContent = msg;
  toast.style.position = "fixed";
  toast.style.bottom = "20px";
  toast.style.right = "20px";
  toast.style.background = ok ? "#10b981" : "#ef4444"; // verde o rojo
  toast.style.color = "#fff";
  toast.style.padding = "10px 15px";
  toast.style.borderRadius = "8px";
  toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
  toast.style.zIndex = "1000";
  toast.style.fontFamily = "Inter, sans-serif";
  toast.style.transition = "opacity 0.5s ease";
  document.body.appendChild(toast);
  setTimeout(() => (toast.style.opacity = "0"), 2800);
  setTimeout(() => toast.remove(), 3500);
}

async function logAccion(usuario, accion) {
  try {
    await addDoc(collection(db, "bitacora"), {
      usuario,
      accion,
      fecha: serverTimestamp(),
    });
  } catch (err) {
    console.error("⚠️ Error al registrar en bitácora:", err);
  }
}

function getTicketId() {
  const params = new URLSearchParams(window.location.search);
  return params.get("id");
}

/* ====== Sesión ====== */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  currentUser = user;

  try {
    const userRef = doc(db, "usuarios", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.rol === "Administrador" || userData.rol === "Tecnico") {
        stateButtons.style.display = "none"; // por defecto oculto
      }
    }
  } catch (err) {
    console.error("Error al verificar rol:", err);
  }

  await cargarTicket();
  cargarComentarios();
});

btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

/* ====== NUEVAS FUNCIONALIDADES ====== */

// 🔹 Botón para imprimir
const btnImprimir = document.createElement("button");
btnImprimir.textContent = "🖨️ Imprimir Ticket";
btnImprimir.className = "btn-new";
btnImprimir.style.display = "none";
document.querySelector(".main").appendChild(btnImprimir);

// 🔹 Verificar visibilidad de botones
function verificarHabilitacionBotones(t) {
  const tieneAsignado = t.asignadoA && t.asignadoA.trim() !== "";
  const tienePrioridad = t.prioridad && t.prioridad.trim() !== "";

  if (!tieneAsignado || !tienePrioridad) {
    stateButtons.style.display = "none";
    return false;
  } else {
    stateButtons.style.display = "flex";
    return true;
  }
}

// 🔹 Mostrar / actualizar botón de impresión
function mostrarBotonImprimir(t) {
  if (!t) return;
  if (t.estado?.toLowerCase().includes("cerrado")) {
    btnImprimir.style.display = "inline-block";
    btnImprimir.textContent = t.impreso ? "🖨️ Reimprimir Ticket" : "🖨️ Imprimir Ticket";
    btnImprimir.onclick = async () => {
      await generarPDFTicket(t, t.solucion || "");
      if (!t.impreso) {
        const ref = doc(db, "tickets", t.id);
        await updateDoc(ref, { impreso: true });
        t.impreso = true;
        btnImprimir.textContent = "🖨️ Reimprimir Ticket";
      }
      showToast("✅ Ticket impreso correctamente", true);
    };
  } else {
    btnImprimir.style.display = "none";
  }
}

/* ====== Carga de ticket ====== */
async function cargarTicket() {
  ticketId = getTicketId();
  if (!ticketId) return;

  const ref = doc(db, "tickets", ticketId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    asuntoEl.textContent = "❌ Ticket no encontrado";
    return;
  }

  const t = snap.data();
  ticketData = { id: ticketId, ...t };

  asuntoEl.textContent = `#${t.numero ?? ticketId} - ${t.asunto ?? ""}`;
  descripcionEl.textContent = t.descripcion || "";
  categoriaEl.textContent = t.categoria || "";
  departamentoEl.textContent = t.departamento || "";
  prioridadEl.textContent = t.prioridad || "";
  estadoEl.textContent = t.estado || "Pendiente";
  estadoEl.className = `badge ${normEstado(t.estado)}`;
  creadoPorEl.textContent = t.creadoPor || "";
  fechaEl.textContent = t.fecha?.toDate?.().toLocaleString?.() || "-";

  verificarHabilitacionBotones(t);
  mostrarBotonImprimir(t);
}

/* ====== Cambio de estado ====== */
window.actualizarEstado = async function (nuevoEstado) {
  if (!ticketId) return;
  const ref = doc(db, "tickets", ticketId);
  const snap = await getDoc(ref);
  const data = snap.data();

  const asignado = data.asignadoA && data.asignadoA.trim() !== "";
  const tienePrioridad = data.prioridad && data.prioridad.trim() !== "";

  if (!asignado || !tienePrioridad) {
    showToast("⚠️ El ticket debe estar asignado y tener prioridad antes de cambiar su estado.", false);
    return;
  }

  if (nuevoEstado.toLowerCase().includes("cerr")) {
    inputSolucion.value = "";
    modalSolucion.style.display = "flex";
    return;
  }

  if (nuevoEstado.toLowerCase().includes("proceso")) {
    await updateDoc(ref, {
      estado: "En proceso",
      primerRespuesta: data.primerRespuesta || serverTimestamp(),
    });
    await logAccion(currentUser.email, `Marcó ticket #${ticketId} como En proceso`);
    showToast("🟢 Ticket marcado como En proceso", true);
  }

  if (nuevoEstado.toLowerCase().includes("pend")) {
    await updateDoc(ref, { estado: "Pendiente" });
    await logAccion(currentUser.email, `Reabrió ticket #${ticketId} como Pendiente`);
    showToast("🔁 Ticket reabierto como Pendiente", true);
  }

  await cargarTicket();
};

/* ====== Guardar solución y cerrar ====== */
btnGuardarSolucion.addEventListener("click", async () => {
  const solucion = inputSolucion.value.trim();
  if (!solucion) {
    showToast("⚠️ Escribe la solución brindada.", false);
    return;
  }

  const ref = doc(db, "tickets", ticketId);
  const snap = await getDoc(ref);
  const data = snap.data();

  if (!data.asignadoA || !data.prioridad) {
    showToast("⚠️ No puedes cerrar el ticket sin asignar técnico y prioridad.", false);
    return;
  }

  await updateDoc(ref, {
    estado: "Cerrado",
    solucion,
    cerrado: serverTimestamp(),
    fechaCierre: serverTimestamp()
  });

  await addDoc(collection(db, "tickets", ticketId, "comentarios"), {
    usuario: currentUser.email,
    texto: `SOLUCIÓN: ${solucion}`,
    fecha: serverTimestamp(),
  });

  try {
    await addDoc(collection(db, "tickets", ticketId, "chat"), {
      autor: currentUser.email,
      tipo: "solucion",
      mensaje: solucion,
      fecha: serverTimestamp(),
    });
  } catch (e) {
    console.warn("Chat no disponible:", e?.message);
  }

  await logAccion(currentUser.email, `Cerró el ticket #${ticketId} con solución`);
  modalSolucion.style.display = "none";
  showToast("✅ Ticket cerrado correctamente", true);

  await cargarTicket();
  try {
    await generarPDFTicket(ticketData, solucion);
  } catch (e) {
    console.error("No se pudo generar el PDF:", e);
  }
});

btnCancelarSolucion.addEventListener("click", () => {
  modalSolucion.style.display = "none";
  showToast("❌ Cierre cancelado", false);
});

/* ====== Comentarios ====== */
function cargarComentarios() {
  if (!ticketId) return;

  const qRef = query(
    collection(db, "tickets", ticketId, "comentarios"),
    orderBy("fecha", "asc")
  );

  onSnapshot(qRef, (snapshot) => {
    comentariosList.innerHTML = "";
    snapshot.forEach((docSnap) => {
      const c = docSnap.data();
      const div = document.createElement("div");
      div.className = "comentario";
      div.innerHTML = `<strong>${c.usuario}</strong>: ${c.texto} <br><small>${c.fecha?.toDate?.().toLocaleString?.() || "-"}</small>`;
      comentariosList.appendChild(div);
    });
  });
}

btnComentar.addEventListener("click", async () => {
  if (!ticketId) return;
  const texto = comentarioInput.value.trim();
  if (!texto) {
    showToast("⚠️ Escribe un comentario antes de enviar.", false);
    return;
  }

  await addDoc(collection(db, "tickets", ticketId, "comentarios"), {
    usuario: currentUser.email,
    texto,
    fecha: serverTimestamp(),
  });

  await logAccion(currentUser.email, `Comentó en ticket #${ticketId}`);
  comentarioInput.value = "";
  showToast("💬 Comentario agregado correctamente", true);
});

/* ====== PDF ====== */
async function generarPDFTicket(t, solucionTexto) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();

  const logo = await toBase64("assets/logo.jpg").catch(() => null);
  if (logo) doc.addImage(logo, "PNG", 15, 10, 28, 28);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("SIT - SISTEMA INTELIGENTE DE TICKETS", pageWidth / 2, 15, { align: "center" });
  doc.setFontSize(11);
  doc.text("Puerto Cortés, Honduras", pageWidth / 2, 22, { align: "center" });
  doc.setFontSize(12);
  doc.text(`TICKET N° ${t.numero ?? t.id}`, pageWidth / 2, 30, { align: "center" });

  const fechaCre = t.fecha?.toDate?.().toLocaleString?.() || "-";
  const filas1 = [
    ["Fecha", fechaCre],
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
    columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: pageWidth - 75 } },
    margin: { left: 10, right: 10 }
  });

  const ahora = new Date();
  const fechaInicio = t.primerRespuesta?.toDate?.().toLocaleString?.() || "-";
  const filas2 = [
    ["Inicio", fechaInicio],
    ["Fin", ahora.toLocaleString()],
    ["Observaciones / Solución", (solucionTexto || "-").replace(/\s+/g, " ")]
  ];

  doc.autoTable({
    head: [["Datos de mantenimiento", ""]],
    body: filas2,
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [17, 24, 39], textColor: 255 },
    columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: pageWidth - 75 } },
    margin: { left: 10, right: 10 }
  });

  const y = doc.lastAutoTable.finalY + 30;
  const mid = pageWidth / 2;
  doc.line(20, y, mid - 10, y);
  doc.line(mid + 10, y, pageWidth - 20, y);
  doc.setFontSize(10);
  doc.text("Firma Responsable de Mantenimiento", (20 + mid - 10) / 2, y + 6, { align: "center" });
  doc.text("Firma del Solicitante", (mid + 10 + pageWidth - 20) / 2, y + 6, { align: "center" });

  doc.setFontSize(9);
  doc.text("Generado por SIT • " + ahora.toLocaleString(), pageWidth / 2, 287, { align: "center" });

  doc.save(`ticket_${t.numero ?? t.id}_cierre.pdf`);
}

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

