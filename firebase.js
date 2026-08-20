import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// 👉 Remplace cet objet par la config copiée depuis la console Firebase :
// Paramètres du projet (roue crantée) → Vos applications → application Web → objet de config SDK
const firebaseConfig = {
  apiKey: "AIzaSyCJGk8LX4o3P9t0QCQpEUOOkxGfBKT1xw0",
  authDomain: "desk-macro.firebaseapp.com",
  projectId: "desk-macro",
  storageBucket: "desk-macro.firebasestorage.app",
  messagingSenderId: "542086096637",
  appId: "1:542086096637:web:8a47ab26749e5cb42c4094",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
