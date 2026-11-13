// 사이트 상단의 '종' 버튼.
// 누르면 공지 페이지(/notices.html)로 넘어가고,
// 읽지 않은 공지가 있으면 개수를 빨간 배지로 보여준다.

import { watchNotifications } from "./notificationCenter.js";

const NOTICES_URL = "/notices.html";

// 종 버튼 하나를 만들어 돌려준다.
export function createNoticeBell({ label = "알림" } = {}) {
  const link = document.createElement("a");
  link.className = "notice-bell";
  link.href = NOTICES_URL;
  link.setAttribute("aria-label", "알림 메시지 보기");

  const icon = document.createElement("span");
  icon.className = "notice-bell-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "🔔";

  const text = document.createElement("span");
  text.className = "notice-bell-label";
  text.textContent = label;

  const badge = document.createElement("span");
  badge.className = "notice-bell-badge";
  badge.hidden = true;

  link.append(icon, text, badge);

  return {
    element: link,
    setCount(count) {
      const safeCount = Number(count) || 0;
      badge.hidden = safeCount === 0;
      badge.textContent = safeCount > 99 ? "99+" : String(safeCount);
      link.classList.toggle("has-unread", safeCount > 0);
      link.setAttribute(
        "aria-label",
        safeCount > 0 ? `알림 메시지 보기, 읽지 않음 ${safeCount}건` : "알림 메시지 보기"
      );
    }
  };
}

// 하위 페이지(예산 · 자원 · 캘린더 ...) 상단에 종 버튼을 붙인다.
// '← 홈으로' 링크 옆에 놓아 어느 화면에서나 같은 자리에 오게 한다.
export function mountPageBell(user) {
  // E안 페이지는 공통 틀(위 메뉴 · 아래 메뉴)이 알림 단추를 이미 갖고 있다.
  if (document.body.classList.contains("nu")) return () => {};

  const backLink = document.querySelector(".back-link");
  if (!backLink) return () => {};

  const bar = document.createElement("div");
  bar.className = "page-top-bar";
  backLink.replaceWith(bar);

  const bell = createNoticeBell();
  bar.append(backLink, bell.element);

  // 비로그인 방문자도 공지를 읽을 수 있다. 다만 읽지 않음 표시는 달지 않는다.
  if (!user) {
    bell.setCount(0);
    return () => {};
  }

  return watchNotifications(user, ({ notices }) => bell.setCount(notices));
}
