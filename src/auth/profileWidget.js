// 화면 우측 아래에 뜨는 프로필 단추와 그 팝업.
// 로그인하지 않았으면 로그인 · 회원가입 단추를,
// 로그인했으면 그 계정의 정보와 권한을 한눈에 보여준다.

import { onAuthStateChanged } from "firebase/auth";

import { auth } from "../firebase.js";
import {
  describeStudentId,
  getDisplayName,
  getRoleName,
  getSubcommitteeRoleName,
  isAdminEmail,
  getClubLeaderOf,
  getMyClub,
  needsClubChoice,
  needsIdentity,
  resolveUserProfile,
  SUBCOMMITTEE_NONE,
  SUBCOMMITTEES,
  canWriteNotice,
  EXECUTIVE_ROLE
} from "../userRole.js";
import { buildLoginUrl, signOutUser } from "./authService.js";
import { openIdentityDialog } from "./identityDialog.js";
import { isClubChoiceSnoozed, openClubDialog } from "./clubDialog.js";

let panel = null;
let button = null;
let isOpen = false;
let currentUser = null;
let currentProfile = null;
let hasAskedForIdentity = false;
let hasAskedForClub = false;

// 페이지마다 한 번씩 부른다. 로그인 · 회원가입 페이지에서는 부르지 않는다.
export function mountProfileWidget({ onProfile } = {}) {
  if (document.querySelector(".profile-widget")) return;

  const widget = document.createElement("div");
  widget.className = "profile-widget";

  button = document.createElement("button");
  button.type = "button";
  button.className = "profile-button";
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-label", "내 계정");
  button.innerHTML = '<span class="profile-avatar" aria-hidden="true">👤</span>';

  panel = document.createElement("div");
  panel.className = "profile-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "내 계정");
  panel.hidden = true;

  widget.append(panel, button);
  document.body.appendChild(widget);

  button.addEventListener("click", togglePanel);

  document.addEventListener("click", (event) => {
    if (!isOpen || widget.contains(event.target)) return;
    closePanel();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isOpen) closePanel();
  });

  renderSignedOut();

  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    currentProfile = user ? await resolveUserProfile(user) : null;

    if (user) {
      renderSignedIn(user, currentProfile);
      askForIdentityOnce(currentProfile);
    } else {
      hasAskedForIdentity = false;
      renderSignedOut();
    }

    onProfile?.({ user, profile: currentProfile });
  });
}

// 화면의 다른 단추(E안의 '내 정보', 프로필 단추)로 팝업을 열고 닫는다.
export function toggleProfilePanel() {
  if (!panel) mountProfileWidget();
  togglePanel();
}

function togglePanel() {
  if (isOpen) closePanel();
  else openPanel();
}

function openPanel() {
  isOpen = true;
  panel.classList.remove("is-closing");
  panel.hidden = false;
  button.setAttribute("aria-expanded", "true");
  button.classList.add("is-open");
}

function closePanel() {
  isOpen = false;
  button.setAttribute("aria-expanded", "false");
  button.classList.remove("is-open");

  // 닫힐 때 살짝 작아지며 사라지게 한 뒤 숨긴다.
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !document.body.classList.contains("nu")) {
    panel.hidden = true;
    return;
  }

  panel.classList.add("is-closing");
  setTimeout(() => {
    panel.classList.remove("is-closing");
    if (!isOpen) panel.hidden = true;
  }, 160);
}

// 학번 · 이름이 비어 있는 계정에만 입력 창을 한 번 띄운다.
// 저장하고 나면 needsIdentity 가 거짓이 되어 다시 뜨지 않는다.
function askForIdentityOnce(profile) {
  if (hasAskedForIdentity || !needsIdentity(profile)) {
    askForClubOnce(profile);
    return;
  }

  hasAskedForIdentity = true;

  openIdentityDialog({
    onSaved: async () => {
      currentProfile = await resolveUserProfile(auth.currentUser);
      renderSignedIn(auth.currentUser, currentProfile);
      askForClubOnce(currentProfile);
    }
  });
}

