import "./styles/site.css";
import "./styles/neoul/admin.css";

import { guardPage } from "./pageGuard.js";
import {
  getSubcommitteeSections,
  getSubcommitteeRoleName,
  readSubcommitteeRoles,
  SUBCOMMITTEE_CHAIR,
  SUBCOMMITTEE_NONE,
  SUBCOMMITTEES
} from "./userRole.js";

const listElement = document.querySelector("#subcommitteeList");
const message = document.querySelector("#subcommitteeMessage");

guardPage({
  requireSubcommittee: true,
  onReady: ({ profile }) => {
    const roles = profile.subcommitteeRoles ?? readSubcommitteeRoles(profile);
    const chairCount = SUBCOMMITTEES
      .filter(({ id }) => roles[id] === SUBCOMMITTEE_CHAIR).length;
    const memberCount = SUBCOMMITTEES
      .filter(({ id }) => roles[id] !== SUBCOMMITTEE_NONE).length;

    message.textContent = memberCount
      ? `소속 소위원회 ${memberCount}곳 · 소위원장 ${chairCount}곳의 관리 항목을 열 수 있습니다.`
      : "아직 소속된 소위원회가 없습니다. 관리자에게 권한을 요청해주세요.";

    renderSubcommittees(roles);
  }
});

function renderSubcommittees(roles) {
  listElement.textContent = "";

  SUBCOMMITTEES.forEach((subcommittee) => {
    const role = roles[subcommittee.id] ?? SUBCOMMITTEE_NONE;
    const isMember = role !== SUBCOMMITTEE_NONE;
    const isChair = role === SUBCOMMITTEE_CHAIR;
    const sections = getSubcommitteeSections(subcommittee);
    const isReady = sections.length > 0;
    const isOpen = isMember && isReady;

    const card = isOpen ? document.createElement("a") : document.createElement("div");
    card.className = "subcommittee-card";
    card.classList.toggle("is-locked", !isOpen);

    if (isOpen) {
      card.href = `/admin.html?section=${sections[0]}`;
    }

    const name = document.createElement("h2");
    name.textContent = subcommittee.name;

    const description = document.createElement("p");
    description.textContent = subcommittee.description;

    const roleBadge = document.createElement("span");
    roleBadge.className = `subcommittee-role-badge ${isChair ? "is-chair" : ""}`.trim();
    roleBadge.textContent = isMember
      ? getSubcommitteeRoleName(role)
      : "소속 아님";

    const permission = document.createElement("p");
    permission.className = "subcommittee-permission";

    if (!isMember) {
      permission.textContent = "관리 화면을 열 수 없습니다.";
    } else if (isChair) {
      permission.textContent = "승인 · 반려 등 처리 권한이 있습니다.";
    } else {
      permission.textContent = "관리 현황을 열람만 할 수 있습니다. 승인 · 반려는 소위원장이 처리합니다.";
    }

    const status = document.createElement("span");
    status.className = "subcommittee-status";

    if (!isReady) {
      status.textContent = "준비 중";
    } else if (!isMember) {
      status.textContent = "권한 없음";
    } else {
      status.textContent = subcommittee.sectionName;
      status.classList.add("is-open");
    }

    card.append(name, roleBadge, description, permission, status);

    if (isOpen) {
      const arrow = document.createElement("span");
      arrow.className = "subcommittee-arrow";
      arrow.textContent = "→";
      card.appendChild(arrow);
    }

    listElement.appendChild(card);
  });
}
