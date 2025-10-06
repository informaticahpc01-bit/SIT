import { auth, db } from "./firebase.js";
import {
  signOut,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  getIdToken
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  where,
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const userNameEl = document.getElementById("userName");
const btnLogout = document.getElementById("btnLogout");

const formUsuario = document.getElementById("formUsuario");
const uNombre = document.getElementById("uNombre");
const uDNI = document.getElementById("uDNI");
const uCorreo = document.getElementById("uCorreo");
const uPassword = document.getElementById("uPassword");
const uDepartamento = document.getElementById("uDepartamento");
const uRol = document.getElementById("uRol");

const msgError = document.getElementById("msgError");
const msgOk = document.getElementById("msgOk");

const tablaUsuarios = document.querySelector("#tablaUsuarios tbody");

// Modal editar
const modalEditar = document.getElementById("modalEditar");
const eNombre = document.getElementById("eNombre");
const eDNI = document.getElementById("eDNI");
const eDepartamento = document.getElementById("eDepartamento");
const eRol = document.getElementById("eRol");
const btnGuardarEdicion = document.getElementById("btnGuardarEdicion");

let usuarioEditando = null;
let usuariosGlobal = [];

// 🔹 Sesión
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    userNameEl.textContent = user.email;
    cargarDepartamentos();
    cargarUsuarios();
  }
});

// 🔹 Logout
btnLogout.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

// 🔹 Cargar departamentos
async function cargarDepartamentos() {
  const snapshot = await getDocs(collection(db, "departamentos"));
  uDepartamento.innerHTML = '<option value="">Seleccione departamento</option>';
  eDepartamento.innerHTML = '<option value="">Seleccione departamento</option>';
  snapshot.forEach((doc) => {
    const d = doc.data();
    uDepartamento.innerHTML += `<option value="${d.nombre}">${d.nombre}</option>`;
    eDepartamento.innerHTML += `<option value="${d.nombre}">${d.nombre}</option>`;
  });
}

// 🔹 Guardar acción en Bitácora
async function logAccion(usuario, accion) {
  await setDoc(doc(collection(db, "bitacora")), {
    usuario,
    accion,
    fecha: serverTimestamp(),
  });
}

// 🔹 Crear usuario
formUsuario.addEventListener("submit", async (e) => {
  e.preventDefault();
  msgError.textContent = "";
  msgOk.textContent = "";

  const dni = uDNI.value.trim();
  const correo = uCorreo.value.trim();

  if (!/^\d{13}$/.test(dni)) {
    msgError.textContent = "⚠️ El DNI debe contener exactamente 13 números.";
    return;
  }

  try {
    // Verificar correo único
    const q = query(collection(db, "usuarios"), where("correo", "==", correo));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      msgError.textContent = "⚠️ Este correo ya está registrado.";
      return;
    }

    // Crear en Firebase Auth
    const cred = await createUserWithEmailAndPassword(auth, correo, uPassword.value);

    // Guardar en Firestore
    await setDoc(doc(db, "usuarios", cred.user.uid), {
      uid: cred.user.uid,
      nombre: uNombre.value.trim(),
      dni,
      correo,
      departamento: uDepartamento.value,
      rol: uRol.value,
      creadoEn: serverTimestamp(),
    });

    msgOk.textContent = "✅ Usuario creado exitosamente";
    formUsuario.reset();
    cargarUsuarios();

    await logAccion(auth.currentUser.email, `Creó usuario ${correo}`);
  } catch (err) {
    msgError.textContent = "❌ Error: " + err.message;
  }
});

// 🔹 Cargar usuarios
async function cargarUsuarios() {
  tablaUsuarios.innerHTML = "<tr><td colspan='6'>⏳ Cargando...</td></tr>";
  const q = query(collection(db, "usuarios"), orderBy("nombre"));
  const snapshot = await getDocs(q);

  usuariosGlobal = [];
  snapshot.forEach((docSnap) => {
    usuariosGlobal.push({ id: docSnap.id, ...docSnap.data() });
  });

  renderUsuarios(usuariosGlobal);
}

