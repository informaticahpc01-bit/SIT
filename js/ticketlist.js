import { auth, db } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// ---------- Referencias ----------
const btnLogout = document.getElementById("btnLogout");
const filtroCampo = document.getElementById("filtroCampo");
const buscarTicket = document.getElementById("buscarTicket");
const tabBtns = document.querySelectorAll(".tab-btn");

const tabContainers = {
  todos: document.getElementById("tab-todos"),
  pendiente: document.getElementById("tab-pendiente"),
  proceso: document.getElementById("tab-proceso"),
  cerrado: document.getElementById("tab-cerrado"),
  eliminado: document.getElementById("tab-eliminado"),
};

const paginador = document.getElementById("paginador");

// Modales
const modalTecnico = document.getElementById("modalTecnico");
const tecnicoSelect = document.getElementById("tecnicoSelect");
const prioridadSelect = document.getElementById("prioridadSelect");
const btnAsignar = document.getElementById("btnAsignar");
const btnCancelar = document.getElementById("btnCancelar");

let ticketsCache = [];
let ticketEnEdicion = null;

// Paginación
let paginaActual = 1;
const ticketsPorPagina = 30;
let totalPaginas = 1;

// ---------- Utilidad ----------
function normalizarTexto(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ---------- Bitácora ----------
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

// ---------- Sesión ----------
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    cargarTickets();
  }
});

btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// ---------- Escuchar tickets ----------
function cargarTickets() {
  const q = query(collection(db, "tickets"), orderBy("fecha", "desc"));
  onSnapshot(q, (snapshot) => {
    ticketsCache = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTickets();
  });
}

// ---------- Ordenar ----------
function ordenarTickets(lista) {
  const ordenEstado = { pendiente: 1, proceso: 2, cerrado: 3, eliminado: 4 };
  const ordenPrioridad = { critica: 1, alta: 2, media: 3, baja: 4 };

  return lista.sort((a, b) => {
    // Primero por estado
    const estadoA = ordenEstado[normalizarTexto(a.estado)] || 99;
    const estadoB = ordenEstado[normalizarTexto(b.estado)] || 99;
    if (estadoA !== estadoB) return estadoA - estadoB;

    // Luego por prioridad (solo en pendientes/proceso/cerrado)
    const prioA = ordenPrioridad[normalizarTexto(a.prioridad)] || 99;
    const prioB = ordenPrioridad[normalizarTexto(b.prioridad)] || 99;
    if (prioA !== prioB) return prioA - prioB;

    // Finalmente por fecha
    return (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0);
  });
}

// ---------- Crear tarjeta ----------
function crearTicketCard(t) {
  const div = document.createElement("div");
  div.className = "ticket-card";
  div.innerHTML = `
    <div class="ticket-header">
      <h3>#${t.numero || "?"} - ${t.asunto}</h3>
      <span class="badge ${normalizarTexto(t.estado)}">${t.estado}</span>
    </div>
    <div class="ticket-body">
      <p>${t.descripcion || ""}</p>
      <p><strong>Depto:</strong> ${t.departamento || "N/A"}</p>
      <p><strong>Categoría:</strong> ${t.categoria || "N/A"}</p>
      <p><strong>Prioridad:</strong> 
        <span class="badge-prioridad ${normalizarTexto(t.prioridad)}">
          ${t.prioridad || "No asignada"}
        </span>
      </p>
      <p><strong>Técnico:</strong> ${t.tecnicoAsignado || "No asignado"}</p>
      <p><strong>Creado por:</strong> ${t.creadoPor || "?"}</p>
    </div>
    <div class="ticket-actions">
      ${
        normalizarTexto(t.estado) === "eliminado"
          ? `<button class="btn-action delete-final">❌ Eliminar definitivo</button>`
          : `<button class="btn-action delete">🗑️ Eliminar</button>
             <button class="btn-action assign">👨‍🔧 Asignar</button>`
      }
    </div>
  `;

  // Click abre detalle
  if (normalizarTexto(t.estado) !== "eliminado") {
    div.addEventListener("click", (e) => {
      if (!e.target.closest(".btn-action")) {
        window.location.href = `ticket_detalle.html?id=${t.id}`;
      }
    });
  }

  // Botón eliminar
  const btnDel = div.querySelector(".delete");
  if (btnDel) {
    btnDel.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (confirm("¿Eliminar este ticket?")) {
        try {
          await updateDoc(doc(db, "tickets", t.id), { estado: "eliminado" });
          await logAccion(auth.currentUser.email, `Eliminó ticket #${t.numero}`);
        } catch (err) {
          console.error("⚠️ Error al eliminar ticket:", err);
          alert("No se pudo eliminar el ticket. Revisa la consola.");
        }
      }
    });
  }

