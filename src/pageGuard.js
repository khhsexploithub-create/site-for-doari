import { onAuthStateChanged } from "firebase/auth";

import { auth } from "./firebase.js";
import {
  EXECUTIVE_ROLE,
  hasSubcommittee,
  resolveUserProfile
} from "./userRole.js";
import { buildLoginUrl } from "./auth/authService.js";
import { mountProfileWidget } from "./auth/profileWidget.js";
import { mountShell } from "./ui/shell.js";

// 페이지를 열 때 권한을 확인한다.
//
//  allowAnonymous : 로그인하지 않아도 열람할 수 있는 페이지 (02 · 04 · 05 · 공지)
//  requireExecutive / requireSubcommittee : 예전과 같다.
//
// onReady 는 로그인 여부와 상관없이 불린다. user 가 null 이면 비로그인 열람이다.
export function guardPage({
  allowAnonymous = false,
  requireExecutive = false,
  requireSubcommittee = false,
  onReady
} = {}) {
  // 프로필 팝업과 E안 공통 틀(PC 위 메뉴 · 모바일 아래 메뉴 · 알림 배지)을 모든 페이지에 붙인다.
  mountProfileWidget();
  mountShell();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      // 로그인이 필요한 페이지는 로그인 화면으로 보내고, 끝나면 여기로 돌아온다.
      if (!allowAnonymous) {
        window.location.replace(buildLoginUrl());
        return;
      }

      onReady?.({ user: null, role: "", profile: null, isSignedIn: false });
      return;
    }

    const profile = await resolveUserProfile(user);

    // 소위원회에 소속되지 않은 계정은 소위원회 권한 페이지를 열 수 없다.
    if (requireSubcommittee && !hasSubcommittee(profile)) {
      window.location.replace("/");
      return;
    }

    if (requireExecutive && profile.role !== EXECUTIVE_ROLE) {
      window.location.replace("/");
      return;
    }

    onReady?.({ user, role: profile.role, profile, isSignedIn: true });
  });
}
