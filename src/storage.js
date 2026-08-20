import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// Chaque "clé" (banks-data, econ-data...) est stockée comme un document
// dans la collection "deskmacro" sur Firestore. Même interface que
// window.storage pour que le reste du code n'ait presque rien à changer.
const COLLECTION = "deskmacro";

export async function storageGet(key) {
  const snap = await getDoc(doc(db, COLLECTION, key));
  return snap.exists() ? { value: snap.data().value } : null;
}

export async function storageSet(key, value) {
  await setDoc(doc(db, COLLECTION, key), { value });
}
