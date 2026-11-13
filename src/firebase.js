import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyD408PqmVurTYBmK1JDeb49oMNVCd_No6k",
  authDomain: "site-for-dongari.firebaseapp.com",
  projectId: "site-for-dongari",
  storageBucket: "site-for-dongari.firebasestorage.app",
  messagingSenderId: "700415202457",
  // public/firebase-messaging-sw.js 에도 같은 값이 있다. 바꾸면 둘 다 바꾼다.
  appId: "1:700415202457:web:ae404943ef02b4cdca9408",
  measurementId: "G-7PMVP0X0KJ"
};
export const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
