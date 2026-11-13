import "../styles/site.css";
import "../styles/neoul/board.css";

import { guardPage } from "../pageGuard.js";
import {
  createActivityComment,
  deleteActivityComment,
  deleteActivityRecordWithPassword,
  getActivityRecord,
  hasActivityPassword,
  isActivityAuthor,
  registerActivityView,
  subscribeToActivityComments
} from "./activityService.js";

const article = document.querySelector("#postArticle");
const stateMessage = document.querySelector("#postStateMessage");
const postTitle = document.querySelector("#postTitle");
const postClubName = document.querySelector("#postClubName");
const postDate = document.querySelector("#postDate");
const postViews = document.querySelector("#postViews");
const postContent = document.querySelector("#postContent");
const deleteOpenButton = document.querySelector("#postDeleteButton");

const commentList = document.querySelector("#activityCommentList");
const commentCount = document.querySelector("#activityCommentCount");
const commentForm = document.querySelector("#activityCommentForm");
const commentInput = document.querySelector("#activityCommentInput");
const commentSubmitButton = document.querySelector("#activityCommentSubmit");
const commentMessage = document.querySelector("#activityCommentMessage");

const deleteDialog = document.querySelector("#activityDeleteDialog");
const deleteForm = document.querySelector("#activityDeleteForm");
const deletePasswordInput = document.querySelector("#activityDeletePassword");
const deleteTargetText = document.querySelector("#activityDeleteTarget");
const deleteMessage = document.querySelector("#activityDeleteMessage");
const deleteConfirmButton = document.querySelector("#activityDeleteConfirmButton");
const deleteCancelButton = document.querySelector("#activityDeleteCancelButton");
const deleteCloseButton = document.querySelector("#activityDeleteCloseButton");

const LIST_URL = "/activity.html?tab=notice";

let activityRecord = null;
let currentUser = null;
let isCommentSubmitting = false;
let isDeleting = false;
let unsubscribeFromComments = null;

// ========================================
// 글 번호 읽기
// ========================================
// 기본은 /activity/notice/<글 번호> 주소를 쓰고,
// 재작성 규칙이 없는 환경에서는 ?id=<글 번호> 로도 들어올 수 있게 한다.

function readRecordId() {
  // 새 주소는 /activity/notice/<글 번호>, 예전에 공유된 /activity/<글 번호> 도 그대로 열린다.
  const pathMatch = window.location.pathname
    .match(/^\/activity\/(?:notice\/)?([^/]+)\/?$/);

  if (pathMatch) {
    return decodeURIComponent(pathMatch[1]);
  }

  return new URLSearchParams(window.location.search).get("id") ?? "";
}

const recordId = readRecordId();

guardPage({
  allowAnonymous: true,
  onReady: async ({ user }) => {
    currentUser = user;

    // 의견은 로그인한 구성원만 남길 수 있다.
    commentSubmitButton.disabled = !user;

    if (!user) {
      commentInput.disabled = true;
      commentInput.placeholder = "댓글을 남기려면 로그인해주세요.";
    }

    await loadActivityRecord();
  }
});

