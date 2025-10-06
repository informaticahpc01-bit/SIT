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
    // 🔹 Verificar rol en Firestore
    const userRef = doc(db, "usuarios", user.uid);
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (userData.rol === "Administrador" || userData.rol === "Tecnico") {
        stateButtons.style.display = "flex";
      }
    } else {
      console.warn("⚠️ No se encontró el usuario en Firestore.");
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
}

/* ====== Cambio de estado ====== */
window.actualizarEstado = async function (nuevoEstado) {
  if (!ticketId) return;

  const ref = doc(db, "tickets", ticketId);

  // Cerrar → abrir modal
  if (nuevoEstado.toLowerCase().includes("cerr")) {
    inputSolucion.value = "";
    modalSolucion.style.display = "flex";
    return;
  }

  // En proceso
  if (nuevoEstado.toLowerCase().includes("proceso")) {
    const snap = await getDoc(ref);
    const data = snap.data() || {};
    await updateDoc(ref, {
      estado: "En proceso",
      ...(data.primerRespuesta ? {} : { primerRespuesta: serverTimestamp() })
    });
    await logAccion(currentUser.email, `Marcó ticket #${ticketId} como En proceso`);
  }

  // Pendiente (reabrir)
  if (nuevoEstado.toLowerCase().includes("pend")) {
    await updateDoc(ref, { estado: "Pendiente" });
    await logAccion(currentUser.email, `Reabrió ticket #${ticketId} como Pendiente`);
  }

  // Refresca siempre
  await cargarTicket();
};

/* Guardar solución y cerrar */
btnGuardarSolucion.addEventListener("click", async () => {
  const solucion = inputSolucion.value.trim();
  if (!solucion) {
    alert("Por favor, escribe la solución brindada.");
    return;
  }

  const ref = doc(db, "tickets", ticketId);
  await updateDoc(ref, {
    estado: "Cerrado",
    solucion,
    cerrado: serverTimestamp(),
    fechaCierre: serverTimestamp()
  });

  // Registrar en comentarios
  await addDoc(collection(db, "tickets", ticketId, "comentarios"), {
    usuario: currentUser.email,
    texto: `SOLUCIÓN: ${solucion}`,
    fecha: serverTimestamp(),
  });

  // Enviar al chat del ticket (si existe)
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

  // Refrescar ticket y generar PDF
  await cargarTicket();
  try {
    await generarPDFTicket(ticketData, solucion);
  } catch (e) {
    console.error("No se pudo generar el PDF:", e);
  }
});

btnCancelarSolucion.addEventListener("click", () => {
  modalSolucion.style.display = "none";
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
  if (!texto) return;

  await addDoc(collection(db, "tickets", ticketId, "comentarios"), {
    usuario: currentUser.email,
    texto,
    fecha: serverTimestamp(),
  });

  await logAccion(currentUser.email, `Comentó en ticket #${ticketId}`);
  comentarioInput.value = "";
});

/* ====== PDF ====== */
async function generarPDFTicket(t, solucionTexto) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();

  // Logo
  const logo = await toBase64("assets/icons/logop.png").catch(() => null);
  if (logo) doc.addImage(logo, "PNG", 15, 10, 28, 28);

  // Encabezado
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("HOSPITAL DE PUERTO CORTÉS", pageWidth / 2, 15, { align: "center" });
  doc.setFontSize(11);
  doc.text("Departamento de Informática", pageWidth / 2, 22, { align: "center" });
  doc.setFontSize(12);
  doc.text(`TICKET DE MANTENIMIENTO/TRABAJO   No: ${t.numero ?? t.id}`, pageWidth / 2, 30, { align: "center" });

  // Datos del solicitante / ticket
  const fechaCre = t.fecha?.toDate?.().toLocaleString?.() || "-";
  const filas1 = [
    ["Fecha", fechaCre],
    ["Departamento", t.departamento || "-"],
    ["Responsable de petición", t.creadoPor || "-"],
    ["Descripción del trabajo solicitado", (t.descripcion || "-").replace(/\s+/g, " ")],
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

  // Datos de mantenimiento
  const ahora = new Date();
  const filas2 = [
    ["Inicio", "-"],
    ["Fin", ahora.toLocaleString()],
    ["Observaciones / Solución", (solucionTexto || "-").replace(/\s+/g, " ")],
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

  // Firmas
  const y = doc.lastAutoTable.finalY + 30;
  const mid = pageWidth / 2;
  doc.line(20, y, mid - 10, y);    
  doc.line(mid + 10, y, pageWidth - 20, y); 
  doc.setFontSize(10);
  doc.text("Firma Responsable de Mantenimiento", (20 + mid - 10) / 2, y + 6, { align: "center" });
  doc.text("Firma del Solicitante", (mid + 10 + pageWidth - 20) / 2, y + 6, { align: "center" });

  // Pie
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
