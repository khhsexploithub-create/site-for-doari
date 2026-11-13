import "../styles/site.css";
import "../styles/neoul/board.css";

import { guardPage } from "../pageGuard.js";
import { getDisplayName, getReadableClubNames } from "../userRole.js";
import {
  createSubmission,
  describeRemaining,
  formatDateTime,
  getAssignment,
  getAssignmentStatus,
  getAssignmentClubName,
  getAssignmentStatusName,
  getMySubmission,
  isSubmittable
} from "./assignmentService.js";
import {
  MAX_FILE_BYTES,
  MAX_FILE_COUNT,
  createUploadId,
  findOversizedFile,
  formatFileSize,
  removeAttachments,
  uploadAttachments
} from "./attachmentUpload.js";

const form = document.querySelector("#submitForm");
const stateMessage = document.querySelector("#submitStateMessage");
const backLink = document.querySelector("#submitBackLink");
const cancelLink = document.querySelector("#submitCancelLink");

const assignmentTitleTag = document.querySelector("#submitAssignmentTitle");
const statusBadge = document.querySelector("#submitStatusBadge");
const periodText = document.querySelector("#submitPeriodText");
const remainingText = document.querySelector("#submitRemainingText");

const authorNameInput = document.querySelector("#submitAuthorName");
const studentIdInput = document.querySelector("#submitStudentId");
const titleInput = document.querySelector("#submitTitle");
const contentInput = document.querySelector("#submitContent");
const contentCount = document.querySelector("#submitContentCount");

const attachmentList = document.querySelector("#submitAttachmentList");
const addAttachmentButton = document.querySelector("#submitAddAttachmentButton");

const saveButton = document.querySelector("#submitSaveButton");
const message = document.querySelector("#submitMessage");

const INITIAL_ATTACHMENT_ROWS = 5;

let assignment = null;
let currentUser = null;
let currentProfile = null;
let isSaving = false;

// ========================================
// 주소 읽기
// ========================================
// /activity/submit/<과제 번호> 를 쓰고,
// 재작성 규칙이 없는 환경에서는 ?id=<과제 번호> 로도 들어올 수 있게 한다.

function readAssignmentId() {
  const pathMatch = window.location.pathname.match(/^\/activity\/submit\/([^/]+)\/?$/);

  if (pathMatch) {
    return decodeURIComponent(pathMatch[1]);
  }

  return new URLSearchParams(window.location.search).get("id") ?? "";
}

const assignmentId = readAssignmentId();
const assignmentUrl = assignmentId
  ? `/activity/assignment/${encodeURIComponent(assignmentId)}`
  : "/activity.html";

backLink.href = assignmentUrl;
cancelLink.href = assignmentUrl;

guardPage({
  onReady: async ({ user, profile }) => {
    currentUser = user;
    currentProfile = profile;

    await loadAssignment();
  }
});

