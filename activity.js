import "../style.css";

import { guardPage } from "../pageGuard.js";
import { EXECUTIVE_ROLE } from "../userRole.js";
import {
  createActivityComment,
  createActivityRecord,
  deleteActivityComment,
  getActivityRecords,
  registerActivityView,
  subscribeToActivityComments
} from "./activityService.js";

const formDialog = document.querySelector("#activityFormDialog");
const openFormButton = document.querySelector("#activityOpenFormButton");
const closeFormButton = document.querySelector("#activityFormCloseButton");
const form = document.querySelector("#activityForm");
const clubNameInput = document.querySelector("#activityClubName");
const titleInput = document.querySelector("#activityTitle");
const contentInput = document.querySelector("#activityContent");
const submitButton = document.querySelector("#activitySubmitButton");
const formMessage = document.querySelector("#activityFormMessage");
const activityList = document.querySelector("#activityList");
const searchField = document.querySelector("#activitySearchField");
const searchInput = document.querySelector("#activitySearchInput");
const detail = document.querySelector("#activityDetail");
const detailTitle = document.querySelector("#activityDetailTitle");
const detailClubName = document.querySelector("#activityDetailClubName");
const detailDate = document.querySelector("#activityDetailDate");
const detailContent = document.querySelector("#activityDetailContent");

const commentList = document.querySelector("#activityCommentList");
const commentCount = document.querySelector("#activityCommentCount");
const commentForm = document.querySelector("#activityCommentForm");
const commentInput = document.querySelector("#activityCommentInput");
const commentSubmitButton = document.querySelector("#activityCommentSubmit");
const commentMessage = document.querySelector("#activityCommentMessage");

let activityRecords = [];
let isSubmitting = false;
let isCommentSubmitting = false;
let openedRecordId = "";
let currentUser = null;
let currentRole = "";
let unsubscribeFromComments = null;

// ========================================
// 권한 확인 (일반 계정은 등록 기능을 쓸 수 없다)
// ========================================

guardPage({
  onReady: ({ user, role }) => {
    currentUser = user;
    currentRole = role;

    const canRegister = role === EXECUTIVE_ROLE;
    openFormButton.hidden = !canRegister;
    openFormButton.disabled = !canRegister;

    if (!canRegister) {
      formDialog.remove();
    }

    commentSubmitButton.disabled = false;

    loadActivityRecords();
  }
});

// ========================================
// 등록 창 열고 닫기 (연합회 임원 전용)
// ========================================

openFormButton.addEventListener("click", () => {
  if (currentRole !== EXECUTIVE_ROLE) return;

  formMessage.textContent = "";
  formDialog.showModal();
  clubNameInput.focus();
});

closeFormButton?.addEventListener("click", () => formDialog.close());

formDialog?.addEventListener("click", (event) => {
  if (event.target === formDialog) formDialog.close();
});

// ========================================
// 활동 기록 등록
// ========================================

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (currentRole !== EXECUTIVE_ROLE) return;

  const activityRecord = {
    clubName: clubNameInput.value,
    title: titleInput.value,
    content: contentInput.value
  };

  if (!isValidActivityRecord(activityRecord)) {
    formMessage.textContent = "동아리 이름, 제목, 내용을 모두 입력해주세요.";
    return;
  }

  if (isSubmitting) return;

  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = "등록 중...";
  formMessage.textContent = "";

  try {
    await createActivityRecord(activityRecord);
    form.reset();
    formDialog.close();
    await loadActivityRecords();
  } catch (error) {
    console.error("활동 기록 저장 오류:", error);
    formMessage.textContent = "활동 기록을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
  } finally {
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = "등록";
  }
});

// ========================================
// 검색 (모든 계정 사용 가능)
// ========================================

searchField.addEventListener("change", renderFilteredActivityRecords);
searchInput.addEventListener("input", renderFilteredActivityRecords);

