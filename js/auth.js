import { auth, db } from "./firebase.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const email = document.getElementById("email");
const pass = document.getElementById("password");
const btnLogin = document.getElementById("btnLogin");
const msgError = document.getElementById("msgError");
const msgOk = document.getElementById("msgOk");

// ✅ Validar email
function validarEmail(valor) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(valor);
}

btnLogin.addEventListener("click", async () => {
  msgError.style.display = "none";
  msgOk.style.display = "none";

  const correo = email.value.trim();
  const clave = pass.value.trim();

  if (!correo || !clave) {
    showError("⚠️ Debes completar todos los campos.");
    return;
  }
  if (!validarEmail(correo)) {
    showError("⚠️ Ingresa un correo válido.");
    return;
  }
  if (clave.length < 6) {
    showError("⚠️ La contraseña debe tener al menos 6 caracteres.");
    return;
  }

  btnLogin.disabled = true;
  btnLogin.textContent = "Ingresando...";

  try {
    // 🔐 Iniciar sesión
    const userCred = await signInWithEmailAndPassword(auth, correo, clave);
    const uid = userCred.user.uid;

    // 🔎 Obtener rol de Firestore
    const ref = doc(db, "usuarios", uid);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      showError("❌ No tienes un rol asignado. Contacta al administrador.");
      return;
    }

    const rol = snap.data().rol; // admin | tecnico | cliente
    console.log("✅ Rol detectado:", rol);

    showOk("✅ Bienvenido " + (userCred.user.email || ""));

    // Guardar en localStorage para reusar
    localStorage.setItem("sitUserRol", rol);

    // 🔀 Redirigir según rol
    setTimeout(() => {
      if (rol === "Administrador") {
        window.location.href = "dashboard.html";
      } else if (rol === "Tecnico") {
        window.location.href = "dashboard_tech.html";
      } else if (rol === "Usuario") {
        window.location.href = "dashboard_cliente.html";
      } else {
        showError("❌ Rol no válido. Contacta al administrador.");
      }
    }, 1200);

  } catch (err) {
    console.error("❌ Error en login:", err.code, err.message);
    let mensaje = "❌ Error al iniciar sesión.";
    if (err.code === "auth/invalid-email") mensaje = "❌ El correo no es válido.";
    if (err.code === "auth/user-not-found") mensaje = "❌ No existe una cuenta con este correo.";
    if (err.code === "auth/wrong-password") mensaje = "❌ Contraseña incorrecta.";
    if (err.code === "auth/too-many-requests") mensaje = "❌ Demasiados intentos fallidos. Intenta más tarde.";
    showError(mensaje);
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = "Ingresar";
  }
});

function showError(msg) {
  msgError.textContent = msg;
  msgError.style.display = "block";
}
function showOk(msg) {
  msgOk.textContent = msg;
  msgOk.style.display = "block";
}
