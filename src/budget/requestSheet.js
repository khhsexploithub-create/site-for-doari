// 예산 신청 품목을 엑셀처럼 적는 표.
//
// 현황표와 같은 열 순서를 쓴다. 금액은 수량 × 단가로 자동 계산하므로 직접 고칠 수 없다.
// 배송비는 물품 아래에 딸린 '서비스' 행으로 따로 적어 정산이 쉽도록 했다.

export const ITEM_KINDS = ["재료", "도구", "비품", "서비스"];

export const SHIPPING_ITEM_NAME = "위 품목 배송비";

// 엑셀 양식과 붙여넣기에서 함께 쓰는 열 순서
export const SHEET_COLUMNS = ["종류", "품목", "수량", "단가", "구매 링크", "세부 내용"];

export function createEmptyItem(kind = "재료") {
  return {
    kind,
    itemName: "",
    quantity: 1,
    unitPrice: 0,
    purchaseLink: "",
    description: "",
    isShipping: false
  };
}

function createShippingItem() {
  return {
    kind: "서비스",
    itemName: SHIPPING_ITEM_NAME,
    quantity: 1,
    unitPrice: 0,
    purchaseLink: "",
    description: "배송비",
    isShipping: true
  };
}

export function getItemAmount(item) {
  const quantity = Number(item?.quantity) || 0;
  const unitPrice = Number(item?.unitPrice) || 0;
  return quantity * unitPrice;
}

export function sumItems(items) {
  return (items ?? []).reduce((total, item) => total + getItemAmount(item), 0);
}

// 종류별 소계. 화면 아래 칩과 관리자 화면에서 함께 쓴다.
export function sumByKind(items) {
  const totals = Object.fromEntries(ITEM_KINDS.map((kind) => [kind, 0]));

  (items ?? []).forEach((item) => {
    const kind = ITEM_KINDS.includes(item?.kind) ? item.kind : "재료";
    totals[kind] += getItemAmount(item);
  });

  return totals;
}

export function formatMoney(value) {
  const number = Number(value) || 0;
  return number.toLocaleString("ko-KR");
}

// ========================================
// 표 만들기
// ========================================

