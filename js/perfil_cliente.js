import { auth, db } from "./firebase.js";
import {
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import {
  doc,
  getDoc,
  query,
  where,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

/* ==== Referencias DOM ==== */
const btnLogout = document.querySelector(".btn-logout");
const perfilCorreo = document.getElementById("perfilCorreo");
const perfilNombre = document.getElementById("perfilNombre");
const btnCambiarPass = document.getElementById("btnCambiarPass");

/* ==== Toast ==== */
function showToast(message, type = "info") {
  let container = document.getElementById("toastContainer");
  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 4000);
}

/* ==== Cerrar sesión ==== */
if (btnLogout) {
  btnLogout.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
}

/* ==== Cargar datos del cliente ==== */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  perfilCorreo.textContent = user.email || "—";

  try {
    // Buscar en la colección usuarios por UID
    const snap = await getDoc(doc(db, "usuarios", user.uid));

    if (snap.exists()) {
      const data = snap.data();
      perfilNombre.textContent = data.nombre || "—";
    } else {
      // Si no existe documento con UID, buscar por correo
      const q = query(collection(db, "usuarios"), where("correo", "==", user.email));
      const res = await getDocs(q);
      if (!res.empty) {
        const data = res.docs[0].data();
        perfilNombre.textContent = data.nombre || "—";
      } else {
        perfilNombre.textContent = "—";
      }
    }
  } catch (err) {
    console.error("⚠️ Error al obtener datos de perfil:", err);
    perfilNombre.textContent = "—";
  }

  // Cambiar contraseña
  if (btnCambiarPass) {
    btnCambiarPass.addEventListener("click", async () => {
      try {
        await sendPasswordResetEmail(auth, user.email);
        showToast("📩 Se ha enviado un correo para restablecer tu contraseña.", "success");
      } catch (err) {
        console.error("⚠️ Error al enviar correo de recuperación:", err);
        showToast("⚠️ No se pudo enviar el correo de recuperación.", "error");
      }
    });
  }
});