// 🔹 Renderizar usuarios
function renderUsuarios(lista) {
  tablaUsuarios.innerHTML = "";

  if (lista.length === 0) {
    tablaUsuarios.innerHTML = "<tr><td colspan='6'>⚠️ No se encontraron usuarios.</td></tr>";
    return;
  }

  lista.forEach((u) => {
    const badgeClass =
      u.rol === "Administrador" ? "badge admin" :
      u.rol === "Tecnico" ? "badge tecnico" :
      "badge usuario";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${u.nombre}</td>
      <td>${u.dni}</td>
      <td>${u.correo}</td>
      <td>${u.departamento}</td>
      <td><span class="${badgeClass}">${u.rol}</span></td>
      <td class="acciones">
        <button class="btn-action edit" onclick="editarUsuario('${u.id}')">✏️ Editar</button>
        <button class="btn-action delete" onclick="eliminarUsuario('${u.id}', '${u.correo}')">🗑️ Eliminar</button>
        <button class="btn-action edit" onclick="resetPass('${u.correo}')">🔑 Reset</button>
      </td>
    `;
    tablaUsuarios.appendChild(tr);
  });
}

// 🔹 Editar usuario
window.editarUsuario = async (id) => {
  usuarioEditando = id;
  const docSnap = await getDoc(doc(db, "usuarios", id));
  if (docSnap.exists()) {
    const u = docSnap.data();
    eNombre.value = u.nombre;
    eDNI.value = u.dni;
    eDepartamento.value = u.departamento;
    eRol.value = u.rol;
    modalEditar.style.display = "flex";
  }
};

// 🔹 Guardar cambios
btnGuardarEdicion.addEventListener("click", async () => {
  if (!usuarioEditando) return;

  if (!/^\d{13}$/.test(eDNI.value.trim())) {
    alert("⚠️ El DNI debe contener exactamente 13 números.");
    return;
  }

  await updateDoc(doc(db, "usuarios", usuarioEditando), {
    nombre: eNombre.value.trim(),
    dni: eDNI.value.trim(),
    departamento: eDepartamento.value,
    rol: eRol.value,
  });

  modalEditar.style.display = "none";
  usuarioEditando = null;
  cargarUsuarios();

  await logAccion(auth.currentUser.email, `Editó usuario ${eNombre.value}`);
});

// 🔹 Eliminar usuario (Firestore + Auth via Cloud Function)
window.eliminarUsuario = async (id, correo) => {
  if (!confirm(`¿Seguro que deseas eliminar al usuario ${correo}?`)) return;

  try {
    // 1. Eliminar en Firestore
    await deleteDoc(doc(db, "usuarios", id));

    // 2. Obtener token actual
    const token = await getIdToken(auth.currentUser, true);

    // 3. Llamar Cloud Function
    const resp = await fetch("https://us-central1-TU_PROJECT_ID.cloudfunctions.net/eliminarUsuarioAuth", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}` 
      },
      body: JSON.stringify({ uid: id })
    });

    const data = await resp.json();
    if (data.success) {
      alert("✅ Usuario eliminado de la base de datos y Auth");
    } else {
      alert("⚠️ Se eliminó en Firestore, pero no en Auth: " + data.error);
    }

    cargarUsuarios();
    await logAccion(auth.currentUser.email, `Eliminó usuario ${correo}`);
  } catch (err) {
    alert("❌ Error al eliminar: " + err.message);
  }
};

// 🔹 Resetear contraseña
window.resetPass = async (correo) => {
  try {
    await sendPasswordResetEmail(auth, correo);
    alert("📩 Se envió un correo de restablecimiento a " + correo);
    await logAccion(auth.currentUser.email, `Reseteó contraseña de ${correo}`);
  } catch (err) {
    alert("❌ Error: " + err.message);
  }
};

// 🔹 Filtro y búsqueda
const buscarInput = document.getElementById("buscarUsuario");
const filtroRol = document.getElementById("filtroRol");

function normalizar(texto) {
  return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function aplicarFiltros() {
  const texto = normalizar(buscarInput.value.trim());
  const rol = filtroRol.value;

  const filtrados = usuariosGlobal.filter((u) => {
    const coincideTexto =
      normalizar(u.nombre).includes(texto) ||
      normalizar(u.dni).includes(texto) ||
      normalizar(u.correo).includes(texto) ||
      normalizar(u.departamento).includes(texto);

    const coincideRol = rol === "" || u.rol === rol;

    return coincideTexto && coincideRol;
  });

  renderUsuarios(filtrados);
}

buscarInput.addEventListener("input", aplicarFiltros);
filtroRol.addEventListener("change", aplicarFiltros);
  