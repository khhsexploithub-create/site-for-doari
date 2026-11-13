// 소속 동아리가 비어 있는 계정에 띄우는 선택 창.
// 학번 · 이름 입력 창(identityDialog.js)과 같은 방식으로 만든다.
// 저장하고 나면 계정 기록에 남으므로 다시 뜨지 않는다.

import { createClubChoiceGroup } from "../clubList.js";
import { saveClubs } from "./authService.js";

// '나중에'를 누르면 이번 세션에서만 숨긴다. 다음 로그인 때 다시 묻는다.
const SNOOZE_KEY = "clubChoiceSnoozed";

let dialog = null;
let isSubmitting = false;

export function isClubChoiceSnoozed() {
  try {
    return sessionStorage.getItem(SNOOZE_KEY) === "1";
  } catch (error) {
    console.error("소속 선택 창 상태를 읽지 못했습니다:", error);
    return false;
  }
}

function snoozeClubChoice() {
  try {
    sessionStorage.setItem(SNOOZE_KEY, "1");
  } catch (error) {
    console.error("소속 선택 창 상태를 저장하지 못했습니다:", error);
  }
}

export function openClubDialog({ onSaved } = {}) {
  if (!dialog) dialog = buildDialog();

  const { element, form, picker, message, submitButton } = dialog;

  form.onsubmit = async (event) => {
    event.preventDefault();

    if (isSubmitting) return;

    const clubName = picker.getSelected();

    if (!clubName) {
      message.textContent = "소속 동아리를 골라주세요.";
      return;
    }

    isSubmitting = true;
    submitButton.disabled = true;
    submitButton.textContent = "저장 중...";
    message.textContent = "";

    try {
      await saveClubs([clubName]);
      element.close();
      await onSaved?.();
    } catch (error) {
      console.error("소속 동아리 저장 오류:", error);
      message.textContent = error.message?.includes("소속")
        ? error.message
        : "저장하지 못했습니다. 잠시 후 다시 시도해주세요.";
    } finally {
      isSubmitting = false;
      submitButton.disabled = false;
      updateSubmitLabel();
    }
  };

  picker.setSelected("");
  message.textContent = "";
  updateSubmitLabel();

  element.showModal();

  function updateSubmitLabel() {
    const clubName = picker.getSelected();
    submitButton.textContent = clubName ? `${clubName}으로 저장` : "저장";
    submitButton.disabled = !clubName;
  }

  dialog.updateSubmitLabel = updateSubmitLabel;
}

function buildDialog() {
  const element = document.createElement("dialog");
  element.className = "identity-dialog club-dialog";

  const form = document.createElement("form");
  form.className = "identity-form";
  form.noValidate = true;

  const title = document.createElement("h2");
  title.textContent = "소속 동아리를 알려주세요";

  const description = document.createElement("p");
  description.className = "identity-description";
  description.textContent =
    "동아리 과제가 소속 동아리별로 나뉘었어요. 선택한 동아리의 과제만 보이고 제출할 수 있습니다.";

  const picker = createClubChoiceGroup({
    name: "소속 동아리",
    onChange: () => {
      message.textContent = "";
      dialog?.updateSubmitLabel?.();
    }
  });

  const warning = document.createElement("p");
  warning.className = "club-dialog-warning";
  warning.textContent =
    "⚠ 저장 후에는 본인이 바꿀 수 없어요. 잘못 골랐으면 연합회에 문의해주세요.";

  const message = document.createElement("p");
  message.className = "message account-message";
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");

  const actions = document.createElement("div");
  actions.className = "identity-actions club-dialog-actions";

  const laterButton = document.createElement("button");
  laterButton.type = "button";
  laterButton.className = "secondary";
  laterButton.textContent = "나중에";
  laterButton.addEventListener("click", () => {
    snoozeClubChoice();
    element.close();
  });

  const submitButton = document.createElement("button");
  submitButton.type = "submit";
  submitButton.textContent = "저장";

  actions.append(laterButton, submitButton);

  const footnote = document.createElement("small");
  footnote.className = "account-hint";
  footnote.textContent = "'나중에'를 누르면 다음 로그인 때 다시 물어봐요";

  form.append(title, description, picker.element, warning, message, actions, footnote);
  element.appendChild(form);
  document.body.appendChild(element);

  return { element, form, picker, message, submitButton };
}
