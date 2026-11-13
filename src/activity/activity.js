import "../styles/site.css";
import "../styles/neoul/board.css";

import { guardPage } from "../pageGuard.js";
import { mountPageBell } from "../notifications/bell.js";
import {
  EXECUTIVE_ROLE,
  UNION_CLUB_NAME,
  getClubLeaderOf,
  getDisplayName,
  getReadableClubNames,
  readClubs
} from "../userRole.js";
import { CLUBS, createClubTag } from "../clubList.js";
import {
  ASSIGNMENT_SORT_OPTIONS,
  bindSortSelect,
  buildSerialNumbers,
  sortItems
} from "../ui/listSort.js";
import { createAttachmentPicker } from "./attachmentPicker.js";
import {
  removeAttachments,
  uploadAssignmentFiles,
  validateAttachmentFiles
} from "./attachmentUpload.js";
import {
  createActivityRecord,
  getActivityRecords
} from "./activityService.js";
import {
  createAssignment,
  formatDate,
  formatShortDateTime,
  formatViewCount,
  getAssignmentStatus,
  getAssignmentStatusName,
  getAssignmentClubName,
  getAssignments,
  getYear,
  newAssignmentId,
  summarizeSubmissions
} from "./assignmentService.js";

// ========================================
// 화면 요소
// ========================================

const tabButtons = [...document.querySelectorAll(".board-tab")];
const panels = {
  assignment: document.querySelector("#assignmentPanel"),
  notice: document.querySelector("#noticePanel")
};

const assignmentClubNotice = document.querySelector("#assignmentClubNotice");
const assignmentClubTabs = document.querySelector("#assignmentClubTabs");
const assignmentTableBody = document.querySelector("#assignmentTableBody");
const assignmentYearFilter = document.querySelector("#assignmentYearFilter");
const assignmentStatusFilter = document.querySelector("#assignmentStatusFilter");
const assignmentSortSelect = document.querySelector("#assignmentSortSelect");
const assignmentMineButton = document.querySelector("#assignmentMineButton");
const assignmentCreateButton = document.querySelector("#assignmentCreateButton");

const assignmentDialog = document.querySelector("#assignmentFormDialog");
const assignmentForm = document.querySelector("#assignmentForm");
const assignmentCloseButton = document.querySelector("#assignmentFormCloseButton");
const assignmentSubmitButton = document.querySelector("#assignmentSubmitButton");
const assignmentFormMessage = document.querySelector("#assignmentFormMessage");
const assignmentClubSelect = document.querySelector("#assignmentClub");
const assignmentClubHint = document.querySelector("#assignmentClubHint");

const noticeTableBody = document.querySelector("#noticeTableBody");
const noticeTotalCount = document.querySelector("#noticeTotalCount");
const noticeSearchField = document.querySelector("#noticeSearchField");
const noticeSearchInput = document.querySelector("#noticeSearchInput");
const noticeSortSelect = document.querySelector("#noticeSortSelect");
const noticeCreateButton = document.querySelector("#noticeCreateButton");

const formDialog = document.querySelector("#activityFormDialog");
const closeFormButton = document.querySelector("#activityFormCloseButton");
const form = document.querySelector("#activityForm");
const clubNameInput = document.querySelector("#activityClubName");
const titleInput = document.querySelector("#activityTitle");
const contentInput = document.querySelector("#activityContent");
const passwordInput = document.querySelector("#activityPassword");
const submitButton = document.querySelector("#activitySubmitButton");
const formMessage = document.querySelector("#activityFormMessage");

const attachmentPicker = assignmentDialog
  ? createAttachmentPicker({
    list: document.querySelector("#assignmentAttachList"),
    addButton: document.querySelector("#assignmentAttachAddButton"),
    message: assignmentFormMessage
  })
  : null;

// 정렬은 기본이 최신순이고, 고른 방식은 브라우저에 기억해 새로고침해도 유지한다.
const assignmentSort = bindSortSelect(assignmentSortSelect, {
  storageKey: "assignments",
  options: ASSIGNMENT_SORT_OPTIONS,
  onChange: () => renderAssignments()
});

const noticeSort = bindSortSelect(noticeSortSelect, {
  storageKey: "activityNotices",
  onChange: () => renderFilteredActivityRecords()
});

let assignments = [];
let activityRecords = [];
let currentUser = null;
let currentProfile = null;
let currentRole = "";
let showOnlyMine = false;
let myClubNames = [];
let selectedClubTab = "";
let leaderClub = "";
let isAdminAccount = false;
let isAssignmentSubmitting = false;
let isSubmitting = false;

