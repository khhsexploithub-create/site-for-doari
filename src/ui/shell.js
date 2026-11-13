// E안 공통 틀.
//  - PC: 위 메뉴 줄 (로고 · 메뉴 · 알림 · 내 정보)
//  - 모바일: 아래 메뉴 (홈 · 알림 · 내 정보)
//  - 알림 숫자 배지, '내 정보' 단추로 프로필 팝업 열기
//
// 사용: mountShell({ active: "budget" })   ← 홈은 mountShell({ active: "home", topNav: false })
// 모양은 styles/site.css (neoul/core.css) 에 있다. 각 페이지 JS 가 site.css 를 먼저 불러온다.

import { onAuthStateChanged } from "firebase/auth";

import { auth } from "../firebase.js";
import { getDisplayName, getRoleName, isAdminEmail, resolveUserProfile } from "../userRole.js";
import { watchNotifications } from "../notifications/notificationCenter.js";
import { toggleProfilePanel } from "../auth/profileWidget.js";

const NAV_ITEMS = [
  { key: "budget", href: "/budget.html", label: "예산" },
  { key: "activity", href: "/activity.html", label: "동아리 활동" },
  { key: "resources", href: "/resources.html", label: "자원 예약" },
  { key: "calendar", href: "/calendar.html", label: "캘린더" },
  { key: "unionEvents", href: "/union-events.html", label: "연합회 행사" }
];

const ICONS = {
  home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/></svg>',
  bell: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
  user: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>',
  userSmall: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>'
};

let countListeners = [];
let mounted = null;

// 주소를 보고 위 메뉴에서 어느 칸을 켤지 정한다.
export function activeFromPath(pathname = window.location.pathname) {
  if (pathname === "/" || pathname.endsWith("/index.html")) return "home";
  if (pathname.startsWith("/budget")) return "budget";
  if (pathname.startsWith("/activity") || pathname.startsWith("/assignment")
    || pathname.startsWith("/submission")) return "activity";
  if (pathname.startsWith("/resources")) return "resources";
  if (pathname.startsWith("/calendar") || pathname.startsWith("/event")) return "calendar";
  if (pathname.startsWith("/union-events")) return "unionEvents";
  if (pathname.startsWith("/notices")) return "notices";
  return "";
}

// 여러 번 불러도 한 번만 붙는다.
export function mountShell({ active = activeFromPath(), topNav = true } = {}) {
  if (mounted) return mounted;
  document.body.classList.add("nu");

  if (topNav && !document.querySelector(".nu-topnav")) {
    document.body.prepend(buildTopNav(active));
  }

  if (!document.querySelector(".nu-tabbar")) {
    document.body.appendChild(buildTabbar(active));
  }

  document.querySelectorAll("[data-profile-toggle]").forEach(bindProfileToggle);

  let stopWatching = null;

  onAuthStateChanged(auth, async (user) => {
    stopWatching?.();
    stopWatching = null;

    if (!user) {
      setProfileLabel("로그인", "");
      publishCounts(null);
      return;
    }

    const profile = await resolveUserProfile(user);
    const role = isAdminEmail(user.email) ? "관리자" : getRoleName(profile.role);
    setProfileLabel(getDisplayName(profile, user), role);

    stopWatching = watchNotifications(user, publishCounts);
  });

  mounted = {
    // 알림 개수가 바뀔 때마다 불린다. 로그인하지 않았으면 counts 는 null.
    onCounts(listener) {
      countListeners.push(listener);
    }
  };

  return mounted;
}

// ========================================
// 만들기
// ========================================

function buildTopNav(active) {
  const nav = document.createElement("nav");
  nav.className = "nu-topnav";
  nav.setAttribute("aria-label", "주요 메뉴");

  const links = NAV_ITEMS.map(({ key, href, label }) =>
    `<a href="${href}"${key === active ? ' aria-current="page"' : ""}>${label}</a>`
  ).join("");

  nav.innerHTML = `
    <div class="nu-topnav-inner">
      <a href="/" class="nu-brand"><img src="/neoul-wave.png" alt="" aria-hidden="true"><span>너울</span></a>
      <div class="nu-navlinks">${links}</div>
      <div class="nu-nav-actions">
        <a href="/notices.html" class="nu-iconbtn"${active === "notices" ? ' aria-current="page"' : ""} aria-label="알림 메시지 보기" data-count-label="알림 메시지 보기">
          ${ICONS.bell}<span class="nu-badge" data-count-badge hidden></span>
        </a>
        <button type="button" class="nu-profile-pill" data-profile-toggle aria-label="내 계정">
          <span class="nu-avatar">${ICONS.userSmall}</span>
          <span class="nu-profile-name" data-profile-name></span>
        </button>
      </div>
    </div>`;

  return nav;
}

function buildTabbar(active) {
  const nav = document.createElement("nav");
  nav.className = "nu-tabbar";
  nav.setAttribute("aria-label", "아래 메뉴");

  nav.innerHTML = `
    <a href="/" class="nu-tab"${active === "home" ? ' aria-current="page"' : ""}>
      <span class="nu-tab-icon">${ICONS.home}</span>홈
    </a>
    <a href="/notices.html" class="nu-tab"${active === "notices" ? ' aria-current="page"' : ""} data-count-label="알림">
      <span class="nu-tab-icon">${ICONS.bell}<span class="nu-badge" data-count-badge hidden></span></span>알림
    </a>
    <button type="button" class="nu-tab" data-profile-toggle aria-label="내 계정">
      <span class="nu-tab-icon">${ICONS.user}</span>내 정보
    </button>`;

  return nav;
}

function bindProfileToggle(element) {
  if (element.dataset.profileBound) return;
  element.dataset.profileBound = "true";

  element.addEventListener("click", (event) => {
    event.preventDefault();
    // 바깥을 누르면 닫히는 처리와 겹치지 않게 여기서 멈춘다.
    event.stopPropagation();
    toggleProfilePanel();
  });
}

// ========================================
// 상태 반영
// ========================================

function setProfileLabel(name, role) {
  document.querySelectorAll("[data-profile-name]").forEach((element) => {
    element.textContent = "";
    element.append(document.createTextNode(name));

    if (role) {
      const roleElement = document.createElement("span");
      roleElement.className = "nu-profile-role";
      roleElement.textContent = ` · ${role}`;
      element.appendChild(roleElement);
    }
  });
}

function publishCounts(counts) {
  const total = counts?.total ?? 0;

  document.querySelectorAll("[data-count-badge]").forEach((badge) => {
    const wasHidden = badge.hidden;
    badge.hidden = total === 0;
    badge.textContent = total > 99 ? "99+" : String(total);

    // 숫자가 새로 생기면 톡 튀어나오는 효과를 다시 준다.
    if (wasHidden && total > 0) {
      badge.style.animation = "none";
      void badge.offsetWidth;
      badge.style.animation = "";
    }
  });

  document.querySelectorAll("[data-count-label]").forEach((element) => {
    const label = element.dataset.countLabel;
    element.setAttribute("aria-label", total > 0 ? `${label}, 읽지 않음 ${total}건` : label);
  });

  countListeners.forEach((listener) => listener(counts));
}
