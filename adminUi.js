// 관리자 화면에서 공통으로 쓰는 작은 UI 도구 모음

export function createInfoLine(label, value) {
  const paragraph = document.createElement("p");
  paragraph.className = "admin-info-line";

  const labelElement = document.createElement("strong");
  labelElement.textContent = `${label}: `;

  const valueElement = document.createElement("span");
  valueElement.textContent = value;

  paragraph.append(labelElement, valueElement);
  return paragraph;
}

// 라벨과 입력창을 한 쌍으로 만든다.
export function createField(labelText, { type = "text", value = "", multiline = false } = {}) {
  const label = document.createElement("label");
  label.className = "admin-edit-field";
  label.append(document.createTextNode(labelText));

  const input = multiline
    ? document.createElement("textarea")
    : document.createElement("input");

  if (!multiline) input.type = type;
  input.value = value ?? "";

  label.appendChild(input);
  return { label, input };
}

export function createStatusBadge(text, statusKey) {
  const status = document.createElement("span");
  status.className = `status status-${statusKey}`;
  status.textContent = text;
  return status;
}

export function formatDateTime(timestamp) {
  if (!timestamp) return "시간 정보 없음";

  const date = typeof timestamp.toDate === "function"
    ? timestamp.toDate()
    : new Date(timestamp);

  return Number.isNaN(date.getTime()) ? "시간 정보 없음" : date.toLocaleString("ko-KR");
}

export function normalize(value) {
  return String(value ?? "").toLocaleLowerCase("ko-KR");
}

export function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
