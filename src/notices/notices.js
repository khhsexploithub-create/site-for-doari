import "../styles/site.css";
import "../styles/neoul/notices.css";

import { guardPage } from "../pageGuard.js";
import { mountPageBell } from "../notifications/bell.js";
import { mountPushPanel } from "../push/pushPanel.js";
import { canWriteNotice } from "../userRole.js";
import { markSectionRead, subscribeToReadState, toMillis, getBaseline } from "../notifications/readState.js";
import { BASIC_SORT_OPTIONS, bindSortSelect, sortItems } from "../ui/listSort.js";
import {
  createNotice,
  deleteNotice,
  getNoticeCategoryName,
  subscribeToNotices,
  updateNotice
} from "./noticeService.js";

const tabs = document.querySelectorAll(".notices-tab");
const receivedTabDot = document.querySelector("#receivedTabDot");
const unreadTabDot = document.querySelector("#unreadTabDot");

const filterApp = document.querySelector("#noticeFilterApp");
const filterEvent = document.querySelector("#noticeFilterEvent");
const categoryFilter = document.querySelector("#noticeCategoryFilter");
const markAllReadButton = document.querySelector("#markAllReadButton");
const totalCount = document.querySelector("#noticeTotalCount");
const searchInput = document.querySelector("#noticeSearchInput");
const sortSelect = document.querySelector("#noticeSortSelect");

// 기본은 최신순이고, 고른 방식은 브라우저에 기억한다.
const noticeSort = bindSortSelect(sortSelect, {
  storageKey: "notices",
  options: BASIC_SORT_OPTIONS,
  onChange: () => renderList()
});

const listElement = document.querySelector("#noticeList");
const detailPlaceholder = document.querySelector("#noticeDetailPlaceholder");
const detailBody = document.querySelector("#noticeDetailBody");
const detailTitle = document.querySelector("#noticeDetailTitle");
const detailBadge = document.querySelector("#noticeDetailBadge");
const compactScreen = window.matchMedia("(max-width: 860px)");
const detailAuthor = document.querySelector("#noticeDetailAuthor");
const detailDate = document.querySelector("#noticeDetailDate");
const detailContent = document.querySelector("#noticeDetailContent");
const detailActions = document.querySelector("#noticeDetailActions");
const editButton = document.querySelector("#noticeEditButton");
const deleteButton = document.querySelector("#noticeDeleteButton");

const writeSection = document.querySelector("#noticeWriteSection");
const form = document.querySelector("#noticeForm");
const editingIdInput = document.querySelector("#noticeEditingId");
const titleInput = document.querySelector("#noticeTitle");
const categorySelect = document.querySelector("#noticeCategory");
const contentInput = document.querySelector("#noticeContent");
const submitButton = document.querySelector("#noticeSubmitButton");
const cancelEditButton = document.querySelector("#noticeCancelEditButton");
const formMessage = document.querySelector("#noticeFormMessage");

let notices = [];
let canWrite = false;
let activeTab = "received";
let selectedId = "";
let isSubmitting = false;
// 화면에 들어온 순간의 '마지막으로 읽은 시각'. 여기서 고정해 두어야
// 읽음 처리를 한 뒤에도 어떤 글이 새 글이었는지 계속 보인다.
let unreadBaseline = 0;
let hasBaseline = false;

guardPage({
  allowAnonymous: true,
  onReady: ({ user, profile }) => {
    mountPageBell(user);
    mountPushPanel(user);
    canWrite = canWriteNotice(profile);
    writeSection.hidden = !canWrite;

    // 비로그인 방문자는 공지를 읽기만 한다. 읽음 표시는 남기지 않는다.
    if (!user) {
      hasBaseline = true;
      unreadBaseline = Date.now();
      markAllReadButton.hidden = true;
      watchNotices();
      return;
    }

    const accountCreatedAt = toMillis(user.metadata?.creationTime);

    // 먼저 '마지막으로 읽은 시각'을 붙잡아 두고, 그 다음에 읽음 처리를 한다.
    // 순서를 바꾸면 방금 쓴 시각이 기준이 되어 새 글이 하나도 없는 것처럼 보인다.
    subscribeToReadState(user.uid, (lastReadAt) => {
      if (hasBaseline) return;
      hasBaseline = true;
      unreadBaseline = getBaseline(lastReadAt, "notices", accountCreatedAt);
      renderList();

      // 기준을 잡은 뒤에 이 화면의 공지를 읽은 것으로 표시한다.
      markSectionRead("notices");
    });

    watchNotices();
  }
});