// 글 하나를 여는 주소. 새로고침하거나 링크를 공유해도 그대로 열린다.
function getAssignmentUrl(assignmentId) {
  return `/activity/assignment/${encodeURIComponent(assignmentId)}`;
}

function getNoticeUrl(recordId) {
  return `/activity/notice/${encodeURIComponent(recordId)}`;
}

// ========================================
// 탭
// ========================================

tabButtons.forEach((button) => {
  button.addEventListener("click", () => selectTab(button.dataset.tab));
});

function selectTab(name) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tab === name;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  Object.entries(panels).forEach(([key, panel]) => {
    panel.hidden = key !== name;
  });

  // 새로고침해도 보고 있던 탭이 그대로 열리도록 주소에 남긴다.
  const url = new URL(window.location.href);
  url.searchParams.set("tab", name);
  window.history.replaceState(null, "", url);
}

// ========================================
// 권한 확인 (일반 계정은 등록 기능을 쓸 수 없다)
// ========================================

guardPage({
  allowAnonymous: true,
  onReady: async ({ user, role, profile }) => {
    currentUser = user;
    currentProfile = profile;
    currentRole = role;

    mountPageBell(user);

    isAdminAccount = profile?.isAdmin === true;
    leaderClub = getClubLeaderOf(profile);
    myClubNames = user ? getReadableClubNames(profile) : [];

    // 공지는 지금까지처럼 연합회 임원이 올린다.
    noticeCreateButton.hidden = role !== EXECUTIVE_ROLE;
    if (role !== EXECUTIVE_ROLE) formDialog.remove();

    // 과제는 그 동아리 부장(과 관리자)만 등록한다.
    const canRegisterAssignment = isAdminAccount || Boolean(leaderClub);
    assignmentCreateButton.hidden = !canRegisterAssignment;
    assignmentCreateButton.textContent = leaderClub
      ? `+ ${leaderClub} 과제 등록`
      : "+ 과제 등록";

    if (!canRegisterAssignment) {
      assignmentDialog.remove();
    } else {
      fillAssignmentClubSelect();
    }

    // MY 는 로그인한 계정만 쓸 수 있다.
    assignmentMineButton.disabled = !user;

    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    selectTab(requestedTab === "notice" ? "notice" : "assignment");

    await Promise.all([loadAssignments(), loadActivityRecords()]);
  }
});

// ========================================
// 동아리 과제 목록
// ========================================

async function loadAssignments() {
  // 소속 동아리를 모르면 과제를 읽을 수 없다. (규칙에서도 막는다)
  if (!currentUser) {
    showClubNotice("동아리 과제는 로그인한 뒤에 볼 수 있습니다.");
    showTableMessage(assignmentTableBody, 8, "로그인 후 이용해주세요.");
    return;
  }

  if (!isAdminAccount && readClubs(currentProfile).length === 0) {
    showClubNotice("소속 동아리를 먼저 골라주세요. 오른쪽 아래 프로필에서 고를 수 있어요.");
    showTableMessage(assignmentTableBody, 8, "소속 동아리를 고르면 과제가 보입니다.");
    return;
  }

  showTableMessage(assignmentTableBody, 8, "과제를 불러오는 중...");

  try {
    // 관리자는 전체를, 그 밖에는 소속 동아리와 연합회 공통만 읽는다.
    assignments = await getAssignments(isAdminAccount ? null : myClubNames);

    // 제출 현황은 담당자 · 관리자 · 이미 낸 계정만 볼 수 있다.
    // 그 밖의 계정에게는 건수를 '-' 로 둔다.
    if (currentUser) {
      const summaries = await Promise.all(assignments.map((assignment) => (
        summarizeSubmissions(assignment, {
          uid: currentUser.uid,
          isAdmin: currentProfile?.isAdmin === true
        }).catch(() => null)
      )));

      assignments = assignments.map((assignment, index) => ({
        ...assignment,
        submissionCount: summaries[index]?.total ?? null,
        hasMySubmission: summaries[index]?.hasMine ?? false
      }));
    }

    fillYearFilter();
    fillClubTabs();
    renderAssignments();
  } catch (error) {
    console.error("동아리 과제 조회 오류:", error);
    showTableMessage(assignmentTableBody, 8, "과제를 불러오지 못했습니다.");
  }
}

function showClubNotice(text) {
  assignmentClubNotice.textContent = text;
  assignmentClubNotice.hidden = false;
  assignmentClubTabs.hidden = true;
}