async function loadActivityRecord() {
  if (!recordId) {
    showStateMessage("잘못된 주소입니다. 목록에서 글을 다시 선택해주세요.");
    return;
  }

  try {
    activityRecord = await getActivityRecord(recordId);

    if (!activityRecord) {
      showStateMessage("삭제되었거나 존재하지 않는 공지입니다.");
      return;
    }

    renderActivityRecord();
    watchComments();
    countView();
  } catch (error) {
    console.error("동아리 공지 조회 오류:", error);
    showStateMessage("공지를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

function showStateMessage(text) {
  article.hidden = true;
  stateMessage.hidden = false;
  stateMessage.textContent = text;
}

function renderActivityRecord() {
  const title = activityRecord.title ?? "제목 없음";

  document.title = `${title} | 동아리 공지`;
  postTitle.textContent = title;
  postClubName.textContent = activityRecord.clubName ?? "동아리 이름 없음";
  postDate.textContent = formatDate(activityRecord.createdAt);
  postDate.dateTime = getDateTime(activityRecord.createdAt);
  postViews.textContent = `조회 ${formatViewCount(activityRecord.viewCount)}`;
  postContent.textContent = activityRecord.content ?? "내용 없음";

  // 삭제 단추는 이 글을 올린 계정에게만 보인다.
  deleteOpenButton.hidden = !isActivityAuthor(activityRecord, currentUser?.uid);

  stateMessage.hidden = true;
  article.hidden = false;
}

// 같은 계정은 30분에 한 번만 조회수가 오른다.
async function countView() {
  if (!currentUser) return;

  try {
    const didCount = await registerActivityView(activityRecord.id, currentUser.uid);

    if (didCount) {
      activityRecord.viewCount = Number(activityRecord.viewCount ?? 0) + 1;
      postViews.textContent = `조회 ${formatViewCount(activityRecord.viewCount)}`;
    }
  } catch (error) {
    console.error("조회수 처리 오류:", error);
  }
}

// ========================================
// 댓글
// ========================================

function watchComments() {
  unsubscribeFromComments?.();
  commentList.textContent = "댓글을 불러오는 중...";
  commentMessage.textContent = "";

  unsubscribeFromComments = subscribeToActivityComments(
    activityRecord.id,
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

  if (isCommentSubmitting || !currentUser || !activityRecord) return;

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
    await createActivityComment(activityRecord.id, {
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
    commentSubmitButton.textContent = "댓글";
  }
});

async function removeComment(comment, deleteButton) {
  if (!window.confirm("이 댓글을 삭제할까요?")) return;

  deleteButton.disabled = true;

  try {
    await deleteActivityComment(activityRecord.id, comment.id);
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
// 공지 삭제 (비밀번호 확인)
// ========================================

deleteOpenButton.addEventListener("click", () => {
  if (!activityRecord || !isActivityAuthor(activityRecord, currentUser?.uid)) return;

  deleteForm.reset();
  deleteTargetText.textContent = `${activityRecord.clubName ?? "동아리 이름 없음"} · ${activityRecord.title ?? "제목 없음"}`;

  if (!hasActivityPassword(activityRecord)) {
    deleteMessage.textContent = "비밀번호가 설정되지 않은 글입니다. 관리자에게 삭제를 요청해주세요.";
    deletePasswordInput.disabled = true;
    deleteConfirmButton.disabled = true;
  } else {
    deleteMessage.textContent = "";
    deletePasswordInput.disabled = false;
    deleteConfirmButton.disabled = false;
  }

  deleteDialog.showModal();
  deletePasswordInput.focus();
});

function closeDeleteDialog() {
  deleteForm.reset();
  deleteMessage.textContent = "";
  deleteDialog.close();
}

deleteCancelButton.addEventListener("click", closeDeleteDialog);
deleteCloseButton.addEventListener("click", closeDeleteDialog);

deleteDialog.addEventListener("click", (event) => {
  if (event.target === deleteDialog) closeDeleteDialog();
});

deleteForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isDeleting || !activityRecord) return;

  const password = deletePasswordInput.value;

  if (!password.trim()) {
    deleteMessage.textContent = "비밀번호를 입력하세요.";
    return;
  }

  isDeleting = true;
  deleteConfirmButton.disabled = true;
  deleteConfirmButton.textContent = "삭제 중...";
  deleteMessage.textContent = "";

  try {
    const didDelete = await deleteActivityRecordWithPassword(activityRecord, password);

    if (!didDelete) {
      deleteMessage.textContent = "비밀번호가 일치하지 않습니다.";
      deletePasswordInput.select();
      return;
    }

    unsubscribeFromComments?.();
    window.location.replace(LIST_URL);
  } catch (error) {
    console.error("동아리 공지 삭제 오류:", error);
    deleteMessage.textContent = "공지를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.";
  } finally {
    isDeleting = false;
    deleteConfirmButton.disabled = false;
    deleteConfirmButton.textContent = "삭제";
  }
});

// ========================================
// 표시 도구
// ========================================

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