// Botón eliminar definitivo (con subcolecciones)
const btnDelFinal = div.querySelector(".delete-final");
if (btnDelFinal) {
  btnDelFinal.addEventListener("click", async (e) => {
    e.stopPropagation();
    if (confirm("⚠️ Esta acción borrará el ticket y TODAS sus sub-colecciones. ¿Deseas continuar?")) {
      try {
        await eliminarTicketConSubcolecciones(t.id);
        await logAccion(auth.currentUser.email, `Eliminó DEFINITIVAMENTE ticket #${t.numero}`);
      } catch (err) {
        console.error("⚠️ Error al eliminar definitivamente:", err);
        alert("No se pudo eliminar el ticket definitivamente. Revisa la consola.");
      }
    }
  });
}

  // Botón asignar
  const btnAssign = div.querySelector(".assign");
  if (btnAssign) {
    btnAssign.addEventListener("click", (e) => {
      e.stopPropagation();
      abrirModalAsignar(t);
    });
  }

  return div;
}

// ---------- Render ----------
function renderTickets() {
  Object.values(tabContainers).forEach((c) => (c.innerHTML = ""));

  let filtro = filtroCampo.value;
  let texto = normalizarTexto(buscarTicket.value);

  let listaFiltrada = ticketsCache.filter(
    (t) => !texto || normalizarTexto(t[filtro]).includes(texto)
  );

  listaFiltrada = ordenarTickets(listaFiltrada);

  totalPaginas = Math.ceil(listaFiltrada.length / ticketsPorPagina) || 1;
  if (paginaActual > totalPaginas) paginaActual = totalPaginas;

  const inicio = (paginaActual - 1) * ticketsPorPagina;
  const fin = inicio + ticketsPorPagina;
  const listaPagina = listaFiltrada.slice(inicio, fin);

  listaPagina.forEach((t) => {
    const estado = normalizarTexto(t.estado);

    if (estado === "eliminado") {
      tabContainers.eliminado.appendChild(crearTicketCard(t));
    } else {
      tabContainers.todos.appendChild(crearTicketCard(t));
      if (estado === "pendiente") tabContainers.pendiente.appendChild(crearTicketCard(t));
      if (estado === "proceso") tabContainers.proceso.appendChild(crearTicketCard(t));
      if (estado === "cerrado") tabContainers.cerrado.appendChild(crearTicketCard(t));
    }
  });

  renderPaginador();
}

// ---------- Paginador ----------
function renderPaginador() {
  paginador.innerHTML = "";
  if (totalPaginas <= 1) return;

  const btnPrev = document.createElement("button");
  btnPrev.textContent = "⬅ Anterior";
  btnPrev.disabled = paginaActual === 1;
  btnPrev.addEventListener("click", () => {
    paginaActual--;
    renderTickets();
  });

  const info = document.createElement("span");
  info.textContent = `Página ${paginaActual} de ${totalPaginas}`;

  const btnNext = document.createElement("button");
  btnNext.textContent = "Siguiente ➡";
  btnNext.disabled = paginaActual === totalPaginas;
  btnNext.addEventListener("click", () => {
    paginaActual++;
    renderTickets();
  });

  paginador.appendChild(btnPrev);
  paginador.appendChild(info);
  paginador.appendChild(btnNext);
}

// ---------- Modal Asignar ----------
async function cargarTecnicos() {
  tecnicoSelect.innerHTML = "<option value=''>⏳ Cargando...</option>";
  try {
    const snap = await getDocs(collection(db, "usuarios"));
    tecnicoSelect.innerHTML = "<option value=''>Seleccione...</option>";

    snap.forEach((docSnap) => {
      const u = docSnap.data();
      const rol = normalizarTexto(u.rol);
      if (rol === "tecnico" || rol === "administrador") {
        const opt = document.createElement("option");
        opt.value = u.correo;
        opt.textContent = `${u.nombre || u.correo} (${u.rol})`;
        tecnicoSelect.appendChild(opt);
      }
    });

    if (tecnicoSelect.options.length === 1) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "⚠️ No hay técnicos/administradores";
      tecnicoSelect.appendChild(opt);
    }
  } catch (err) {
    console.error("⚠️ Error al cargar técnicos:", err);
    tecnicoSelect.innerHTML =
      "<option value=''>❌ Error al cargar usuarios</option>";
  }
}

function abrirModalAsignar(ticket) {
  ticketEnEdicion = ticket;
  cargarTecnicos();
  tecnicoSelect.value = ticket.tecnicoAsignado || "";
  prioridadSelect.value = ticket.prioridad || "";
  modalTecnico.style.display = "flex";
}