// 소속 동아리 + 연합회 공통을 탭으로 놓는다. 관리자는 과제가 있는 동아리를 모두 본다.
function fillClubTabs() {
  const names = isAdminAccount
    ? [...new Set(assignments.map(getAssignmentClubName))]
      .sort((first, second) => first.localeCompare(second, "ko-KR"))
    : myClubNames;

  assignmentClubTabs.textContent = "";
  assignmentClubTabs.hidden = names.length <= 1;

  if (!names.includes(selectedClubTab)) {
    selectedClubTab = names[0] ?? "";
  }

  names.forEach((clubName) => {
    const count = assignments
      .filter((assignment) => getAssignmentClubName(assignment) === clubName).length;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "board-subtab";
    button.setAttribute("role", "tab");
    button.textContent = `${clubName} ${count}`;
    button.classList.toggle("is-active", clubName === selectedClubTab);
    button.setAttribute("aria-selected", String(clubName === selectedClubTab));

    button.addEventListener("click", () => {
      selectedClubTab = clubName;
      fillClubTabs();
      renderAssignments();
    });

    assignmentClubTabs.appendChild(button);
  });
}

// 등록 창의 동아리 칸. 부장은 자기 동아리로 고정되고, 관리자만 고를 수 있다.
function fillAssignmentClubSelect() {
  assignmentClubSelect.textContent = "";

  const names = isAdminAccount
    ? [UNION_CLUB_NAME, ...CLUBS.map((club) => club.name)]
    : [leaderClub];

  names.forEach((clubName) => {
    assignmentClubSelect.appendChild(new Option(clubName, clubName));
  });

  assignmentClubSelect.disabled = !isAdminAccount;
  assignmentClubHint.textContent = isAdminAccount
    ? "관리자는 연합회 공통 과제도 낼 수 있습니다."
    : "부장 동아리로 고정됩니다.";
}

function fillYearFilter() {
  const years = [...new Set(assignments
    .map((assignment) => getYear(assignment.dueAt) || getYear(assignment.createdAt))
    .filter(Boolean))].sort((first, second) => second - first);

  const selected = assignmentYearFilter.value;

  assignmentYearFilter.textContent = "";
  assignmentYearFilter.appendChild(new Option("전체 연도", ""));
  years.forEach((year) => assignmentYearFilter.appendChild(new Option(`${year}년`, String(year))));

  if (years.includes(Number(selected))) {
    assignmentYearFilter.value = selected;
  }
}

assignmentYearFilter.addEventListener("change", renderAssignments);
assignmentStatusFilter.addEventListener("change", renderAssignments);

assignmentMineButton.addEventListener("click", () => {
  showOnlyMine = !showOnlyMine;
  assignmentMineButton.classList.toggle("is-active", showOnlyMine);
  assignmentMineButton.setAttribute("aria-pressed", String(showOnlyMine));
  renderAssignments();
});

function renderAssignments() {
  const year = assignmentYearFilter.value;
  const statusFilter = assignmentStatusFilter.value;
  const now = Date.now();

  const filtered = assignments.filter((assignment) => {
    if (year && String(getYear(assignment.dueAt) || getYear(assignment.createdAt)) !== year) {
      return false;
    }

    if (statusFilter && getAssignmentStatus(assignment, now) !== statusFilter) return false;
    if (showOnlyMine && !assignment.hasMySubmission) return false;
    if (selectedClubTab && getAssignmentClubName(assignment) !== selectedClubTab) return false;

    return true;
  });

  assignmentTableBody.textContent = "";

  if (filtered.length === 0) {
    showTableMessage(assignmentTableBody, 8, "등록된 과제가 없습니다.");
    return;
  }

  // 순번은 먼저 올라온 과제가 1번이고, 어떻게 정렬해도 과제마다 그대로다.
  const serials = buildSerialNumbers(filtered, (assignment) => assignment.createdAt);
  const sorted = sortItems(filtered, assignmentSort.value(), {
    created: (assignment) => assignment.createdAt,
    title: (assignment) => assignment.title,
    due: (assignment) => assignment.dueAt,
    now
  });

  sorted.forEach((assignment) => {
    const status = getAssignmentStatus(assignment, now);
    const url = getAssignmentUrl(assignment.id);
    const row = document.createElement("tr");
    row.className = "board-row";

    row.append(
      cell("순번", String(serials.get(assignment.id)), "board-cell-number"),
      cell("구분", statusBadge(status), "board-cell-status"),
      cell("과제명", assignmentTitleCell(assignment, url), "board-cell-title"),
      cell("동아리", createClubTag(getAssignmentClubName(assignment)), "board-cell-club"),
      cell(
        "제출",
        assignment.submissionCount == null ? "-" : `${assignment.submissionCount}건`,
        "board-cell-count"
      ),
      cell("담당자", assignment.managerName || "-", "board-cell-person"),
      cell("마감일", dueCell(assignment), "board-cell-due"),
      cell("바로가기", goLink(url, `${assignment.title ?? "과제"} 상세 보기`), "board-cell-go")
    );

    assignmentTableBody.appendChild(row);
  });
}

