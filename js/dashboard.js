// js/dashboard.js
import { auth, db } from "./firebase.js";
import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const userNameEl = document.getElementById("userName");
const btnLogout = document.getElementById("btnLogout");
const btnNuevoTicket = document.getElementById("btnNuevoTicket");
const listaTickets = document.getElementById("listaTickets");

const countAbiertos = document.getElementById("countAbiertos");
const countProceso = document.getElementById("countProceso");
const countCerrados = document.getElementById("countCerrados");

let chartEstados = null;

// 🔹 Sesión
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "./index.html";
  } else {
    userNameEl.textContent = user.email;
    cargarTickets();
  }
});

// 🔹 Logout
btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// 🔹 Redirigir a creación de ticket
btnNuevoTicket.addEventListener("click", () => {
  window.location.href = "new_ticket.html";
});

// 🔹 Escuchar tickets en tiempo real
function cargarTickets() {
  const q = query(collection(db, "tickets"), orderBy("fecha", "desc"));

  onSnapshot(q, (snapshot) => {
    listaTickets.innerHTML = "";
    let abiertos = 0,
      proceso = 0,
      cerrados = 0;

    let ranking = {};

    snapshot.forEach((doc) => {
      const t = doc.data();
      const id = doc.id;

      const estado = (t.estado || "").toLowerCase();

      // Contadores
      if (estado === "pendiente" || estado === "abierto") abiertos++;
      if (estado === "proceso" || estado === "en proceso") proceso++;
      if (estado === "cerrado") cerrados++;

      // Ranking departamentos
      if (t.departamento) {
        ranking[t.departamento] = (ranking[t.departamento] || 0) + 1;
      }

      // 🔹 Mostrar SOLO tickets no cerrados en la lista
      if (estado !== "cerrado") {
        const estadoClass = estado.replace(" ", "-");
        const div = document.createElement("div");
        div.className = "ticket-card";
        div.innerHTML = `
          <h3><a href="ticket_detalle.html?id=${id}">#${t.numero || "?"} - ${t.asunto}</a></h3>
          <p>${t.descripcion || ""}</p>
          <p>
            <span class="badge ${estadoClass}">${estado}</span> | 
            <strong>${t.departamento || "Sin depto"}</strong> | 
            Creado por: ${t.creadoPor || "Desconocido"}
          </p>
        `;
        listaTickets.appendChild(div);
      }
    });

    // Actualizar contadores
    countAbiertos.textContent = abiertos;
    countProceso.textContent = proceso;
    countCerrados.textContent = cerrados;

    // Gráfico por estado
    actualizarGrafico(abiertos, proceso, cerrados);

    // Ranking
    mostrarRanking(ranking);
  });
}

// 🔹 Gráfico circular con porcentajes
function actualizarGrafico(a, p, c) {
  const ctx = document.getElementById("chartEstados").getContext("2d");
  if (chartEstados) chartEstados.destroy();

  const total = a + p + c || 1;

  chartEstados = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels: ["Pendientes", "En proceso", "Cerrados"],
      datasets: [
        {
          data: [a, p, c],
          backgroundColor: ["#f97316", "#3b82f6", "#22c55e"],
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: "bottom" },
        datalabels: {
          color: "#fff",
          font: { weight: "bold" },
          formatter: (value) => {
            const porcentaje = ((value / total) * 100).toFixed(1);
            return `${value} (${porcentaje}%)`;
          },
        },
      },
    },
    plugins: [ChartDataLabels],
  });
}

// 🔹 Ranking de departamentos
function mostrarRanking(data) {
  const ul = document.getElementById("rankingDept");
  ul.innerHTML = "";
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
  sorted.forEach(([dept, count]) => {
    const li = document.createElement("li");
    li.textContent = `${dept}: ${count} tickets`;
    ul.appendChild(li);
  });
}
