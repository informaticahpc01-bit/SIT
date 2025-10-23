import { auth, db } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* =========================
   Refs y estado
========================= */
const btnLogout = document.getElementById("btnLogout");
const userNameEl = document.getElementById("userName");
const listaTickets = document.getElementById("listaTickets");
const chatTitulo = document.getElementById("chatTitulo");
const chatBox = document.getElementById("chatBox");
const mensajeInput = document.getElementById("mensajeInput");
const btnEnviar = document.getElementById("btnEnviar");
const btnAdjunto = document.getElementById("btnAdjunto");
const fileInput = document.getElementById("fileInput");
const previewArea = document.getElementById("previewArea");

const btnDetalles = document.getElementById("btnDetalles");
const detallePanel = document.getElementById("detallePanel");
const cerrarDetalle = document.getElementById("cerrarDetalle");
const detalleContenido = document.getElementById("detalleContenido");

let currentUser = null;
let ticketSeleccionado = null;
let estadoTicketSeleccionado = null;
let pendingFile = null; // { nombre, tipo, base64 }

/* =========================
   Utils
========================= */
const toDate = (v) => {
  if (!v) return null;
  try {
    if (typeof v?.toDate === "function") return v.toDate();
    if (v instanceof Date) return v;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

function formatHora(ms) {
  return new Date(ms).toLocaleTimeString("es-HN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDia(ms) {
  const hoy = new Date();
  const fecha = new Date(ms);
  if (fecha.toDateString() === hoy.toDateString()) return "Hoy";
  hoy.setDate(hoy.getDate() - 1);
  if (fecha.toDateString() === hoy.toDateString()) return "Ayer";
  return fecha.toLocaleDateString("es-HN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/* =========================
   Sesión
========================= */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUser = user;
  userNameEl.textContent = user.email;
  cargarTickets();
});

btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

/* =========================
   Tickets en tiempo real
========================= */
function cargarTickets() {
  // Solo escuchar los tickets del usuario autenticado
  const qTick = query(
    collection(db, "tickets"),
    where("creadoPor", "==", currentUser.email) // 👈 ajusta el campo según tu estructura
  );

  onSnapshot(qTick, (snap) => {
    let tickets = [];

    if (snap.empty) {
      listaTickets.innerHTML = `<p class="empty">No hay tickets</p>`;
      return;
    }

    snap.forEach((ds) => {
      const t = { id: ds.id, ...ds.data() };
      if ((t.estado || "").toLowerCase() === "eliminado") return;

      // escuchar los mensajes de cada ticket individual del usuario
      const qChat = collection(db, "tickets", t.id, "chat");
      onSnapshot(qChat, (chatSnap) => {
        let noLeidos = 0;
        let ultimo = "";
        let fechaUltimo = null;

        chatSnap.forEach((mDoc) => {
          const m = mDoc.data();
          if (!(m.leidoPor || []).includes(currentUser.email)) noLeidos++;
          if (!fechaUltimo || toDate(m.fecha) > fechaUltimo) {
            fechaUltimo = toDate(m.fecha);
            ultimo = m.mensaje || (m.tipo === "imagen" ? "🖼 Imagen" : "");
          }
        });

        const idx = tickets.findIndex((x) => x.id === t.id);
        if (idx >= 0) {
          tickets[idx] = { ...tickets[idx], noLeidos, ultimo, fechaUltimo };
        } else {
          tickets.push({ ...t, noLeidos, ultimo, fechaUltimo });
        }

        renderTickets(tickets);
      });
    });
  });
}


function renderTickets(tickets) {
  listaTickets.innerHTML = "";

  tickets.sort((a, b) => {
    const fechaA = a.fechaUltimo ? a.fechaUltimo.getTime() : 0;
    const fechaB = b.fechaUltimo ? b.fechaUltimo.getTime() : 0;

    if ((a.estado || "").toLowerCase() === "cerrado" && (b.estado || "").toLowerCase() !== "cerrado") return 1;
    if ((b.estado || "").toLowerCase() === "cerrado" && (a.estado || "").toLowerCase() !== "cerrado") return -1;

    return fechaB - fechaA;
  });

  tickets.forEach((t) => {
    const div = document.createElement("div");
    div.className = "ticket-item";
    if ((t.estado || "").toLowerCase() === "cerrado") div.classList.add("cerrado");

    div.innerHTML = `
      <div class="ticket-top">
        <span class="ticket-asunto">
          #${t.numero || t.id} — ${t.asunto || "(sin asunto)"}
          ${(t.estado || "").toLowerCase() === "cerrado" ? `<span class="tag-cerrado">CERRADO</span>` : ""}
        </span>
        <small>${t.fechaUltimo ? formatHora(t.fechaUltimo) : ""}</small>
      </div>
      <div class="ticket-bottom">
        <span class="preview">${t.ultimo || "Sin mensajes"}</span>
        ${t.noLeidos > 0 ? `<span class="badge">${t.noLeidos}</span>` : ""}
      </div>
    `;

    div.addEventListener("click", () => seleccionarTicket(div, t));
    listaTickets.appendChild(div);
  });
}

/* =========================
   Selección de ticket
========================= */
function seleccionarTicket(el, t) {
  document.querySelectorAll(".ticket-item").forEach((x) => x.classList.remove("active"));
  el.classList.add("active");

  ticketSeleccionado = t.id;
  estadoTicketSeleccionado = (t.estado || "").toLowerCase();
  chatTitulo.textContent = `Chat — Ticket #${t.numero || t.id}`;

  const bloqueado = estadoTicketSeleccionado === "cerrado";
  mensajeInput.disabled = bloqueado;
  btnEnviar.disabled = bloqueado;
  btnAdjunto.disabled = bloqueado;
  fileInput.disabled = bloqueado;

  cargarChat(t.id);
  marcarMensajesLeidos(t.id);

  const badge = el.querySelector(".badge");
  if (badge) badge.remove();
}

/* =========================
   Chat tiempo real
========================= */
function cargarChat(ticketId) {
  const qChat = collection(db, "tickets", ticketId, "chat");

  onSnapshot(qChat, (snap) => {
    chatBox.innerHTML = "";

    let mensajes = [];
    snap.forEach((ds) => mensajes.push({ id: ds.id, ...ds.data() }));

    mensajes.sort((a, b) => {
      const fa = toDate(a.fecha)?.getTime() || 0;
      const fb = toDate(b.fecha)?.getTime() || 0;
      return fa - fb;
    });

    let diaActual = "";
    mensajes.forEach((m) => {
      const fechaMs = toDate(m.fecha)?.getTime();
      const dia = fechaMs ? formatDia(fechaMs) : "";

      if (dia && dia !== diaActual) {
        diaActual = dia;
        const sep = document.createElement("div");
        sep.className = "day-separator";
        sep.textContent = dia;
        chatBox.appendChild(sep);
      }

      const div = document.createElement("div");
      div.className = "chat-msg " + (m.usuario === currentUser.email ? "user" : "other");

      let contenido = m.mensaje ?? "";

      // 👇 Mostrar imágenes recibidas (url o base64)
      if (m.tipo === "imagen" || m.tipo === "texto+imagen") {
        if (m.imagen?.base64) {
          contenido = `
            <div>${m.mensaje || ""}</div>
            <img src="${m.imagen.base64}" class="chat-img" alt="imagen"/>
          `;
        } else if (m.url) {
          contenido = `
            <div>${m.mensaje || ""}</div>
            <img src="${m.url}" class="chat-img" alt="imagen"/>
          `;
        } else {
          contenido = `<div>🖼 Imagen recibida (sin vista previa)</div>`;
        }
      }

      let checkText = "✓";
      let checkClass = "";
      if ((m.leidoPor || []).includes(currentUser.email)) checkText = "✓✓";
      if ((m.leidoPor || []).length > 1) {
        checkText = "✓✓";
        checkClass = "azul";
      }

      div.innerHTML = `
        <div class="msg-bubble">
          <div class="msg-text">${contenido}</div>
          <div class="msg-meta">
            ${toDate(m.fecha)?.toLocaleTimeString("es-HN",{hour:"2-digit",minute:"2-digit"}) || ""} 
            <span class="checks ${checkClass}">${checkText}</span>
          </div>
        </div>
      `;
      chatBox.appendChild(div);
    });

    chatBox.scrollTop = chatBox.scrollHeight;
  });
}


/* =========================
   Enviar mensajes
========================= */
async function enviarMensaje() {
  if (!ticketSeleccionado || estadoTicketSeleccionado === "cerrado") return;
  if (!mensajeInput.value.trim() && !pendingFile) return;

  let tipo = "texto";
  let mensajeData = {
    usuario: currentUser.email,
    fecha: serverTimestamp(),
    leidoPor: [currentUser.email]
  };

  if (pendingFile && mensajeInput.value.trim()) {
    tipo = "texto+imagen";
    mensajeData = {
      ...mensajeData,
      mensaje: mensajeInput.value.trim(),
      tipo,
      imagen: { base64: pendingFile.base64 }
    };
  } else if (pendingFile) {
    tipo = "imagen";
    mensajeData = {
      ...mensajeData,
      mensaje: "",
      tipo,
      imagen: { base64: pendingFile.base64 }
    };
  } else {
    tipo = "texto";
    mensajeData = {
      ...mensajeData,
      mensaje: mensajeInput.value.trim(),
      tipo
    };
  }

  await addDoc(collection(db, "tickets", ticketSeleccionado, "chat"), mensajeData);

  // limpiar
  mensajeInput.value = "";
  previewArea.innerHTML = "";
  pendingFile = null;
  fileInput.value = "";
}

btnEnviar.addEventListener("click", () => enviarMensaje());
mensajeInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    enviarMensaje();
  }
});

