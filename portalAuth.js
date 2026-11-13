import "./style.css";

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";

import { auth } from "./firebase.js";
import {
  EXECUTIVE_ROLE,
  GENERAL_ROLE,
  getRoleName,
  resolveUserRole
} from "./userRole.js";

// ========================================
// DOM
// ========================================

const authGate = document.querySelector("#authGate");
const gateForm = document.querySelector("#gateForm");
const gateTitle = document.querySelector("#gateTitle");
const gateSubtitle = document.querySelector("#gateSubtitle");
const emailInput = document.querySelector("#gateEmail");
const passwordInput = document.querySelector("#gatePassword");
const loginButton = document.querySelector("#gateLoginButton");
const signUpButton = document.querySelector("#gateSignUpButton");
const gateMessage = document.querySelector("#gateMessage");

const roleTabs = document.querySelectorAll(".gate-role-tab");
const roleGuide = document.querySelector("#gateRoleGuide");
const roleNote = document.querySelector("#gateRoleNote");

const portalMain = document.querySelector("#portalMain");
const currentEmail = document.querySelector("#portalCurrentEmail");
const roleBadge = document.querySelector("#portalRoleBadge");
const logoutButton = document.querySelector("#portalLogoutButton");
const executiveOnlyElements = document.querySelectorAll("[data-executive-only]");

let isAuthSubmitting = false;
let hasPlayedIntro = false;
let gateHideTimer = 0;
let selectedRole = EXECUTIVE_ROLE;
let requestedRole = "";

// ========================================
// 로그인 상태에 따른 화면 전환
// ========================================

onAuthStateChanged(auth, async (user) => {
  authGate.classList.remove("is-loading");

  if (!user) {
    showGate();
    return;
  }

  const role = await resolveUserRole(user);

  // 로그인 화면에서 고른 계정 종류와 실제 권한이 다르면 되돌린다.
  if (requestedRole && requestedRole !== role) {
    requestedRole = "";
    await signOut(auth);
    gateMessage.textContent = role === EXECUTIVE_ROLE
      ? "이 계정은 연합회 임원 계정입니다. '연합회 임원'을 선택해 로그인해주세요."
      : "이 계정은 일반 계정입니다. '일반'을 선택해 로그인해주세요.";
    return;
  }

  requestedRole = "";
  showPortal(user, role);
});

function showPortal(user, role) {
  window.clearTimeout(gateHideTimer);

  currentEmail.textContent = user.email ?? "이메일 정보 없음";
  roleBadge.textContent = getRoleName(role);
  roleBadge.classList.toggle("is-executive", role === EXECUTIVE_ROLE);

  // 일반 계정에게는 임원 전용 항목(01 · 03 · 관리자)을 보여주지 않는다.
  executiveOnlyElements.forEach((element) => {
    element.hidden = role !== EXECUTIVE_ROLE;
  });

  portalMain.hidden = false;
  gateMessage.textContent = "";

  authGate.classList.add("is-authenticated");
  gateHideTimer = window.setTimeout(() => {
    authGate.hidden = true;
  }, 520);
}

function showGate() {
  window.clearTimeout(gateHideTimer);

  portalMain.hidden = true;
  currentEmail.textContent = "";
  roleBadge.textContent = "";
  authGate.hidden = false;
  authGate.classList.remove("is-authenticated");

  playIntroAnimation();
}

// ========================================
// 제목 · 부제목 퍼뜨리기 애니메이션
// ========================================

function playIntroAnimation() {
  if (hasPlayedIntro) return;
  hasPlayedIntro = true;

  const start = () => {
    spreadText(gateTitle, { baseDelay: 120, delayStep: 28 });
    spreadText(gateSubtitle, { baseDelay: 380, delayStep: 20 });
  };

  if (document.fonts?.ready) {
    document.fonts.ready.then(() => window.requestAnimationFrame(start));
    return;
  }

  window.requestAnimationFrame(start);
}

// 글자를 중앙에서 바깥으로 퍼뜨리며 나타나게 한다.
function spreadText(element, { baseDelay = 0, delayStep = 24 } = {}) {
  const text = element.textContent ?? "";
  element.textContent = "";

  const characters = Array.from(text).map((character) => {
    const span = document.createElement("span");
    span.className = "spread-char";
    span.textContent = character === " " ? " " : character;
    element.appendChild(span);
    return span;
  });

  const elementRect = element.getBoundingClientRect();
  const centerX = elementRect.left + elementRect.width / 2;
  const middleIndex = (characters.length - 1) / 2;

  characters.forEach((span, index) => {
    const rect = span.getBoundingClientRect();
    const offsetX = centerX - (rect.left + rect.width / 2);

    span.style.setProperty("--spread-x", `${offsetX.toFixed(2)}px`);
    span.style.animationDelay = `${Math.round(baseDelay + Math.abs(index - middleIndex) * delayStep)}ms`;
  });

  element.classList.add("is-spreading");
}

// ========================================
// 로그인 / 회원가입
// ========================================

roleTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    selectedRole = tab.dataset.role === EXECUTIVE_ROLE ? EXECUTIVE_ROLE : GENERAL_ROLE;

    roleTabs.forEach((button) => {
      const isActive = button === tab;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    const isExecutiveTab = selectedRole === EXECUTIVE_ROLE;
    roleGuide.textContent = isExecutiveTab
      ? "연합회 임원 계정으로 로그인하세요."
      : "일반 계정으로 로그인하거나 새로 가입하세요.";
    roleNote.hidden = !isExecutiveTab;
    signUpButton.hidden = isExecutiveTab;
    gateMessage.textContent = "";
  });
});

gateForm.addEventListener("submit", (event) => {
  event.preventDefault();
  authenticate("login");
});

signUpButton.addEventListener("click", () => authenticate("signUp"));

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;

  try {
    await signOut(auth);
  } catch (error) {
    console.error("로그아웃 오류:", error);
  } finally {
    logoutButton.disabled = false;
  }
});

async function authenticate(type) {
  if (isAuthSubmitting) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    gateMessage.textContent = "이메일과 비밀번호를 모두 입력해주세요.";
    return;
  }

  requestedRole = type === "signUp" ? GENERAL_ROLE : selectedRole;
  isAuthSubmitting = true;
  loginButton.disabled = true;
  signUpButton.disabled = true;
  gateMessage.textContent = type === "login" ? "로그인 중..." : "회원가입 중...";

  try {
    if (type === "login") {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      await createUserWithEmailAndPassword(auth, email, password);
    }

    emailInput.value = "";
    passwordInput.value = "";
    gateMessage.textContent = "";
  } catch (error) {
    console.error("사용자 인증 오류:", error);
    requestedRole = "";
    gateMessage.textContent = getAuthErrorMessage(error.code);
  } finally {
    isAuthSubmitting = false;
    loginButton.disabled = false;
    signUpButton.disabled = false;
  }
}

function getAuthErrorMessage(code) {
  if (code === "auth/invalid-email") {
    return "이메일 형식이 올바르지 않습니다.";
  }

  if (["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(code)) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }

  if (code === "auth/email-already-in-use") {
    return "이미 가입된 이메일입니다.";
  }

  if (code === "auth/weak-password") {
    return "비밀번호는 6자 이상이어야 합니다.";
  }

  if (code === "auth/too-many-requests") {
    return "시도가 너무 많습니다. 잠시 후 다시 시도해주세요.";
  }

  if (code === "auth/operation-not-allowed") {
    return "이메일 로그인이 비활성화되어 있습니다. 관리자에게 문의하세요.";
  }

  return "인증 중 오류가 발생했습니다.";
}
