import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";

import { db } from "../firebase.js";
import {
  EXECUTIVE_ROLE,
  GENERAL_ROLE,
  getRoleName,
  isAdminEmail,
  SUBCOMMITTEES
} from "../userRole.js";
import { createInfoLine, formatDateTime, normalize } from "./adminUi.js";

const listElement = document.querySelector("#userAdminList");
const searchInput = document.querySelector("#userAdminSearch");
const refreshButton = document.querySelector("#userAdminRefreshButton");
const totalCount = document.querySelector("#userTotalCount");
const executiveCount = document.querySelector("#userExecutiveCount");
const generalCount = document.querySelector("#userGeneralCount");

let users = [];
let isInitialized = false;

export function initUserAdmin() {
  if (isInitialized) return;
  isInitialized = true;

  searchInput.addEventListener("input", renderUsers);
  refreshButton.addEventListener("click", loadUserAdmin);
}

export async function loadUserAdmin() {
  listElement.textContent = "계정을 불러오는 중...";

  try {
    const snapshot = await getDocs(collection(db, "users"));

    users = snapshot.docs
      .map((userDoc) => ({ id: userDoc.id, ...userDoc.data() }))
      .sort((first, second) => (first.email ?? "").localeCompare(second.email ?? ""));

    renderStats();
    renderUsers();
  } catch (error) {
    console.error("계정 조회 오류:", error);
    listElement.textContent = "계정을 불러오지 못했습니다.";
  }
}

function renderStats() {
  const executives = users.filter((user) => getRole(user) === EXECUTIVE_ROLE).length;

  totalCount.textContent = users.length.toLocaleString("ko-KR");
  executiveCount.textContent = executives.toLocaleString("ko-KR");
  generalCount.textContent = (users.length - executives).toLocaleString("ko-KR");
}

function getRole(user) {
  if (isAdminEmail(user.email)) return EXECUTIVE_ROLE;
  return user.role === EXECUTIVE_ROLE ? EXECUTIVE_ROLE : GENERAL_ROLE;
}

function renderUsers() {
  const searchTerm = normalize(searchInput.value.trim());
  const filtered = users.filter((user) => !searchTerm || normalize(user.email).includes(searchTerm));

  listElement.textContent = "";

  if (filtered.length === 0) {
    listElement.textContent = searchTerm
      ? "검색 결과가 없습니다."
      : "아직 가입한 계정이 없습니다.";
    return;
  }

  filtered.forEach((user) => listElement.appendChild(createUserCard(user)));
}

function createUserCard(user) {
  const role = getRole(user);
  const isAdminAccount = isAdminEmail(user.email);

  const card = document.createElement("article");
  card.className = `admin-card user-admin-card status-${role === EXECUTIVE_ROLE ? "approved" : "pending"}`;

  const title = document.createElement("h2");
  title.textContent = user.email || "이메일 정보 없음";

  const currentRole = createInfoLine(
    "현재 권한",
    isAdminAccount ? "관리자 (항상 연합회 임원)" : getRoleName(role)
  );

  const joinedAt = createInfoLine("가입 시간", formatDateTime(user.createdAt));

  const message = document.createElement("p");
  message.className = "message admin-card-message-line";

  const actions = document.createElement("div");
  actions.className = "admin-card-actions";

  const promoteButton = document.createElement("button");
  promoteButton.type = "button";
  promoteButton.textContent = "연합회 임원으로 지정";
  promoteButton.disabled = isAdminAccount || role === EXECUTIVE_ROLE;

  const demoteButton = document.createElement("button");
  demoteButton.type = "button";
  demoteButton.className = "secondary";
  demoteButton.textContent = "일반 계정으로 변경";
  demoteButton.disabled = isAdminAccount || role === GENERAL_ROLE;

  promoteButton.addEventListener("click", () => saveProfile({ role: EXECUTIVE_ROLE }));
  demoteButton.addEventListener("click", () => saveProfile({ role: GENERAL_ROLE }));

  // 3D 프린터 사용 권한
  const printerAccess = isAdminAccount || user.printerAccess === true;

  const printerBox = document.createElement("div");
  printerBox.className = "admin-permission-box";

  const printerLabel = document.createElement("div");
  printerLabel.className = "admin-permission-title";
  printerLabel.textContent = "3D 프린터 사용 권한";

  const printerState = document.createElement("span");
  printerState.className = `admin-permission-state ${printerAccess ? "is-on" : ""}`;
  printerState.textContent = printerAccess ? "허용됨 (교육 이수)" : "미허용";

  const printerButton = document.createElement("button");
  printerButton.type = "button";
  printerButton.className = printerAccess ? "secondary" : "";
  printerButton.textContent = printerAccess ? "사용 권한 회수" : "사용 권한 부여";
  printerButton.disabled = isAdminAccount;
  printerButton.addEventListener("click", () => saveProfile({ printerAccess: !printerAccess }));

  printerBox.append(printerLabel, printerState, printerButton);

  // 소위원회 소속
  const memberships = isAdminAccount
    ? SUBCOMMITTEES.map(({ id }) => id)
    : (Array.isArray(user.subcommittees) ? user.subcommittees : []);

  const subcommitteeBox = document.createElement("div");
  subcommitteeBox.className = "admin-permission-box";

  const subcommitteeLabel = document.createElement("div");
  subcommitteeLabel.className = "admin-permission-title";
  subcommitteeLabel.textContent = "소위원회 소속";
  subcommitteeBox.appendChild(subcommitteeLabel);

  const checkboxes = SUBCOMMITTEES.map((subcommittee) => {
    const option = document.createElement("label");
    option.className = "admin-permission-option";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = memberships.includes(subcommittee.id);
    checkbox.disabled = isAdminAccount;

    const name = document.createElement("span");
    name.textContent = subcommittee.name;

    option.append(checkbox, name);
    subcommitteeBox.appendChild(option);

    return { id: subcommittee.id, checkbox };
  });

  const saveSubcommitteeButton = document.createElement("button");
  saveSubcommitteeButton.type = "button";
  saveSubcommitteeButton.className = "secondary";
  saveSubcommitteeButton.textContent = "소위원회 저장";
  saveSubcommitteeButton.disabled = isAdminAccount;
  saveSubcommitteeButton.addEventListener("click", () => saveProfile({
    subcommittees: checkboxes.filter(({ checkbox }) => checkbox.checked).map(({ id }) => id)
  }));

  subcommitteeBox.appendChild(saveSubcommitteeButton);

  async function saveProfile(changes) {
    promoteButton.disabled = true;
    demoteButton.disabled = true;
    printerButton.disabled = true;
    saveSubcommitteeButton.disabled = true;
    message.textContent = "변경 중...";

    try {
      await updateDoc(doc(db, "users", user.id), {
        ...changes,
        updatedAt: serverTimestamp()
      });

      await loadUserAdmin();
    } catch (error) {
      console.error("계정 권한 변경 오류:", error);
      message.textContent = "권한을 변경하지 못했습니다. 잠시 후 다시 시도해주세요.";
      promoteButton.disabled = false;
      demoteButton.disabled = false;
      printerButton.disabled = false;
      saveSubcommitteeButton.disabled = false;
    }
  }

  actions.append(promoteButton, demoteButton);
  card.append(title, currentRole, joinedAt, actions, printerBox, subcommitteeBox, message);
  return card;
}