/* =========================
   Adjuntos (solo imágenes con preview)
========================= */
btnAdjunto.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    alert("❌ Solo se permiten imágenes.");
    fileInput.value = "";
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result;

    pendingFile = { nombre: file.name, tipo: "imagen", base64 };

    previewArea.innerHTML = `
      <div class="preview-item">
        <img src="${base64}" alt="preview" class="preview-img" />
        <button class="remove-preview">✖</button>
      </div>
    `;

    previewArea.querySelector(".remove-preview").addEventListener("click", () => {
      previewArea.innerHTML = "";
      pendingFile = null;
      fileInput.value = "";
    });
  };

  reader.readAsDataURL(file);
});

/* =========================
   Indicador escribiendo
========================= */
mensajeInput.addEventListener("input", async () => {
  if (!ticketSeleccionado) return;
  await setDoc(doc(db, "tickets", ticketSeleccionado, "typing", currentUser.uid), {
    usuario: currentUser.email,
    escribiendo: mensajeInput.value.length > 0,
    fecha: serverTimestamp()
  });
});

function escucharTyping(ticketId) {
  const qTyping = collection(db, "tickets", ticketId, "typing");
  onSnapshot(qTyping, (snap) => {
    const typingUsers = [];
    snap.forEach((ds) => {
      const d = ds.data();
      if (d.usuario !== currentUser.email && d.escribiendo) typingUsers.push(d.usuario);
    });

    let typingEl = document.getElementById("typingIndicator");
    if (!typingEl) {
      typingEl = document.createElement("div");
      typingEl.id = "typingIndicator";
      typingEl.className = "typing";
      chatBox.parentNode.insertBefore(typingEl, chatBox.nextSibling);
    }
    typingEl.textContent = typingUsers.length ? `${typingUsers.join(", ")} está escribiendo...` : "";
  });
}

