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
  apiKey: "COLE_SUA_API_KEY_AQUI",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  projectId: "SEU_PROJECT_ID",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_MESSAGING_SENDER_ID",
  appId: "SEU_APP_ID"
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
  const result = await getDocs(query(quotesCollection, orderBy("createdAt", "desc")));
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
