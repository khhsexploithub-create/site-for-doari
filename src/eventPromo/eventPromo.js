// 캘린더 페이지의 '행사 홍보'.
// 등록은 여기에서 하고, 등록한 내용을 고치거나 지우는 것은
// 관리자 화면의 '05 행사 홍보 관리'에서 행사운영 소위원장이 한다.

import { EXECUTIVE_ROLE } from "../userRole.js";
import { createClubTag, fillClubSelect } from "../clubList.js";
import { compressImage, formatBytes } from "./imageCompress.js";
import {
  createClubEvent,
  getEventUrl,
  subscribeToClubEvents
} from "./eventService.js";

const form = document.querySelector("#eventPromoForm");
const clubSelect = document.querySelector("#eventClubName");
const titleInput = document.querySelector("#eventTitle");
const dateInput = document.querySelector("#eventDate");
const locationInput = document.querySelector("#eventLocation");
const startTimeInput = document.querySelector("#eventStartTime");
const endTimeInput = document.querySelector("#eventEndTime");
const promotionInput = document.querySelector("#eventPromotion");
const planInput = document.querySelector("#eventPlan");
const posterInput = document.querySelector("#eventPoster");
const posterPreviewBox = document.querySelector("#eventPosterPreviewBox");
const posterPreview = document.querySelector("#eventPosterPreview");
const posterRemoveButton = document.querySelector("#eventPosterRemove");
const submitButton = document.querySelector("#eventPromoSubmitButton");
const authMessage = document.querySelector("#eventPromoAuthMessage");
const formMessage = document.querySelector("#eventPromoMessage");
const listElement = document.querySelector("#eventPromoList");

let events = [];
let posterDataUrl = "";
let isSubmitting = false;
let canRegister = false;
let onEventsChanged = null;

export function initEventPromo({ user, role, onChange } = {}) {
  onEventsChanged = onChange;

  fillClubSelect(clubSelect);

  canRegister = role === EXECUTIVE_ROLE;
  form.hidden = !canRegister;
  submitButton.disabled = !canRegister;

  // 등록할 수 없는 사람에게는 신청란 안내를 열람용 문구로 바꾼다.
  const sectionHeading = document.querySelector("#eventPromoHeading");
  const sectionDescription = sectionHeading?.nextElementSibling;

  if (!canRegister && sectionDescription) {
    sectionHeading.textContent = "행사 안내";
    sectionDescription.textContent = "동아리가 등록한 행사를 확인할 수 있습니다.";
  }

  authMessage.textContent = canRegister
    ? `로그인 계정: ${user?.email ?? "이메일 정보 없음"}`
    : "";

  watchEvents();
}

function watchEvents() {
  subscribeToClubEvents(
    (nextEvents) => {
      events = nextEvents;
      renderEventList();
      onEventsChanged?.(events);
    },
    (error) => {
      console.error("행사 조회 오류:", error);
      listElement.textContent = "행사를 불러오지 못했습니다.";
    }
  );
}

function renderEventList() {
  listElement.textContent = "";

  if (events.length === 0) {
    const empty = document.createElement("li");
    empty.className = "event-promo-empty";
    empty.textContent = "아직 등록된 행사가 없습니다.";
    listElement.appendChild(empty);
    return;
  }

  const todayKey = new Date().toISOString().slice(0, 10);

  events.forEach((clubEvent) => {
    const item = document.createElement("li");
    item.appendChild(createEventCard(clubEvent, todayKey));
    listElement.appendChild(item);
  });
}

// 관리자 화면 목록에서도 같은 모양을 쓴다.
export function createEventCard(clubEvent, todayKey = "") {
  const link = document.createElement("a");
  link.className = "event-promo-item";
  link.href = getEventUrl(clubEvent.id);
  link.classList.toggle("is-past", Boolean(todayKey) && (clubEvent.date ?? "") < todayKey);

  if (clubEvent.posterImage) {
    const thumb = document.createElement("img");
    thumb.className = "event-promo-thumb";
    thumb.src = clubEvent.posterImage;
    thumb.alt = "";
    link.appendChild(thumb);
  }

  const body = document.createElement("div");
  body.className = "event-promo-body";

  const title = document.createElement("strong");
  title.textContent = clubEvent.title ?? "행사 이름 없음";

  const meta = document.createElement("span");
  meta.className = "event-promo-meta";
  meta.append(
    createClubTag(clubEvent.clubName),
    document.createTextNode(
      `${clubEvent.date ?? "날짜 미정"} ${clubEvent.startTime ?? ""}${clubEvent.endTime ? `–${clubEvent.endTime}` : ""} · ${clubEvent.location ?? "장소 미정"}`
    )
  );

  body.append(title, meta);
  link.appendChild(body);

  return link;
}

// ========================================
// 포스터 이미지
// ========================================

posterInput.addEventListener("change", async () => {
  const file = posterInput.files?.[0];

  if (!file) {
    clearPoster();
    return;
  }

  formMessage.textContent = "이미지를 줄이는 중...";

  try {
    const { dataUrl, width, height, bytes } = await compressImage(file);
    posterDataUrl = dataUrl;
    posterPreview.src = dataUrl;
    posterPreviewBox.hidden = false;
    formMessage.textContent = `포스터 준비 완료 (${width}×${height}, ${formatBytes(bytes)})`;
  } catch (error) {
    console.error("이미지 처리 오류:", error);
    clearPoster();
    formMessage.textContent = error.message ?? "이미지를 처리하지 못했습니다.";
  }
});

posterRemoveButton.addEventListener("click", () => {
  clearPoster();
  formMessage.textContent = "포스터 이미지를 뺐습니다.";
});

function clearPoster() {
  posterDataUrl = "";
  posterInput.value = "";
  posterPreview.removeAttribute("src");
  posterPreviewBox.hidden = true;
}

// ========================================
// 등록
// ========================================

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSubmitting || !canRegister) return;

  const clubEvent = {
    clubName: clubSelect.value,
    title: titleInput.value.trim(),
    date: dateInput.value,
    location: locationInput.value.trim(),
    startTime: startTimeInput.value,
    endTime: endTimeInput.value,
    promotion: promotionInput.value.trim(),
    plan: planInput.value.trim(),
    posterImage: posterDataUrl
  };

  if (!clubEvent.clubName) {
    formMessage.textContent = "동아리명을 선택해주세요.";
    return;
  }

  const required = ["title", "date", "location", "startTime", "endTime", "promotion", "plan"];

  if (required.some((field) => !clubEvent[field])) {
    formMessage.textContent = "포스터를 뺀 모든 항목을 입력해주세요.";
    return;
  }

  if (clubEvent.endTime <= clubEvent.startTime) {
    formMessage.textContent = "종료 시간은 시작 시간보다 늦어야 합니다.";
    return;
  }

  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = "등록 중...";
  formMessage.textContent = "";

  try {
    await createClubEvent(clubEvent);
    form.reset();
    fillClubSelect(clubSelect);
    clearPoster();
    formMessage.textContent = "행사 홍보를 등록했습니다.";
  } catch (error) {
    console.error("행사 등록 오류:", error);
    formMessage.textContent = "행사를 등록하지 못했습니다. 잠시 후 다시 시도해주세요.";
  } finally {
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = "행사 홍보 등록";
  }
});
