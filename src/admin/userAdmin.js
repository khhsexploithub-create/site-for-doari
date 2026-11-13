// 06 계정 권한 관리.
//
// 화면은 세 덩어리다.
//   1) 소위원회 구성판 — 누가 어디 소속인지 한눈에 본다
//   2) 계정 목록      — 구분 탭 · 검색 · 필터 · 일괄 처리
//   3) 상세 패널      — 고른 계정의 역할과 권한을 고친다
//
// 권한을 바꿀 때마다 users/{uid}/changeLog 에 한 줄씩 남겨 둔다.

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";

import { auth, db } from "../firebase.js";
import { CLUBS, createClubTag } from "../clubList.js";
import {
  EXECUTIVE_ROLE,
  GENERAL_ROLE,
  describeStudentId,
  hasChairRecord,
  isAdminEmail,
  readClubs,
  readSubcommitteeRoles,
  SUBCOMMITTEE_CHAIR,
  SUBCOMMITTEE_MEMBER,
  SUBCOMMITTEE_NONE,
  SUBCOMMITTEES,
  toSubcommitteeFields
} from "../userRole.js";
import { formatDateTime, normalize } from "./adminUi.js";

const boardElement = document.querySelector("#subcommitteeBoard");
const scopeTabs = document.querySelector("#userScopeTabs");
const searchInput = document.querySelector("#userAdminSearch");
const gradeFilter = document.querySelector("#userGradeFilter");
const subcommitteeFilter = document.querySelector("#userSubcommitteeFilter");
const permissionFilter = document.querySelector("#userPermissionFilter");
const sortSelect = document.querySelector("#userSortSelect");
const flagChips = document.querySelector("#userFlagChips");
const bulkBar = document.querySelector("#userBulkBar");
const selectAllBox = document.querySelector("#userSelectAll");
const tableBody = document.querySelector("#userAdminTableBody");
const footNote = document.querySelector("#userAdminFootNote");
const detailPanel = document.querySelector("#userAdminDetail");
const refreshButton = document.querySelector("#userAdminRefreshButton");
const exportButton = document.querySelector("#userExportButton");

const NEW_ACCOUNT_DAYS = 7;

const SCOPES = [
  { value: "all", name: "전체" },
  { value: "executive", name: "연합회 임원" },
  { value: "general", name: "일반" },
  { value: "admin", name: "관리자" }
];

const FLAGS = [
  { value: "new", name: `신규 가입 (최근 ${NEW_ACCOUNT_DAYS}일)`, test: isNewAccount },
  { value: "noStudentId", name: "학번 미입력", test: (user) => !user.studentId },
  { value: "noClub", name: "소속 동아리 없음", test: (user) => readClubs(user).length === 0 },
  {
    value: "executiveWithoutSubcommittee",
    name: "임원인데 소위원회 없음",
    test: (user) => getRole(user) === EXECUTIVE_ROLE
      && !isAdminEmail(user.email)
      && readClubsSafe(user.subcommittees).length === 0
  }
];

let users = [];
let changeLogs = new Map();
let selectedIds = new Set();
let selectedUserId = "";
let scope = "all";
let activeFlag = "";
let isInitialized = false;

export function initUserAdmin() {
  if (isInitialized) return;
  isInitialized = true;

  fillSubcommitteeFilter();

  searchInput.addEventListener("input", renderList);
  gradeFilter.addEventListener("change", renderList);
  subcommitteeFilter.addEventListener("change", renderList);
  permissionFilter.addEventListener("change", renderList);
  sortSelect.addEventListener("change", renderList);
  refreshButton.addEventListener("click", loadUserAdmin);
  exportButton.addEventListener("click", exportAccounts);

  selectAllBox.addEventListener("change", () => {
    const visible = getVisibleUsers();
    if (selectAllBox.checked) visible.forEach((user) => selectedIds.add(user.id));
    else visible.forEach((user) => selectedIds.delete(user.id));
    renderList();
  });
}

export async function loadUserAdmin() {
  showTableMessage("계정을 불러오는 중...");

  try {
    const snapshot = await getDocs(collection(db, "users"));
    users = snapshot.docs.map((userDoc) => ({ id: userDoc.id, ...userDoc.data() }));

    selectedIds = new Set();
    renderBoard();
    renderScopeTabs();
    renderFlagChips();
    renderList();
  } catch (error) {
    console.error("계정 조회 오류:", error);
    showTableMessage("계정을 불러오지 못했습니다.");
  }
}

// ========================================
// 소위원회 구성판
// ========================================

