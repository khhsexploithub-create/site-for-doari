import "../styles/site.css";
import "../styles/neoul/account.css";

import { createClubChoiceGroup } from "../clubList.js";
import { setupPasswordToggle } from "../passwordToggle.js";
import { describeStudentId, isValidStudentId } from "../userRole.js";
import { getAuthErrorMessage, readNextUrl, signUp } from "./authService.js";

const form = document.querySelector("#signUpForm");
const studentIdInput = document.querySelector("#signUpStudentId");
const studentIdHint = document.querySelector("#studentIdHint");
const nameInput = document.querySelector("#signUpName");
const clubPickerSlot = document.querySelector("#signUpClubPicker");
const emailInput = document.querySelector("#signUpEmail");
const passwordInput = document.querySelector("#signUpPassword");
const passwordToggle = document.querySelector("#signUpPasswordToggle");
const passwordConfirmInput = document.querySelector("#signUpPasswordConfirm");
const passwordConfirmToggle = document.querySelector("#signUpPasswordConfirmToggle");
const submitButton = document.querySelector("#signUpSubmitButton");
const message = document.querySelector("#signUpMessage");

const nextUrl = readNextUrl();
let isSubmitting = false;

// 소속 동아리는 한 곳만 고른다.
const clubPicker = createClubChoiceGroup({
  name: "소속 동아리",
  onChange: () => { message.textContent = ""; }
});
clubPickerSlot.appendChild(clubPicker.element);

setupPasswordToggle(passwordInput, passwordToggle);
setupPasswordToggle(passwordConfirmInput, passwordConfirmToggle);

// 학번 칸에는 숫자만, 다섯 자리까지만 들어가게 한다.
studentIdInput.addEventListener("input", () => {
  const digitsOnly = studentIdInput.value.replace(/\D/g, "").slice(0, 5);

  if (studentIdInput.value !== digitsOnly) {
    studentIdInput.value = digitsOnly;
  }

  updateStudentIdHint();
});

function updateStudentIdHint() {
  const value = studentIdInput.value;

  if (!value) {
    studentIdHint.textContent = "학년·반·번호를 붙여 다섯 자리로 입력하세요.";
    studentIdHint.classList.remove("is-error", "is-ok");
    return;
  }

  if (isValidStudentId(value)) {
    studentIdHint.textContent = describeStudentId(value);
    studentIdHint.classList.remove("is-error");
    studentIdHint.classList.add("is-ok");
    return;
  }

  studentIdHint.textContent = `숫자 5자리가 필요합니다. (현재 ${value.length}자리)`;
  studentIdHint.classList.remove("is-ok");
  studentIdHint.classList.add("is-error");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSubmitting) return;

  const studentId = studentIdInput.value.trim();
  const name = nameInput.value.trim();
  const club = clubPicker.getSelected();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const passwordConfirm = passwordConfirmInput.value;

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

  if (!club) {
    message.textContent = "소속 동아리를 골라주세요.";
    clubPickerSlot.scrollIntoView({ block: "center" });
    return;
  }

  if (!email) {
    message.textContent = "이메일을 입력해주세요.";
    emailInput.focus();
    return;
  }

  if (password.length < 6) {
    message.textContent = "비밀번호는 6자 이상으로 입력해주세요.";
    passwordInput.focus();
    return;
  }

  if (password !== passwordConfirm) {
    message.textContent = "비밀번호가 서로 다릅니다. 다시 확인해주세요.";
    passwordConfirmInput.focus();
    passwordConfirmInput.select();
    return;
  }

  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = "가입 중...";
  message.textContent = "";

  try {
    await signUp({ email, password, studentId, name, clubs: [club] });
    window.location.replace(nextUrl);
  } catch (error) {
    console.error("회원가입 오류:", error);
    message.textContent = getAuthErrorMessage(error.code);
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = "회원가입";
  }
});
