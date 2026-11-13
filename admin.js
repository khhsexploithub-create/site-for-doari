import "./style.css";

import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "firebase/auth";

import {
  collection,
  getDocs,
  query,
  orderBy,
  doc,
  updateDoc,
  serverTimestamp
} from "firebase/firestore";

import {
  auth,
  db
} from "./firebase.js";

import {
  isAdminEmail,
  resolveUserProfile,
  SUBCOMMITTEES
} from "./userRole.js";

import {
  initActivityAdmin,
  loadActivityAdmin
} from "./admin/activityAdmin.js";

import {
  initResourceAdmin,
  loadResourceAdmin
} from "./admin/resourceAdmin.js";

import {
  initScheduleAdmin,
  loadScheduleAdmin
} from "./admin/scheduleAdmin.js";

import {
  initUserAdmin,
  loadUserAdmin
} from "./admin/userAdmin.js";


// ========================================
// 관리자 계정
// ========================================

// 관리자 이메일 목록은 userRole.js 에서 관리한다.


// ========================================
// DOM
// ========================================

const loginSection =
  document.querySelector("#loginSection");

const adminSection =
  document.querySelector("#adminSection");

const loginForm =
  document.querySelector("#loginForm");

const loginMessage =
  document.querySelector("#loginMessage");

const passwordInput =
  document.querySelector("#password");

const passwordToggle =
  document.querySelector("#passwordToggle");

const budgetRequestList =
  document.querySelector("#budgetRequestList");

const budgetTotalCount =
  document.querySelector("#budgetTotalCount");

const budgetPendingCount =
  document.querySelector("#budgetPendingCount");

const budgetApprovedCount =
  document.querySelector("#budgetApprovedCount");

const budgetRejectedCount =
  document.querySelector("#budgetRejectedCount");

const budgetAssemblyCount =
  document.querySelector("#budgetAssemblyCount");

const adminAccessLabel =
  document.querySelector("#adminAccessLabel");

const refreshButton =
  document.querySelector("#refreshButton");

const logoutButton =
  document.querySelector("#logoutButton");


// ========================================
// 비밀번호 표시 / 숨기기
// ========================================

passwordToggle.addEventListener(
  "click",
  () => {

    const shouldShowPassword =
      passwordInput.type === "password";

    passwordInput.type =
      shouldShowPassword
        ? "text"
        : "password";

    passwordToggle.textContent =
      shouldShowPassword
        ? "숨기기"
        : "보기";

    passwordToggle.setAttribute(
      "aria-label",
      shouldShowPassword
        ? "비밀번호 숨기기"
        : "비밀번호 표시"
    );

    passwordToggle.setAttribute(
      "aria-pressed",
      String(shouldShowPassword)
    );

  }
);


// ========================================
// 관리자 로그인
// ========================================

loginForm.addEventListener(
  "submit",
  async (event) => {

    event.preventDefault();

    const email =
      document
        .querySelector("#email")
        .value
        .trim()
        .toLowerCase();

    const password =
      passwordInput.value;


    loginMessage.textContent =
      "로그인 중...";


    try {

      const result =
        await signInWithEmailAndPassword(
          auth,
          email,
          password
        );


      // 관리자와 소위원회 계정만 통과시킨다.
      const profile =
        await resolveUserProfile(result.user);

      if (
        getAccessibleSections(
          result.user,
          profile
        ).length === 0
      ) {

        await signOut(auth);

        loginMessage.textContent =
          "관리자 또는 소위원회 계정이 아닙니다.";

        return;
      }


      loginMessage.textContent = "";

    } catch (error) {

      console.error(
        "관리자 로그인 오류:",
        error
      );

      loginMessage.textContent =
        "이메일 또는 비밀번호를 확인해주세요.";

    }

  }
);


// ========================================
// 로그인 상태 확인
// ========================================

onAuthStateChanged(
  auth,
  async (user) => {

    if (!user) {
      showLoginSection();
      return;
    }


    const profile =
      await resolveUserProfile(user);

    const accessibleSections =
      getAccessibleSections(user, profile);


    if (accessibleSections.length === 0) {
      showLoginSection();
      return;
    }


    loginSection.classList.add("hidden");
    adminSection.classList.remove("hidden");

    applySectionAccess(
      accessibleSections,
      isAdminEmail(user.email)
    );


    const tasks = [];

    if (accessibleSections.includes("budgetManagement")) {
      tasks.push(loadBudgetRequests());
    }

    if (accessibleSections.includes("activityManagement")) {
      initActivityAdmin();
      tasks.push(loadActivityAdmin());
    }

    if (accessibleSections.includes("resourceManagement")) {
      initResourceAdmin();
      tasks.push(loadResourceAdmin());
    }

    if (accessibleSections.includes("scheduleManagement")) {
      initScheduleAdmin();
      tasks.push(loadScheduleAdmin());
    }

    if (accessibleSections.includes("userManagement")) {
      initUserAdmin();
      tasks.push(loadUserAdmin());
    }

    await Promise.all(tasks);

  }
);


function showLoginSection() {
  loginSection.classList.remove("hidden");
  adminSection.classList.add("hidden");
}