function renderBoard() {
  boardElement.textContent = "";

  SUBCOMMITTEES.forEach((subcommittee) => {
    const chair = findChair(subcommittee.id);
    const members = users.filter((user) => (
      !isAdminEmail(user.email)
      && readClubsSafe(user.subcommittees).includes(subcommittee.id)
      && user.id !== chair?.id
    ));

    const card = document.createElement("button");
    card.type = "button";
    card.className = "subcommittee-card";
    card.classList.toggle("is-vacant", !chair);
    card.classList.toggle("is-active", subcommitteeFilter.value === subcommittee.id);

    const name = document.createElement("strong");
    name.textContent = subcommittee.name;

    const section = document.createElement("span");
    section.className = "subcommittee-card-section";
    section.textContent = subcommittee.sectionName;

    card.append(name, section);

    if (chair) {
      const chairLine = document.createElement("span");
      chairLine.className = "subcommittee-chair";
      chairLine.textContent = `👑 ${getAccountName(chair)} ${chair.studentId ?? ""}`.trim();
      card.appendChild(chairLine);
    } else {
      const vacant = document.createElement("span");
      vacant.className = "subcommittee-vacant";
      vacant.textContent = "⚠ 소위원장 공석";
      card.appendChild(vacant);
    }

    const memberRow = document.createElement("span");
    memberRow.className = "subcommittee-members";
    memberRow.textContent = members.length > 0
      ? members.map(getAccountName).join(" · ")
      : "임원 없음";
    card.appendChild(memberRow);

    card.addEventListener("click", () => {
      subcommitteeFilter.value = subcommitteeFilter.value === subcommittee.id
        ? ""
        : subcommittee.id;
      renderBoard();
      renderList();
    });

    boardElement.appendChild(card);
  });
}

// ========================================
// 구분 탭 · 정리 필요 알림
// ========================================

function renderScopeTabs() {
  scopeTabs.textContent = "";

  SCOPES.forEach(({ value, name }) => {
    const count = users.filter((user) => matchesScope(user, value)).length;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "user-scope-tab";
    button.setAttribute("role", "tab");
    button.classList.toggle("is-active", scope === value);
    button.setAttribute("aria-selected", String(scope === value));
    button.textContent = `${name} ${count}`;

    button.addEventListener("click", () => {
      scope = value;
      renderScopeTabs();
      renderList();
    });

    scopeTabs.appendChild(button);
  });
}

function renderFlagChips() {
  flagChips.textContent = "";

  FLAGS.forEach(({ value, name, test }) => {
    const count = users.filter(test).length;
    if (count === 0) return;

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "user-flag-chip";
    chip.classList.toggle("is-active", activeFlag === value);
    chip.textContent = `${name} ${count}`;

    chip.addEventListener("click", () => {
      activeFlag = activeFlag === value ? "" : value;
      renderFlagChips();
      renderList();
    });

    flagChips.appendChild(chip);
  });
}

function fillSubcommitteeFilter() {
  subcommitteeFilter.textContent = "";
  subcommitteeFilter.appendChild(new Option("소위원회 전체", ""));
  SUBCOMMITTEES.forEach(({ id, name }) => subcommitteeFilter.appendChild(new Option(name, id)));
}

// ========================================
// 목록
// ========================================

function getVisibleUsers() {
  const searchTerm = normalize(searchInput.value.trim());
  const grade = gradeFilter.value;
  const subcommitteeId = subcommitteeFilter.value;
  const permission = permissionFilter.value;
  const flag = FLAGS.find(({ value }) => value === activeFlag);

  const filtered = users.filter((user) => {
    if (!matchesScope(user, scope)) return false;

    if (searchTerm && !(
      normalize(user.name).includes(searchTerm)
      || normalize(user.studentId).includes(searchTerm)
      || normalize(user.email).includes(searchTerm)
    )) return false;

    // 학번이 없는 계정은 학년 필터와 무관하게 늘 보여준다. (손봐야 할 계정이므로)
    if (grade && user.studentId && String(user.studentId)[0] !== grade) return false;

    if (subcommitteeId && !readClubsSafe(user.subcommittees).includes(subcommitteeId)) return false;

    if (permission === "printer" && user.printerAccess !== true) return false;
    if (permission === "notice" && user.noticeAccess !== true) return false;
    if (permission === "leader" && !String(user.clubLeaderOf ?? "").trim()) return false;
    if (permission === "chair" && !hasChairRecord(user)) return false;

    if (flag && !flag.test(user)) return false;

    return true;
  });

  return sortUsers(filtered);
}

function sortUsers(list) {
  const mode = sortSelect.value;

  return [...list].sort((first, second) => {
    if (mode === "name") {
      return getAccountName(first).localeCompare(getAccountName(second), "ko-KR");
    }

    if (mode === "createdAt") {
      return getMillis(second.createdAt) - getMillis(first.createdAt);
    }

    // 학번순. 학번이 없는 계정은 맨 뒤로 보낸다.
    const firstId = String(first.studentId ?? "");
    const secondId = String(second.studentId ?? "");
    if (!firstId && !secondId) return getAccountName(first).localeCompare(getAccountName(second), "ko-KR");
    if (!firstId) return 1;
    if (!secondId) return -1;
    return firstId.localeCompare(secondId);
  });
}

