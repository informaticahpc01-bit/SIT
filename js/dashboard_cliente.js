import { auth, db } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* ====== DOM ====== */
const btnLogout = document.querySelector(".btn-logout");
const resumenPendientes = document.getElementById("resumenPendientes");
const resumenProceso = document.getElementById("resumenProceso");
const resumenCerrados = document.getElementById("resumenCerrados");
const listaUltimos = document.getElementById("listaUltimos");

/* ====== Helpers ====== */
function normEstado(v) {
  return String(v || "").trim().toLowerCase();
}

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
  if (!ms) return "Fecha no registrada";
  try {
    return new Date(ms).toLocaleString("es-HN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "Fecha no registrada";
  }
}

/* ====== Cerrar sesión ====== */
btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

/* ====== Auth y datos ====== */
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const userEmail = user.email.toLowerCase().trim();
  const ticketsRef = collection(db, "tickets");
  const q = query(ticketsRef, where("creadoPor", "==", userEmail));

  onSnapshot(q, (snap) => {
    const pendientes = [];
    const proceso = [];
    const cerrados = [];

    let cntPend = 0, cntProc = 0, cntCerr = 0;

    snap.forEach((doc) => {
      const t = doc.data();
      const est = normEstado(t.estado);
      const fechaMs = tsToMillis(t.fechaCreacion || t.fecha || t.creadoEl);
      const fechaTxt = fechaMs ? formatDate(fechaMs) : "Fecha no registrada";

      const ticketHTML = `
        <div class="ticket">
          <h3>${t.asunto || "Sin asunto"}</h3>
          <p>${t.descripcion || ""}</p>
          <span class="estado"><b>Estado:</b> ${t.estado || "—"}</span><br/>
          <small><b>Creado:</b> ${fechaTxt}</small><br/><br/>
          <button class="btn-detalles" data-id="${doc.id}">🔍 Ver Detalles</button>
        </div>
      `;

      if (est === "pendiente") {
        pendientes.push(ticketHTML);
        cntPend++;
      } else if (est === "proceso") {
        proceso.push(ticketHTML);
        cntProc++;
      } else if (est === "cerrado") {
        cerrados.push(ticketHTML);
        cntCerr++;
      }
    });

    // Resumen
    resumenPendientes.textContent = cntPend;
    resumenProceso.textContent = cntProc;
    resumenCerrados.textContent = cntCerr;

    // Render ordenado: pendientes → proceso → cerrados
    listaUltimos.innerHTML = `
      ${pendientes.join("")}
      ${proceso.join("")}
      ${cerrados.join("")}
    `;

    // Eventos de botones Detalles
    document.querySelectorAll(".btn-detalles").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const id = e.target.dataset.id;
        window.location.href = `detalle_ticket.html?id=${id}`;
      });
    });
  });
});
