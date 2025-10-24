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

  /* ==== Referencias DOM ==== */
  const detalleTicket = document.getElementById("detalleTicket");
  const btnVolver = document.getElementById("btnVolver");

  const listaComentarios = document.getElementById("listaComentarios");
  const textoComentario = document.getElementById("textoComentario");
  const btnAgregarComentario = document.getElementById("btnAgregarComentario");

  const nuevoTecnico = document.getElementById("nuevoTecnico");
  const btnReasignar = document.getElementById("btnReasignar");
  const btnCerrarTicket = document.getElementById("btnCerrarTicket");

  const accionesNormales = document.getElementById("accionesNormales");
  const accionesCerrado = document.getElementById("accionesCerrado");
  const btnReimprimir = document.getElementById("btnReimprimir");

  /* Modal */
  const modalSolucion = document.getElementById("modalSolucion");
  const textoSolucion = document.getElementById("textoSolucion");
  const btnGuardarSolucion = document.getElementById("btnGuardarSolucion");
  const btnCancelarModal = document.getElementById("btnCancelarModal");

  /* Toasts */
  const toastContainer = document.getElementById("toastContainer");

  /* Estado */
  let ticketId = null;
  let currentUser = null;
  let ticketData = null;

  /* ===== Helpers ===== */
  function showToast(msg, type = "info") {
    const div = document.createElement("div");
    div.className = `toast ${type}`;
    div.textContent = msg;
    toastContainer.appendChild(div);
    setTimeout(() => div.remove(), 4000);
  }

  function getTicketId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("id");
  }

  async function logAccion(usuario, accion) {
    try {
      await addDoc(collection(db, "bitacora"), {
        usuario,
        accion,
        fecha: serverTimestamp()
      });
    } catch (err) {
      console.error("⚠️ Error al registrar en bitácora:", err);
    }
  }

  /* ===== Sesión ===== */
  import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";

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
    cargarTecnicos();
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
          <p><b>Departamento:</b> ${t.departamento || "Sin departamento"}</p>
          <p><b>Prioridad:</b> ${t.prioridad || "Sin prioridad"}</p>
          <p><b>Estado:</b> ${t.estado || "desconocido"}</p>
          <p><b>Asignado a:</b> ${t.tecnicoAsignado || "Sin asignar"}</p>
          <p><b>Fecha:</b> ${t.fecha?.toDate ? t.fecha.toDate().toLocaleString() : "Sin fecha"}</p>
          ${t.solucion ? `<p><b>Solución:</b> ${t.solucion}</p>` : ""}
        </div>
      `;

      // 📌 Controlar interfaz según estado
      if ((t.estado || "").toLowerCase() === "cerrado") {
        accionesNormales.style.display = "none";
        accionesCerrado.style.display = "block";

        // bloquear comentarios
        textoComentario.disabled = true;
        btnAgregarComentario.disabled = true;

        btnReimprimir.onclick = async () => {
          const snap = await getDoc(doc(db, "tickets", ticketId));
          if (snap.exists()) {
            const data = { id: ticketId, ...snap.data() };
            await generarPDFTicket(data, data.solucion || "");
          } else {
            showToast("⚠️ No se pudo cargar el ticket para imprimir", "error");
          }
        };
      } else {
        accionesNormales.style.display = "block";
        accionesCerrado.style.display = "none";

        textoComentario.disabled = false;
        btnAgregarComentario.disabled = false;
      }
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
                        <small>${c.fecha?.toDate().toLocaleString() || "-"}</small>`;
        listaComentarios.appendChild(div);
      });
    });
  }

  btnAgregarComentario.addEventListener("click", async () => {
    const texto = textoComentario.value.trim();
    if (!texto) return;
    await addDoc(collection(db, "tickets", ticketId, "comentarios"), {
      usuario: currentUser.email,
      texto,
      fecha: serverTimestamp()
    });
    await logAccion(currentUser.email, `Comentó en ticket #${ticketId}`);
    textoComentario.value = "";
  });

  /* ===== Cargar técnicos ===== */
  async function cargarTecnicos() {
    try {
      const snap = await getDocs(collection(db, "usuarios"));
      nuevoTecnico.innerHTML = "";
      snap.forEach((docSnap) => {
        const u = docSnap.data();
        if (u.rol === "Administrador" || u.rol === "Tecnico") {
          const opt = document.createElement("option");
          opt.value = u.correo;
          opt.textContent = `${u.nombre} (${u.correo})`;
          nuevoTecnico.appendChild(opt);
        }
      });
    } catch (err) {
      console.error("Error al cargar técnicos:", err);
    }
  }

  btnReasignar.addEventListener("click", async () => {
    const correo = nuevoTecnico.value;
    if (!correo) return;
    try {
      await updateDoc(doc(db, "tickets", ticketId), { tecnicoAsignado: correo });
      await logAccion(currentUser.email, `Reasignó ticket #${ticketId} a ${correo}`);
      showToast("✅ Ticket reasignado correctamente", "success");
      window.location.href = "mis_tickets.html";
    } catch (err) {
      console.error(err);
      showToast("⚠️ Error al reasignar ticket", "error");
    }
  });

  /* ===== Cerrar ticket con solución ===== */
  btnCerrarTicket.addEventListener("click", () => {
    textoSolucion.value = "";
    modalSolucion.style.display = "flex";
  });

  btnCancelarModal.addEventListener("click", () => {
    modalSolucion.style.display = "none";
  });

  btnGuardarSolucion.addEventListener("click", async () => {
    const solucion = textoSolucion.value.trim();
    if (!solucion) {
      alert("⚠️ Debes escribir la solución.");
      return;
    }

    try {
      await updateDoc(doc(db, "tickets", ticketId), {
        estado: "Cerrado",
        solucion,
        fechaCierre: serverTimestamp()
      });

      await addDoc(collection(db, "tickets", ticketId, "comentarios"), {
        usuario: currentUser.email,
        texto: `SOLUCIÓN: ${solucion}`,
        fecha: serverTimestamp()
      });

      await logAccion(currentUser.email, `Cerró el ticket #${ticketId}`);

      modalSolucion.style.display = "none";
      showToast("✅ Ticket cerrado con solución", "success");

      // Generar PDF inmediatamente
      await generarPDFTicket(ticketData, solucion);

      cargarDetalle(ticketId);
    } catch (err) {
      console.error(err);
      showToast("⚠️ Error al cerrar ticket", "error");
    }
  });

  /* ===== PDF ===== */
  async function generarPDFTicket(t, solucionTexto) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("p", "mm", "a4");
    const pageWidth = doc.internal.pageSize.getWidth();

    // Logo
    const logo = await toBase64("assets/logo.jpg").catch(() => null);
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
      columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: pageWidth - 55 - 20 } },
      margin: { left: 10, right: 10 }
    });

    // Datos de mantenimiento
    const ahora = new Date();
    const fechaInicio = t.fechaPrimerRespuesta?.toDate?.().toLocaleString?.() || "-";
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

