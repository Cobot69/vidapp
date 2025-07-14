// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCg0veanxyrgkX0cGqDlwXRCy1F-tA8e0s",
  authDomain: "vidapp-e74cd.firebaseapp.com",
  projectId: "vidapp-e74cd",
  storageBucket: "vidapp-e74cd.appspot.com",  // <-- fixed here
  messagingSenderId: "194676041106",
  appId: "1:194676041106:web:1542e9aefc9b29a3b70d4b",
  measurementId: "G-81LCN0CJGM"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
