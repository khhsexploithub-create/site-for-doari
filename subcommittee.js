import "./style.css";

import { guardPage } from "./pageGuard.js";
import { SUBCOMMITTEES } from "./userRole.js";

const listElement = document.querySelector("#subcommitteeList");
const message = document.querySelector("#subcommitteeMessage");

guardPage({
  onReady: ({ profile }) => {
    const memberships = Array.isArray(profile.subcommittees) ? profile.subcommittees : [];

    message.textContent = memberships.length
      ? `소속 소위원회 ${memberships.length}곳의 관리 항목을 열 수 있습니다.`
      : "아직 소속된 소위원회가 없습니다. 관리자에게 권한을 요청해주세요.";

    renderSubcommittees(memberships);
  }
});

function renderSubcommittees(memberships) {
  listElement.textContent = "";

  SUBCOMMITTEES.forEach((subcommittee) => {
    const isMember = memberships.includes(subcommittee.id);
    const isReady = Boolean(subcommittee.section);
    const isOpen = isMember && isReady;

    const card = isOpen ? document.createElement("a") : document.createElement("div");
    card.className = "subcommittee-card";
    card.classList.toggle("is-locked", !isOpen);

    if (isOpen) {
      card.href = `/admin.html?section=${subcommittee.section}`;
    }

    const name = document.createElement("h2");
    name.textContent = subcommittee.name;

    const description = document.createElement("p");
    description.textContent = subcommittee.description;

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

    card.append(name, description, status);

    if (isOpen) {
      const arrow = document.createElement("span");
      arrow.className = "subcommittee-arrow";
      arrow.textContent = "→";
      card.appendChild(arrow);
    }

    listElement.appendChild(card);
  });
}
