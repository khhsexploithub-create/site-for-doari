import "../styles/site.css";
import "../styles/neoul/board.css";

import { guardPage } from "../pageGuard.js";
import { isSubcommitteeChair } from "../userRole.js";
import { createClubTag } from "../clubList.js";
import {
  createEventComment,
  deleteClubEvent,
  deleteEventComment,
  getClubEvent,
  subscribeToEventComments
} from "./eventService.js";

const article = document.querySelector("#eventArticle");
const stateMessage = document.querySelector("#eventStateMessage");
const clubTagBox = document.querySelector("#eventClubTagBox");
const titleElement = document.querySelector("#eventTitle");
const dateElement = document.querySelector("#eventDate");
const timeElement = document.querySelector("#eventTime");
const locationElement = document.querySelector("#eventLocation");
const posterFigure = document.querySelector("#eventPosterFigure");
const posterImage = document.querySelector("#eventPoster");
const promotionElement = document.querySelector("#eventPromotion");
const planElement = document.querySelector("#eventPlan");
const deleteButton = document.querySelector("#eventDeleteButton");

const commentList = document.querySelector("#eventCommentList");
const commentCount = document.querySelector("#eventCommentCount");
const commentForm = document.querySelector("#eventCommentForm");
const commentInput = document.querySelector("#eventCommentInput");
const commentSubmitButton = document.querySelector("#eventCommentSubmit");
const commentMessage = document.querySelector("#eventCommentMessage");

const CALENDAR_URL = "/calendar.html";

let clubEvent = null;
let currentUser = null;
let canManageEvent = false;
let isCommentSubmitting = false;
let unsubscribeFromComments = null;

// /event/<행사 번호> 를 기본으로 하고, 재작성 규칙이 없으면 ?id= 로도 들어올 수 있다.
function readEventId() {
  const pathMatch = window.location.pathname.match(/^\/event\/([^/]+)\/?$/);

  if (pathMatch) {
    return decodeURIComponent(pathMatch[1]);
  }

  return new URLSearchParams(window.location.search).get("id") ?? "";
}

const eventId = readEventId();

guardPage({
  allowAnonymous: true,
  onReady: async ({ user, profile }) => {
    currentUser = user;
    // 행사 홍보는 행사운영 소위원장이 관리한다.
    canManageEvent = isSubcommitteeChair(profile, "event");

    // 의견은 로그인한 구성원만 남길 수 있다.
    commentSubmitButton.disabled = !user;

    if (!user) {
      commentInput.disabled = true;
      commentInput.placeholder = "의견을 남기려면 로그인해주세요.";
    }

    await loadClubEvent();
  }
});

