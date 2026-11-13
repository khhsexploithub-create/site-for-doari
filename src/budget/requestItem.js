import "../style.css";

import { guardPage } from "../pageGuard.js";
import { MAX_ITEMS, readDraft, writeDraft } from "./requestDraft.js";

const form = document.querySelector("#itemForm");
const itemNameInput = document.querySelector("#itemName");
const purposeInput = document.querySelector("#itemPurpose");
const amountInput = document.querySelector("#itemAmount");
const linkInput = document.querySelector("#itemLink");
const descriptionInput = document.querySelector("#itemDescription");
const saveButton = document.querySelector("#itemSaveButton");
const formMessage = document.querySelector("#itemFormMessage");
const draftMessage = document.querySelector("#itemDraftMessage");

const BUDGET_URL = "/budget.html";

guardPage({
  onReady: () => {
    const draft = readDraft();

    // 동아리명과 신청자명은 신청 페이지에 그대로 남아 있다는 것을 알려준다.
    draftMessage.textContent = draft.clubName || draft.requesterName
      ? `${draft.clubName || "동아리 미선택"} · ${draft.requesterName || "신청자 미입력"} 신청서에 담깁니다. (현재 ${draft.items.length}개 항목)`
      : "저장하면 신청서의 '신청 현황'에 담깁니다.";

    saveButton.disabled = false;
    itemNameInput.focus();
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  const item = {
    itemName: itemNameInput.value.trim(),
    purpose: purposeInput.value.trim(),
    amount: Number(amountInput.value),
    purchaseLink: linkInput.value.trim(),
    description: descriptionInput.value.trim()
  };

  if (!item.itemName || !item.purpose || !item.description) {
    formMessage.textContent = "물품 이름, 사용 목적, 상세 설명을 모두 입력해주세요.";
    return;
  }

  if (!Number.isFinite(item.amount) || item.amount <= 0) {
    formMessage.textContent = "신청 금액을 1원 이상으로 입력해주세요.";
    return;
  }

  if (!isValidUrl(item.purchaseLink)) {
    formMessage.textContent = "구매 링크는 http:// 또는 https:// 로 시작하는 주소여야 합니다.";
    return;
  }

  const draft = readDraft();

  if (draft.items.length >= MAX_ITEMS) {
    formMessage.textContent = `한 신청서에는 물품을 ${MAX_ITEMS}개까지 담을 수 있습니다.`;
    return;
  }

  draft.items.push(item);
  writeDraft(draft);

  window.location.href = BUDGET_URL;
});

function isValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