/* =========================
   Marcar mensajes leídos
========================= */
function marcarMensajesLeidos(ticketId) {
  const qChat = collection(db, "tickets", ticketId, "chat");
  onSnapshot(qChat, (snap) => {
    snap.forEach(async (ds) => {
      const m = ds.data();
      if (!(m.leidoPor || []).includes(currentUser.email)) {
        await updateDoc(doc(db, "tickets", ticketId, "chat", ds.id), {
          leidoPor: arrayUnion(currentUser.email),
        });
      }
    });
  });

  escucharTyping(ticketId);
}

/* =========================
   Panel detalles
========================= */
btnDetalles.addEventListener("click", async () => {
  if (!ticketSeleccionado) return;
  detallePanel.classList.remove("hidden");

  const snap = await getDoc(doc(db, "tickets", ticketSeleccionado));
  if (!snap.exists()) {
    detalleContenido.innerHTML = "<p>❌ Ticket no encontrado</p>";
    return;
  }
  const t = snap.data();

  detalleContenido.innerHTML = `
    <div class="detalle-grid">
      <div class="detalle-item"><h4>Asunto</h4><p>${t.asunto || "-"}</p></div>
      <div class="detalle-item"><h4>Descripción</h4><p>${t.descripcion || "-"}</p></div>
      <div class="detalle-item"><h4>Departamento</h4><p>${t.departamento || "-"}</p></div>
      <div class="detalle-item"><h4>Estado</h4><p>${t.estado || "-"}</p></div>
      <div class="detalle-item"><h4>Prioridad</h4><p>${t.prioridad || "Sin asignar"}</p></div>
      <div class="detalle-item"><h4>Fecha</h4><p>${toDate(t.fecha)?.toLocaleString("es-HN") || "-"}</p></div>
    </div>
  `;
});

cerrarDetalle.addEventListener("click", () => {
  detallePanel.classList.add("hidden");
});

/* =========================
   Bloquear botones al inicio
========================= */
function bloquearInputsInicial() {
  mensajeInput.disabled = true;
  btnEnviar.disabled = true;
  btnAdjunto.disabled = true;
  fileInput.disabled = true;
}
bloquearInputsInicial();