function assignmentTitleCell(assignment, url) {
  const wrap = document.createElement("span");
  wrap.className = "board-title-wrap";

  const link = document.createElement("a");
  link.className = "board-title-link";
  link.href = url;
  link.textContent = assignment.title ?? "제목 없음";
  wrap.appendChild(link);

  // 내가 제출한 과제에는 체크 표시를 남긴다.
  if (assignment.hasMySubmission) {
    const mark = document.createElement("span");
    mark.className = "board-mine-mark";
    mark.textContent = "✓";
    mark.title = "내가 제출한 과제";
    wrap.appendChild(mark);
  }

  return wrap;
}

function dueCell(assignment) {
  const wrap = document.createElement("span");
  wrap.className = "board-due";

  const start = document.createElement("span");
  start.className = "board-due-start";
  start.textContent = formatShortDateTime(assignment.startAt);

  const due = document.createElement("strong");
  due.textContent = formatShortDateTime(assignment.dueAt);

  wrap.append(start, due);
  return wrap;
}

function statusBadge(status) {
  const badge = document.createElement("span");
  badge.className = `board-badge is-${status}`;
  badge.textContent = getAssignmentStatusName(status);
  return badge;
}

function goLink(url, label) {
  const link = document.createElement("a");
  link.className = "board-go-link";
  link.href = url;
  link.textContent = "ⓘ";
  link.setAttribute("aria-label", label);
  link.title = label;
  return link;
}

// ========================================
// 과제 등록 (연합회 임원 전용)
// ========================================

assignmentCreateButton?.addEventListener("click", () => {
  if (!isAdminAccount && !leaderClub) return;

  assignmentFormMessage.textContent = "";
  attachmentPicker?.reset();
  assignmentDialog.showModal();
  document.querySelector("#assignmentTitle").focus();
});

assignmentCloseButton?.addEventListener("click", () => assignmentDialog.close());

assignmentDialog?.addEventListener("click", (event) => {
  if (event.target === assignmentDialog) assignmentDialog.close();
});

assignmentForm?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isAssignmentSubmitting) return;
  if (!isAdminAccount && !leaderClub) return;

  const assignment = {
    clubName: assignmentClubSelect.value,
    title: document.querySelector("#assignmentTitle").value,
    managerName: document.querySelector("#assignmentManager").value,
    target: document.querySelector("#assignmentTarget").value,
    startAt: document.querySelector("#assignmentStartAt").value,
    dueAt: document.querySelector("#assignmentDueAt").value,
    allowLateEdit: document.querySelector("#assignmentAllowLateEdit").checked,
    allowComment: document.querySelector("#assignmentAllowComment").checked,
    notice: document.querySelector("#assignmentNotice").value
  };

  if (new Date(assignment.dueAt).getTime() <= new Date(assignment.startAt).getTime()) {
    assignmentFormMessage.textContent = "마감 시각은 제출 시작보다 뒤여야 합니다.";
    return;
  }

  const { files } = attachmentPicker.read();
  const fileProblem = validateAttachmentFiles(files);

  if (fileProblem) {
    assignmentFormMessage.textContent = fileProblem;
    return;
  }

  isAssignmentSubmitting = true;
  assignmentSubmitButton.disabled = true;
  assignmentSubmitButton.textContent = "등록 중...";
  assignmentFormMessage.textContent = "";

  let uploaded = [];

  try {
    // 첨부파일을 먼저 올리고, 과제 문서에는 이름과 주소만 담는다.
    const assignmentId = newAssignmentId();

    if (files.length > 0) {
      assignmentFormMessage.textContent = "첨부파일을 올리는 중...";
      uploaded = await uploadAssignmentFiles({
        assignmentId,
        uid: currentUser.uid,
        files,
        onProgress: (index, total) => {
          assignmentFormMessage.textContent = `첨부파일을 올리는 중... (${index + 1}/${total})`;
        }
      });
    }

    await createAssignment({ ...assignment, assignmentId, attachments: uploaded });
    assignmentForm.reset();
    attachmentPicker.reset();
    assignmentFormMessage.textContent = "";
    assignmentDialog.close();
    await loadAssignments();
  } catch (error) {
    console.error("동아리 과제 저장 오류:", error);
    // 과제가 저장되지 못했다면 올려 둔 파일이 남지 않게 정리한다.
    await removeAttachments(uploaded);
    assignmentFormMessage.textContent = "과제를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
  } finally {
    isAssignmentSubmitting = false;
    assignmentSubmitButton.disabled = false;
    assignmentSubmitButton.textContent = "등록";
  }
});

