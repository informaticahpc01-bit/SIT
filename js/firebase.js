// js/firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.2.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBPdcrKd4K8bi6Zniy_PX9yvBtTiGT-T6I",
  authDomain: "sistema-inteligente-tickets.firebaseapp.com",
  projectId: "sistema-inteligente-tickets",
  storageBucket: "sistema-inteligente-tickets.appspot.com", 
  messagingSenderId: "64170578583",
  appId: "1:64170578583:web:4313a9275d205b6e9f8fd2"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);

// Servicios
const auth = getAuth(app);
const db = getFirestore(app);

export { auth, db };
