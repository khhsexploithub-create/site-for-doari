// 신청 페이지와 항목 추가 페이지 사이에서 작성 중인 내용을 옮긴다.
// 같은 탭에서만 살아 있으면 되므로 sessionStorage 를 쓴다.

const DRAFT_KEY = "budgetRequestDraft";

const EMPTY_DRAFT = {
  clubName: "",
  requesterName: "",
  items: []
};

export const MAX_ITEMS = 20;

export function readDraft() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? "null");

    if (!saved || typeof saved !== "object") {
      return { ...EMPTY_DRAFT, items: [] };
    }

    return {
      clubName: typeof saved.clubName === "string" ? saved.clubName : "",
      requesterName: typeof saved.requesterName === "string" ? saved.requesterName : "",
      items: Array.isArray(saved.items) ? saved.items.filter(isValidItem) : []
    };
  } catch (error) {
    console.error("작성 중인 신청서를 읽지 못했습니다:", error);
    return { ...EMPTY_DRAFT, items: [] };
  }
}

export function writeDraft(draft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
      clubName: draft.clubName ?? "",
      requesterName: draft.requesterName ?? "",
      items: Array.isArray(draft.items) ? draft.items : []
    }));
  } catch (error) {
    console.error("작성 중인 신청서를 저장하지 못했습니다:", error);
  }
}

export function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY);
  } catch (error) {
    console.error("작성 중인 신청서를 비우지 못했습니다:", error);
  }
}

function isValidItem(item) {
  return Boolean(item) && typeof item === "object" && typeof item.itemName === "string";
}

export function sumItemAmounts(items) {
  return (items ?? []).reduce((total, item) => total + (Number(item.amount) || 0), 0);
}

export function formatAmount(amount) {
  const parsed = Number(amount);
  return Number.isFinite(parsed) ? `${parsed.toLocaleString("ko-KR")}원` : "금액 정보 없음";
}