export function createRequestSheet({ tableBody, onChange }) {
  let items = [createEmptyItem()];

  function notify() {
    onChange?.(items);
  }

  function render() {
    tableBody.textContent = "";

    let visibleNumber = 0;

    items.forEach((item, index) => {
      if (!item.isShipping) visibleNumber += 1;
      tableBody.appendChild(createRow(item, index, item.isShipping ? "↳" : String(visibleNumber)));
    });

    notify();
  }

  function createRow(item, index, numberLabel) {
    const row = document.createElement("tr");
    row.className = `sheet-row${item.isShipping ? " is-shipping" : ""}`;
    row.dataset.index = String(index);

    // --- 순번 ---
    row.appendChild(textCell(numberLabel, "sheet-cell-number"));

    // --- 종류 ---
    const kindCell = document.createElement("td");
    kindCell.className = "sheet-cell-kind";

    const kindSelect = document.createElement("select");
    kindSelect.className = `sheet-kind is-${ITEM_KINDS.indexOf(item.kind) + 1}`;
    ITEM_KINDS.forEach((kind) => kindSelect.appendChild(new Option(kind, kind)));
    kindSelect.value = ITEM_KINDS.includes(item.kind) ? item.kind : "재료";
    kindSelect.disabled = item.isShipping;
    kindSelect.addEventListener("change", () => {
      item.kind = kindSelect.value;
      kindSelect.className = `sheet-kind is-${ITEM_KINDS.indexOf(item.kind) + 1}`;
      notify();
    });

    kindCell.appendChild(kindSelect);
    row.appendChild(kindCell);

    // --- 품목 ---
    const nameCell = document.createElement("td");
    nameCell.className = "sheet-cell-name";

    if (item.isShipping) {
      const label = document.createElement("span");
      label.className = "sheet-shipping-label";
      label.textContent = `┗ ${SHIPPING_ITEM_NAME}`;
      nameCell.appendChild(label);
    } else {
      nameCell.appendChild(createInput(item, "itemName", {
        column: 1,
        index,
        placeholder: "물품 이름"
      }));
    }

    // 품목 칸에서 오른쪽 클릭하면 배송비 행을 붙인다.
    nameCell.addEventListener("contextmenu", (event) => {
      if (item.isShipping) return;
      event.preventDefault();
      addShippingRow(index);
    });

    row.appendChild(nameCell);

    // --- 수량 · 단가 ---
    row.appendChild(numberCell(item, "quantity", index, 2));
    row.appendChild(numberCell(item, "unitPrice", index, 3));

    // --- 금액 (자동) ---
    const amountCell = document.createElement("td");
    amountCell.className = "sheet-cell-amount";
    amountCell.textContent = formatMoney(getItemAmount(item));
    row.appendChild(amountCell);

    // --- 구매 링크 ---
    const linkCell = document.createElement("td");
    linkCell.className = "sheet-cell-link";

    if (item.isShipping) {
      linkCell.textContent = "—";
    } else {
      linkCell.appendChild(createInput(item, "purchaseLink", {
        column: 4,
        index,
        placeholder: "링크 필요"
      }));
    }

    row.appendChild(linkCell);

    // --- 세부 내용 ---
    const descriptionCell = document.createElement("td");
    descriptionCell.className = "sheet-cell-description";
    descriptionCell.appendChild(createInput(item, "description", {
      column: 5,
      index,
      placeholder: "사용 목적"
    }));
    row.appendChild(descriptionCell);

    // --- 행 지우기 ---
    const removeCell = document.createElement("td");
    removeCell.className = "sheet-cell-remove";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "sheet-remove";
    removeButton.textContent = "×";
    removeButton.setAttribute("aria-label", `${index + 1}행 지우기`);
    removeButton.addEventListener("click", () => removeRow(index));

    removeCell.appendChild(removeButton);
    row.appendChild(removeCell);

    return row;
  }

  function textCell(text, className) {
    const cell = document.createElement("td");
    cell.className = className;
    cell.textContent = text;
    return cell;
  }

  // 수량 · 단가처럼 숫자만 받는 칸
  function numberCell(item, key, index, column) {
    const cell = document.createElement("td");
    cell.className = "sheet-cell-number-input";

    const input = createInput(item, key, { column, index, numeric: true });
    cell.appendChild(input);
    return cell;
  }

  function createInput(item, key, { column, index, placeholder = "", numeric = false } = {}) {
    const input = document.createElement("input");
    input.type = "text";
    input.className = "sheet-input";
    input.placeholder = placeholder;
    input.dataset.column = String(column);
    input.dataset.index = String(index);
    input.value = numeric ? formatMoney(item[key]) : (item[key] ?? "");

    if (numeric) {
      input.inputMode = "numeric";
      input.classList.add("is-numeric");
    }

    input.addEventListener("input", () => {
      if (numeric) {
        const digits = input.value.replace(/[^0-9]/g, "");
        item[key] = Number(digits) || 0;
        input.value = digits ? formatMoney(item[key]) : "";
        updateAmount(index);
      } else {
        item[key] = input.value;
      }

      clearError(input);
      notify();
    });

    // 마지막 칸에서 Tab / Enter 를 누르면 새 행이 생긴다.
    input.addEventListener("keydown", (event) => {
      const isLastCell = column === 5 && index === items.length - 1;

      if (event.key === "Enter") {
        event.preventDefault();
        if (isLastCell) addRow();
        else focusCell(index + (column === 5 ? 1 : 0), column === 5 ? 1 : column + 1);
        return;
      }

      if (event.key === "Tab" && !event.shiftKey && isLastCell) {
        event.preventDefault();
        addRow();
      }
    });

    input.addEventListener("paste", handlePaste);
    return input;
  }

  // 표 안의 금액 칸만 다시 그린다. 입력 중에 커서가 튀지 않도록.
  function updateAmount(index) {
    const row = tableBody.querySelector(`tr[data-index="${index}"]`);
    const amountCell = row?.querySelector(".sheet-cell-amount");
    if (amountCell) amountCell.textContent = formatMoney(getItemAmount(items[index]));
  }

  // ========================================
  // 엑셀에서 복사해 붙여넣기
  // ========================================

  function handlePaste(event) {
    const text = event.clipboardData?.getData("text/plain") ?? "";

    // 한 칸만 붙여넣는 경우는 브라우저 기본 동작에 맡긴다.
    if (!text.includes("\t") && !text.includes("\n")) return;

    event.preventDefault();

    const startIndex = Number(event.target.dataset.index) || 0;
    const startColumn = Number(event.target.dataset.column) || 0;

    const grid = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => line.split("\t"));

    grid.forEach((cells, rowOffset) => {
      const index = startIndex + rowOffset;

      while (items.length <= index) items.push(createEmptyItem());

      const item = items[index];
      if (item.isShipping) return;

      cells.forEach((rawValue, cellOffset) => {
        applyCell(item, startColumn + cellOffset, rawValue.trim());
      });
    });

    render();
  }

  // 열 번호에 맞는 값을 채운다. (0 종류 · 1 품목 · 2 수량 · 3 단가 · 4 링크 · 5 세부)
  function applyCell(item, column, value) {
    if (column === 0) {
      if (ITEM_KINDS.includes(value)) item.kind = value;
      return;
    }

    if (column === 1) { item.itemName = value; return; }
    if (column === 2) { item.quantity = toNumber(value); return; }
    if (column === 3) { item.unitPrice = toNumber(value); return; }
    if (column === 4) { item.purchaseLink = value; return; }
    if (column === 5) { item.description = value; }
  }

  // ========================================
  // 행 다루기
  // ========================================

  function addRow() {
    items.push(createEmptyItem());
    render();
    focusCell(items.length - 1, 1);
  }

  function addShippingRow(index) {
    // 이미 배송비 행이 붙어 있으면 더 붙이지 않는다.
    if (items[index + 1]?.isShipping) return;

    items.splice(index + 1, 0, createShippingItem());
    render();
    focusCell(index + 1, 3);
  }

  function removeRow(index) {
    const isParent = !items[index]?.isShipping;

    // 물품을 지우면 딸린 배송비 행도 함께 지운다.
    const removeCount = isParent && items[index + 1]?.isShipping ? 2 : 1;
    items.splice(index, removeCount);

    if (items.length === 0) items.push(createEmptyItem());
    render();
  }

  function focusCell(index, column) {
    const input = tableBody.querySelector(
      `tr[data-index="${index}"] .sheet-input[data-column="${column}"]`
    );
    input?.focus();
  }

  // ========================================
  // 칸 단위 검증
  // ========================================

  function clearError(input) {
    input.classList.remove("is-error");
    input.closest("td")?.classList.remove("is-error");
    input.closest("tr")?.classList.remove("is-error");
  }

  function markError(index, column, text) {
    const row = tableBody.querySelector(`tr[data-index="${index}"]`);
    const input = row?.querySelector(`.sheet-input[data-column="${column}"]`);

    row?.classList.add("is-error");
    input?.classList.add("is-error");
    input?.closest("td")?.classList.add("is-error");

    if (column === 4 && input && !input.value) input.placeholder = "링크 필요";

    return text;
  }

  // 첫 번째로 걸리는 문제 하나만 알려준다. 고치면 다음 문제를 짚어 준다.
  function validate() {
    tableBody.querySelectorAll(".is-error").forEach((element) => element.classList.remove("is-error"));

    let visibleNumber = 0;

    for (const [index, item] of items.entries()) {
      if (!item.isShipping) visibleNumber += 1;
      const label = item.isShipping ? `${visibleNumber}행 배송비` : `${visibleNumber}행`;

      if (!item.isShipping && !String(item.itemName).trim()) {
        return markError(index, 1, `${label}: 품목 이름을 적어주세요`);
      }

      if ((Number(item.quantity) || 0) <= 0) {
        return markError(index, 2, `${label}: 수량은 1 이상이어야 합니다`);
      }

      if ((Number(item.unitPrice) || 0) <= 0) {
        return markError(index, 3, `${label}: 단가를 적어주세요`);
      }

      if (!item.isShipping && !isValidLink(item.purchaseLink)) {
        return markError(index, 4, `${label}: 구매 링크를 입력해야 제출할 수 있어요`);
      }
    }

    return "";
  }

  render();

  return {
    getItems: () => items,
    setItems: (nextItems) => {
      items = Array.isArray(nextItems) && nextItems.length > 0
        ? nextItems.map((item) => ({ ...createEmptyItem(), ...item }))
        : [createEmptyItem()];
      render();
    },
    addRow,
    validate,
    render
  };
}

function toNumber(value) {
  const digits = String(value ?? "").replace(/[^0-9.-]/g, "");
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
}

// 주소 형태이기만 하면 받는다. http 를 빼고 적는 경우가 많아 그것도 허용한다.
export function isValidLink(value) {
  const text = String(value ?? "").trim();
  if (!text) return false;
  return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+([/?#][^\s]*)?$/i.test(text);
}
