import "../styles/site.css";
import "../styles/neoul/board.css";

import { guardPage } from "../pageGuard.js";
import { getReadableClubNames } from "../userRole.js";
import { createClubTag } from "../clubList.js";
import { BASIC_SORT_OPTIONS, bindSortSelect, buildSerialNumbers, sortItems } from "../ui/listSort.js";
import { createAttachmentPicker } from "./attachmentPicker.js";
import {
  formatFileSize,
  removeAttachments,
  uploadAssignmentFiles,
  validateAttachmentFiles
} from "./attachmentUpload.js";
import {
  deleteAssignment,
  getAssignmentClubName,
  describeRemaining,
  formatDate,
  formatDateTime,
  formatViewCount,
  getAssignment,
  getAssignmentStatus,
  getAssignmentStatusName,
  getMySubmission,
  getSubmissions,
  isAssignmentManager,
  isSubmittable,
  registerAssignmentView,
  toDateTimeLocal,
  updateAssignment
} from "./assignmentService.js";

const article = document.querySelector("#assignmentArticle");
const stateMessage = document.querySelector("#assignmentStateMessage");

const titleText = document.querySelector("#assignmentTitleText");
const statusBadge = document.querySelector("#assignmentStatusBadge");
const periodText = document.querySelector("#assignmentPeriodText");
const remainingText = document.querySelector("#assignmentRemainingText");
const managerText = document.querySelector("#assignmentManagerText");
const openedText = document.querySelector("#assignmentOpenedText");
const viewsText = document.querySelector("#assignmentViewsText");
const targetText = document.querySelector("#assignmentTargetText");
const lateEditText = document.querySelector("#assignmentLateEditText");
const commentText = document.querySelector("#assignmentCommentText");
const noticeText = document.querySelector("#assignmentNoticeText");

const attachmentSection = document.querySelector("#assignmentAttachments");
const attachmentListElement = document.querySelector("#assignmentAttachmentList");

const submitOpenButton = document.querySelector("#assignmentSubmitOpenButton");
const assignmentEditButton = document.querySelector("#assignmentEditButton");
const assignmentDeleteButton = document.querySelector("#assignmentDeleteButton");

const submissionTableBody = document.querySelector("#submissionTableBody");
const submissionTotalCount = document.querySelector("#submissionTotalCount");
const submissionMineButton = document.querySelector("#submissionMineButton");
const submissionSortSelect = document.querySelector("#submissionSortSelect");

const editDialog = document.querySelector("#assignmentEditDialog");
const editForm = document.querySelector("#assignmentEditForm");
const editCloseButton = document.querySelector("#assignmentEditCloseButton");
const editSaveButton = document.querySelector("#assignmentEditSaveButton");
const editMessage = document.querySelector("#assignmentEditMessage");

const editPicker = createAttachmentPicker({
  list: document.querySelector("#assignmentEditAttachList"),
  addButton: document.querySelector("#assignmentEditAttachAddButton"),
  message: editMessage
});

// 제출 목록도 최신순이 기본이고, 고른 방식은 기억한다.
const submissionSort = bindSortSelect(submissionSortSelect, {
  storageKey: "submissions",
  options: BASIC_SORT_OPTIONS,
  onChange: () => renderSubmissions()
});

const LIST_URL = "/activity.html";

let assignment = null;
let submissions = [];
let currentUser = null;
let currentProfile = null;
let mySubmission = null;
let canSeeList = false;
let canOpenAll = false;
let showOnlyMine = false;
let isSubmitting = false;
let isEditSaving = false;

// ========================================
// 과제 번호 읽기
// ========================================
// 기본은 /activity/assignment/<과제 번호> 주소를 쓰고,
// 재작성 규칙이 없는 환경에서는 ?id=<과제 번호> 로도 들어올 수 있게 한다.

function readAssignmentId() {
  const pathMatch = window.location.pathname.match(/^\/activity\/assignment\/([^/]+)\/?$/);

  if (pathMatch) {
    return decodeURIComponent(pathMatch[1]);
  }

  return new URLSearchParams(window.location.search).get("id") ?? "";
}

const assignmentId = readAssignmentId();

const SUBMIT_URL = `/activity/submit/${encodeURIComponent(assignmentId)}`;

function getSubmissionUrl(submissionId) {
  return `/activity/submission/${encodeURIComponent(assignmentId)}`
    + `/${encodeURIComponent(submissionId)}`;
}

guardPage({
  onReady: async ({ user, profile }) => {
    currentUser = user;
    currentProfile = profile;

    submissionMineButton.disabled = !user;

    await loadAssignment();
  }
});