function renderList() {
  const visible = getVisibleUsers();

  renderBulkBar();
  tableBody.textContent = "";

  if (visible.length === 0) {
    showTableMessage("조건에 맞는 계정이 없습니다.");
    footNote.textContent = "";
    selectAllBox.checked = false;
    return;
  }

  // 학번순으로 볼 때는 반별로 묶어서 보여준다.
  const groupByClass = sortSelect.value === "studentId";
  let lastGroup = "";

  visible.forEach((user) => {
    if (groupByClass) {
      const group = describeClassGroup(user);

      if (group !== lastGroup) {
        lastGroup = group;
        const count = visible.filter((candidate) => describeClassGroup(candidate) === group).length;
        tableBody.appendChild(createGroupRow(`${group} · ${count}명`, !user.studentId));
      }
    }

    tableBody.appendChild(createUserRow(user));
  });

  footNote.textContent = `${visible.length}명 표시 · 전체 ${users.length}명`;
  selectAllBox.checked = visible.every((user) => selectedIds.has(user.id));
}

function createGroupRow(text, isWarning) {
  const row = document.createElement("tr");
  row.className = `user-group-row${isWarning ? " is-warning" : ""}`;

  const cell = document.createElement("td");
  cell.colSpan = 9;
  cell.textContent = isWarning ? `${text} (학년 필터와 무관하게 항상 표시)` : text;

  row.appendChild(cell);
  return row;
}

function createUserRow(user) {
  const isAdminAccount = isAdminEmail(user.email);
  const row = document.createElement("tr");
  row.className = "user-row";
  row.classList.toggle("is-selected", selectedUserId === user.id);
  row.classList.toggle("is-checked", selectedIds.has(user.id));

  // --- 선택 상자 ---
  const checkCell = document.createElement("td");
  checkCell.className = "user-cell-check";
  const checkBox = document.createElement("input");
  checkBox.type = "checkbox";
  checkBox.checked = selectedIds.has(user.id);
  checkBox.disabled = isAdminAccount;
  checkBox.setAttribute("aria-label", `${getAccountName(user)} 선택`);
  checkBox.addEventListener("click", (event) => event.stopPropagation());
  checkBox.addEventListener("change", () => {
    if (checkBox.checked) selectedIds.add(user.id);
    else selectedIds.delete(user.id);
    renderList();
  });
  checkCell.appendChild(checkBox);

  // --- 이름 / 이메일 ---
  const nameCell = document.createElement("td");
  nameCell.className = "user-cell-name";

  const nameLine = document.createElement("span");
  nameLine.className = "user-name";
  nameLine.textContent = getAccountName(user);

  if (isNewAccount(user)) {
    const badge = document.createElement("span");
    badge.className = "user-new-badge";
    badge.textContent = "NEW";
    nameLine.appendChild(badge);
  }

  const emailLine = document.createElement("span");
  emailLine.className = "user-email";
  emailLine.textContent = user.email || "이메일 없음";

  nameCell.append(nameLine, emailLine);

  // --- 학번 ---
  const idCell = document.createElement("td");
  idCell.className = "user-cell-id";
  if (user.studentId) {
    idCell.textContent = user.studentId;
  } else {
    idCell.textContent = "미입력";
    idCell.classList.add("is-warning");
  }

  // --- 구분 ---
  const kindCell = document.createElement("td");
  kindCell.className = "user-cell-kind";
  kindCell.appendChild(createKindBadge(user));

  // --- 소속 동아리 ---
  const clubCell = document.createElement("td");
  clubCell.className = "user-cell-club";
  const myClub = readClubs(user)[0] ?? "";
  if (myClub) {
    const tag = createClubTag(myClub);
    if (String(user.clubLeaderOf ?? "") === myClub) tag.textContent = `👑 ${myClub}`;
    clubCell.appendChild(tag);
  } else {
    clubCell.textContent = "—";
  }

  // --- 소위원회 ---
  const subCell = document.createElement("td");
  subCell.className = "user-cell-sub";
  subCell.append(...createSubcommitteeTags(user));

  // --- 토글 두 개 ---
  const printerCell = document.createElement("td");
  printerCell.className = "user-cell-toggle";
  printerCell.appendChild(createToggle({
    checked: isAdminAccount || user.printerAccess === true,
    disabled: isAdminAccount,
    label: "3D 프린터 사용",
    onChange: (next) => saveProfile(user, { printerAccess: next }, `3D 프린터 ${next ? "허용" : "회수"}`)
  }));

  const noticeCell = document.createElement("td");
  noticeCell.className = "user-cell-toggle";
  noticeCell.appendChild(createToggle({
    checked: isAdminAccount || user.noticeAccess === true,
    // 공지 권한은 소위원장에게만 줄 수 있다.
    disabled: isAdminAccount || (!hasChairRecord(user) && user.noticeAccess !== true),
    label: "공지 작성",
    onChange: (next) => saveProfile(user, { noticeAccess: next }, `공지 권한 ${next ? "부여" : "회수"}`)
  }));

  // --- 가입일 ---
  const dateCell = document.createElement("td");
  dateCell.className = "user-cell-date";
  dateCell.textContent = formatShortDate(user.createdAt);

  row.append(checkCell, nameCell, idCell, kindCell, clubCell, subCell, printerCell, noticeCell, dateCell);

  row.addEventListener("click", () => {
    selectedUserId = user.id;
    renderList();
    renderDetail(user);
  });

  return row;
}

