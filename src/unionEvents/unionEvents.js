import "../styles/site.css";
import "../styles/neoul/events.css";

import { guardPage } from "../pageGuard.js";
import { canManageUnionEvent } from "../userRole.js";
import { mountPageBell } from "../notifications/bell.js";
import { markSectionRead } from "../notifications/readState.js";
import { compressImage, formatBytes } from "../eventPromo/imageCompress.js";
import {
  createUnionEvent,
  deleteUnionEvent,
  splitByDate,
  subscribeToUnionEvents,
  updateUnionEvent
} from "./unionEventService.js";

const formSection = document.querySelector("#unionEventFormSection");
const form = document.querySelector("#unionEventForm");
const editingIdInput = document.querySelector("#unionEventEditingId");
const titleInput = document.querySelector("#unionEventTitle");
const dateInput = document.querySelector("#unionEventDate");
const startTimeInput = document.querySelector("#unionEventStartTime");
const endTimeInput = document.querySelector("#unionEventEndTime");
const locationInput = document.querySelector("#unionEventLocation");
const targetInput = document.querySelector("#unionEventTarget");
const contentInput = document.querySelector("#unionEventContent");
const posterInput = document.querySelector("#unionEventPoster");
const posterPreviewBox = document.querySelector("#unionEventPosterPreviewBox");
const posterPreview = document.querySelector("#unionEventPosterPreview");
const posterRemoveButton = document.querySelector("#unionEventPosterRemove");
const submitButton = document.querySelector("#unionEventSubmitButton");
const cancelEditButton = document.querySelector("#unionEventCancelEditButton");
const authMessage = document.querySelector("#unionEventAuthMessage");
const formMessage = document.querySelector("#unionEventFormMessage");

const upcomingList = document.querySelector("#upcomingEventList");
const pastList = document.querySelector("#pastEventList");

const dialog = document.querySelector("#unionEventDialog");
const dialogClose = document.querySelector("#unionEventDialogClose");
const detailBadge = document.querySelector("#unionEventDetailBadge");
const detailTitle = document.querySelector("#unionEventDetailTitle");
const detailPoster = document.querySelector("#unionEventDetailPoster");
const detailDate = document.querySelector("#unionEventDetailDate");
const detailTime = document.querySelector("#unionEventDetailTime");
const detailLocation = document.querySelector("#unionEventDetailLocation");
const detailTarget = document.querySelector("#unionEventDetailTarget");
const detailContent = document.querySelector("#unionEventDetailContent");
const detailAuthor = document.querySelector("#unionEventDetailAuthor");
const detailActions = document.querySelector("#unionEventDetailActions");
const editButton = document.querySelector("#unionEventEditButton");
const deleteButton = document.querySelector("#unionEventDeleteButton");

let unionEvents = [];
let canManage = false;
let posterDataUrl = "";
let isSubmitting = false;
let openedEvent = null;

dialogClose.addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => {
  if (event.target === dialog) dialog.close();
});

guardPage({
  allowAnonymous: true,
  onReady: ({ user, profile }) => {
    canManage = canManageUnionEvent(profile);

    formSection.hidden = !canManage;
    detailActions.hidden = !canManage;

    authMessage.textContent = canManage
      ? `로그인 계정: ${user?.email ?? "이메일 정보 없음"}`
      : "";

    mountPageBell(user);
    watchUnionEvents();

    // 이 화면을 열었으므로 '연합회 행사' 알림을 읽은 것으로 표시한다.
    if (user) markSectionRead("unionEvents");
  }
});

function watchUnionEvents() {
  subscribeToUnionEvents(
    (nextEvents) => {
      unionEvents = nextEvents;
      renderLists();
    },
    (error) => {
      console.error("연합회 행사 조회 오류:", error);
      upcomingList.textContent = "";
      upcomingList.appendChild(createEmptyItem("행사를 불러오지 못했습니다."));
    }
  );
}

// ========================================
// 목록
// ========================================

function renderLists() {
  const { upcoming, past } = splitByDate(unionEvents, todayKey());

  renderList(upcomingList, upcoming, "예정된 연합회 행사가 없습니다.");
  renderList(pastList, past, "지난 연합회 행사가 없습니다.");
}

