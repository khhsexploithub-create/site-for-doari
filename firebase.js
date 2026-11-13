import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyD408PqmVurTYBmK1JDeb49oMNVCd_No6k",
  authDomain: "site-for-dongari.firebaseapp.com",
  projectId: "site-for-dongari",
  storageBucket: "site-for-dongari.firebasestorage.app",
  messagingSenderId: "700415202457",
  appId: "G-7PMVP0X0KJ"
};
const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