async function loadClubEvent() {
  if (!eventId) {
    showStateMessage("잘못된 주소입니다. 캘린더에서 행사를 다시 선택해주세요.");
    return;
  }

  try {
    clubEvent = await getClubEvent(eventId);

    if (!clubEvent) {
      showStateMessage("삭제되었거나 존재하지 않는 행사입니다.");
      return;
    }

    renderClubEvent();
    watchComments();
  } catch (error) {
    console.error("행사 조회 오류:", error);
    showStateMessage("행사를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

function showStateMessage(text) {
  article.hidden = true;
  stateMessage.hidden = false;
  stateMessage.textContent = text;
}

function renderClubEvent() {
  const title = clubEvent.title ?? "행사 이름 없음";

  document.title = `${title} | 행사 안내`;
  titleElement.textContent = title;

  clubTagBox.textContent = "";
  clubTagBox.appendChild(createClubTag(clubEvent.clubName));

  dateElement.textContent = clubEvent.date ?? "날짜 미정";
  dateElement.dateTime = clubEvent.date ?? "";
  timeElement.textContent = `${clubEvent.startTime ?? "시간 미정"}${clubEvent.endTime ? `–${clubEvent.endTime}` : ""}`;
  locationElement.textContent = clubEvent.location ?? "장소 미정";

  promotionElement.textContent = clubEvent.promotion?.trim() || "등록된 홍보 내용이 없습니다.";
  planElement.textContent = clubEvent.plan?.trim() || "등록된 행사 계획이 없습니다.";

  if (clubEvent.posterImage) {
    posterImage.src = clubEvent.posterImage;
    posterImage.alt = `${title} 포스터`;
    posterFigure.hidden = false;
  }

  // 행사운영 소위원장만 삭제할 수 있다.
  deleteButton.hidden = !canManageEvent;

  stateMessage.hidden = true;
  article.hidden = false;
}

deleteButton.addEventListener("click", async () => {
  if (!clubEvent || !canManageEvent) return;

  if (!window.confirm(`'${clubEvent.title ?? "행사"}' 홍보를 삭제할까요? 남겨진 의견도 함께 보이지 않게 됩니다.`)) {
    return;
  }

  deleteButton.disabled = true;

  try {
    unsubscribeFromComments?.();
    await deleteClubEvent(clubEvent.id);
    window.location.replace(CALENDAR_URL);
  } catch (error) {
    console.error("행사 삭제 오류:", error);
    deleteButton.disabled = false;
    commentMessage.textContent = "행사를 삭제하지 못했습니다.";
  }
});

// ========================================
// 의견
// ========================================

function watchComments() {
  unsubscribeFromComments?.();
  commentList.textContent = "의견을 불러오는 중...";
  commentMessage.textContent = "";

  unsubscribeFromComments = subscribeToEventComments(
    clubEvent.id,
    renderComments,
    (error) => {
      console.error("의견 조회 오류:", error);
      commentList.textContent = "의견을 불러오지 못했습니다.";
    }
  );
}

function renderComments(comments) {
  commentCount.textContent = String(comments.length);
  commentList.textContent = "";

  if (comments.length === 0) {
    const empty = document.createElement("li");
    empty.className = "activity-comment-empty";
    empty.textContent = "아직 의견이 없습니다. 첫 의견을 남겨보세요.";
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
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "secondary activity-comment-delete";
      removeButton.textContent = "삭제";
      removeButton.addEventListener("click", () => removeComment(comment, removeButton));
      head.appendChild(removeButton);
    }

    commentList.appendChild(item);
  });
}

commentForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isCommentSubmitting || !currentUser || !clubEvent) return;

  const content = commentInput.value.trim();

  if (!content) {
    commentMessage.textContent = "의견 내용을 입력해주세요.";
    return;
  }

  if (content.length > 1000) {
    commentMessage.textContent = "의견은 1000자까지 입력할 수 있습니다.";
    return;
  }

  isCommentSubmitting = true;
  commentSubmitButton.disabled = true;
  commentSubmitButton.textContent = "등록 중...";
  commentMessage.textContent = "";

  try {
    await createEventComment(clubEvent.id, {
      content,
      authorUid: currentUser.uid,
      authorName: getAuthorName(currentUser)
    });
    commentInput.value = "";
  } catch (error) {
    console.error("의견 등록 오류:", error);
    commentMessage.textContent = "의견을 등록하지 못했습니다. 잠시 후 다시 시도해주세요.";
  } finally {
    isCommentSubmitting = false;
    commentSubmitButton.disabled = false;
    commentSubmitButton.textContent = "의견 등록";
  }
});

async function removeComment(comment, removeButton) {
  if (!window.confirm("이 의견을 삭제할까요?")) return;

  removeButton.disabled = true;

  try {
    await deleteEventComment(clubEvent.id, comment.id);
  } catch (error) {
    console.error("의견 삭제 오류:", error);
    commentMessage.textContent = "의견을 삭제하지 못했습니다.";
    removeButton.disabled = false;
  }
}

function getAuthorName(user) {
  const email = user.email ?? "";
  return email.includes("@") ? email.split("@")[0] : (email || "익명");
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