// 소속 동아리가 비어 있으면 한 번 물어본다.
// '나중에'를 누르면 이번 세션에서만 숨기고 다음 로그인 때 다시 뜬다.
function askForClubOnce(profile) {
  if (hasAskedForClub || !needsClubChoice(profile) || isClubChoiceSnoozed()) return;
  hasAskedForClub = true;

  openClubDialog({
    onSaved: async () => {
      currentProfile = await resolveUserProfile(auth.currentUser);
      renderSignedIn(auth.currentUser, currentProfile);
    }
  });
}

// ========================================
// 로그인하지 않은 상태
// ========================================

function renderSignedOut() {
  button.classList.remove("is-signed-in");
  button.innerHTML = '<span class="profile-avatar" aria-hidden="true">👤</span>';

  panel.textContent = "";

  const head = document.createElement("div");
  head.className = "profile-panel-head";

  const avatar = document.createElement("div");
  avatar.className = "profile-panel-avatar";
  avatar.textContent = "👤";

  const title = document.createElement("strong");
  title.className = "profile-panel-name";
  title.textContent = "로그인하지 않음";

  const subtitle = document.createElement("p");
  subtitle.className = "profile-panel-subtitle";
  subtitle.textContent = "로그인하면 예산 신청과 자원 예약을 이용할 수 있습니다.";

  head.append(avatar, title, subtitle);

  const actions = document.createElement("div");
  actions.className = "profile-panel-actions";

  const loginLink = document.createElement("a");
  loginLink.className = "profile-action is-primary";
  loginLink.href = buildLoginUrl();
  loginLink.textContent = "로그인";

  const signUpLink = document.createElement("a");
  signUpLink.className = "profile-action";
  signUpLink.href = `/signup.html?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  signUpLink.textContent = "회원가입";

  actions.append(loginLink, signUpLink);
  panel.append(head, actions);
}

// ========================================
// 로그인한 상태
// ========================================

function renderSignedIn(user, profile) {
  const displayName = getDisplayName(profile, user);
  const isAdminAccount = isAdminEmail(user.email);

  button.classList.add("is-signed-in");
  button.innerHTML = "";

  const initial = document.createElement("span");
  initial.className = "profile-avatar is-initial";
  initial.textContent = displayName.slice(0, 1);
  button.appendChild(initial);

  panel.textContent = "";

  // --- 머리말: 이름 · 권한 배지 ---
  const head = document.createElement("div");
  head.className = "profile-panel-head";

  const avatar = document.createElement("div");
  avatar.className = "profile-panel-avatar is-initial";
  avatar.textContent = displayName.slice(0, 1);

  const name = document.createElement("strong");
  name.className = "profile-panel-name";
  name.textContent = displayName;

  const badges = document.createElement("div");
  badges.className = "profile-badges";
  badges.appendChild(createBadge(
    isAdminAccount ? "관리자" : getRoleName(profile.role),
    isAdminAccount ? "is-admin" : (profile.role === EXECUTIVE_ROLE ? "is-executive" : "")
  ));

  head.append(avatar, name, badges);

  // --- 계정 정보 ---
  const details = document.createElement("dl");
  details.className = "profile-details";

  const studentId = String(profile.studentId ?? "").trim();
  details.append(
    createDetail("학번", studentId
      ? `${studentId} · ${describeStudentId(studentId)}`
      : "등록되지 않음"),
    createDetail("이메일", user.email ?? "이메일 정보 없음")
  );

  // --- 소위원회 ---
  const assigned = SUBCOMMITTEES
    .filter(({ id }) => (profile.subcommitteeRoles?.[id] ?? SUBCOMMITTEE_NONE) !== SUBCOMMITTEE_NONE)
    .map(({ id, name: subcommitteeName }) => (
      `${subcommitteeName} ${getSubcommitteeRoleName(profile.subcommitteeRoles[id])}`
    ));

  details.appendChild(createDetail(
    "소위원회",
    assigned.length > 0 ? assigned.join("\n") : "소속된 소위원회 없음"
  ));

  // --- 특수 권한 ---
  const permissions = [];
  if (profile.printerAccess) permissions.push("3D 프린터 사용");
  if (canWriteNotice(profile)) permissions.push("공지 작성");

  details.appendChild(createDetail(
    "특수 권한",
    permissions.length > 0 ? permissions.join(" · ") : "없음"
  ));

  panel.append(head, details);

  // --- 소속 동아리 ---
  const myClub = getMyClub(profile);
  const leaderOf = getClubLeaderOf(profile);

  details.appendChild(createDetail(
    "소속 동아리",
    myClub ? (leaderOf ? `${myClub} (부장)` : myClub) : "미등록"
  ));

  if (needsClubChoice(profile)) {
    const clubNotice = document.createElement("button");
    clubNotice.type = "button";
    clubNotice.className = "profile-identity-notice";
    clubNotice.textContent = "소속 동아리가 등록되지 않았습니다. 지금 고르기 →";
    clubNotice.addEventListener("click", () => {
      closePanel();
      openClubDialog({
        onSaved: async () => {
          currentProfile = await resolveUserProfile(auth.currentUser);
          renderSignedIn(auth.currentUser, currentProfile);
        }
      });
    });
    panel.appendChild(clubNotice);
  }

  // --- 학번이 비어 있으면 채워 넣을 수 있게 ---
  if (needsIdentity(profile)) {
    const notice = document.createElement("button");
    notice.type = "button";
    notice.className = "profile-identity-notice";
    notice.textContent = "학번·이름이 등록되지 않았습니다. 지금 입력하기 →";
    notice.addEventListener("click", () => {
      closePanel();
      openIdentityDialog({
        onSaved: async () => {
          currentProfile = await resolveUserProfile(auth.currentUser);
          renderSignedIn(auth.currentUser, currentProfile);
        }
      });
    });
    panel.appendChild(notice);
  }

  // --- 바로가기 ---
  const actions = document.createElement("div");
  actions.className = "profile-panel-actions";

  const budgetLink = document.createElement("a");
  budgetLink.className = "profile-action";
  budgetLink.href = "/budget.html";
  budgetLink.textContent = "내 예산 신청 내역";
  actions.appendChild(budgetLink);

  const canOpenAdmin = isAdminAccount
    || (Array.isArray(profile.subcommittees) && profile.subcommittees.length > 0);

  if (canOpenAdmin) {
    const adminLink = document.createElement("a");
    adminLink.className = "profile-action";
    adminLink.href = "/admin.html";
    adminLink.textContent = "관리자 페이지";
    actions.appendChild(adminLink);
  }

  const logoutButton = document.createElement("button");
  logoutButton.type = "button";
  logoutButton.className = "profile-action is-danger";
  logoutButton.textContent = "로그아웃";
  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    logoutButton.textContent = "로그아웃 중...";

    try {
      await signOutUser();
      closePanel();
    } catch (error) {
      console.error("로그아웃 오류:", error);
      logoutButton.disabled = false;
      logoutButton.textContent = "로그아웃";
    }
  });

  actions.appendChild(logoutButton);
  panel.appendChild(actions);
}

// ========================================
// 작은 조각들
// ========================================

function createBadge(text, className = "") {
  const badge = document.createElement("span");
  badge.className = `profile-badge ${className}`.trim();
  badge.textContent = text;
  return badge;
}

function createDetail(label, value) {
  const row = document.createElement("div");
  row.className = "profile-detail-row";

  const term = document.createElement("dt");
  term.textContent = label;

  const description = document.createElement("dd");
  description.textContent = value;

  row.append(term, description);
  return row;
}
