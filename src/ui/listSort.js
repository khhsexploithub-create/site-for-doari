// 목록 정렬 공통 도구. 파일 탐색기처럼 최신순 · 오래된순 · 제목순을 고르고,
// 과제는 마감 임박순도 고른다. 고른 방식은 목록마다 브라우저에 기억한다.

export const SORT_NEWEST = "newest";
export const SORT_OLDEST = "oldest";
export const SORT_TITLE = "title";
export const SORT_DUE = "due";

const LABELS = {
  [SORT_NEWEST]: "최신순",
  [SORT_OLDEST]: "오래된순",
  [SORT_TITLE]: "제목순",
  [SORT_DUE]: "마감 임박순"
};

export const BASIC_SORT_OPTIONS = [SORT_NEWEST, SORT_OLDEST, SORT_TITLE];
export const ASSIGNMENT_SORT_OPTIONS = [...BASIC_SORT_OPTIONS, SORT_DUE];

const STORAGE_PREFIX = "dongari.sort.";

function readStored(key) {
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + key);
  } catch {
    return null;
  }
}

function writeStored(key, value) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, value);
  } catch {
    // 저장이 막힌 브라우저에서는 이번 화면에서만 유지된다.
  }
}

// <select> 에 정렬 방식을 채우고, 바꿀 때마다 기억한다.
// 돌려주는 객체의 value() 가 지금 고른 방식이다.
export function bindSortSelect(select, { storageKey, options = BASIC_SORT_OPTIONS, onChange }) {
  const defaultValue = SORT_NEWEST;

  select.textContent = "";
  options.forEach((value) => select.appendChild(new Option(LABELS[value], value)));

  const stored = readStored(storageKey);
  select.value = options.includes(stored) ? stored : defaultValue;

  select.addEventListener("change", () => {
    if (!options.includes(select.value)) select.value = defaultValue;
    writeStored(storageKey, select.value);
    onChange?.(select.value);
  });

  return { value: () => (options.includes(select.value) ? select.value : defaultValue) };
}

export function toTime(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value.toMillis === "function") return value.toMillis();

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareTitle(first, second) {
  return String(first ?? "").localeCompare(String(second ?? ""), "ko-KR", {
    numeric: true,
    sensitivity: "base"
  });
}

// items 를 고른 방식으로 정렬한 새 배열을 돌려준다. (원본은 건드리지 않는다)
// 같은 값이면 최신 글이 먼저 오도록 하고, 그래도 같으면 번호로 순서를 고정한다.
//
// accessors
//   created(item) : 작성 시각   title(item) : 제목   due(item) : 마감 시각 (마감 임박순에만 필요)
export function sortItems(items, mode, { created, title, due, now = Date.now() }) {
  const byNewest = (first, second) => toTime(created(second)) - toTime(created(first))
    || String(first.id ?? "").localeCompare(String(second.id ?? ""));

  const comparators = {
    [SORT_NEWEST]: byNewest,
    [SORT_OLDEST]: (first, second) => toTime(created(first)) - toTime(created(second))
      || String(first.id ?? "").localeCompare(String(second.id ?? "")),
    [SORT_TITLE]: (first, second) => compareTitle(title(first), title(second)) || byNewest(first, second),
    // 아직 마감되지 않은 과제를 마감이 가까운 순으로, 이미 마감된 과제는 그 뒤에 최근 마감부터.
    [SORT_DUE]: (first, second) => {
      const firstDue = toTime(due?.(first));
      const secondDue = toTime(due?.(second));
      const firstOpen = firstDue === 0 || firstDue >= now;
      const secondOpen = secondDue === 0 || secondDue >= now;

      if (firstOpen !== secondOpen) return firstOpen ? -1 : 1;

      if (firstOpen) {
        // 마감 시각이 없는 과제는 열린 과제의 맨 뒤로 보낸다.
        const firstKey = firstDue || Number.MAX_SAFE_INTEGER;
        const secondKey = secondDue || Number.MAX_SAFE_INTEGER;
        return firstKey - secondKey || byNewest(first, second);
      }

      return secondDue - firstDue || byNewest(first, second);
    }
  };

  return [...items].sort(comparators[mode] ?? byNewest);
}

// 순번은 정렬 방식과 상관없이 글마다 고정한다. 가장 먼저 올라온 글이 1번이다.
export function buildSerialNumbers(items, created) {
  const serials = new Map();

  [...items]
    .sort((first, second) => toTime(created(first)) - toTime(created(second))
      || String(first.id ?? "").localeCompare(String(second.id ?? "")))
    .forEach((item, index) => serials.set(item.id, index + 1));

  return serials;
}
