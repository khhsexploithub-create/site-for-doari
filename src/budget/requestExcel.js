// 예산 신청 양식(.xlsx) 내려받기와 불러오기.
//
// 엑셀 라이브러리는 덩치가 커서 첫 화면에 같이 싣지 않는다.
// 단추를 누른 순간에만 불러온다(동적 import).

import { ITEM_KINDS, SHEET_COLUMNS, createEmptyItem } from "./requestSheet.js";

const SHEET_NAME = "예산 신청";

async function loadXlsx() {
  return import("xlsx");
}

// 현황표와 같은 열 순서로 빈 양식을 만들어 준다.
export async function downloadTemplate() {
  const XLSX = await loadXlsx();

  const rows = [
    SHEET_COLUMNS,
    ["재료", "3D프린터 필라멘트 PLA 1kg", 2, 39000, "https://example.com/item", "대회용 로봇 출장 출력"],
    ["서비스", "위 품목 배송비", 1, 3500, "", "배송비"]
  ];

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 8 }, { wch: 34 }, { wch: 6 }, { wch: 10 }, { wch: 34 }, { wch: 24 }];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, SHEET_NAME);
  XLSX.writeFile(book, "예산신청_양식.xlsx");
}

// 올린 파일을 표에 넣을 수 있는 품목 목록으로 바꾼다.
export async function readWorkbook(file) {
  const XLSX = await loadXlsx();
  const buffer = await file.arrayBuffer();
  const book = XLSX.read(buffer, { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]];

  if (!sheet) {
    throw new Error("시트를 찾지 못했습니다.");
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });

  // 첫 줄이 머리글이면 건너뛴다.
  const body = rows.length > 0 && String(rows[0][0] ?? "").trim() === "종류"
    ? rows.slice(1)
    : rows;

  const items = body
    .map((row) => toItem(row))
    .filter((item) => item.itemName || item.unitPrice > 0);

  if (items.length === 0) {
    throw new Error("읽을 수 있는 줄이 없습니다.");
  }

  return items;
}

function toItem(row) {
  const kind = String(row[0] ?? "").trim();
  const itemName = String(row[1] ?? "").trim();
  const isShipping = itemName.includes("배송비");

  return {
    ...createEmptyItem(),
    kind: ITEM_KINDS.includes(kind) ? kind : (isShipping ? "서비스" : "재료"),
    itemName,
    quantity: toNumber(row[2]) || 1,
    unitPrice: toNumber(row[3]),
    purchaseLink: String(row[4] ?? "").trim(),
    description: String(row[5] ?? "").trim(),
    isShipping
  };
}

function toNumber(value) {
  if (typeof value === "number") return Math.round(value);
  const digits = String(value ?? "").replace(/[^0-9.-]/g, "");
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}