function createKindBadge(user) {
  const badge = document.createElement("span");

  if (isAdminEmail(user.email)) {
    badge.className = "user-kind is-admin";
    badge.textContent = "관리자";
  } else if (getRole(user) === EXECUTIVE_ROLE) {
    badge.className = "user-kind is-executive";
    badge.textContent = "임원";
  } else {
    badge.className = "user-kind";
    badge.textContent = "일반";
  }

  return badge;
}

function createSubcommitteeTags(user) {
  if (isAdminEmail(user.email)) {
    const tag = document.createElement("span");
    tag.className = "user-sub-tag is-chair";
    tag.textContent = "전체";
    return [tag];
  }

  const roles = readSubcommitteeRoles(user);
  const assigned = SUBCOMMITTEES.filter(({ id }) => roles[id] !== SUBCOMMITTEE_NONE);

  if (assigned.length === 0) {
    const empty = document.createElement("span");
    empty.textContent = "—";
    return [empty];
  }

  return assigned.map(({ id, name }) => {
    const tag = document.createElement("span");
    const isChair = roles[id] === SUBCOMMITTEE_CHAIR;
    tag.className = `user-sub-tag${isChair ? " is-chair" : ""}`;
    // 카드가 좁으므로 '예산 관리 소위원회' 는 '예산' 처럼 앞말만 쓴다.
    tag.textContent = `${isChair ? "👑 " : ""}${name.split(" ")[0].replace("·", "·")}`;
    tag.title = name;
    return tag;
  });
}

function createToggle({ checked, disabled, label, onChange }) {
  const wrap = document.createElement("label");
  wrap.className = "user-toggle";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.disabled = disabled;
  input.setAttribute("aria-label", label);

  const track = document.createElement("span");
  track.className = "user-toggle-track";

  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("change", () => onChange(input.checked));

  wrap.append(input, track);
  return wrap;
}

// ========================================
// 일괄 처리
// ========================================

function renderBulkBar() {
  bulkBar.textContent = "";
  bulkBar.hidden = selectedIds.size === 0;

  if (selectedIds.size === 0) return;

  const count = document.createElement("strong");
  count.textContent = `${selectedIds.size}명 선택됨`;

  const actions = document.createElement("div");
  actions.className = "user-bulk-actions";

  actions.appendChild(createBulkButton("임원 지정", () => bulkSave(
    { role: EXECUTIVE_ROLE }, "연합회 임원 지정"
  )));

  // 소위원회 배정은 '소속(임원)' 으로만 넣는다. 소위원장은 상세 패널에서 한 명씩 정한다.
  const subcommitteeSelect = document.createElement("select");
  subcommitteeSelect.className = "user-bulk-select";
  subcommitteeSelect.appendChild(new Option("소위원회 배정", ""));
  SUBCOMMITTEES.forEach(({ id, name }) => subcommitteeSelect.appendChild(new Option(name, id)));
  subcommitteeSelect.addEventListener("change", async () => {
    const id = subcommitteeSelect.value;
    subcommitteeSelect.value = "";
    if (!id) return;
    await bulkAssignSubcommittee(id);
  });
  actions.appendChild(subcommitteeSelect);

  actions.appendChild(createBulkButton("3D 프린터 허용", () => bulkSave(
    { printerAccess: true }, "3D 프린터 허용"
  )));

  actions.appendChild(createBulkButton("일반으로", () => bulkSave(
    { role: GENERAL_ROLE }, "일반 계정으로 변경"
  )));

  const clear = createBulkButton("선택 해제", () => {
    selectedIds = new Set();
    renderList();
  });
  clear.classList.add("is-quiet");
  actions.appendChild(clear);

  bulkBar.append(count, actions);
}

function createBulkButton(text, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "user-bulk-button";
  button.textContent = text;
  button.addEventListener("click", onClick);
  return button;
}

function getSelectedUsers() {
  return users.filter((user) => selectedIds.has(user.id) && !isAdminEmail(user.email));
}