async function loadAssignment() {
  if (!assignmentId) {
    showStateMessage("잘못된 주소입니다. 과제 목록에서 다시 들어와주세요.");
    return;
  }

  try {
    assignment = await getAssignment(assignmentId);

    if (!assignment) {
      showStateMessage("삭제되었거나 존재하지 않는 과제입니다.");
      return;
    }

    // 소속 동아리 과제에만 낼 수 있다. 규칙에서도 같은 조건으로 막는다.
    const assignmentClub = getAssignmentClubName(assignment);

    if (currentProfile?.isAdmin !== true
      && !getReadableClubNames(currentProfile).includes(assignmentClub)) {
      showStateMessage(`${assignmentClub} 소속만 낼 수 있는 과제예요.`);
      return;
    }

    if (!isSubmittable(assignment)) {
      showStateMessage("제출 기간이 아닙니다. 과제 화면에서 기간을 확인해주세요.");
      return;
    }

    // 계정당 한 번만 낼 수 있다.
    const mine = await getMySubmission(assignmentId, currentUser.uid).catch(() => null);

    if (mine) {
      showStateMessage("이미 제출한 과제입니다. 다시 내려면 낸 글을 지우고 새로 써주세요.");
      return;
    }

    renderForm();
  } catch (error) {
    console.error("동아리 과제 조회 오류:", error);
    showStateMessage("과제를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

function renderForm() {
  const status = getAssignmentStatus(assignment);
  const title = assignment.title ?? "제목 없음";

  document.title = `${title} 과제제출 | 동아리 통합 인프라`;
  assignmentTitleTag.textContent = title;

  statusBadge.className = `board-badge is-${status}`;
  statusBadge.textContent = getAssignmentStatusName(status);

  periodText.textContent =
    `제출기간 : ${formatDateTime(assignment.startAt)} ~ ${formatDateTime(assignment.dueAt)}`;
  remainingText.textContent = describeRemaining(assignment);

  authorNameInput.value = getDisplayName(currentProfile, currentUser);
  studentIdInput.value = currentProfile?.studentId || "학번 미등록";

  for (let index = 0; index < INITIAL_ATTACHMENT_ROWS; index += 1) {
    addAttachmentRow();
  }

  form.hidden = false;
  stateMessage.hidden = true;
}

// ========================================
// 첨부 칸
// ========================================

function addAttachmentRow() {
  const rows = attachmentList.children.length;

  if (rows >= MAX_FILE_COUNT) {
    message.textContent = `첨부는 ${MAX_FILE_COUNT}개까지 올릴 수 있습니다.`;
    return;
  }

  const item = document.createElement("li");
  item.className = "board-attach-row";

  const label = document.createElement("span");
  label.className = "board-attach-label";
  label.textContent = `첨부${rows + 1}`;

  // 파일 상자 전체가 누르는 자리다. 진짜 입력칸은 상자 안에 숨겨 둔다.
  const box = document.createElement("label");
  box.className = "board-attach-box";

  const input = document.createElement("input");
  input.type = "file";
  input.className = "board-attach-input";
  input.setAttribute("aria-label", `첨부파일 ${rows + 1}`);

  const choose = document.createElement("span");
  choose.className = "board-attach-choose";
  choose.textContent = "파일 선택";

  const name = document.createElement("span");
  name.className = "board-attach-name";
  name.textContent = "선택된 파일 없음";

  const size = document.createElement("span");
  size.className = "board-attach-size";

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "board-attach-clear";
  clearButton.textContent = "×";
  clearButton.hidden = true;
  clearButton.setAttribute("aria-label", `첨부파일 ${rows + 1} 지우기`);

  function showChosenFile() {
    const file = input.files?.[0];

    if (!file) {
      box.classList.remove("is-filled");
      name.textContent = "선택된 파일 없음";
      size.textContent = "";
      clearButton.hidden = true;
      return;
    }

    if (file.size > MAX_FILE_BYTES) {
      message.textContent =
        `'${file.name}' 은 ${formatFileSize(MAX_FILE_BYTES)} 를 넘습니다. 더 작은 파일을 올려주세요.`;
      input.value = "";
      showChosenFile();
      return;
    }

    message.textContent = "";
    box.classList.remove("is-dragging");
    box.classList.add("is-filled");
    name.textContent = file.name;
    size.textContent = formatFileSize(file.size);
    clearButton.hidden = false;
  }

  input.addEventListener("change", showChosenFile);

  clearButton.addEventListener("click", () => {
    input.value = "";
    showChosenFile();
  });

  // 상자에 파일을 끌어다 놓아도 된다.
  box.addEventListener("dragover", (event) => {
    event.preventDefault();
    box.classList.add("is-dragging");
  });

  box.addEventListener("dragleave", () => box.classList.remove("is-dragging"));

  box.addEventListener("drop", (event) => {
    event.preventDefault();
    box.classList.remove("is-dragging");

    const dropped = event.dataTransfer?.files?.[0];
    if (!dropped) return;

    const transfer = new DataTransfer();
    transfer.items.add(dropped);
    input.files = transfer.files;
    showChosenFile();
  });

  box.append(input, choose, name, size);
  item.append(label, box, clearButton);
  attachmentList.appendChild(item);

  addAttachmentButton.hidden = attachmentList.children.length >= MAX_FILE_COUNT;
}

addAttachmentButton.addEventListener("click", addAttachmentRow);

function readChosenFiles() {
  return [...attachmentList.querySelectorAll(".board-attach-input")]
    .map((input) => input.files?.[0])
    .filter(Boolean);
}

// ========================================
// 글자 수
// ========================================

contentInput.addEventListener("input", () => {
  contentCount.textContent = String(contentInput.value.length);
});

// ========================================
// 저장
// ========================================

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSaving || !assignment) return;

  if (!titleInput.value.trim() || !contentInput.value.trim()) {
    message.textContent = "제목과 내용을 모두 입력해주세요.";
    return;
  }

  // 화면을 열어둔 사이에 마감됐을 수 있어 저장 직전에 한 번 더 본다.
  if (!isSubmittable(assignment)) {
    message.textContent = "제출 기간이 지났습니다.";
    return;
  }

  const files = readChosenFiles();
  const oversized = findOversizedFile(files);

  if (oversized) {
    message.textContent =
      `'${oversized.name}' 은 ${formatFileSize(MAX_FILE_BYTES)} 를 넘습니다.`;
    return;
  }

  isSaving = true;
  saveButton.disabled = true;
  saveButton.textContent = "저장 중...";
  message.textContent = files.length > 0 ? "첨부파일을 올리는 중..." : "";

  let uploaded = [];

  try {
    uploaded = files.length > 0
      ? await uploadAttachments({
        assignmentId,
        uid: currentUser.uid,
        uploadId: createUploadId(),
        files,
        onProgress: (index, total, name) => {
          message.textContent = `첨부파일을 올리는 중... (${index + 1}/${total}) ${name}`;
        }
      })
      : [];

    message.textContent = "제출하는 중...";

    await createSubmission(assignmentId, {
      title: titleInput.value,
      content: contentInput.value,
      authorName: getDisplayName(currentProfile, currentUser),
      studentId: currentProfile?.studentId ?? "",
      attachments: uploaded
    });

    window.location.replace(assignmentUrl);
  } catch (error) {
    console.error("과제 제출 오류:", error);

    // 저장에 실패했으면 이미 올라간 첨부파일은 지워서 찌꺼기를 남기지 않는다.
    await removeAttachments(uploaded);

    message.textContent = describeSubmitError(error);
    isSaving = false;
    saveButton.disabled = false;
    saveButton.textContent = "저장";
  }
});

// 왜 실패했는지 화면에서 바로 알 수 있게 풀어 쓴다.
function describeSubmitError(error) {
  const code = String(error?.code ?? "");

  if (code === "permission-denied") {
    return "제출 권한이 없습니다. 제출 기간과 로그인 상태를 확인해주세요."
      + " (보안 규칙이 아직 반영되지 않았을 수도 있습니다)";
  }

  if (code === "storage/unauthorized") {
    return "첨부파일을 올릴 권한이 없습니다. Storage 규칙이 배포되었는지 확인해주세요.";
  }

  if (code === "storage/unknown" || code === "storage/retry-limit-exceeded") {
    return "첨부파일을 올리지 못했습니다. Firebase Storage 가 켜져 있는지 확인해주세요.";
  }

  if (code.startsWith("storage/")) {
    return `첨부파일을 올리지 못했습니다. (${code})`;
  }

  return code
    ? `제출하지 못했습니다. (${code})`
    : "제출하지 못했습니다. 잠시 후 다시 시도해주세요.";
}

function showStateMessage(text) {
  form.hidden = true;
  stateMessage.hidden = false;
  stateMessage.textContent = text;
}
