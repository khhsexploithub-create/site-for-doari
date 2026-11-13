// '푸시 알림 켜기' 칸. 알림 메시지 페이지와 홈 화면에서 쓴다.
//
// 화면에 #pushPanel · #pushPanelText · #pushToggleButton 이 있어야 한다.
// compact: 홈 화면처럼 좁은 자리에서는 짧은 문구를 쓴다.

import { checkPushSupport, disablePush, enablePush, isPushEnabledHere } from "./pushService.js";

const MESSAGES = {
  off: "새 공지 · 연합회 행사 · 예산/자원 예약 처리 결과를 이 기기로 바로 받아보세요.",
  on: "이 기기에서 푸시 알림을 받고 있습니다.",
  denied: "알림이 차단되어 있습니다. 브라우저(앱) 설정에서 이 사이트의 알림을 허용한 뒤 다시 눌러주세요.",
  "ios-browser": "아이폰은 Safari 아래 공유 버튼 → '홈 화면에 추가'로 앱을 설치한 뒤, 그 앱에서 알림을 켤 수 있습니다.",
  unsupported: "이 브라우저는 푸시 알림을 지원하지 않습니다. 크롬이나 삼성 인터넷에서 열어주세요.",
  "not-configured": "푸시 알림은 준비 중이에요. 곧 켤 수 있어요."
};

const SHORT_MESSAGES = {
  off: "새 소식을 바로 받아보세요",
  on: "이 기기로 푸시 알림을 받는 중",
  denied: "알림이 차단돼 있어요 · 브라우저 설정에서 허용해주세요",
  "ios-browser": "아이폰은 '홈 화면에 추가'한 앱에서 켤 수 있어요",
  unsupported: "이 브라우저는 푸시 알림을 지원하지 않아요",
  "not-configured": "푸시 알림은 준비 중이에요"
};

// 브라우저가 주는 영어 오류는 사용자에게 그대로 보여 주지 않는다.
function toFriendlyMessage(error) {
  const message = String(error?.message ?? "");
  return /[가-힣]/.test(message) ? message : "알림을 켜지 못했어요. 잠시 후 다시 시도해주세요.";
}

export async function mountPushPanel(user, { compact = false } = {}) {
  const panel = document.querySelector("#pushPanel");
  const text = document.querySelector("#pushPanelText");
  const button = document.querySelector("#pushToggleButton");
  if (!panel || !user) return;

  // 로그인 상태가 다시 바뀌어도 단추에 처리가 두 번 붙지 않게 한다.
  if (panel.dataset.mountedUid === user.uid) return;
  panel.dataset.mountedUid = user.uid;
  button.onclick = null;

  const messages = compact ? SHORT_MESSAGES : MESSAGES;
  const labels = compact
    ? { on: "끄기", off: "켜기" }
    : { on: "푸시 알림 끄기", off: "푸시 알림 켜기" };

  panel.hidden = false;

  const support = await checkPushSupport();
  if (!support.ok) {
    // 좁은 자리(홈)에서는 켤 방법이 없는 안내는 아예 숨긴다. 아이폰 안내만 남긴다.
    if (compact && support.reason !== "ios-browser") {
      panel.hidden = true;
      return;
    }

    text.textContent = messages[support.reason];
    button.hidden = true;
    panel.classList.add("is-unavailable");
    return;
  }

  const render = () => {
    const enabled = isPushEnabledHere();
    const denied = Notification.permission === "denied";

    text.textContent = enabled ? messages.on : denied ? messages.denied : messages.off;
    button.hidden = false;
    button.textContent = enabled ? labels.on : labels.off;
    button.className = enabled ? "secondary" : "";
    button.setAttribute("aria-label", enabled ? "푸시 알림 끄기" : "푸시 알림 켜기");
    panel.classList.toggle("is-on", enabled);
  };

  button.onclick = async () => {
    button.disabled = true;
    const wasEnabled = isPushEnabledHere();
    text.textContent = wasEnabled ? "알림을 끄는 중..." : "알림을 켜는 중...";

    try {
      if (wasEnabled) await disablePush(user);
      else await enablePush(user);
      render();
    } catch (error) {
      console.error("푸시 알림 설정 오류:", error);
      render();
      text.textContent = toFriendlyMessage(error);
    } finally {
      button.disabled = false;
    }
  };

  render();
}

// 로그아웃하면 칸을 숨기고, 다음 로그인 때 다시 붙일 수 있게 한다.
export function unmountPushPanel() {
  const panel = document.querySelector("#pushPanel");
  if (!panel) return;
  panel.hidden = true;
  delete panel.dataset.mountedUid;
}
