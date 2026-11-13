import { onAuthStateChanged } from "firebase/auth";

import { auth } from "./firebase.js";

// 로그인하지 않은 접근은 로그인 게이트(홈)로 되돌린다.
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.replace("/");
  }
});