btnAsignar.addEventListener("click", async () => {
  if (!ticketEnEdicion) return;

  const prioridad = prioridadSelect.value;
  const tecnico = tecnicoSelect.value;

  if (!prioridad) return alert("Debes seleccionar una prioridad");
  if (!tecnico) return alert("Debes seleccionar un técnico");

  const ticketRef = doc(db, "tickets", ticketEnEdicion.id);
  let datos = {
    prioridad: prioridad,
    tecnicoAsignado: tecnico,
    estado: "proceso",
  };

  if (!ticketEnEdicion.fechaPrimerRespuesta) {
    datos.primerRespuesta = serverTimestamp();
    datos.fechaPrimerRespuesta = serverTimestamp();
  }

  await updateDoc(ticketRef, datos);
  await logAccion(
    auth.currentUser.email,
    `Asignó prioridad ${prioridad.toUpperCase()} y técnico ${tecnico} al ticket #${ticketEnEdicion.numero}`
  );

  modalTecnico.style.display = "none";
  ticketEnEdicion = null;
});

btnCancelar.addEventListener("click", () => {
  modalTecnico.style.display = "none";
  ticketEnEdicion = null;
});

// ---------- Tabs ----------
tabBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    Object.values(tabContainers).forEach((c) => c.classList.add("hidden"));
    document.getElementById("tab-" + btn.dataset.tab).classList.remove("hidden");
  });
});

// ---------- Filtros ----------
buscarTicket.addEventListener("input", () => {
  paginaActual = 1;
  renderTickets();
});
filtroCampo.addEventListener("change", () => {
  paginaActual = 1;
  renderTickets();
});

// ---------- Exportar PDF ----------
document.getElementById("btnExportPDF").addEventListener("click", async () => {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("No se cargó jsPDF. Revisa las etiquetas <script> del HTML.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF("p", "mm", "a4");
  const pageWidth = doc.internal.pageSize.getWidth();

  const activeTab = document.querySelector(".tab-btn.active")?.dataset.tab || "todos";

  let listaExportar = [];
  if (activeTab === "todos") {
    listaExportar = ticketsCache.filter((t) => normalizarTexto(t.estado) !== "eliminado");
  } else if (activeTab === "eliminado") {
    listaExportar = ticketsCache.filter((t) => normalizarTexto(t.estado) === "eliminado");
  } else {
    listaExportar = ticketsCache.filter((t) => normalizarTexto(t.estado) === activeTab);
  }

  if (!listaExportar.length) {
    alert("No hay tickets para exportar en esta pestaña.");
    return;
  }

  const logoUrl = "assets/logo.png";
  try {
    const logoBase64 = await toBase64(logoUrl);
    doc.addImage(logoBase64, "PNG", (pageWidth - 30) / 2, 10, 30, 30);
  } catch {
    console.warn("Logo no encontrado, se exporta sin logo.");
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14).text("HOSPITAL PUERTO CORTES", pageWidth / 2, 48, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10).text("Dirección: Puerto Cortes, Honduras", pageWidth / 2, 54, { align: "center" });

  const ahora = new Date();
  const fechaGenerado = `Generado el ${ahora.toLocaleDateString()} ${ahora.toLocaleTimeString()}`;
  const titulo = `Reporte de Tickets - ${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`;

  doc.setFont("helvetica", "bold").setFontSize(12).text(titulo, pageWidth / 2, 64, { align: "center" });
  doc.setFont("helvetica", "normal").setFontSize(9).text(fechaGenerado, pageWidth / 2, 70, { align: "center" });

  const filas = listaExportar.map((t) => [
    t.numero || t.id,
    t.asunto || "",
    t.departamento || "N/A",
    t.categoria || "N/A",
    t.tecnicoAsignado || "No asignado",
    t.prioridad || "No asignada",
    t.estado || "",
  ]);

  if (typeof doc.autoTable !== "function") {
    alert("No se cargó jsPDF-AutoTable. Revisa las etiquetas <script> del HTML.");
    return;
  }

  doc.autoTable({
    head: [["ID", "Asunto", "Departamento", "Categoría", "Técnico", "Prioridad", "Estado"]],
    body: filas,
    startY: 80,
    styles: { fontSize: 9 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 247, 250] }
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal").setFontSize(9).text(
      `Página ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.height - 10,
      { align: "center" }
    );
  }

  doc.save(`tickets_${activeTab}.pdf`);
});

// Helper: imagen a base64
function toBase64(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
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

/**
 * 🔥 Eliminar un ticket y todas sus subcolecciones
 */
async function eliminarTicketConSubcolecciones(ticketId) {
  const ticketRef = doc(db, "tickets", ticketId);

  // Define aquí las subcolecciones que tiene tu ticket
  const subcolecciones = ["comentarios", "historial", "adjuntos"];

  for (const sub of subcolecciones) {
    const subRef = collection(ticketRef, sub);
    const snapshot = await getDocs(subRef);

    // Eliminar todos los documentos dentro de cada subcolección
    const promises = snapshot.docs.map((d) => deleteDoc(d.ref));
    await Promise.all(promises);
  }

  // Finalmente elimina el documento del ticket
  await deleteDoc(ticketRef);
}