async function loadActivityRecords() {
  activityList.textContent = "활동 기록을 불러오는 중...";

  try {
    activityRecords = await getActivityRecords();
    renderFilteredActivityRecords();
  } catch (error) {
    console.error("활동 기록 조회 오류:", error);
    activityList.textContent = "활동 기록을 불러오지 못했습니다.";
    detail.classList.add("hidden");
  }
}

function renderFilteredActivityRecords() {
  const searchTerm = searchInput.value.trim().toLocaleLowerCase("ko-KR");
  const field = searchField.value;
  const filteredRecords = activityRecords.filter((activityRecord) => {
    if (!searchTerm) return true;
    return (activityRecord[field] ?? "").toLocaleLowerCase("ko-KR").includes(searchTerm);
  });

  renderActivityRecords(filteredRecords, Boolean(searchTerm));
}

function renderActivityRecords(records, isSearching) {
  activityList.textContent = "";

  if (records.length === 0) {
    activityList.textContent = isSearching
      ? "검색 결과가 없습니다."
      : "등록된 활동 기록이 없습니다.";
    closeActivityDetail();
    return;
  }

  records.forEach((activityRecord, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const number = document.createElement("span");
    const clubName = document.createElement("span");
    const title = document.createElement("strong");
    const date = document.createElement("time");
    const viewCount = document.createElement("span");

    button.type = "button";
    button.className = "activity-record";
    button.classList.toggle("is-open", activityRecord.id === openedRecordId);
    button.addEventListener("click", () => openActivityDetail(activityRecord));
    number.className = "activity-record-number";
    number.textContent = String(index + 1);
    clubName.className = "activity-record-club";
    clubName.textContent = activityRecord.clubName ?? "동아리 이름 없음";
    title.textContent = activityRecord.title ?? "제목 없음";
    date.textContent = formatDate(activityRecord.createdAt);
    date.dateTime = getDateTime(activityRecord.createdAt);
    viewCount.className = "activity-record-views";
    viewCount.textContent = `조회 ${formatViewCount(activityRecord.viewCount)}`;

    button.append(number, clubName, title, date, viewCount);
    item.appendChild(button);
    activityList.appendChild(item);
  });

  const openedRecord = records.find((record) => record.id === openedRecordId);

  if (openedRecord) {
    renderActivityDetail(openedRecord);
  } else {
    closeActivityDetail();
  }
}

// ========================================
// 상세 보기
// ========================================

async function openActivityDetail(activityRecord) {
  const isNewlyOpened = openedRecordId !== activityRecord.id;
  openedRecordId = activityRecord.id;

  renderActivityDetail(activityRecord);
  renderFilteredActivityRecords();
  detail.scrollIntoView({ behavior: "smooth", block: "nearest" });

  if (isNewlyOpened) {
    watchComments(activityRecord.id);
  }

  if (!currentUser) return;

  try {
    // 같은 계정은 30분에 한 번만 조회수가 오른다.
    const didCount = await registerActivityView(activityRecord.id, currentUser.uid);

    if (didCount) {
      activityRecord.viewCount = Number(activityRecord.viewCount ?? 0) + 1;
      renderFilteredActivityRecords();
    }
  } catch (error) {
    console.error("조회수 처리 오류:", error);
  }
}

function renderActivityDetail(activityRecord) {
  detailTitle.textContent = activityRecord.title ?? "제목 없음";
  detailClubName.textContent = activityRecord.clubName ?? "동아리 이름 없음";
  detailDate.textContent = formatDate(activityRecord.createdAt);
  detailDate.dateTime = getDateTime(activityRecord.createdAt);
  detailContent.textContent = activityRecord.content ?? "내용 없음";
  detail.classList.remove("hidden");
}

function closeActivityDetail() {
  detail.classList.add("hidden");
  openedRecordId = "";
  unsubscribeFromComments?.();
  unsubscribeFromComments = null;
}

// ========================================
// 댓글
// ========================================

