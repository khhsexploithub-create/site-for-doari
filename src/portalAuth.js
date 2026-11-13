import "./styles/site.css";
import "./styles/neoul/home.css";

import { onAuthStateChanged } from "firebase/auth";

import { auth } from "./firebase.js";
import {
  EXECUTIVE_ROLE,
  getDisplayName,
  getRoleName,
  isAdminEmail,
  resolveUserProfile
} from "./userRole.js";
import { buildLoginUrl } from "./auth/authService.js";
import { mountProfileWidget } from "./auth/profileWidget.js";
import { watchNotificationFeed } from "./notifications/notificationCenter.js";
import { mountShell } from "./ui/shell.js";
import { mountPushPanel, unmountPushPanel } from "./push/pushPanel.js";

const greeting = document.querySelector("#portalGreeting");
const executiveOnlyElements = document.querySelectorAll("[data-executive-only]");
const subcommitteeOnlyElements = document.querySelectorAll("[data-subcommittee-only]");
const notifyCards = document.querySelectorAll("[data-notify-section]");
const loginOnlyCards = document.querySelectorAll("[data-requires-login]");

const feedList = document.querySelector("#homeFeedList");
const feedHeading = document.querySelector("#homeFeedHeading");
const feedCount = document.querySelector("#homeFeedCount");

let stopWatchingFeed = null;
let isSignedIn = false;

const LOCK_ICON = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

// 홈 화면은 로그인 없이도 열린다. 프로필 팝업과 공통 틀(아래 메뉴 · 알림 배지)을 붙인다.
mountProfileWidget();
const shell = mountShell({ active: "home", topNav: false });

renderToday();

// 타일의 '새 소식' 표시는 공통 틀이 받아 온 알림 개수를 그대로 쓴다.
shell.onCounts((counts) => {
  notifyCards.forEach((card) => setCardBadge(card, counts?.[card.dataset.notifySection] ?? 0));
});

onAuthStateChanged(auth, async (user) => {
  stopWatchingFeed?.();
  stopWatchingFeed = null;

  if (!user) {
    showSignedOut();
  } else {
    const profile = await resolveUserProfile(user);
    showSignedIn(user, profile);
  }

  stopWatchingFeed = watchNotificationFeed(user, renderFeed, { limit: 3 });
});

// ========================================
// 로그인하지 않은 상태
// ========================================

function showSignedOut() {
  isSignedIn = false;
  unmountPushPanel();
  greeting.textContent = "둘러보는 중이에요 · 로그인하면 신청도 할 수 있어요";

  executiveOnlyElements.forEach((element) => { element.hidden = true; });
  subcommitteeOnlyElements.forEach((element) => { element.hidden = true; });

  clearCardBadges();

  // 예산 · 자원 예약은 로그인해야 열 수 있다. 잠금 표시를 달고 로그인 화면으로 보낸다.
  loginOnlyCards.forEach((card) => {
    card.classList.add("is-locked");
    card.dataset.href = card.dataset.href || card.getAttribute("href");
    card.setAttribute("href", buildLoginUrl(card.dataset.href));
    setCardLock(card, true);
  });
}

// ========================================
// 로그인한 상태
// ========================================

function showSignedIn(user, profile) {
  isSignedIn = true;

  // 홈에서도 바로 푸시 알림을 켤 수 있게 한다. (PC: 새 알림 카드 아래 / 모바일: 머리 아래 띠)
  mountPushPanel(user, { compact: true });
  const isAdminAccount = isAdminEmail(user.email);

  greeting.textContent = `${getDisplayName(profile, user)}님, 환영합니다 · `
    + `${isAdminAccount ? "관리자" : getRoleName(profile.role)}`;

  // 관리자 페이지 링크는 연합회 임원에게만 보인다.
  executiveOnlyElements.forEach((element) => {
    element.hidden = profile.role !== EXECUTIVE_ROLE;
  });

  subcommitteeOnlyElements.forEach((element) => {
    element.hidden = !(Array.isArray(profile.subcommittees) && profile.subcommittees.length > 0);
  });

  // 잠금을 풀고 원래 주소로 되돌린다.
  loginOnlyCards.forEach((card) => {
    card.classList.remove("is-locked");
    if (card.dataset.href) card.setAttribute("href", card.dataset.href);
    setCardLock(card, false);
  });
}

// ========================================
// 새 알림 칸
// ========================================

function renderFeed({ items, unreadCount, isSignedIn: signedIn }) {
  feedHeading.textContent = signedIn ? "새 알림" : "최근 소식";
  feedCount.hidden = unreadCount === 0;
  feedCount.textContent = unreadCount > 99 ? "99+" : String(unreadCount);

  feedList.textContent = "";

  if (items.length === 0) {
    const empty = document.createElement("li");
    empty.className = "home-feed-empty";
    empty.textContent = signedIn ? "새로 온 알림이 없어요." : "아직 올라온 소식이 없어요.";
    feedList.appendChild(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("li");
    const link = document.createElement("a");
    link.href = item.href;

    if (item.unread) {
      const dot = document.createElement("span");
      dot.className = "home-feed-dot";
      dot.setAttribute("aria-label", "읽지 않음");
      link.appendChild(dot);
    }

    const tag = document.createElement("span");
    tag.className = `home-feed-tag${item.tone ? ` is-${item.tone}` : ""}`;
    tag.textContent = item.tag;

    const title = document.createElement("span");
    title.className = "home-feed-title";
    title.textContent = item.title;

    const meta = document.createElement("span");
    meta.className = "home-feed-meta";
    meta.textContent = [item.meta, formatRelative(item.time)].filter(Boolean).join(" · ");

    link.append(tag, title, meta);
    row.appendChild(link);
    feedList.appendChild(row);
  });
}

function formatRelative(millis) {
  if (!millis) return "";
  const minutes = Math.round((Date.now() - millis) / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}일 전`;
  const date = new Date(millis);
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

// ========================================
// 캘린더 타일 (오늘 날짜)
// ========================================

function renderToday() {
  const now = new Date();
  const weekdays = ["일요일", "월요일", "화요일", "수요일", "목요일", "금요일", "토요일"];
  document.querySelector("#homeDay").textContent = String(now.getDate());
  document.querySelector("#homeMonth").textContent = `${now.getMonth() + 1}월`;
  document.querySelector("#homeWeekday").textContent = weekdays[now.getDay()];
}

// ========================================
// 타일 표시
// ========================================

function setCardLock(card, locked) {
  let lock = card.querySelector(".portal-card-lock");

  if (!locked) {
    lock?.remove();
    return;
  }

  if (!lock) {
    lock = document.createElement("span");
    lock.className = "portal-card-lock";
    lock.innerHTML = `${LOCK_ICON}<span>로그인 필요</span>`;
    card.appendChild(lock);
  }
}

function setCardBadge(card, count) {
  let badge = card.querySelector(".portal-card-badge");

  if (!isSignedIn || count <= 0) {
    badge?.remove();
    card.classList.remove("has-unread");
    return;
  }

  if (!badge) {
    badge = document.createElement("span");
    badge.className = "portal-card-badge";
    card.appendChild(badge);
  }

  const label = card.dataset.badgeLabel ?? "새 소식";
  badge.textContent = `${label} ${count > 99 ? "99+" : count}`;
  badge.setAttribute("aria-label", `읽지 않은 ${label} ${count}건`);
  card.classList.add("has-unread");
}

function clearCardBadges() {
  notifyCards.forEach((card) => {
    card.querySelector(".portal-card-badge")?.remove();
    card.classList.remove("has-unread");
  });
}
