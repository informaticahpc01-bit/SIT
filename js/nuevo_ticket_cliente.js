import { auth, db } from "./firebase.js";
import { 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* ==== DOM ==== */
const btnLogout = document.querySelector(".btn-logout");
const form = document.getElementById("formNuevoTicket");
const selectDepartamento = document.getElementById("departamento");

/* ==== Cerrar sesión ==== */
btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

let currentUser = null;

/* ==== Sesión ==== */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  currentUser = user;

  // 📌 Cargar departamentos desde Firestore
  await cargarDepartamentos();
});

/* ==== Cargar Departamentos ==== */
async function cargarDepartamentos() {
  try {
    selectDepartamento.innerHTML = `<option value="">Seleccione departamento</option>`;
    const snap = await getDocs(collection(db, "departamentos"));
    snap.forEach((doc) => {
      const data = doc.data();
      const opt = document.createElement("option");
      opt.value = data.nombre;
      opt.textContent = data.nombre;
      selectDepartamento.appendChild(opt);
    });
  } catch (err) {
    console.error("⚠️ Error cargando departamentos:", err);
  }
}

/* ==== Crear Ticket ==== */
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const asunto = form.asunto.value.trim();
  const descripcion = form.descripcion.value.trim();
  const departamento = form.departamento.value.trim();

  if (!asunto || !descripcion || !departamento) {
    mostrarToast("⚠️ Debes llenar todos los campos", "error");
    return;
  }

  try {
    // 📌 Obtener el contador actual
    const counterRef = doc(db, "counters", "tickets");
    const counterSnap = await getDoc(counterRef);

    let nuevoNumero = 1;
    if (counterSnap.exists()) {
      nuevoNumero = (counterSnap.data().ultimo || 0) + 1;
    }

    // 📌 Guardar ticket con número consecutivo
    await addDoc(collection(db, "tickets"), {
      numero: nuevoNumero,
      asunto,
      descripcion,
      departamento,
      estado: "pendiente",
      creadoPor: currentUser.email,
      fecha: serverTimestamp()
    });

    // 📌 Actualizar contador en la BD
    await updateDoc(counterRef, { ultimo: nuevoNumero });

    mostrarToast(`✅ Ticket #${nuevoNumero} creado con éxito`, "success");
    setTimeout(() => {
      window.location.href = "mis_tickets_cliente.html";
    }, 1500);
  } catch (err) {
    console.error("Error creando ticket:", err);
    mostrarToast("⚠️ Error al crear ticket", "error");
  }
});

/* ==== Toasts ==== */
function mostrarToast(msg, type = "info") {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    document.body.appendChild(container);
  }

  const div = document.createElement("div");
  div.className = `toast ${type}`;
  div.textContent = msg;
  container.appendChild(div);

  setTimeout(() => div.remove(), 4000);
}
