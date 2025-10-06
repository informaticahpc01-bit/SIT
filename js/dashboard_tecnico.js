import { auth, db } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  collection,
  query,
  where,
  limit,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* ==== Referencias DOM ==== */
const btnLogout = document.querySelector(".btn-logout");
const resumenMis = document.getElementById("resumenMis");
const resumenProceso = document.getElementById("resumenProceso");
const resumenCerrados = document.getElementById("resumenCerrados");
const listaUltimos = document.getElementById("listaUltimos");

/* ==== Cerrar sesión ==== */
btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

/* ==== Cargar datos en tiempo real ==== */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const tecnicoEmail = user.email.toLowerCase().trim();
  const ticketsRef = collection(db, "tickets");

  /* 🔹 Todos mis tickets (excepto eliminados) */
  const qMis = query(ticketsRef, where("tecnicoAsignado", "==", tecnicoEmail));
  onSnapshot(qMis, (snap) => {
    const activos = snap.docs.filter(doc => (doc.data().estado || "").toLowerCase().trim() !== "eliminado");
    resumenMis.textContent = activos.length;

    // 🔹 En proceso
    const enProceso = activos.filter(doc => (doc.data().estado || "").toLowerCase().trim() === "proceso");
    resumenProceso.textContent = enProceso.length;

    // 🔹 Cerrados
    const cerrados = activos.filter(doc => (doc.data().estado || "").toLowerCase().trim() === "cerrado");
    resumenCerrados.textContent = cerrados.length;
  });

  /* 🔹 Últimos tickets en proceso (máx 5) */
  const qUltimos = query(ticketsRef, where("tecnicoAsignado", "==", tecnicoEmail), limit(20));
  onSnapshot(qUltimos, (snap) => {
    listaUltimos.innerHTML = "";
    if (snap.empty) {
      listaUltimos.innerHTML = `<p class="empty">No hay tickets en proceso recientes...</p>`;
    } else {
      const enProceso = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(t => (t.estado || "").toLowerCase().trim() === "proceso")
        .slice(0, 5); // mostrar solo 5

      if (enProceso.length === 0) {
        listaUltimos.innerHTML = `<p class="empty">No hay tickets en proceso recientes...</p>`;
      } else {
        enProceso.forEach((t) => {
          const asunto = t.asunto || "Sin asunto";
          const descripcion = t.descripcion || "Sin descripción";
          const departamento = t.departamento || "No asignado";
          const prioridad = t.prioridad || "Sin prioridad";
          const fecha = t.fecha?.toDate ? t.fecha.toDate().toLocaleString() : "Sin fecha";

          listaUltimos.innerHTML += `
            <div class="ticket">
              <strong>${asunto}</strong><br>
              <span><b>Descripción:</b> ${descripcion}</span><br>
              <span><b>Departamento:</b> ${departamento}</span><br>
              <span><b>Prioridad:</b> ${prioridad}</span><br>
              <span><b>Fecha:</b> ${fecha}</span>
            </div>
          `;
        });
      }
    }
  });
});