function watchComments(recordId) {
  unsubscribeFromComments?.();
  commentList.textContent = "댓글을 불러오는 중...";
  commentMessage.textContent = "";

  unsubscribeFromComments = subscribeToActivityComments(
    recordId,
    renderComments,
    (error) => {
      console.error("댓글 조회 오류:", error);
      commentList.textContent = "댓글을 불러오지 못했습니다.";
    }
  );
}

function renderComments(comments) {
  commentCount.textContent = String(comments.length);
  commentList.textContent = "";

  if (comments.length === 0) {
    const empty = document.createElement("li");
    empty.className = "activity-comment-empty";
    empty.textContent = "아직 댓글이 없습니다. 첫 댓글을 남겨보세요.";
    commentList.appendChild(empty);
    return;
  }

  comments.forEach((comment) => {
    const item = document.createElement("li");
    item.className = "activity-comment";

    const head = document.createElement("div");
    head.className = "activity-comment-head";

    const author = document.createElement("strong");
    author.textContent = comment.authorName ?? "익명";

    const time = document.createElement("time");
    time.textContent = formatDate(comment.createdAt);
    time.dateTime = getDateTime(comment.createdAt);

    head.append(author, time);

    const content = document.createElement("p");
    content.className = "activity-comment-content";
    content.textContent = comment.content ?? "";

    item.append(head, content);

    if (comment.authorUid === currentUser?.uid) {
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "secondary activity-comment-delete";
      deleteButton.textContent = "삭제";
      deleteButton.addEventListener("click", () => removeComment(comment, deleteButton));
      head.appendChild(deleteButton);
    }

    commentList.appendChild(item);
  });
}

commentForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isCommentSubmitting || !currentUser || !openedRecordId) return;

  const content = commentInput.value.trim();

  if (!content) {
    commentMessage.textContent = "댓글 내용을 입력해주세요.";
    return;
  }

  if (content.length > 1000) {
    commentMessage.textContent = "댓글은 1000자까지 입력할 수 있습니다.";
    return;
  }

  isCommentSubmitting = true;
  commentSubmitButton.disabled = true;
  commentSubmitButton.textContent = "등록 중...";
  commentMessage.textContent = "";

  try {
    await createActivityComment(openedRecordId, {
      content,
      authorUid: currentUser.uid,
      authorName: getAuthorName(currentUser)
    });
    commentInput.value = "";
  } catch (error) {
    console.error("댓글 등록 오류:", error);
    commentMessage.textContent = "댓글을 등록하지 못했습니다. 잠시 후 다시 시도해주세요.";
  } finally {
    isCommentSubmitting = false;
    commentSubmitButton.disabled = false;
    commentSubmitButton.textContent = "댓글 등록";
  }
});

async function removeComment(comment, deleteButton) {
  if (!window.confirm("이 댓글을 삭제할까요?")) return;

  deleteButton.disabled = true;

  try {
    await deleteActivityComment(openedRecordId, comment.id);
  } catch (error) {
    console.error("댓글 삭제 오류:", error);
    commentMessage.textContent = "댓글을 삭제하지 못했습니다.";
    deleteButton.disabled = false;
  }
}

function getAuthorName(user) {
  const email = user.email ?? "";
  return email.includes("@") ? email.split("@")[0] : (email || "익명");
}

// ========================================
// 표시 도구
// ========================================

function isValidActivityRecord({ clubName, title, content }) {
  return Boolean(clubName.trim() && title.trim() && content.trim());
}

function formatViewCount(viewCount) {
  const numberViewCount = Number(viewCount);
  return Number.isFinite(numberViewCount) ? numberViewCount.toLocaleString("ko-KR") : "0";
}

function formatDate(timestamp) {
  if (!timestamp) return "작성일 정보 없음";
  const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "작성일 정보 없음" : date.toLocaleString("ko-KR");
}

function getDateTime(timestamp) {
  if (!timestamp) return "";
  const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
