import {
  deleteActivityRecord,
  getActivityRecords,
  updateActivityRecord
} from "../activity/activityService.js";

import {
  createInfoLine,
  createField,
  formatDateTime,
  normalize
} from "./adminUi.js";

const listElement = document.querySelector("#activityAdminList");
const searchInput = document.querySelector("#activityAdminSearch");
const refreshButton = document.querySelector("#activityAdminRefreshButton");
const totalCount = document.querySelector("#activityTotalCount");
const totalViews = document.querySelector("#activityTotalViews");
const topViews = document.querySelector("#activityTopViews");

let activityRecords = [];
let isInitialized = false;

export function initActivityAdmin() {
  if (isInitialized) return;
  isInitialized = true;

  searchInput.addEventListener("input", renderActivityRecords);
  refreshButton.addEventListener("click", loadActivityAdmin);
}

export async function loadActivityAdmin() {
  listElement.textContent = "동아리 공지를 불러오는 중...";

  try {
    activityRecords = await getActivityRecords();
    renderStats();
    renderActivityRecords();
  } catch (error) {
    console.error("동아리 공지 조회 오류:", error);
    listElement.textContent = "동아리 공지를 불러오지 못했습니다.";
  }
}

function renderStats() {
  const viewCounts = activityRecords.map((record) => Number(record.viewCount ?? 0));

  totalCount.textContent = activityRecords.length.toLocaleString("ko-KR");
  totalViews.textContent = viewCounts.reduce((sum, count) => sum + count, 0).toLocaleString("ko-KR");
  topViews.textContent = (viewCounts.length ? Math.max(...viewCounts) : 0).toLocaleString("ko-KR");
}

function renderActivityRecords() {
  const searchTerm = normalize(searchInput.value.trim());
  const filteredRecords = activityRecords.filter((record) => (
    !searchTerm
    || normalize(record.clubName).includes(searchTerm)
    || normalize(record.title).includes(searchTerm)
  ));

  listElement.textContent = "";

  if (filteredRecords.length === 0) {
    listElement.textContent = searchTerm
      ? "검색 결과가 없습니다."
      : "아직 등록된 동아리 공지가 없습니다.";
    return;
  }

  filteredRecords.forEach((record) => listElement.appendChild(createActivityCard(record)));
}

function createActivityCard(record) {
  const card = document.createElement("article");
  card.className = "admin-card activity-admin-card";

  const title = document.createElement("h2");
  title.textContent = record.title ?? "제목 없음";

  const clubName = createInfoLine("동아리 이름", record.clubName ?? "동아리명 없음");
  const createdAt = createInfoLine("작성일", formatDateTime(record.createdAt));

  const viewCount = document.createElement("p");
  viewCount.className = "admin-info-line admin-view-count";
  const viewLabel = document.createElement("strong");
  viewLabel.textContent = "조회수: ";
  const viewValue = document.createElement("span");
  viewValue.textContent = `${Number(record.viewCount ?? 0).toLocaleString("ko-KR")}회`;
  viewCount.append(viewLabel, viewValue);

  const editGrid = document.createElement("div");
  editGrid.className = "admin-edit-grid";

  const clubField = createField("동아리 이름", { value: record.clubName ?? "" });
  const titleField = createField("제목", { value: record.title ?? "" });
  editGrid.append(clubField.label, titleField.label);

  const contentField = createField("내용", { value: record.content ?? "", multiline: true });

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
      title: titleField.input.value,
      content: contentField.input.value
    };

    if (!updated.clubName.trim() || !updated.title.trim() || !updated.content.trim()) {
      message.textContent = "동아리 이름, 제목, 내용을 모두 입력해주세요.";
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "저장 중...";
    message.textContent = "";

    try {
      await updateActivityRecord(record.id, updated);
      await loadActivityAdmin();
    } catch (error) {
      console.error("동아리 공지 수정 오류:", error);
      message.textContent = "수정에 실패했습니다. 잠시 후 다시 시도해주세요.";
      saveButton.disabled = false;
      saveButton.textContent = "수정 저장";
    }
  });

  deleteButton.addEventListener("click", async () => {
    if (!window.confirm(`'${record.title ?? "제목 없음"}' 공지를 삭제할까요?`)) return;

    deleteButton.disabled = true;
    deleteButton.textContent = "삭제 중...";

    try {
      await deleteActivityRecord(record.id);
      await loadActivityAdmin();
    } catch (error) {
      console.error("동아리 공지 삭제 오류:", error);
      message.textContent = "삭제에 실패했습니다. 잠시 후 다시 시도해주세요.";
      deleteButton.disabled = false;
      deleteButton.textContent = "삭제";
    }
  });

  actions.append(saveButton, deleteButton);
  card.append(title, clubName, createdAt, viewCount, editGrid, contentField.label, actions, message);
  return card;
}