// ========================================
// 과제 불러오기
// ========================================

async function loadAssignment() {
  if (!assignmentId) {
    showStateMessage("잘못된 주소입니다. 목록에서 과제를 다시 선택해주세요.");
    return;
  }

  try {
    assignment = await getAssignment(assignmentId);

    if (!assignment) {
      showStateMessage("삭제되었거나 존재하지 않는 과제입니다.");
      return;
    }

    // 소속 동아리 과제만 열 수 있다. 규칙에서도 같은 조건으로 막는다.
    const assignmentClub = getAssignmentClubName(assignment);

    if (currentProfile?.isAdmin !== true
      && !getReadableClubNames(currentProfile).includes(assignmentClub)) {
      showStateMessage(
        `${assignmentClub} 소속만 볼 수 있는 과제예요.`
        + " 소속이 잘못됐다면 연합회에 문의해주세요."
      );
      return;
    }

    // 조회수는 로그인한 계정이 30분에 한 번만 올린다.
    if (currentUser) {
      try {
        const didCount = await registerAssignmentView(assignmentId, currentUser.uid);
        if (didCount) assignment.viewCount = Number(assignment.viewCount ?? 0) + 1;
      } catch (error) {
        console.error("조회수 기록 오류:", error);
      }
    }

    // 담당자(등록자) · 관리자는 전체를, 이미 낸 계정은 목록까지 볼 수 있다.
    const isAdmin = currentProfile?.isAdmin === true;
    const isManager = isAssignmentManager(assignment, currentUser?.uid);

    mySubmission = currentUser
      ? await getMySubmission(assignmentId, currentUser.uid).catch(() => null)
      : null;

    canOpenAll = isAdmin || isManager;
    canSeeList = canOpenAll || Boolean(mySubmission);

    renderAssignment();
    await loadSubmissions();
  } catch (error) {
    console.error("동아리 과제 조회 오류:", error);
    showStateMessage("과제를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

function renderAssignment() {
  const status = getAssignmentStatus(assignment);
  const title = assignment.title ?? "제목 없음";

  document.title = `${title} | 동아리 과제 제출`;
  titleText.textContent = title;

  // 어느 동아리 과제인지 제목 옆에 남긴다.
  const clubSlot = document.querySelector("#assignmentClubTag");
  if (clubSlot) {
    clubSlot.textContent = "";
    clubSlot.appendChild(createClubTag(getAssignmentClubName(assignment)));
  }

  statusBadge.className = `board-badge is-${status}`;
  statusBadge.textContent = getAssignmentStatusName(status);

  periodText.textContent =
    `제출기간 : ${formatDateTime(assignment.startAt)} ~ ${formatDateTime(assignment.dueAt)}`;
  remainingText.textContent = describeRemaining(assignment);

  managerText.textContent = assignment.managerName || "-";
  openedText.textContent = formatDateTime(assignment.createdAt);
  viewsText.textContent = formatViewCount(assignment.viewCount);
  targetText.textContent = assignment.target || "전체 동아리";
  lateEditText.textContent = assignment.allowLateEdit ? "허용" : "금지";
  commentText.textContent = assignment.allowComment ? "사용" : "사용 안 함";
  noticeText.textContent = assignment.notice || "안내된 내용이 없습니다.";

  // 수정과 삭제는 작성자와 관리자만. 보안 규칙에서도 같은 조건으로 막는다.
  assignmentEditButton.hidden = !canOpenAll;
  assignmentDeleteButton.hidden = !canOpenAll;

  renderAssignmentAttachments();

  // 계정당 한 번만 낼 수 있다. 이미 냈으면 내 글로 보낸다.
  if (mySubmission) {
    submitOpenButton.textContent = "내 제출글 보기";
    submitOpenButton.disabled = false;
    submitOpenButton.title = "";
  } else {
    const canSubmit = Boolean(currentUser) && isSubmittable(assignment);
    submitOpenButton.textContent = "+ 과제제출";
    submitOpenButton.disabled = !canSubmit;
    submitOpenButton.title = canSubmit
      ? ""
      : (currentUser ? "제출 기간이 아닙니다." : "제출하려면 로그인해주세요.");
  }

  article.hidden = false;
  stateMessage.hidden = true;
}

function renderAssignmentAttachments() {
  const files = Array.isArray(assignment?.attachments) ? assignment.attachments : [];

  attachmentListElement.textContent = "";
  attachmentSection.hidden = files.length === 0;

  files.forEach((attachment) => {
    const item = document.createElement("li");
    item.className = "board-attachment";

    const link = document.createElement("a");
    link.href = attachment.url ?? "#";
    link.textContent = attachment.name ?? "파일";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    // 링크를 눌러 바로 내려받게 한다.
    link.download = attachment.name ?? "";

    const size = document.createElement("span");
    size.className = "board-attachment-size";
    size.textContent = formatFileSize(attachment.size);

    item.append(link, size);
    attachmentListElement.appendChild(item);
  });
}

// ========================================
// 제출 현황
// ========================================

async function loadSubmissions() {
  if (!currentUser) {
    submissionTotalCount.textContent = "0";
    showTableMessage("제출 현황은 로그인 후 볼 수 있습니다.");
    return;
  }

  // 아직 내지 않은 계정에게는 제출 현황을 보여주지 않는다.
  if (!canSeeList) {
    submissionTotalCount.textContent = "0";
    submissionMineButton.disabled = true;
    showTableMessage("과제를 제출하면 제출 현황을 볼 수 있습니다.");
    return;
  }

  showTableMessage("제출 현황을 불러오는 중...");

  try {
    submissions = await getSubmissions(assignmentId);
    renderSubmissions();
  } catch (error) {
    console.error("제출 현황 조회 오류:", error);
    showTableMessage("제출 현황을 불러오지 못했습니다.");
  }
}

submissionMineButton.addEventListener("click", () => {
  showOnlyMine = !showOnlyMine;
  submissionMineButton.classList.toggle("is-active", showOnlyMine);
  submissionMineButton.setAttribute("aria-pressed", String(showOnlyMine));
  renderSubmissions();
});

function renderSubmissions() {
  const filtered = showOnlyMine
    ? submissions.filter((submission) => submission.authorUid === currentUser?.uid)
    : submissions;

  submissionTotalCount.textContent = String(filtered.length);
  submissionTableBody.textContent = "";

  if (filtered.length === 0) {
    showTableMessage(showOnlyMine ? "내가 제출한 글이 없습니다." : "제출된 글이 없습니다.");
    return;
  }

  // 순번은 먼저 낸 글이 1번이고, 정렬을 바꿔도 글마다 그대로다.
  const serials = buildSerialNumbers(filtered, (submission) => submission.createdAt);
  const sorted = sortItems(filtered, submissionSort.value(), {
    created: (submission) => submission.createdAt,
    title: (submission) => submission.title
  });

  sorted.forEach((submission) => {
    const row = document.createElement("tr");
    row.className = "board-row";

    // 낸 내용은 본인과 담당자, 관리자만 열 수 있다.
    const canOpen = canOpenAll || submission.id === currentUser?.uid;
    const title = submission.title ?? "제목 없음";
    let titleCell;

    if (canOpen) {
      const link = document.createElement("a");
      link.className = "board-title-link";
      link.href = getSubmissionUrl(submission.id);
      link.textContent = title;
      titleCell = link;
    } else {
      const plain = document.createElement("span");
      plain.className = "board-title-locked";
      plain.textContent = title;
      plain.title = "본인이 낸 글만 열어볼 수 있습니다.";
      titleCell = plain;
    }

    row.append(
      cell("순번", String(serials.get(submission.id)), "board-cell-number"),
      cell("제목", titleCell, "board-cell-title"),
      cell("이름", submission.authorName || "이름 없음", "board-cell-person"),
      cell("날짜", formatDate(submission.createdAt), "board-cell-date"),
      cell("조회", formatViewCount(submission.viewCount), "board-cell-count")
    );

    submissionTableBody.appendChild(row);
  });
}

// ========================================
// 과제 제출 (제출 페이지로 이동)
// ========================================

submitOpenButton.addEventListener("click", () => {
  if (!currentUser) return;

  if (mySubmission) {
    window.location.href = getSubmissionUrl(mySubmission.id);
    return;
  }

  if (!isSubmittable(assignment)) return;

  window.location.href = SUBMIT_URL;
});

// ========================================
// 과제 수정 (작성자 · 관리자 전용)
// ========================================

assignmentEditButton.addEventListener("click", () => {
  if (!canOpenAll || !assignment) return;

  document.querySelector("#assignmentEditTitle").value = assignment.title ?? "";
  document.querySelector("#assignmentEditManager").value = assignment.managerName ?? "";
  document.querySelector("#assignmentEditTarget").value = assignment.target ?? "";
  document.querySelector("#assignmentEditStartAt").value = toDateTimeLocal(assignment.startAt);
  document.querySelector("#assignmentEditDueAt").value = toDateTimeLocal(assignment.dueAt);
  document.querySelector("#assignmentEditAllowLateEdit").checked = assignment.allowLateEdit === true;
  document.querySelector("#assignmentEditAllowComment").checked = assignment.allowComment === true;
  document.querySelector("#assignmentEditNotice").value = assignment.notice ?? "";

  editPicker.reset(Array.isArray(assignment.attachments) ? assignment.attachments : []);
  editMessage.textContent = "";
  editDialog.showModal();
});

editCloseButton.addEventListener("click", () => editDialog.close());

editDialog.addEventListener("click", (event) => {
  if (event.target === editDialog) editDialog.close();
});

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isEditSaving || !canOpenAll || !assignment) return;

  const edited = {
    title: document.querySelector("#assignmentEditTitle").value,
    managerName: document.querySelector("#assignmentEditManager").value,
    target: document.querySelector("#assignmentEditTarget").value,
    startAt: document.querySelector("#assignmentEditStartAt").value,
    dueAt: document.querySelector("#assignmentEditDueAt").value,
    allowLateEdit: document.querySelector("#assignmentEditAllowLateEdit").checked,
    allowComment: document.querySelector("#assignmentEditAllowComment").checked,
    notice: document.querySelector("#assignmentEditNotice").value
  };

  if (!edited.title.trim()) {
    editMessage.textContent = "과제명을 입력해주세요.";
    return;
  }

  if (new Date(edited.dueAt).getTime() <= new Date(edited.startAt).getTime()) {
    editMessage.textContent = "마감 시각은 제출 시작보다 뒤여야 합니다.";
    return;
  }

  const original = Array.isArray(assignment.attachments) ? assignment.attachments : [];
  const { kept, removed, files } = editPicker.read(original);
  const fileProblem = validateAttachmentFiles(files, kept.length);

  if (fileProblem) {
    editMessage.textContent = fileProblem;
    return;
  }

  isEditSaving = true;
  editSaveButton.disabled = true;
  editSaveButton.textContent = "저장 중...";
  editMessage.textContent = "";

  let uploaded = [];

  try {
    if (files.length > 0) {
      uploaded = await uploadAssignmentFiles({
        assignmentId,
        uid: currentUser.uid,
        files,
        onProgress: (index, total) => {
          editMessage.textContent = `첨부파일을 올리는 중... (${index + 1}/${total})`;
        }
      });
    }

    const attachments = [...kept, ...uploaded];

    await updateAssignment(assignmentId, { ...edited, attachments });

    // 저장이 끝난 뒤에야 해제한 파일을 저장소에서 지운다. (저장이 실패하면 그대로 남는다)
    await removeAttachments(removed);

    assignment = await getAssignment(assignmentId) ?? assignment;
    renderAssignment();
    editDialog.close();
  } catch (error) {
    console.error("동아리 과제 수정 오류:", error);
    await removeAttachments(uploaded);
    editMessage.textContent = "과제를 수정하지 못했습니다. 권한이나 네트워크를 확인하고 다시 시도해주세요.";
  } finally {
    isEditSaving = false;
    editSaveButton.disabled = false;
    editSaveButton.textContent = "저장";
  }
});

