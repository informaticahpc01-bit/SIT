import { db } from "./firebase.js";
import { 
  collection, 
  addDoc, 
  getDocs, 
  deleteDoc, 
  doc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const formDept = document.getElementById("formDept");
const deptName = document.getElementById("deptName");
const deptTable = document.getElementById("deptTable");
const overlay = document.getElementById("overlay");

// 🔹 Toast para mostrar mensajes
function showToast(msg, ok = true) {
  let toast = document.createElement("div");
  toast.textContent = msg;
  toast.style.position = "fixed";
  toast.style.bottom = "20px";
  toast.style.right = "20px";
  toast.style.background = ok ? "#10b981" : "#ef4444"; // verde o rojo
  toast.style.color = "#fff";
  toast.style.padding = "10px 15px";
  toast.style.borderRadius = "8px";
  toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.3)";
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// 🔹 Overlay helpers
function showOverlay(msg = "Procesando...") {
  overlay.textContent = "⏳ " + msg;
  overlay.style.display = "flex";
}
function hideOverlay() {
  overlay.style.display = "none";
}

// 🔹 Cargar departamentos
async function cargarDepartamentos() {
  deptTable.innerHTML = "<tr><td colspan='3'>⏳ Cargando...</td></tr>";
  const querySnapshot = await getDocs(collection(db, "departamentos"));
  deptTable.innerHTML = "";

  querySnapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const fecha = data.fechaCreacion?.toDate().toLocaleString() || "—";

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${(data.nombre || "").toUpperCase()}</td>   <!-- 🔹 siempre en MAYÚSCULAS -->
      <td>${fecha}</td>
      <td>
        <button class="btn-danger" onclick="eliminarDept('${docSnap.id}')">Eliminar</button>
      </td>
    `;
    deptTable.appendChild(row);
  });
}

// 🔹 Crear nuevo departamento
formDept.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!deptName.value.trim()) return;

  showOverlay("Guardando departamento...");

  try {
    await addDoc(collection(db, "departamentos"), {
      nombre: deptName.value.trim().toUpperCase(), // 🔹 siempre en MAYÚSCULA
      fechaCreacion: serverTimestamp() // ⏰ se guarda la fecha/hora del servidor
    });

    deptName.value = "";
    showToast("✔ Departamento agregado");
    await cargarDepartamentos();
  } catch (err) {
    console.error("Error al agregar:", err);
    showToast("❌ Error al guardar", false);
  } finally {
    hideOverlay();
  }
});

// 🔹 Eliminar departamento
window.eliminarDept = async (id) => {
  showOverlay("Eliminando departamento...");

  try {
    await deleteDoc(doc(db, "departamentos", id));
    showToast("✔ Departamento eliminado");
    await cargarDepartamentos();
  } catch (err) {
    console.error("Error al eliminar:", err);
    showToast("❌ Error al eliminar", false);
  } finally {
    hideOverlay();
  }
};

// 🔹 Inicializar
cargarDepartamentos();