// ========================================
// 동아리 공지 목록
// ========================================

async function loadActivityRecords() {
  showTableMessage(noticeTableBody, 6, "공지를 불러오는 중...");

  try {
    activityRecords = await getActivityRecords();
    renderFilteredActivityRecords();
  } catch (error) {
    console.error("동아리 공지 조회 오류:", error);
    showTableMessage(noticeTableBody, 6, "공지를 불러오지 못했습니다.");
  }
}

noticeSearchField.addEventListener("change", renderFilteredActivityRecords);
noticeSearchInput.addEventListener("input", renderFilteredActivityRecords);

function renderFilteredActivityRecords() {
  const searchTerm = noticeSearchInput.value.trim().toLocaleLowerCase("ko-KR");
  const field = noticeSearchField.value;

  const filtered = activityRecords.filter((activityRecord) => {
    if (!searchTerm) return true;
    return (activityRecord[field] ?? "").toLocaleLowerCase("ko-KR").includes(searchTerm);
  });

  noticeTotalCount.textContent = String(filtered.length);
  renderActivityRecords(filtered, Boolean(searchTerm));
}

function renderActivityRecords(records, isSearching) {
  noticeTableBody.textContent = "";

  if (records.length === 0) {
    showTableMessage(
      noticeTableBody,
      6,
      isSearching ? "검색 결과가 없습니다." : "등록된 공지가 없습니다."
    );
    return;
  }

  const serials = buildSerialNumbers(records, (record) => record.createdAt);
  const sorted = sortItems(records, noticeSort.value(), {
    created: (record) => record.createdAt,
    title: (record) => record.title
  });

  sorted.forEach((activityRecord) => {
    const row = document.createElement("tr");
    row.className = "board-row";

    const badge = document.createElement("span");
    badge.className = "board-badge is-notice";
    badge.textContent = "알림";

    const link = document.createElement("a");
    link.className = "board-title-link";
    link.href = getNoticeUrl(activityRecord.id);
    link.textContent = activityRecord.title ?? "제목 없음";

    row.append(
      cell("순번", String(serials.get(activityRecord.id)), "board-cell-number"),
      cell("구분", badge, "board-cell-status"),
      cell("글제목", link, "board-cell-title"),
      cell("작성자", activityRecord.clubName ?? "동아리 이름 없음", "board-cell-person"),
      cell("조회", formatViewCount(activityRecord.viewCount), "board-cell-count"),
      cell("날짜", formatDate(activityRecord.createdAt), "board-cell-date")
    );

    noticeTableBody.appendChild(row);
  });
}

// ========================================
// 공지 등록 (연합회 임원 전용)
// ========================================

noticeCreateButton?.addEventListener("click", () => {
  if (currentRole !== EXECUTIVE_ROLE) return;

  formMessage.textContent = "";
  formDialog.showModal();
  clubNameInput.focus();
});

closeFormButton?.addEventListener("click", () => formDialog.close());

formDialog?.addEventListener("click", (event) => {
  if (event.target === formDialog) formDialog.close();
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (currentRole !== EXECUTIVE_ROLE) return;

  const activityRecord = {
    clubName: clubNameInput.value,
    title: titleInput.value,
    content: contentInput.value,
    password: passwordInput.value,
    authorName: getDisplayName(currentProfile, currentUser)
  };

  if (!isValidActivityRecord(activityRecord)) {
    formMessage.textContent = "동아리 이름, 제목, 내용, 비밀번호를 모두 입력해주세요.";
    return;
  }

  if (activityRecord.password.length < 4) {
    formMessage.textContent = "비밀번호는 4자 이상으로 입력해주세요.";
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
    console.error("동아리 공지 저장 오류:", error);
    formMessage.textContent = "공지를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
  } finally {
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = "등록";
  }
});

// ========================================
// 표시 도구
// ========================================

// 표 칸 하나. 좁은 화면에서는 data-label 이 항목 이름으로 보인다.
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

function showTableMessage(tableBody, columnCount, message) {
  tableBody.textContent = "";

  const row = document.createElement("tr");
  row.className = "board-empty-row";

  const td = document.createElement("td");
  td.colSpan = columnCount;
  td.textContent = message;

  row.appendChild(td);
  tableBody.appendChild(row);
}

function isValidActivityRecord({ clubName, title, content, password }) {
  return Boolean(clubName.trim() && title.trim() && content.trim() && password.trim());
}