async function bulkSave(changes, logText) {
  const targets = getSelectedUsers();
  if (targets.length === 0) return;

  bulkBar.classList.add("is-busy");

  try {
    for (const user of targets) {
      await updateDoc(doc(db, "users", user.id), { ...changes, updatedAt: serverTimestamp() });
      Object.assign(user, changes);
      await writeChangeLog(user.id, logText);
    }

    selectedIds = new Set();
    refreshAll();
  } catch (error) {
    console.error("일괄 권한 변경 오류:", error);
    window.alert("일부 계정을 바꾸지 못했습니다. 새로고침한 뒤 다시 시도해주세요.");
  } finally {
    bulkBar.classList.remove("is-busy");
  }
}

async function bulkAssignSubcommittee(subcommitteeId) {
  const targets = getSelectedUsers();
  if (targets.length === 0) return;

  const subcommittee = SUBCOMMITTEES.find(({ id }) => id === subcommitteeId);
  bulkBar.classList.add("is-busy");

  try {
    for (const user of targets) {
      const roles = { ...readSubcommitteeRoles(user) };
      if (roles[subcommitteeId] === SUBCOMMITTEE_NONE) roles[subcommitteeId] = SUBCOMMITTEE_MEMBER;

      const fields = toSubcommitteeFields(roles);
      await updateDoc(doc(db, "users", user.id), { ...fields, updatedAt: serverTimestamp() });
      Object.assign(user, fields);
      await writeChangeLog(user.id, `${subcommittee?.name ?? subcommitteeId} 임원 배정`);
    }

    selectedIds = new Set();
    refreshAll();
  } catch (error) {
    console.error("소위원회 일괄 배정 오류:", error);
    window.alert("일부 계정을 바꾸지 못했습니다. 새로고침한 뒤 다시 시도해주세요.");
  } finally {
    bulkBar.classList.remove("is-busy");
  }
}

// ========================================
// 상세 패널
// ========================================

function renderDetail(user) {
  const isAdminAccount = isAdminEmail(user.email);
  const isOwnAccount = auth.currentUser?.uid === user.id;

  detailPanel.textContent = "";

  const head = document.createElement("div");
  head.className = "user-detail-head";

  const name = document.createElement("h3");
  name.textContent = getAccountName(user);

  head.append(name, createKindBadge(user));

  const identity = document.createElement("p");
  identity.className = "user-detail-identity";
  identity.textContent = [
    user.studentId ? describeStudentId(user.studentId) : "학번 미등록",
    user.email || "이메일 없음",
    `${formatShortDate(user.createdAt)} 가입`
  ].join(" · ");

  detailPanel.append(head, identity);

  // --- 소속 동아리 · 부장 ---
  detailPanel.appendChild(createSectionTitle("소속 동아리"));

  const clubRow = document.createElement("div");
  clubRow.className = "user-detail-row";

  const clubSelect = document.createElement("select");
  clubSelect.appendChild(new Option("소속 없음", ""));
  CLUBS.forEach(({ name: clubName }) => clubSelect.appendChild(new Option(clubName, clubName)));
  clubSelect.value = readClubs(user)[0] ?? "";
  clubSelect.disabled = isAdminAccount;

  const leaderLabel = document.createElement("label");
  leaderLabel.className = "user-leader-check";
  const leaderBox = document.createElement("input");
  leaderBox.type = "checkbox";
  leaderBox.checked = Boolean(String(user.clubLeaderOf ?? "").trim());
  leaderBox.disabled = isAdminAccount || !clubSelect.value;
  leaderLabel.append(leaderBox, document.createTextNode(" 이 동아리의 부장"));

  clubSelect.addEventListener("change", () => {
    leaderBox.disabled = isAdminAccount || !clubSelect.value;
    if (!clubSelect.value) leaderBox.checked = false;
  });

  const clubSaveButton = document.createElement("button");
  clubSaveButton.type = "button";
  clubSaveButton.className = "secondary user-detail-save";
  clubSaveButton.textContent = "소속 저장";
  clubSaveButton.disabled = isAdminAccount;
  clubSaveButton.addEventListener("click", () => saveClubAssignment(user, {
    clubName: clubSelect.value,
    isLeader: leaderBox.checked
  }));

  clubRow.append(clubSelect, leaderLabel, clubSaveButton);
  detailPanel.appendChild(clubRow);

  const clubHint = document.createElement("p");
  clubHint.className = "user-detail-hint";
  clubHint.textContent = "부장은 그 동아리 소속이어야 하고, 한 동아리에 한 명만 둘 수 있습니다.";
  detailPanel.appendChild(clubHint);

  // --- 소위원회 역할 ---
  detailPanel.appendChild(createSectionTitle("소위원회 역할"));

  const roles = isAdminAccount
    ? Object.fromEntries(SUBCOMMITTEES.map(({ id }) => [id, SUBCOMMITTEE_CHAIR]))
    : readSubcommitteeRoles(user);

  SUBCOMMITTEES.forEach((subcommittee) => {
    detailPanel.appendChild(createRoleRow(user, subcommittee, roles[subcommittee.id], isAdminAccount));
  });

  // --- 개별 권한 ---
  detailPanel.appendChild(createSectionTitle("개별 권한"));

  detailPanel.appendChild(createPermissionRow({
    title: "3D 프린터 사용",
    hint: "교육 이수자만",
    checked: isAdminAccount || user.printerAccess === true,
    disabled: isAdminAccount,
    onChange: (next) => saveProfile(user, { printerAccess: next }, `3D 프린터 ${next ? "허용" : "회수"}`)
  }));

  detailPanel.appendChild(createPermissionRow({
    title: "공지 작성 (종 알림)",
    hint: "소위원장만 부여 가능",
    checked: isAdminAccount || user.noticeAccess === true,
    disabled: isAdminAccount || (!hasChairRecord(user) && user.noticeAccess !== true),
    onChange: (next) => saveProfile(user, { noticeAccess: next }, `공지 권한 ${next ? "부여" : "회수"}`)
  }));

  // --- 열 수 있는 관리 화면 ---
  const sections = isAdminAccount
    ? ["전체"]
    : SUBCOMMITTEES
      .filter(({ id }) => roles[id] !== SUBCOMMITTEE_NONE)
      .map(({ sectionName }) => sectionName);

  const sectionRow = document.createElement("p");
  sectionRow.className = "user-detail-sections";
  sectionRow.innerHTML = "";
  const sectionLabel = document.createElement("span");
  sectionLabel.textContent = "열 수 있는 관리 화면";
  const sectionValue = document.createElement("b");
  sectionValue.textContent = sections.length > 0 ? sections.join(" · ") : "없음";
  sectionRow.append(sectionLabel, sectionValue);
  detailPanel.appendChild(sectionRow);

  // --- 변경 기록 ---
  detailPanel.appendChild(createSectionTitle("변경 기록"));

  const logList = document.createElement("ul");
  logList.className = "user-change-log";
  logList.textContent = "";
  detailPanel.appendChild(logList);
  renderChangeLog(user.id, logList);

  // --- 계정 기록 삭제 ---
  const dangerBox = document.createElement("div");
  dangerBox.className = "user-detail-danger";

  const dangerText = document.createElement("span");
  dangerText.textContent = "계정 기록 삭제 — Authentication에서 먼저 삭제한 뒤 진행하세요.";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "danger";
  deleteButton.textContent = "삭제";
  deleteButton.disabled = isAdminAccount || isOwnAccount;
  deleteButton.addEventListener("click", () => removeUserRecord(user));

  dangerBox.append(dangerText, deleteButton);
  detailPanel.appendChild(dangerBox);
}