// 관리자는 모든 항목, 소위원회 계정은 담당 항목만 열 수 있다.
function getAccessibleSections(user, profile) {

  if (isAdminEmail(user.email)) {
    return [
      "budgetManagement",
      "activityManagement",
      "resourceManagement",
      "scheduleManagement",
      "userManagement"
    ];
  }


  const memberships =
    Array.isArray(profile.subcommittees)
      ? profile.subcommittees
      : [];


  return SUBCOMMITTEES
    .filter((subcommittee) =>
      subcommittee.section &&
      memberships.includes(subcommittee.id)
    )
    .map((subcommittee) => subcommittee.section);
}


// ========================================
// 예산 신청 불러오기
// ========================================

async function loadBudgetRequests() {

  budgetRequestList.textContent =
    "예산 신청을 불러오는 중...";


  try {

    const budgetRequestsQuery =
      query(
        collection(db, "budgetRequests"),
        orderBy("createdAt", "desc")
      );


    const snapshot =
      await getDocs(budgetRequestsQuery);


    const budgetRequests =
      snapshot.docs.map(
        (budgetRequestDoc) => ({
          id: budgetRequestDoc.id,
          ...budgetRequestDoc.data()
        })
      );


    renderBudgetStats(budgetRequests);

    renderBudgetRequests(budgetRequests);

  } catch (error) {

    console.error(
      "예산 신청 조회 오류:",
      error
    );

    budgetRequestList.textContent =
      "예산 신청을 불러오지 못했습니다.";

  }

}


// ========================================
// 예산 통계
// ========================================

function renderBudgetStats(
  budgetRequests
) {

  budgetTotalCount.textContent =
    budgetRequests.length;


  budgetPendingCount.textContent =
    countByStatus(
      budgetRequests,
      "pending"
    );


  budgetApprovedCount.textContent =
    countByStatus(
      budgetRequests,
      "approved"
    );


  budgetRejectedCount.textContent =
    countByStatus(
      budgetRequests,
      "rejected"
    );


  budgetAssemblyCount.textContent =
    countByStatus(
      budgetRequests,
      "assembly"
    );

}


// ========================================
// 예산 신청 목록
// ========================================

function renderBudgetRequests(
  budgetRequests
) {

  budgetRequestList.textContent = "";


  if (budgetRequests.length === 0) {

    budgetRequestList.textContent =
      "아직 예산 신청이 없습니다.";

    return;

  }


  budgetRequests.forEach(
    (budgetRequest) => {

      const card =
        createBudgetRequestCard(
          budgetRequest
        );

      budgetRequestList.appendChild(
        card
      );

    }
  );

}


// ========================================
// 예산 신청 카드
// ========================================

function createBudgetRequestCard(data) {

  const card =
    document.createElement("article");

  card.className =
    `admin-card budget-request-card status-${data.status}`;


  const title =
    document.createElement("h2");

  title.textContent =
    data.clubName ?? "동아리명 없음";


  const requester =
    createInfoLine(
      "신청자",
      data.requesterName ?? "이름 없음"
    );


  const purpose =
    createInfoLine(
      "사용 목적",
      data.purpose ?? "목적 없음"
    );


  const amount =
    createInfoLine(
      "신청 금액",
      formatAmount(data.amount)
    );


  const description =
    createInfoLine(
      "상세 설명",
      data.description ?? ""
    );

  description.classList.add(
    "admin-card-message"
  );


  const createdAt =
    createInfoLine(
      "신청 시간",
      formatCreatedAt(data.createdAt)
    );


  const status =
    document.createElement("span");

  status.className = "status";

  status.textContent =
    getBudgetStatusName(
      data.status
    );

  const adminMemoLabel = document.createElement("label");
  adminMemoLabel.className = "admin-memo-label";
  adminMemoLabel.textContent = "관리자 의견";
  const adminMemo = document.createElement("textarea");
  adminMemo.placeholder = "승인 의견 또는 반려 사유를 입력하세요.";
  adminMemo.value = data.adminMemo ?? "";
  adminMemoLabel.appendChild(adminMemo);


  const buttons =
    document.createElement("div");

  buttons.className =
    "admin-card-actions";


  // 승인 버튼
  const approveButton =
    document.createElement("button");

  approveButton.textContent =
    "승인";

  approveButton.addEventListener(
    "click",
    async () => {

      await changeBudgetRequestStatus(
        data.id,
        "approved",
        adminMemo.value
      );

    }
  );


  // 반려 버튼
  const rejectButton =
    document.createElement("button");

  rejectButton.textContent =
    "반려";

  rejectButton.className =
    "danger";

  const completeButton =
    document.createElement("button");

  completeButton.textContent =
    "사용 완료";

  completeButton.className =
    "secondary";

  completeButton.hidden = data.status !== "approved";

  completeButton.addEventListener(
    "click",
    async () => {

      await changeBudgetRequestStatus(
        data.id,
        "completed",
        adminMemo.value
      );

    }
  );

  rejectButton.addEventListener(
    "click",
    async () => {

      await changeBudgetRequestStatus(
        data.id,
        "rejected",
        adminMemo.value
      );

    }
  );


  // 본 회의 안건 상정
  const assemblyButton =
    document.createElement("button");

  assemblyButton.textContent =
    "본 회의 안건 상정";

  assemblyButton.className =
    "assembly";

  assemblyButton.addEventListener(
    "click",
    async () => {

      await changeBudgetRequestStatus(
        data.id,
        "assembly",
        adminMemo.value
      );

    }
  );


  buttons.append(
    approveButton,
    rejectButton,
    assemblyButton
  );

  if (data.status === "approved") {
    buttons.append(completeButton);
  }


  card.append(
    title,
    requester,
    purpose,
    amount,
    description,
    createdAt,
    status,
    adminMemoLabel,
    buttons
  );


  return card;
}


