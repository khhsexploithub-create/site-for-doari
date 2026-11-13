import {
  addDoc,
  collection,
  serverTimestamp
} from "firebase/firestore";

import { db } from "./firebase.js";

export async function createApplication(name, category, message) {
  console.log("저장 시작");

  const docRef = await addDoc(
    collection(db, "applications"),
    {
      name: name.trim(),
      category: category,
      message: message.trim(),
      status: "pending",
      createdAt: serverTimestamp()
    }
  );

  console.log("저장 성공:", docRef.id);

  return docRef.id;
}
