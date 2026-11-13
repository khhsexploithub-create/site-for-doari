// 동아리 목록과 동아리별 색상.
// 최근 기록에서 어느 동아리 신청인지 한눈에 구분하기 위해 색을 나눠 둔다.

export const CLUBS = [
  { name: "창의로봇반", color: "#b45309", background: "#fef3c7", border: "#fcd34d" },
  { name: "게임개발부", color: "#9d174d", background: "#fce7f3", border: "#f9a8d4" },
  { name: "미디어랩", color: "#6d28d9", background: "#ede9fe", border: "#c4b5fd" },
  { name: "자동차탐구", color: "#374151", background: "#e5e7eb", border: "#9ca3af" },
  { name: "환경동아리", color: "#15803d", background: "#dcfce7", border: "#86efac" },
  { name: "인터스텔라", color: "#1d4ed8", background: "#dbeafe", border: "#93c5fd" },
  { name: "해킹반", color: "#0f766e", background: "#ccfbf1", border: "#5eead4" },
  { name: "Catalyst", color: "#c2410c", background: "#ffedd5", border: "#fdba74" },
  { name: "The 피식스", color: "#7e22ce", background: "#f3e8ff", border: "#d8b4fe" },
  { name: "과학심화탐구", color: "#0369a1", background: "#e0f2fe", border: "#7dd3fc" },
  { name: "CYCLO", color: "#a16207", background: "#fef9c3", border: "#fde047" },
  { name: "코드파이낸스", color: "#166534", background: "#d1fae5", border: "#6ee7b7" },
  { name: "GLOBAL AGORA", color: "#be123c", background: "#ffe4e6", border: "#fda4af" }
];

const FALLBACK_COLOR = { color: "#4b5563", background: "#f3f4f6", border: "#d1d5db" };

export function getClubColor(clubName) {
  return CLUBS.find((club) => club.name === clubName) ?? FALLBACK_COLOR;
}

// 동아리 이름을 색깔 있는 태그로 만든다.
export function createClubTag(clubName) {
  const tag = document.createElement("span");
  const { color, background, border } = getClubColor(clubName);

  tag.className = "club-tag";
  tag.textContent = clubName || "동아리명 없음";
  // 긴 이름은 화면에서 잘리므로 전체 이름을 툴팁으로 남긴다.
  tag.title = clubName || "동아리명 없음";
  tag.style.color = color;
  tag.style.background = background;
  tag.style.borderColor = border;

  return tag;
}

// select 에 동아리 목록을 채운다.
export function fillClubSelect(select, { placeholder = "동아리를 선택하세요" } = {}) {
  select.textContent = "";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = placeholder;
  empty.disabled = true;
  empty.selected = true;
  select.appendChild(empty);

  CLUBS.forEach((club) => {
    const option = document.createElement("option");
    option.value = club.name;
    option.textContent = club.name;
    select.appendChild(option);
  });
}

// 가입 화면과 소속 선택 팝업에서 함께 쓰는 동아리 고르기 칩.
// 소속 동아리는 한 곳만 고를 수 있어 라디오 단추처럼 움직인다.
export function createClubChoiceGroup({ name, onChange } = {}) {
  const group = document.createElement("div");
  group.className = "club-choice-group";
  group.setAttribute("role", "radiogroup");
  if (name) group.setAttribute("aria-label", name);

  let selected = "";

  const buttons = CLUBS.map((club) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "club-choice";
    button.textContent = club.name;
    button.dataset.club = club.name;
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", "false");

    button.addEventListener("click", () => {
      selected = selected === club.name ? "" : club.name;
      paint();
      onChange?.(selected);
    });

    group.appendChild(button);
    return button;
  });

  // 고른 동아리만 그 동아리 색으로 칠한다.
  function paint() {
    buttons.forEach((button) => {
      const clubName = button.dataset.club;
      const isSelected = clubName === selected;
      const { color, background, border } = getClubColor(clubName);

      button.classList.toggle("is-selected", isSelected);
      button.setAttribute("aria-checked", String(isSelected));
      button.textContent = isSelected ? `✓ ${clubName}` : clubName;
      button.style.color = isSelected ? color : "";
      button.style.background = isSelected ? background : "";
      button.style.borderColor = isSelected ? border : "";
    });
  }

  return {
    element: group,
    getSelected: () => selected,
    setSelected: (clubName) => {
      selected = CLUBS.some((club) => club.name === clubName) ? clubName : "";
      paint();
    }
  };
}