function watchNotices() {
  subscribeToNotices(
    (nextNotices) => {
      notices = nextNotices;
      renderList();
      refreshOpenedDetail();
    },
    (error) => {
      console.error("공지 조회 오류:", error);
      listElement.textContent = "";
      listElement.appendChild(createEmptyItem("공지를 불러오지 못했습니다."));
    }
  );
}

// ========================================
// 탭 · 필터
// ========================================

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activeTab = tab.dataset.tab;

    tabs.forEach((button) => {
      const isActive = button === tab;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-selected", String(isActive));
    });

    renderList();
  });
});

[filterApp, filterEvent, categoryFilter].forEach((control) => {
  control.addEventListener("change", renderList);
});

searchInput.addEventListener("input", renderList);

markAllReadButton.addEventListener("click", async () => {
  markAllReadButton.disabled = true;

  try {
    await markSectionRead("notices");
    unreadBaseline = Date.now();
    renderList();
  } finally {
    markAllReadButton.disabled = false;
  }
});

function isUnread(notice) {
  const created = toMillis(notice.createdAt);
  return created > 0 && created > unreadBaseline;
}

function getVisibleNotices() {
  const searchTerm = searchInput.value.trim().toLocaleLowerCase("ko-KR");

  const matched = notices.filter((notice) => {
    const category = notice.category ?? "general";

    // '행사' 체크를 끄면 행사 공지를, '공지' 체크를 끄면 나머지를 뺀다.
    if (category === "event" && !filterEvent.checked) return false;
    if (category !== "event" && !filterApp.checked) return false;

    if (categoryFilter.value && category !== categoryFilter.value) return false;
    if (activeTab === "unread" && !isUnread(notice)) return false;

    if (!searchTerm) return true;

    return `${notice.title ?? ""} ${notice.content ?? ""} ${notice.authorName ?? ""}`
      .toLocaleLowerCase("ko-KR")
      .includes(searchTerm);
  });

  // 거르고 찾은 결과를 고른 방식으로 늘어놓는다.
  return sortItems(matched, noticeSort.value(), {
    created: (notice) => notice.createdAt,
    title: (notice) => notice.title
  });
}

// ========================================
// 목록
// ========================================

function renderList() {
  const visible = getVisibleNotices();
  const unreadTotal = notices.filter(isUnread).length;

  totalCount.textContent = visible.length.toLocaleString("ko-KR");
  receivedTabDot.hidden = unreadTotal === 0;
  unreadTabDot.hidden = unreadTotal === 0;

  listElement.textContent = "";

  if (visible.length === 0) {
    listElement.appendChild(createEmptyItem(
      activeTab === "unread" ? "읽지 않은 공지가 없습니다." : "등록된 공지가 없습니다."
    ));
    return;
  }

  visible.forEach((notice) => {
    listElement.appendChild(createNoticeItem(notice));
  });
}

function createEmptyItem(text) {
  const empty = document.createElement("li");
  empty.className = "notice-list-empty";
  empty.textContent = text;
  return empty;
}

function createNoticeItem(notice) {
  const item = document.createElement("li");

  const button = document.createElement("button");
  button.type = "button";
  button.className = "notice-item";
  button.classList.toggle("is-selected", notice.id === selectedId);
  button.classList.toggle("is-unread", isUnread(notice));

  const head = document.createElement("div");
  head.className = "notice-item-head";

  const title = document.createElement("strong");
  title.className = "notice-item-title";
  title.textContent = notice.title ?? "제목 없음";

  if (isUnread(notice)) {
    const dot = document.createElement("span");
    dot.className = "notice-item-dot";
    dot.setAttribute("aria-label", "읽지 않음");
    title.appendChild(dot);
  }

  const badge = document.createElement("span");
  badge.className = `notice-item-badge category-${notice.category ?? "general"}`;
  badge.textContent = getNoticeCategoryName(notice.category);

  head.append(title, badge);

  const preview = document.createElement("p");
  preview.className = "notice-item-preview";
  preview.textContent = notice.content ?? "";

  const meta = document.createElement("div");
  meta.className = "notice-item-meta";

  const author = document.createElement("span");
  author.textContent = notice.authorName || "작성자 미상";

  const date = document.createElement("span");
  date.textContent = formatDateTime(notice.createdAt);

  meta.append(author, date);

  button.append(head, preview, meta);
  button.addEventListener("click", () => selectNotice(notice));

  item.appendChild(button);
  return item;
}