// ========================================
// 과제 삭제 (담당자 · 관리자 전용)
// ========================================

assignmentDeleteButton.addEventListener("click", async () => {
  if (!canOpenAll) return;

  const answer = window.confirm(
    `'${assignment?.title ?? "과제"}' 과제를 삭제할까요? 제출된 글도 함께 지워집니다.`
  );

  if (!answer) return;

  assignmentDeleteButton.disabled = true;
  assignmentDeleteButton.textContent = "삭제 중...";

  try {
    await deleteAssignment(assignmentId);
    window.location.replace(LIST_URL);
  } catch (error) {
    console.error("동아리 과제 삭제 오류:", error);
    assignmentDeleteButton.disabled = false;
    assignmentDeleteButton.textContent = "과제 삭제";
    showStateMessage("과제를 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.", true);
  }
});

// ========================================
// 표시 도구
// ========================================

function cell(label, value, className) {
  const td = document.createElement("td");
  td.className = className;
  td.dataset.label = label;

  if (value instanceof Node) {
    td.appendChild(value);
  } else {
    td.textContent = value;
  }

  return td;
}

function showTableMessage(message) {
  submissionTableBody.textContent = "";

  const row = document.createElement("tr");
  row.className = "board-empty-row";

  const td = document.createElement("td");
  td.colSpan = 5;
  td.textContent = message;

  row.appendChild(td);
  submissionTableBody.appendChild(row);
}

function showStateMessage(message, keepArticle = false) {
  stateMessage.textContent = message;
  stateMessage.hidden = false;

  if (!keepArticle) article.hidden = true;
}
