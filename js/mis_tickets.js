import { auth, db } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  collection,
  query,
  where,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* ==== Referencias DOM ==== */
const btnLogout = document.querySelector(".btn-logout");
const lista = document.getElementById("listaMisTickets");

const buscarTexto = document.getElementById("buscarTexto");
const filtroEstado = document.getElementById("filtroEstado");
const filtroPrioridad = document.getElementById("filtroPrioridad");
const filtroFecha = document.getElementById("filtroFecha");
const fechaInicio = document.getElementById("fechaInicio");
const fechaFin = document.getElementById("fechaFin");

const btnReset = document.getElementById("btnReset");

let tecnicoEmail = "";
let todosLosTickets = [];

/* ==== Cerrar sesión ==== */
btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

/* ==== Sesión ==== */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  tecnicoEmail = user.email.toLowerCase().trim();
  await cargarTickets();
});

/* ==== Cargar tickets del técnico ==== */
async function cargarTickets() {
  const ticketsRef = collection(db, "tickets");

  const q = query(
    ticketsRef,
    where("tecnicoAsignado", "==", tecnicoEmail)
  );

  const snap = await getDocs(q);

  todosLosTickets = snap.docs
    .map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        tecnicoAsignado: (data.tecnicoAsignado || "").toLowerCase().trim()
      };
    })
    .filter(t => (t.estado || "").toLowerCase().trim() !== "eliminado");

  aplicarFiltros();
}

/* ==== Aplicar filtros ==== */
function aplicarFiltros() {
  const texto = (buscarTexto?.value || "").toLowerCase();
  const estadoSel = filtroEstado?.value || "todos";
  const prioridadSel = filtroPrioridad?.value || "todas";
  const fechaSel = filtroFecha?.value || "todas";

  let filtrados = todosLosTickets.filter(t => {
    const coincideTexto =
      (t.asunto || "").toLowerCase().includes(texto) ||
      (t.descripcion || "").toLowerCase().includes(texto);

    const coincideEstado =
      estadoSel === "todos" || (t.estado || "").toLowerCase().trim() === estadoSel;

    const coincidePrioridad =
      prioridadSel === "todas" || (t.prioridad || "").toLowerCase().trim() === prioridadSel;

    let coincideFecha = true;
    if (t.fecha?.toDate) {
      const fechaTicket = t.fecha.toDate();
      const hoy = new Date();
      let inicio, fin;

      if (fechaSel === "hoy") {
        inicio = new Date(); inicio.setHours(0, 0, 0, 0);
        fin = new Date(); fin.setHours(23, 59, 59, 999);
      } else if (fechaSel === "semana") {
        const primerDia = new Date(hoy);
        primerDia.setDate(hoy.getDate() - hoy.getDay());
        inicio = new Date(primerDia.setHours(0, 0, 0, 0));
        fin = new Date(inicio);
        fin.setDate(inicio.getDate() + 6);
        fin.setHours(23, 59, 59, 999);
      } else if (fechaSel === "mes") {
        inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1, 0, 0, 0, 0);
        fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59, 999);
      } else if (fechaSel === "personalizado" && fechaInicio.value && fechaFin.value) {
        inicio = new Date(fechaInicio.value + "T00:00:00");
        fin = new Date(fechaFin.value + "T23:59:59");
      }

      if (inicio && fin) {
        coincideFecha = fechaTicket >= inicio && fechaTicket <= fin;
      }
    }

    return coincideTexto && coincideEstado && coincidePrioridad && coincideFecha;
  });

  // 📌 Reordenar según estado y fecha
  const pendientes = filtrados
    .filter(t => (t.estado || "").toLowerCase().trim() === "pendiente")
    .sort((a, b) => b.fecha.toDate() - a.fecha.toDate());

  const enProceso = filtrados
    .filter(t => (t.estado || "").toLowerCase().trim() === "proceso")
    .sort((a, b) => b.fecha.toDate() - a.fecha.toDate());

  const cerrados = filtrados
    .filter(t => (t.estado || "").toLowerCase().trim() === "cerrado")
    .sort((a, b) => b.fecha.toDate() - a.fecha.toDate());

  const ordenados = [...pendientes, ...enProceso, ...cerrados];

  renderTickets(ordenados);
}

/* ==== Renderizar tickets ==== */
function renderTickets(tickets) {
  lista.innerHTML = "";
  if (tickets.length === 0) {
    lista.innerHTML = `<p class="empty">No se encontraron tickets con los filtros</p>`;
    return;
  }

  tickets.forEach(t => {
    const asunto = t.asunto || "Sin asunto";
    const descripcion = t.descripcion || "Sin descripción";
    const departamento = t.departamento || "Sin departamento";
    const prioridad = t.prioridad || "Sin prioridad";
    const estado = (t.estado || "desconocido").toLowerCase();
    const fecha = t.fecha?.toDate ? t.fecha.toDate().toLocaleString() : "Sin fecha";

    const div = document.createElement("div");
    div.classList.add("ticket");

    div.innerHTML = `
      <h3>${asunto}</h3>
      <p>${descripcion}</p>
      <span><b>Departamento:</b> ${departamento}</span><br>
      <span><b>Prioridad:</b> ${prioridad}</span><br>
      <span><b>Fecha:</b> ${fecha}</span><br>
      <span class="estado ${estado}">
        ${estado.charAt(0).toUpperCase() + estado.slice(1)}
      </span><br>
      <button class="btn-detalles" data-id="${t.id}">📄 Detalles</button>
    `;

    lista.appendChild(div);
  });

  /* ==== Evento para botones Detalles ==== */
  document.querySelectorAll(".btn-detalles").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idTicket = e.target.dataset.id;
      window.location.href = `detalle_ticket.html?id=${idTicket}`;
    });
  });
}

/* ==== Eventos de filtros ==== */
[buscarTexto, filtroEstado, filtroPrioridad, filtroFecha, fechaInicio, fechaFin].forEach(el =>
  el?.addEventListener("input", () => aplicarFiltros())
);

filtroFecha?.addEventListener("change", () => {
  if (filtroFecha.value === "personalizado") {
    fechaInicio.style.display = "block";
    fechaFin.style.display = "block";
  } else {
    fechaInicio.style.display = "none";
    fechaFin.style.display = "none";
  }
});

btnReset?.addEventListener("click", () => {
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
