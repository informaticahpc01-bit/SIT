import { auth, db } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* ====== DOM ====== */
const btnLogout = document.querySelector(".btn-logout");
const listaTickets = document.getElementById("listaTickets");

// Filtros
const buscarTexto = document.getElementById("buscarTexto");
const filtroEstado = document.getElementById("filtroEstado");
const filtroPrioridad = document.getElementById("filtroPrioridad");
const filtroFecha = document.getElementById("filtroFecha");
const fechaInicio = document.getElementById("fechaInicio");
const fechaFin = document.getElementById("fechaFin");
const btnReset = document.getElementById("btnReset");

let allTickets = []; // Tickets originales

/* ====== Helpers ====== */
function tsToMillis(v) {
  if (!v) return null;
  if (typeof v.toMillis === "function") return v.toMillis();
  if (typeof v === "object" && "seconds" in v) {
    return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  }
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function formatDate(ms) {
  if (!ms) return "Sin fecha";
  return new Date(ms).toLocaleString("es-HN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ===================================================
   🎨 Renderizado de Tickets en Tarjetas (Cards)
=================================================== */
function renderTickets(tickets) {
  listaTickets.innerHTML = "";

  if (!tickets.length) {
    listaTickets.innerHTML = `<p class="empty">⚠️ No se encontraron tickets con los filtros aplicados</p>`;
    return;
  }

  tickets.forEach((t) => {
    const fechaMs = tsToMillis(t.fecha);
    const fechaTxt = fechaMs ? formatDate(fechaMs) : "Sin fecha";

    // ✅ Crear contenedor principal con clase de tarjeta
    const div = document.createElement("div");
    div.classList.add("ticket-card");

    // ✅ Estructura visual tipo tarjeta (compatible con CSS moderno)
    div.innerHTML = `
      <div class="ticket-header">
        <h3>${t.asunto || "Sin asunto"}</h3>
        <span class="estado ${t.estado?.toLowerCase() || ""}">
          ${t.estado || "—"}
        </span>
      </div>

      <div class="ticket-body">
        <p><strong>Descripción:</strong> ${t.descripcion || "Sin descripción"}</p>
        <p><strong>Prioridad:</strong> ${t.prioridad || "No definida"}</p>
        <p><strong>Departamento:</strong> ${t.departamento || "General"}</p>
      </div>

      <div class="ticket-footer">
        <small>📅 <b>Creado:</b> ${fechaTxt}</small>
        <button class="btn-detalles" data-id="${t.id}">📄 Detalles</button>
      </div>
    `;

    // ✅ Agregar animación suave (fade-in)
    div.style.opacity = "0";
    div.style.transform = "translateY(10px)";
    listaTickets.appendChild(div);

    // Pequeña animación al insertar
    requestAnimationFrame(() => {
      div.style.transition = "all 0.4s ease";
      div.style.opacity = "1";
      div.style.transform = "translateY(0)";
    });
  });

  // ✅ Eventos de los botones de detalles
  document.querySelectorAll(".btn-detalles").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const id = e.currentTarget.dataset.id;
      window.location.href = `detalle_ticket_cliente.html?id=${id}`;
    });
  });
}

