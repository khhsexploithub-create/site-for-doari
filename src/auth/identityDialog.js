// 학번 · 이름이 비어 있는 계정에 한 번만 띄우는 입력 창.
// 저장하고 나면 계정 기록에 남으므로 다시 뜨지 않는다.

import { describeStudentId, isValidStudentId } from "../userRole.js";
import { saveIdentity } from "./authService.js";

let dialog = null;
let isSubmitting = false;

export function openIdentityDialog({ onSaved } = {}) {
  if (!dialog) dialog = buildDialog();

  const { element, form, studentIdInput, nameInput, hint, message, submitButton } = dialog;

  form.onsubmit = async (event) => {
    event.preventDefault();

    if (isSubmitting) return;

    const studentId = studentIdInput.value.trim();
    const name = nameInput.value.trim();

    if (!isValidStudentId(studentId)) {
      message.textContent = "학번은 숫자 5자리로 입력해주세요. (예: 10712)";
      studentIdInput.focus();
      return;
    }

    if (!name) {
      message.textContent = "이름을 입력해주세요.";
      nameInput.focus();
      return;
    }

    isSubmitting = true;
    submitButton.disabled = true;
    submitButton.textContent = "저장 중...";
    message.textContent = "";

    try {
      await saveIdentity({ studentId, name });
      element.close();
      await onSaved?.();
    } catch (error) {
      console.error("학번·이름 저장 오류:", error);
      message.textContent = error.message?.startsWith("학번") || error.message?.startsWith("이름")
        ? error.message
        : "저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
    } finally {
      isSubmitting = false;
      submitButton.disabled = false;
      submitButton.textContent = "저장";
    }
  };

  studentIdInput.value = "";
  nameInput.value = "";
  message.textContent = "";
  hint.textContent = "학년·반·번호를 붙여 다섯 자리로 입력하세요.";
  hint.className = "account-hint";

  element.showModal();
  studentIdInput.focus();
}

function buildDialog() {
  const element = document.createElement("dialog");
  element.className = "identity-dialog";

  const form = document.createElement("form");
  form.className = "identity-form";
  form.noValidate = true;

  const title = document.createElement("h2");
  title.textContent = "학번과 이름을 입력해주세요";

  const description = document.createElement("p");
  description.className = "identity-description";
  description.textContent =
    "신청과 예약 기록에 표시될 정보입니다. 한 번 저장하면 본인은 고칠 수 없으니 정확히 입력해주세요.";

  const studentIdLabel = document.createElement("label");
  studentIdLabel.textContent = "학번";
  const studentIdInput = document.createElement("input");
  studentIdInput.type = "text";
  studentIdInput.inputMode = "numeric";
  // 길이 제한은 아래 입력 처리에서 한다. maxLength 를 걸면 붙여넣기에서 숫자가 잘려 나간다.
  studentIdInput.placeholder = "숫자 5자리 (예: 10712)";
  studentIdInput.autocomplete = "off";

  const hint = document.createElement("small");
  hint.className = "account-hint";
  hint.textContent = "학년·반·번호를 붙여 다섯 자리로 입력하세요.";

  studentIdLabel.append(studentIdInput, hint);

  // 숫자만, 다섯 자리까지만 받는다.
  studentIdInput.addEventListener("input", () => {
    const digitsOnly = studentIdInput.value.replace(/\D/g, "").slice(0, 5);
    if (studentIdInput.value !== digitsOnly) studentIdInput.value = digitsOnly;

    if (!digitsOnly) {
      hint.textContent = "학년·반·번호를 붙여 다섯 자리로 입력하세요.";
      hint.className = "account-hint";
    } else if (isValidStudentId(digitsOnly)) {
      hint.textContent = describeStudentId(digitsOnly);
      hint.className = "account-hint is-ok";
    } else {
      hint.textContent = `숫자 5자리가 필요합니다. (현재 ${digitsOnly.length}자리)`;
      hint.className = "account-hint is-error";
    }
  });

  const nameLabel = document.createElement("label");
  nameLabel.textContent = "이름";
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.maxLength = 20;
  nameInput.placeholder = "예: 홍길동";
  nameInput.autocomplete = "name";
  nameLabel.appendChild(nameInput);

  const message = document.createElement("p");
  message.className = "message account-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");

  const actions = document.createElement("div");
  actions.className = "identity-actions";

  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.textContent = "저장";

  const laterButton = document.createElement("button");
  laterButton.type = "button";
  laterButton.className = "secondary";
  laterButton.textContent = "나중에";
  laterButton.addEventListener("click", () => element.close());

  actions.append(submitButton, laterButton);

  form.append(title, description, studentIdLabel, nameLabel, message, actions);
  element.appendChild(form);
  document.body.appendChild(element);

  return { element, form, studentIdInput, nameInput, hint, message, submitButton };
}
