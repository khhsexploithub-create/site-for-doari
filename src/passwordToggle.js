// 비밀번호 입력칸 옆의 눈 버튼.
// 누르면 입력한 글자가 보이고, 다시 누르면 가려진다.

const EYE_OPEN = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M1.8 12S5.4 5.4 12 5.4 22.2 12 22.2 12 18.6 18.6 12 18.6 1.8 12 1.8 12Z" />
    <circle cx="12" cy="12" r="3.2" />
  </svg>
`;

const EYE_CLOSED = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M1.8 12S5.4 5.4 12 5.4c1.5 0 2.9.3 4.1.9M20 8.5c1.4 1.7 2.2 3.5 2.2 3.5S18.6 18.6 12 18.6c-1.7 0-3.2-.4-4.5-1" />
    <path d="M9.8 9.8a3.2 3.2 0 0 0 4.4 4.4" />
    <path d="M3.5 3.5l17 17" />
  </svg>
`;

// button 은 입력칸 옆에 미리 놓아둔 빈 버튼이다.
export function setupPasswordToggle(input, button) {
  if (!input || !button) return;

  const apply = (shouldShow) => {
    input.type = shouldShow ? "text" : "password";
    button.innerHTML = shouldShow ? EYE_CLOSED : EYE_OPEN;
    button.setAttribute("aria-pressed", String(shouldShow));
    button.setAttribute("aria-label", shouldShow ? "비밀번호 숨기기" : "비밀번호 표시");
    button.title = shouldShow ? "비밀번호 숨기기" : "비밀번호 표시";
  };

  button.type = "button";
  apply(false);

  button.addEventListener("click", () => {
    const shouldShow = input.type === "password";
    apply(shouldShow);

    // 보기/숨기기를 눌러도 쓰던 자리에 그대로 커서를 둔다.
    const caret = input.value.length;
    input.focus({ preventScroll: true });
    input.setSelectionRange?.(caret, caret);
  });
}
