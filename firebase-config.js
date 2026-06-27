import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp
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

export {
  db,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  doc,
  serverTimestamp
};