function renderList(listElement, items, emptyMessage) {
  listElement.textContent = "";

  if (items.length === 0) {
    listElement.appendChild(createEmptyItem(emptyMessage));
    return;
  }

  items.forEach((unionEvent) => {
    const item = document.createElement("li");
    item.appendChild(createEventCard(unionEvent));
    listElement.appendChild(item);
  });
}

function createEmptyItem(text) {
  const empty = document.createElement("li");
  empty.className = "union-event-empty";
  empty.textContent = text;
  return empty;
}

function createEventCard(unionEvent) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "union-event-item";
  card.classList.toggle("is-past", (unionEvent.date ?? "") < todayKey());

  // 포스터 자리 (없으면 빈 판) + 날짜 딱지
  const visual = document.createElement("span");
  visual.className = "union-event-visual";

  if (unionEvent.posterImage) {
    const thumb = document.createElement("img");
    thumb.className = "union-event-thumb";
    thumb.src = unionEvent.posterImage;
    thumb.alt = "";
    visual.appendChild(thumb);
  }

  visual.appendChild(createDateChip(unionEvent.date));
  card.appendChild(visual);

  const body = document.createElement("div");
  body.className = "union-event-body";

  const title = document.createElement("strong");
  title.textContent = unionEvent.title ?? "행사 제목 없음";

  const meta = document.createElement("span");
  meta.className = "union-event-meta";
  meta.textContent = `${formatDate(unionEvent.date)} ${unionEvent.startTime ?? ""}${unionEvent.endTime ? `–${unionEvent.endTime}` : ""} · ${unionEvent.location ?? "장소 미정"}`;

  const target = document.createElement("span");
  target.className = "union-event-target";
  target.textContent = `대상: ${unionEvent.target || "전체"}`;

  body.append(title, meta, target);
  card.appendChild(body);
  card.addEventListener("click", () => showDetail(unionEvent));

  return card;
}

function createDateChip(dateKey) {
  const chip = document.createElement("span");
  chip.className = "union-event-date";
  chip.setAttribute("aria-hidden", "true");

  const [, month, day] = (dateKey ?? "").split("-").map(Number);
  const monthText = document.createElement("small");
  const dayText = document.createElement("b");
  monthText.textContent = month ? `${month}월` : "";
  dayText.textContent = day ? String(day) : "?";

  chip.append(monthText, dayText);
  return chip;
}

// ========================================
// 상세 보기
// ========================================

function showDetail(unionEvent) {
  openedEvent = unionEvent;

  detailBadge.textContent = (unionEvent.date ?? "") < todayKey() ? "지난 행사" : "다가오는 행사";
  detailTitle.textContent = unionEvent.title ?? "행사 제목 없음";

  if (unionEvent.posterImage) {
    detailPoster.src = unionEvent.posterImage;
    detailPoster.hidden = false;
  } else {
    detailPoster.removeAttribute("src");
    detailPoster.hidden = true;
  }

  detailDate.textContent = formatDate(unionEvent.date);
  detailTime.textContent = `${unionEvent.startTime ?? "시간 미정"}${unionEvent.endTime ? ` ~ ${unionEvent.endTime}` : ""}`;
  detailLocation.textContent = unionEvent.location || "장소 미정";
  detailTarget.textContent = unionEvent.target || "전체";
  detailContent.textContent = unionEvent.content || "등록된 내용이 없습니다.";
  detailAuthor.textContent = `${unionEvent.authorName || "작성자 미상"} · ${formatDateTime(unionEvent.createdAt)}`;

  detailActions.hidden = !canManage;
  dialog.showModal();
}

editButton.addEventListener("click", () => {
  if (!canManage || !openedEvent) return;

  editingIdInput.value = openedEvent.id;
  titleInput.value = openedEvent.title ?? "";
  dateInput.value = openedEvent.date ?? "";
  startTimeInput.value = openedEvent.startTime ?? "";
  endTimeInput.value = openedEvent.endTime ?? "";
  locationInput.value = openedEvent.location ?? "";
  targetInput.value = openedEvent.target ?? "";
  contentInput.value = openedEvent.content ?? "";

  setPoster(openedEvent.posterImage ?? "");

  submitButton.textContent = "수정 저장";
  cancelEditButton.hidden = false;
  formMessage.textContent = "행사를 수정하고 있습니다.";

  dialog.close();
  form.scrollIntoView({ behavior: "smooth", block: "start" });
});