// ========================================
// 상세
// ========================================

function selectNotice(notice) {
  selectedId = notice.id;

  detailPlaceholder.hidden = true;
  detailBody.hidden = false;

  detailBadge.className = `notice-item-badge category-${notice.category ?? "general"}`;
  detailBadge.textContent = getNoticeCategoryName(notice.category);
  detailTitle.textContent = notice.title ?? "제목 없음";
  detailAuthor.textContent = notice.authorName || "작성자 미상";
  detailDate.textContent = formatDateTime(notice.createdAt);
  detailContent.textContent = notice.content ?? "";
  detailActions.hidden = !canWrite;

  // 고를 때마다 본문이 살짝 올라오며 바뀐다.
  detailBody.classList.remove("is-entering");
  void detailBody.offsetWidth;
  detailBody.classList.add("is-entering");

  renderList();

  // 모바일은 목록 아래에 본문이 있으니 그쪽으로 내려 준다.
  if (compactScreen.matches) {
    document.querySelector("#noticeDetail").scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function refreshOpenedDetail() {
  if (!selectedId) return;

  const notice = notices.find((candidate) => candidate.id === selectedId);

  if (!notice) {
    selectedId = "";
    detailBody.hidden = true;
    detailPlaceholder.hidden = false;
    return;
  }

  detailTitle.textContent = notice.title ?? "제목 없음";
  detailContent.textContent = notice.content ?? "";
}

editButton.addEventListener("click", () => {
  const notice = notices.find((candidate) => candidate.id === selectedId);
  if (!canWrite || !notice) return;

  editingIdInput.value = notice.id;
  titleInput.value = notice.title ?? "";
  categorySelect.value = notice.category ?? "general";
  contentInput.value = notice.content ?? "";

  submitButton.textContent = "수정 저장";
  cancelEditButton.hidden = false;
  formMessage.textContent = "공지를 수정하고 있습니다.";

  writeSection.scrollIntoView({ behavior: "smooth", block: "start" });
});

deleteButton.addEventListener("click", async () => {
  const notice = notices.find((candidate) => candidate.id === selectedId);
  if (!canWrite || !notice) return;
  if (!window.confirm(`'${notice.title ?? "공지"}'를 삭제할까요? 되돌릴 수 없습니다.`)) return;

  deleteButton.disabled = true;

  try {
    await deleteNotice(notice.id);
    selectedId = "";
    detailBody.hidden = true;
    detailPlaceholder.hidden = false;
  } catch (error) {
    console.error("공지 삭제 오류:", error);
    window.alert("공지를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.");
  } finally {
    deleteButton.disabled = false;
  }
});

// ========================================
// 작성 · 수정
// ========================================

cancelEditButton.addEventListener("click", resetForm);

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!canWrite || isSubmitting) return;

  const notice = {
    title: titleInput.value.trim(),
    category: categorySelect.value,
    content: contentInput.value.trim()
  };

  if (!notice.title || !notice.content) {
    formMessage.textContent = "제목과 내용을 모두 입력해주세요.";
    return;
  }

  const editingId = editingIdInput.value;

  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = editingId ? "저장 중..." : "등록 중...";
  formMessage.textContent = "";

  try {
    if (editingId) {
      await updateNotice(editingId, notice);
      resetForm();
      formMessage.textContent = "공지를 수정했습니다.";
    } else {
      await createNotice(notice);
      resetForm();
      formMessage.textContent = "공지를 등록했습니다.";
    }
  } catch (error) {
    console.error("공지 저장 오류:", error);
    formMessage.textContent = "공지를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
  } finally {
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = editingIdInput.value ? "수정 저장" : "공지 등록";
  }
});

function resetForm() {
  form.reset();
  editingIdInput.value = "";
  categorySelect.value = "general";
  submitButton.textContent = "공지 등록";
  cancelEditButton.hidden = true;
  formMessage.textContent = "";
}

function formatDateTime(timestamp) {
  if (!timestamp) return "시간 정보 없음";

  const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "시간 정보 없음";

  const pad = (value) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} `
    + `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
