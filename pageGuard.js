import { onAuthStateChanged } from "firebase/auth";

import { auth } from "./firebase.js";
import { EXECUTIVE_ROLE, resolveUserProfile } from "./userRole.js";

// 로그인하지 않았거나 권한이 없는 접근은 홈(로그인 게이트)으로 되돌린다.
export function guardPage({ requireExecutive = false, onReady } = {}) {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.replace("/");
      return;
    }

    const profile = await resolveUserProfile(user);

    if (requireExecutive && profile.role !== EXECUTIVE_ROLE) {
      window.location.replace("/");
      return;
    }

    onReady?.({ user, role: profile.role, profile });
  });
}