function createSectionTitle(text) {
  const title = document.createElement("h4");
  title.className = "user-detail-section-title";
  title.textContent = text;
  return title;
}

// 없음 / 임원 / 소위원장 가운데 하나를 고르는 줄
function createRoleRow(user, subcommittee, currentRole, isAdminAccount) {
  const row = document.createElement("div");
  row.className = "user-role-row";

  const name = document.createElement("span");
  name.className = "user-role-name";
  name.textContent = subcommittee.name.replace(" 소위원회", "");

  const group = document.createElement("div");
  group.className = "user-role-group";

  [
    { value: SUBCOMMITTEE_NONE, text: "없음" },
    { value: SUBCOMMITTEE_MEMBER, text: "임원" },
    { value: SUBCOMMITTEE_CHAIR, text: "소위원장" }
  ].forEach(({ value, text }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "user-role-option";
    button.classList.toggle("is-active", currentRole === value);
    button.textContent = text;
    button.disabled = isAdminAccount;
    button.addEventListener("click", () => saveSubcommitteeRole(user, subcommittee, value));
    group.appendChild(button);
  });

  row.append(name, group);
  return row;
}

function createPermissionRow({ title, hint, checked, disabled, onChange }) {
  const row = document.createElement("div");
  row.className = "user-permission-row";

  const text = document.createElement("div");
  const titleLine = document.createElement("strong");
  titleLine.textContent = title;
  const hintLine = document.createElement("span");
  hintLine.textContent = hint;
  text.append(titleLine, hintLine);

  row.append(text, createToggle({ checked, disabled, label: title, onChange }));
  return row;
}

// ========================================
// 저장
// ========================================

