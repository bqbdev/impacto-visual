import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAaulI9uQhIlgGHfCtufnuquAmUsRl6yLc",
  authDomain: "impacto-visual-5ac15.firebaseapp.com",
  projectId: "impacto-visual-5ac15",
  storageBucket: "impacto-visual-5ac15.firebasestorage.app",
  messagingSenderId: "840117666207",
  appId: "1:840117666207:web:9ab0d76b59e93c64cafdaa"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const quotesCollection = collection(db, "orcamentos");

export async function saveQuote(quote) {
  const payload = {
    ...quote,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const result = await addDoc(quotesCollection, payload);
  return result.id;
}

export async function getQuotes() {
  const result = await getDocs(
    query(quotesCollection, orderBy("createdAt", "desc"))
  );

  return result.docs.map((item) => ({
    id: item.id,
    ...item.data()
  }));
}

export async function updateQuoteStatus(id, status) {
  await updateDoc(doc(db, "orcamentos", id), {
    status,
    updatedAt: serverTimestamp()
  });
}
