// 관리자 화면 '05 행사 홍보 관리'.
// 등록은 캘린더 페이지에서 하고, 여기서는 수정과 삭제만 한다.
// 고치고 지우는 것은 행사운영 소위원장만, 소위원회 임원은 열람만 한다.

import { CLUBS } from "../clubList.js";
import { compressImage, formatBytes } from "../eventPromo/imageCompress.js";
import {
  deleteClubEvent,
  subscribeToClubEvents,
  updateClubEvent
} from "../eventPromo/eventService.js";
import {
  createField,
  createInfoLine,
  formatDateTime,
  normalize,
  todayKey
} from "./adminUi.js";

const listElement = document.querySelector("#eventAdminList");
const searchInput = document.querySelector("#eventAdminSearch");
const refreshButton = document.querySelector("#eventAdminRefreshButton");
const notice = document.querySelector("#eventAdminNotice");
const totalCount = document.querySelector("#eventTotalCount");
const upcomingCount = document.querySelector("#eventUpcomingCount");
const pastCount = document.querySelector("#eventPastCount");

let events = [];
let isInitialized = false;
let canManage = false;
let unsubscribe = null;

export function initEventAdmin({ canManage: canManageEvents = false } = {}) {
  canManage = canManageEvents;

  notice.hidden = canManage;
  notice.textContent = canManage
    ? ""
    : "행사운영 소위원회 임원 권한입니다. 등록된 행사를 열람할 수 있고, 수정 · 삭제는 소위원장만 할 수 있습니다.";

  if (isInitialized) {
    renderEvents();
    return;
  }

  isInitialized = true;
  searchInput.addEventListener("input", renderEvents);
  refreshButton.addEventListener("click", () => renderEvents());
}

export function loadEventAdmin() {
  listElement.textContent = "행사를 불러오는 중...";

  unsubscribe?.();
  unsubscribe = subscribeToClubEvents(
    (nextEvents) => {
      events = nextEvents;
      renderStats();
      renderEvents();
    },
    (error) => {
      console.error("행사 조회 오류:", error);
      listElement.textContent = "행사를 불러오지 못했습니다.";
    }
  );
}

function renderStats() {
  const today = todayKey();
  const upcoming = events.filter((clubEvent) => (clubEvent.date ?? "") >= today).length;

  totalCount.textContent = events.length.toLocaleString("ko-KR");
  upcomingCount.textContent = upcoming.toLocaleString("ko-KR");
  pastCount.textContent = (events.length - upcoming).toLocaleString("ko-KR");
}

function renderEvents() {
  const searchTerm = normalize(searchInput.value.trim());
  const filtered = events.filter((clubEvent) => (
    !searchTerm
    || normalize(clubEvent.clubName).includes(searchTerm)
    || normalize(clubEvent.title).includes(searchTerm)
    || normalize(clubEvent.date).includes(searchTerm)
  ));

  listElement.textContent = "";

  if (filtered.length === 0) {
    listElement.textContent = searchTerm
      ? "검색 결과가 없습니다."
      : "아직 등록된 행사가 없습니다.";
    return;
  }

  filtered.forEach((clubEvent) => listElement.appendChild(createEventAdminCard(clubEvent)));
}