// ========================================
// 정보 한 줄 생성
// ========================================

function createInfoLine(
  label,
  value
) {

  const paragraph =
    document.createElement("p");

  paragraph.className =
    "admin-info-line";


  const labelElement =
    document.createElement("strong");

  labelElement.textContent =
    `${label}: `;


  const valueElement =
    document.createElement("span");

  valueElement.textContent =
    value;


  paragraph.append(
    labelElement,
    valueElement
  );


  return paragraph;
}


// ========================================
// 승인 / 반려
// ========================================

async function changeBudgetRequestStatus(
  id,
  newStatus,
  adminMemo
) {

  try {

    await updateDoc(
      doc(
        db,
        "budgetRequests",
        id
      ),
      {
        status: newStatus,
        adminMemo: adminMemo.trim(),
        reviewedAt: serverTimestamp()
      }
    );


    await loadBudgetRequests();

  } catch (error) {

    console.error(
      "예산 상태 변경 오류:",
      error
    );


    alert(
      "예산 신청 상태 변경 중 오류가 발생했습니다."
    );

  }

}


// ========================================
// 상태 개수
// ========================================

function countByStatus(
  budgetRequests,
  status
) {

  return budgetRequests.filter(
    (budgetRequest) =>
      budgetRequest.status === status
  ).length;

}


// ========================================
// 상태명 변환
// ========================================

function getBudgetStatusName(status) {

  if (status === "approved") {
    return "승인";
  }

  if (status === "rejected") {
    return "반려";
  }

  if (status === "completed") {
    return "사용 완료";
  }

  if (status === "assembly") {
    return "본 회의 안건 상정";
  }

  return "대기";
}


// ========================================
// 금액 표시
// ========================================

function formatAmount(amount) {

  const numberAmount =
    Number(amount);


  if (!Number.isFinite(numberAmount)) {
    return "금액 정보 없음";
  }


  return `${numberAmount.toLocaleString("ko-KR")}원`;
}


// ========================================
// 시간 표시
// ========================================

function formatCreatedAt(createdAt) {

  if (!createdAt) {
    return "시간 정보 없음";
  }


  if (
    typeof createdAt.toDate === "function"
  ) {

    return createdAt
      .toDate()
      .toLocaleString("ko-KR");

  }


  const date =
    new Date(createdAt);


  if (Number.isNaN(date.getTime())) {
    return "시간 정보 없음";
  }


  return date.toLocaleString("ko-KR");
}


// ========================================
// 새로고침
// ========================================

refreshButton.addEventListener(
  "click",
  loadBudgetRequests
);


// ========================================
// 로그아웃
// ========================================

logoutButton.addEventListener(
  "click",
  () => signOut(auth)
);


// ========================================
// 관리 메뉴 전환
// ========================================

const adminMenuButtons =
  document.querySelectorAll("[data-admin-target]");

const adminSections =
  document.querySelectorAll(".admin-management-section");


adminMenuButtons.forEach(
  (menuButton) => {

    menuButton.addEventListener(
      "click",
      () =>
        selectAdminSection(
          menuButton.dataset.adminTarget
        )
    );

  }
);


function selectAdminSection(targetId) {

  adminMenuButtons.forEach(
    (button) =>
      button.classList.toggle(
        "active",
        button.dataset.adminTarget === targetId
      )
  );


  adminSections.forEach(
    (section) =>
      section.classList.toggle(
        "hidden",
        section.id !== targetId
      )
  );

}


// 접근 권한이 있는 항목만 남긴다.
function applySectionAccess(
  accessibleSections,
  isFullAdmin
) {

  adminMenuButtons.forEach(
    (button) => {

      button.hidden =
        !accessibleSections.includes(
          button.dataset.adminTarget
        );

    }
  );


  adminSections.forEach(
    (section) => {

      if (
        !accessibleSections.includes(section.id)
      ) {
        section.classList.add("hidden");
      }

    }
  );


  adminAccessLabel.textContent =
    isFullAdmin
      ? "관리자 계정"
      : "소위원회 계정";


  const requestedSection =
    new URLSearchParams(
      window.location.search
    ).get("section");


  const initialSection =
    accessibleSections.includes(requestedSection)
      ? requestedSection
      : accessibleSections[0];


  selectAdminSection(initialSection);
}