async function saveProfile(user, changes, logText) {
  try {
    await updateDoc(doc(db, "users", user.id), { ...changes, updatedAt: serverTimestamp() });
    Object.assign(user, changes);
    await writeChangeLog(user.id, logText);
    refreshAll();
  } catch (error) {
    console.error("계정 권한 변경 오류:", error);
    window.alert("권한을 바꾸지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

// 소위원장은 소위원회당 한 명이다. 새로 세우면 기존 소위원장을 임원으로 내린다.
async function saveSubcommitteeRole(user, subcommittee, nextRole) {
  const roles = { ...readSubcommitteeRoles(user), [subcommittee.id]: nextRole };

  try {
    if (nextRole === SUBCOMMITTEE_CHAIR) {
      const previous = findChair(subcommittee.id, user.id);

      if (previous) {
        const previousFields = toSubcommitteeFields({
          ...readSubcommitteeRoles(previous),
          [subcommittee.id]: SUBCOMMITTEE_MEMBER
        });

        await updateDoc(doc(db, "users", previous.id), {
          ...previousFields,
          updatedAt: serverTimestamp()
        });
        Object.assign(previous, previousFields);
        await writeChangeLog(previous.id, `${subcommittee.name} 소위원장 해임 (임원으로)`);
      }
    }

    const fields = toSubcommitteeFields(roles);

    // 소위원장 자리에서 내려오면 공지 작성 권한도 함께 거둬들인다.
    if (fields.subcommitteeChairs.length === 0 && user.noticeAccess === true) {
      fields.noticeAccess = false;
    }

    await updateDoc(doc(db, "users", user.id), { ...fields, updatedAt: serverTimestamp() });
    Object.assign(user, fields);
    await writeChangeLog(
      user.id,
      `${subcommittee.name} ${nextRole === SUBCOMMITTEE_NONE ? "해제" : (nextRole === SUBCOMMITTEE_CHAIR ? "소위원장 지정" : "임원 지정")}`
    );

    refreshAll();
    renderDetail(user);
  } catch (error) {
    console.error("소위원회 권한 변경 오류:", error);
    window.alert("소위원회 권한을 바꾸지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

// 소속 동아리와 부장 지정을 함께 저장한다.
async function saveClubAssignment(user, { clubName, isLeader }) {
  const clubs = clubName ? [clubName] : [];
  const clubLeaderOf = isLeader && clubName ? clubName : "";

  try {
    // 한 동아리에 부장은 한 명. 새로 세우면 기존 부장 표시를 지운다.
    if (clubLeaderOf) {
      const previous = users.find((candidate) => (
        candidate.id !== user.id
        && String(candidate.clubLeaderOf ?? "") === clubLeaderOf
      ));

      if (previous) {
        await updateDoc(doc(db, "users", previous.id), {
          clubLeaderOf: "",
          updatedAt: serverTimestamp()
        });
        previous.clubLeaderOf = "";
        await writeChangeLog(previous.id, `${clubLeaderOf} 부장 해임`);
      }
    }

    await updateDoc(doc(db, "users", user.id), {
      clubs,
      clubLeaderOf,
      updatedAt: serverTimestamp()
    });

    Object.assign(user, { clubs, clubLeaderOf });
    await writeChangeLog(
      user.id,
      clubName
        ? `소속 ${clubName}${clubLeaderOf ? " · 부장 지정" : ""}`
        : "소속 동아리 해제"
    );

    refreshAll();
    renderDetail(user);
  } catch (error) {
    console.error("소속 동아리 변경 오류:", error);
    window.alert("소속 동아리를 바꾸지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

async function removeUserRecord(user) {
  const confirmed = window.confirm(
    `'${user.email || "이메일 정보 없음"}' 계정의 권한 기록을 삭제할까요?\n\n`
    + "· 여기서 지우는 것은 권한 기록뿐입니다. 로그인 계정은 Authentication 에서 따로 지워야 합니다.\n"
    + "· 로그인 계정이 남아 있으면 다시 로그인할 때 '일반' 계정으로 기록이 새로 만들어집니다.\n\n"
    + "삭제한 기록은 되돌릴 수 없습니다."
  );

  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "users", user.id));
    users = users.filter((candidate) => candidate.id !== user.id);
    selectedIds.delete(user.id);
    if (selectedUserId === user.id) {
      selectedUserId = "";
      detailPanel.textContent = "";
    }
    refreshAll();
  } catch (error) {
    console.error("계정 기록 삭제 오류:", error);
    window.alert("계정 기록을 지우지 못했습니다. 잠시 후 다시 시도해주세요.");
  }
}

// ========================================
// 변경 기록
// ========================================

async function writeChangeLog(userId, text) {
  try {
    await addDoc(collection(db, "users", userId, "changeLog"), {
      text: String(text).slice(0, 200),
      byEmail: auth.currentUser?.email ?? "",
      createdAt: serverTimestamp()
    });
    changeLogs.delete(userId);
  } catch (error) {
    // 기록이 남지 않아도 권한 변경 자체는 이미 끝났으므로 넘어간다.
    console.error("변경 기록 저장 오류:", error);
  }
}

async function renderChangeLog(userId, listElement) {
  listElement.textContent = "불러오는 중...";

  try {
    if (!changeLogs.has(userId)) {
      const snapshot = await getDocs(collection(db, "users", userId, "changeLog"));
      changeLogs.set(userId, snapshot.docs
        .map((logDoc) => logDoc.data())
        .sort((first, second) => getMillis(second.createdAt) - getMillis(first.createdAt))
        .slice(0, 10));
    }

    const logs = changeLogs.get(userId) ?? [];
    listElement.textContent = "";

    if (logs.length === 0) {
      const empty = document.createElement("li");
      empty.className = "user-change-log-empty";
      empty.textContent = "아직 변경 기록이 없습니다.";
      listElement.appendChild(empty);
      return;
    }

    logs.forEach((log) => {
      const item = document.createElement("li");
      item.textContent = `${formatShortDate(log.createdAt)} · ${log.byEmail || "관리자"} → ${log.text}`;
      listElement.appendChild(item);
    });
  } catch (error) {
    console.error("변경 기록 조회 오류:", error);
    listElement.textContent = "변경 기록을 불러오지 못했습니다.";
  }
}

// ========================================
// 내보내기
// ========================================

function exportAccounts() {
  const header = ["이름", "학번", "이메일", "구분", "소속 동아리", "부장", "소위원회", "3D프린터", "공지", "가입"];

  const rows = sortUsers(users).map((user) => {
    const roles = readSubcommitteeRoles(user);
    const assigned = SUBCOMMITTEES
      .filter(({ id }) => roles[id] !== SUBCOMMITTEE_NONE)
      .map(({ id, name }) => `${name}(${roles[id] === SUBCOMMITTEE_CHAIR ? "소위원장" : "임원"})`);

    return [
      getAccountName(user),
      user.studentId ?? "",
      user.email ?? "",
      isAdminEmail(user.email) ? "관리자" : (getRole(user) === EXECUTIVE_ROLE ? "임원" : "일반"),
      readClubs(user)[0] ?? "",
      String(user.clubLeaderOf ?? ""),
      assigned.join(" / "),
      user.printerAccess === true ? "허용" : "",
      user.noticeAccess === true ? "허용" : "",
      formatDateTime(user.createdAt)
    ];
  });

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");

  // 엑셀에서 한글이 깨지지 않도록 BOM 을 붙인다.
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `계정목록_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();

  URL.revokeObjectURL(url);
}

// ========================================
// 도구
// ========================================

function refreshAll() {
  renderBoard();
  renderScopeTabs();
  renderFlagChips();
  renderList();
}

function matchesScope(user, value) {
  if (value === "all") return true;
  if (value === "admin") return isAdminEmail(user.email);
  if (value === "executive") return !isAdminEmail(user.email) && getRole(user) === EXECUTIVE_ROLE;
  return !isAdminEmail(user.email) && getRole(user) === GENERAL_ROLE;
}

function getRole(user) {
  if (isAdminEmail(user.email)) return EXECUTIVE_ROLE;
  return user.role === EXECUTIVE_ROLE ? EXECUTIVE_ROLE : GENERAL_ROLE;
}

// 이 소위원회의 현재 소위원장 (관리자 계정은 제외)
function findChair(subcommitteeId, exceptUserId = "") {
  return users.find((candidate) => (
    candidate.id !== exceptUserId
    && !isAdminEmail(candidate.email)
    && readClubsSafe(candidate.subcommitteeChairs).includes(subcommitteeId)
  )) ?? null;
}

// 목록 형태로 저장된 값을 안전하게 읽는다. (subcommittees / subcommitteeChairs)
function readClubsSafe(value) {
  return Array.isArray(value) ? value : [];
}

function getAccountName(user) {
  const name = String(user?.name ?? "").trim();
  if (name) return name;

  const email = String(user?.email ?? "").trim();
  return email ? `${email.split("@")[0]} (이름 미등록)` : "이름 미등록";
}

function describeClassGroup(user) {
  const studentId = String(user?.studentId ?? "");
  if (!studentId) return "학번 미입력";
  return `${studentId[0]}학년 ${Number(studentId.slice(1, 3))}반`;
}

function isNewAccount(user) {
  const millis = getMillis(user.createdAt);
  if (!millis) return false;
  return Date.now() - millis <= NEW_ACCOUNT_DAYS * 24 * 60 * 60 * 1000;
}

function formatShortDate(timestamp) {
  const millis = getMillis(timestamp);
  if (!millis) return "-";

  const date = new Date(millis);
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function getMillis(timestamp) {
  if (timestamp && typeof timestamp.toMillis === "function") return timestamp.toMillis();
  const value = new Date(timestamp).getTime();
  return Number.isNaN(value) ? 0 : value;
}

function showTableMessage(text) {
  tableBody.textContent = "";

  const row = document.createElement("tr");
  row.className = "user-empty-row";

  const cell = document.createElement("td");
  cell.colSpan = 9;
  cell.textContent = text;

  row.appendChild(cell);
  tableBody.appendChild(row);
}