function createEventAdminCard(clubEvent) {
  const card = document.createElement("article");
  card.className = "admin-card event-admin-card";

  const title = document.createElement("h2");
  title.textContent = `${clubEvent.date ?? "날짜 미정"} · ${clubEvent.title ?? "행사 이름 없음"}`;

  const createdAt = createInfoLine("등록 시간", formatDateTime(clubEvent.createdAt));

  const editGrid = document.createElement("div");
  editGrid.className = "admin-edit-grid";

  const clubField = createClubField(clubEvent.clubName ?? "");
  const titleField = createField("행사 이름", { value: clubEvent.title ?? "" });
  const dateField = createField("날짜", { type: "date", value: clubEvent.date ?? "" });
  const locationField = createField("장소", { value: clubEvent.location ?? "" });
  const startField = createField("시작 시간", { type: "time", value: clubEvent.startTime ?? "" });
  const endField = createField("종료 시간", { type: "time", value: clubEvent.endTime ?? "" });

  editGrid.append(
    clubField.label,
    titleField.label,
    dateField.label,
    locationField.label,
    startField.label,
    endField.label
  );

  const promotionField = createField("홍보 내용", {
    value: clubEvent.promotion ?? "",
    multiline: true
  });

  const planField = createField("행사 계획", {
    value: clubEvent.plan ?? "",
    multiline: true
  });

  // ========================================
  // 포스터
  // ========================================

  let posterDataUrl = clubEvent.posterImage ?? "";

  const posterBox = document.createElement("div");
  posterBox.className = "event-poster-edit";

  const posterLabel = document.createElement("div");
  posterLabel.className = "admin-permission-title";
  posterLabel.textContent = "포스터 이미지";

  const posterPreview = document.createElement("img");
  posterPreview.className = "event-poster-thumb";
  posterPreview.alt = "포스터 미리보기";

  const posterEmpty = document.createElement("p");
  posterEmpty.className = "schedule-field-hint";
  posterEmpty.textContent = "등록된 포스터가 없습니다.";

  const posterInput = document.createElement("input");
  posterInput.type = "file";
  posterInput.accept = "image/*";

  const posterRemoveButton = document.createElement("button");
  posterRemoveButton.type = "button";
  posterRemoveButton.className = "secondary";
  posterRemoveButton.textContent = "이미지 제거";

  const posterMessage = document.createElement("p");
  posterMessage.className = "schedule-field-hint";

  function showPoster() {
    const hasPoster = Boolean(posterDataUrl);

    posterPreview.hidden = !hasPoster;
    posterEmpty.hidden = hasPoster;
    posterRemoveButton.hidden = !hasPoster || !canManage;

    if (hasPoster) {
      posterPreview.src = posterDataUrl;
    } else {
      posterPreview.removeAttribute("src");
    }
  }

  posterInput.addEventListener("change", async () => {
    const file = posterInput.files?.[0];

    if (!file) return;

    posterMessage.textContent = "이미지를 줄이는 중...";

    try {
      const { dataUrl, width, height, bytes } = await compressImage(file);
      posterDataUrl = dataUrl;
      showPoster();
      posterMessage.textContent = `새 포스터 준비 완료 (${width}×${height}, ${formatBytes(bytes)}) · '수정 저장'을 눌러야 반영됩니다.`;
    } catch (error) {
      console.error("이미지 처리 오류:", error);
      posterInput.value = "";
      posterMessage.textContent = error.message ?? "이미지를 처리하지 못했습니다.";
    }
  });

  posterRemoveButton.addEventListener("click", () => {
    posterDataUrl = "";
    posterInput.value = "";
    showPoster();
    posterMessage.textContent = "포스터를 뺐습니다. '수정 저장'을 눌러야 반영됩니다.";
  });

  posterBox.append(posterLabel, posterPreview, posterEmpty, posterInput, posterRemoveButton, posterMessage);
  showPoster();

  // ========================================
  // 저장 · 삭제
  // ========================================

  const message = document.createElement("p");
  message.className = "message admin-card-message-line";

  const actions = document.createElement("div");
  actions.className = "admin-card-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.textContent = "수정 저장";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger";
  deleteButton.textContent = "삭제";

  saveButton.addEventListener("click", async () => {
    const updated = {
      clubName: clubField.input.value,
      title: titleField.input.value.trim(),
      date: dateField.input.value,
      location: locationField.input.value.trim(),
      startTime: startField.input.value,
      endTime: endField.input.value,
      promotion: promotionField.input.value.trim(),
      plan: planField.input.value.trim(),
      posterImage: posterDataUrl
    };

    // 포스터는 비어 있어도 된다.
    const required = ["clubName", "title", "date", "location", "startTime", "endTime", "promotion", "plan"];

    if (required.some((field) => !updated[field])) {
      message.textContent = "포스터를 뺀 모든 항목을 입력해주세요.";
      return;
    }

    if (updated.endTime <= updated.startTime) {
      message.textContent = "종료 시간은 시작 시간보다 늦어야 합니다.";
      return;
    }

    saveButton.disabled = true;
    deleteButton.disabled = true;
    saveButton.textContent = "저장 중...";
    message.textContent = "";

    try {
      await updateClubEvent(clubEvent.id, updated);
      message.textContent = "행사 내용을 저장했습니다.";
      message.classList.add("is-done");
      posterMessage.textContent = "";
    } catch (error) {
      console.error("행사 수정 오류:", error);
      message.textContent = "행사를 수정하지 못했습니다. 잠시 후 다시 시도해주세요.";
    } finally {
      saveButton.disabled = false;
      deleteButton.disabled = false;
      saveButton.textContent = "수정 저장";
    }
  });

  deleteButton.addEventListener("click", async () => {
    if (!window.confirm(`'${clubEvent.title ?? "행사"}' 홍보를 삭제할까요? 남겨진 의견도 함께 보이지 않게 됩니다.`)) {
      return;
    }

    saveButton.disabled = true;
    deleteButton.disabled = true;
    deleteButton.textContent = "삭제 중...";

    try {
      await deleteClubEvent(clubEvent.id);
    } catch (error) {
      console.error("행사 삭제 오류:", error);
      message.textContent = "행사를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.";
      saveButton.disabled = false;
      deleteButton.disabled = false;
      deleteButton.textContent = "삭제";
    }
  });

  // 열람 권한만 있는 계정에게는 입력칸을 잠그고 버튼을 감춘다.
  if (!canManage) {
    [clubField, titleField, dateField, locationField, startField, endField, promotionField, planField]
      .forEach(({ input }) => {
        input.readOnly = true;
        input.disabled = true;
      });

    posterInput.hidden = true;
    posterRemoveButton.hidden = true;
  } else {
    actions.append(saveButton, deleteButton);
  }

  card.append(
    title,
    createdAt,
    editGrid,
    promotionField.label,
    planField.label,
    posterBox
  );

  if (canManage) {
    card.append(actions);
  }

  card.append(message);
  return card;
}

// 동아리명은 캘린더 등록 폼과 똑같이 목록에서 고른다.
// 예전에 자유 입력으로 저장된 이름이 있으면 그것도 선택지에 남겨 둔다.
function createClubField(currentName) {
  const label = document.createElement("label");
  label.className = "admin-edit-field";
  label.append(document.createTextNode("동아리명"));

  const select = document.createElement("select");
  const names = CLUBS.map(({ name }) => name);

  if (currentName && !names.includes(currentName)) {
    names.unshift(currentName);
  }

  names.forEach((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    option.selected = name === currentName;
    select.appendChild(option);
  });

  label.appendChild(select);
  return { label, input: select };
}