/* ===================================================
   🔎 Filtros dinámicos
=================================================== */
function aplicarFiltros() {
  let filtrados = [...allTickets];

  // 🚫 Quitar eliminados
  filtrados = filtrados.filter(
    (t) => (t.estado || "").toLowerCase() !== "eliminado"
  );

  // 🔎 Texto
  const texto = buscarTexto.value.toLowerCase().trim();
  if (texto) {
    filtrados = filtrados.filter(
      (t) =>
        (t.asunto || "").toLowerCase().includes(texto) ||
        (t.descripcion || "").toLowerCase().includes(texto)
    );
  }

  // Estado
  const est = filtroEstado.value;
  if (est !== "todos") {
    filtrados = filtrados.filter(
      (t) => (t.estado || "").toLowerCase() === est
    );
  }

  // Prioridad
  const pri = filtroPrioridad.value;
  if (pri !== "todas") {
    filtrados = filtrados.filter(
      (t) => (t.prioridad || "").toLowerCase() === pri
    );
  }

  // Fecha
  const hoy = new Date();
  if (filtroFecha.value === "hoy") {
    filtrados = filtrados.filter((t) => {
      const ms = tsToMillis(t.fecha);
      return ms && new Date(ms).toDateString() === hoy.toDateString();
    });
  } else if (filtroFecha.value === "semana") {
    const ini = new Date();
    ini.setDate(hoy.getDate() - 7);
    filtrados = filtrados.filter((t) => {
      const ms = tsToMillis(t.fecha);
      return ms && ms >= ini.getTime();
    });
  } else if (filtroFecha.value === "mes") {
    const ini = new Date();
    ini.setMonth(hoy.getMonth() - 1);
    filtrados = filtrados.filter((t) => {
      const ms = tsToMillis(t.fecha);
      return ms && ms >= ini.getTime();
    });
  } else if (filtroFecha.value === "personalizado") {
    let ini = null;
    let fin = null;

    if (fechaInicio.value) {
      const [y, m, d] = fechaInicio.value.split("-").map(Number);
      ini = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
    }
    if (fechaFin.value) {
      const [y, m, d] = fechaFin.value.split("-").map(Number);
      fin = new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
    }

    if (ini && !fin) fin = new Date(ini).setHours(23, 59, 59, 999);
    if (!ini && fin) ini = new Date(fin).setHours(0, 0, 0, 0);

    filtrados = filtrados.filter((t) => {
      const ms = tsToMillis(t.fecha);
      if (!ms) return false;
      if (ini && ms < ini) return false;
      if (fin && ms > fin) return false;
      return true;
    });
  }

  // === Ordenar ===
  const ordenEstado = { pendiente: 1, proceso: 2, cerrado: 3 };
  filtrados.sort((a, b) => {
    const estadoA = ordenEstado[(a.estado || "").toLowerCase()] || 99;
    const estadoB = ordenEstado[(b.estado || "").toLowerCase()] || 99;
    if (estadoA !== estadoB) return estadoA - estadoB;

    const fechaA = tsToMillis(a.fecha) || 0;
    const fechaB = tsToMillis(b.fecha) || 0;
    return fechaB - fechaA;
  });

  renderTickets(filtrados);
}

/* ===================================================
   🚪 Cerrar sesión
=================================================== */
if (btnLogout) {
  btnLogout.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}

/* ===================================================
   🔐 Autenticación y carga de datos
=================================================== */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const userEmail = user.email.toLowerCase().trim();
  const q = query(collection(db, "tickets"), where("creadoPor", "==", userEmail));

  onSnapshot(q, (snap) => {
    allTickets = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    aplicarFiltros(); // render inicial
  });
});

/* ===================================================
   ⚙️ Eventos dinámicos
=================================================== */
if (buscarTexto) buscarTexto.addEventListener("input", aplicarFiltros);
[filtroEstado, filtroPrioridad, filtroFecha, fechaInicio, fechaFin].forEach((el) => {
  if (el) el.addEventListener("change", aplicarFiltros);
});

if (btnReset) {
  btnReset.addEventListener("click", () => {
    buscarTexto.value = "";
    filtroEstado.value = "todos";
    filtroPrioridad.value = "todas";
    filtroFecha.value = "todas";
    fechaInicio.value = "";
    fechaFin.value = "";
    fechaInicio.style.display = "none";
    fechaFin.style.display = "none";
    aplicarFiltros();
  });
}

if (filtroFecha) {
  filtroFecha.addEventListener("change", () => {
    if (filtroFecha.value === "personalizado") {
      fechaInicio.style.display = "inline-block";
      fechaFin.style.display = "inline-block";
    } else {
      fechaInicio.style.display = "none";
      fechaFin.style.display = "none";
    }
  });
}