deleteButton.addEventListener("click", async () => {
  if (!canManage || !openedEvent) return;
  if (!window.confirm(`'${openedEvent.title ?? "행사"}'를 삭제할까요? 되돌릴 수 없습니다.`)) return;

  deleteButton.disabled = true;

  try {
    await deleteUnionEvent(openedEvent.id);
    dialog.close();
  } catch (error) {
    console.error("연합회 행사 삭제 오류:", error);
    window.alert("행사를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.");
  } finally {
    deleteButton.disabled = false;
  }
});

cancelEditButton.addEventListener("click", resetForm);

// ========================================
// 포스터
// ========================================

posterInput.addEventListener("change", async () => {
  const file = posterInput.files?.[0];

  if (!file) {
    setPoster("");
    return;
  }

  formMessage.textContent = "이미지를 줄이는 중...";

  try {
    const { dataUrl, width, height, bytes } = await compressImage(file);
    setPoster(dataUrl);
    formMessage.textContent = `포스터 준비 완료 (${width}×${height}, ${formatBytes(bytes)})`;
  } catch (error) {
    console.error("이미지 처리 오류:", error);
    setPoster("");
    formMessage.textContent = error.message ?? "이미지를 처리하지 못했습니다.";
  }
});

posterRemoveButton.addEventListener("click", () => {
  setPoster("");
  formMessage.textContent = "포스터 이미지를 뺐습니다.";
});

function setPoster(dataUrl) {
  posterDataUrl = dataUrl ?? "";

  if (posterDataUrl) {
    posterPreview.src = posterDataUrl;
    posterPreviewBox.hidden = false;
  } else {
    posterInput.value = "";
    posterPreview.removeAttribute("src");
    posterPreviewBox.hidden = true;
  }
}

// ========================================
// 등록 · 수정
// ========================================

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!canManage || isSubmitting) return;

  const unionEvent = {
    title: titleInput.value.trim(),
    date: dateInput.value,
    startTime: startTimeInput.value,
    endTime: endTimeInput.value,
    location: locationInput.value.trim(),
    target: targetInput.value.trim(),
    content: contentInput.value.trim(),
    posterImage: posterDataUrl
  };

  const required = ["title", "date", "startTime", "endTime", "location", "target", "content"];

  if (required.some((field) => !unionEvent[field])) {
    formMessage.textContent = "포스터를 뺀 모든 항목을 입력해주세요.";
    return;
  }

  if (unionEvent.endTime <= unionEvent.startTime) {
    formMessage.textContent = "종료 시간은 시작 시간보다 늦어야 합니다.";
    return;
  }

  const editingId = editingIdInput.value;

  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = editingId ? "저장 중..." : "등록 중...";
  formMessage.textContent = "";

  try {
    if (editingId) {
      await updateUnionEvent(editingId, unionEvent);
      resetForm();
      formMessage.textContent = "행사를 수정했습니다.";
    } else {
      await createUnionEvent(unionEvent);
      resetForm();
      formMessage.textContent = "연합회 행사를 등록했습니다.";
    }
  } catch (error) {
    console.error("연합회 행사 저장 오류:", error);
    formMessage.textContent = "행사를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
  } finally {
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = editingIdInput.value ? "수정 저장" : "행사 등록";
  }
});

function resetForm() {
  form.reset();
  editingIdInput.value = "";
  setPoster("");
  submitButton.textContent = "행사 등록";
  cancelEditButton.hidden = true;
  formMessage.textContent = "";
}

// ========================================
// 날짜 표시
// ========================================

function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatDate(dateKey) {
  if (!dateKey) return "날짜 미정";

  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime())
    ? "날짜 미정"
    : new Intl.DateTimeFormat("ko-KR", {
      year: "numeric", month: "long", day: "numeric", weekday: "short"
    }).format(date);
}

function formatDateTime(timestamp) {
  if (!timestamp) return "시간 정보 없음";

  const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "시간 정보 없음" : date.toLocaleString("ko-KR");
}
