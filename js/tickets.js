// js/tickets.js
import { auth, db } from "./firebase.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  collection,
  addDoc,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

// Referencias a elementos del DOM
const formTicket = document.getElementById("formTicket");
const asunto = document.getElementById("asunto");
const descripcion = document.getElementById("descripcion");
const categoria = document.getElementById("categoria");
const departamento = document.getElementById("departamento");
const prioridad = document.getElementById("prioridad");
const priorityBlock = document.getElementById("priorityBlock");
const msgError = document.getElementById("msgError");
const msgOk = document.getElementById("msgOk");

let currentUser = null;
let currentRole = "Usuario"; // Por defecto

// ✅ Función para registrar en Bitácora
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

// ✅ Obtener número consecutivo de ticket
async function obtenerNumeroTicket() {
  const ref = doc(db, "counters", "tickets");
  const snap = await getDoc(ref);

  let numero = 1;
  if (snap.exists()) {
    numero = (snap.data().ultimo || 0) + 1;
    await updateDoc(ref, { ultimo: numero });
  } else {
    // Si no existe el doc "tickets" en "counters", lo inicializamos
    await updateDoc(ref, { ultimo: numero }).catch(async () => {
      await addDoc(collection(db, "counters"), { ultimo: numero });
    });
  }
  return numero;
}

// Verificar usuario logueado y rol
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html"; // Redirigir al login si no está autenticado
  } else {
    currentUser = user;

    // Simulación de roles con el correo
    if (user.email.includes("admin") || user.email.includes("tecnico")) {
      currentRole = "Administrador";
      priorityBlock.style.display = "block";
    }

    // Cargar departamentos dinámicamente
    await cargarDepartamentos();
  }
});

// Función para cargar los departamentos desde Firestore
async function cargarDepartamentos() {
  departamento.innerHTML = "<option value=''>⏳ Cargando...</option>";
  try {
    const querySnapshot = await getDocs(collection(db, "departamentos"));
    departamento.innerHTML = "<option value=''>Seleccione...</option>";

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const opt = document.createElement("option");
      opt.value = data.nombre;
      opt.textContent = data.nombre;
      departamento.appendChild(opt);
    });
  } catch (err) {
    console.error("Error al cargar departamentos:", err);
    msgError.textContent = "❌ Error al cargar los departamentos.";
  }
}

// Manejar envío del formulario
formTicket.addEventListener("submit", async (e) => {
  e.preventDefault();
  msgError.textContent = "";
  msgOk.textContent = "";

  if (!asunto.value.trim() || !descripcion.value.trim() || !categoria.value || !departamento.value) {
    msgError.textContent = "⚠️ Debes completar todos los campos.";
    return;
  }

  try {
    // ✅ Obtener número único de ticket
    const numero = await obtenerNumeroTicket();

    // ✅ Guardar ticket en Firestore
    await addDoc(collection(db, "tickets"), {
      numero, // 👈 Número consecutivo
      asunto: asunto.value.trim(),
      descripcion: descripcion.value.trim(),
      categoria: categoria.value,
      departamento: departamento.value,
      prioridad: currentRole === "Administrador" ? prioridad.value : "Pendiente de clasificación",
      estado: "pendiente", // 👈 Mantener en minúscula (para tabs)
      tecnicoAsignado: "",
      creadoPor: currentUser.email,
      fecha: serverTimestamp() // 👈 Igualar al campo usado en ticketlist.js
    });

    // ✅ Registrar acción en Bitácora
    await logAccion(currentUser.email, `Creó el ticket #${numero}: "${asunto.value.trim()}"`);

    msgOk.textContent = `✅ Ticket #${numero} creado exitosamente.`;
    formTicket.reset();

    // Ocultar prioridad si no es admin
    if (currentRole !== "Administrador") {
      priorityBlock.style.display = "none";
    }
  } catch (err) {
    console.error("Error al crear ticket:", err);
    msgError.textContent = "❌ Error al crear el ticket.";
  }
});
