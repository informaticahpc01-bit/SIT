import { auth, db } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { collection, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* ==== Referencias DOM ==== */
const btnLogout = document.querySelector(".btn-logout");
const lista = document.getElementById("listaTickets");

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

  await cargarTickets(user.email.toLowerCase().trim());
});

/* ==== Cargar tickets en proceso ==== */
async function cargarTickets(tecnicoEmail) {
  try {
    const q = query(
      collection(db, "tickets"),
      where("tecnicoAsignado", "==", tecnicoEmail), // 👈 mismo campo que usas en mis_tickets
       where("estado", "in", ["Cerrado", "cerrado"])
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      lista.innerHTML = `<p class="empty">No tienes tickets en proceso</p>`;
      return;
    }

    let tickets = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    // 🔹 Ordenar por fecha (descendente)
    tickets.sort((a, b) => {
      const fa = a.fecha?.toDate ? a.fecha.toDate() : new Date(0);
      const fb = b.fecha?.toDate ? b.fecha.toDate() : new Date(0);
      return fb - fa;
    });

    renderTickets(tickets);
  } catch (err) {
    console.error("⚠️ Error al cargar tickets en proceso:", err);
    lista.innerHTML = `<p class="error">⚠️ No se pudieron cargar los tickets</p>`;
  }
}

/* ==== Renderizar tickets ==== */
function renderTickets(tickets) {
  lista.innerHTML = "";
  tickets.forEach(t => {
    const asunto = t.asunto || t.titulo || "Sin asunto";
    const descripcion = t.descripcion || "Sin descripción";
    const departamento = t.departamento || "Sin departamento";
    const prioridad = t.prioridad || "Sin prioridad";
    const fecha = t.fecha?.toDate ? t.fecha.toDate().toLocaleString() : "Sin fecha";

    const div = document.createElement("div");
    div.classList.add("ticket");

    div.innerHTML = `
      <h3>${asunto}</h3>
      <p>${descripcion}</p>
      <span><b>Departamento:</b> ${departamento}</span><br>
      <span><b>Prioridad:</b> ${prioridad}</span><br>
      <span><b>Fecha:</b> ${fecha}</span><br>
      <span class="estado cerrado">Cerrado</span><br>
      <button class="btn-detalles" data-id="${t.id}">📄 Detalles</button>
    `;

    lista.appendChild(div);
  });

  // Evento para botones de detalles
  document.querySelectorAll(".btn-detalles").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const idTicket = e.target.dataset.id;
      window.location.href = `detalle_ticket.html?id=${idTicket}`;
    });
  });
}
