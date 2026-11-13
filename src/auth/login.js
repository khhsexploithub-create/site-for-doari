import "../styles/site.css";
import "../styles/neoul/account.css";

import { onAuthStateChanged } from "firebase/auth";

import { auth } from "../firebase.js";
import { setupPasswordToggle } from "../passwordToggle.js";
import { getAuthErrorMessage, readNextUrl, signIn } from "./authService.js";

const form = document.querySelector("#loginForm");
const emailInput = document.querySelector("#loginEmail");
const passwordInput = document.querySelector("#loginPassword");
const passwordToggle = document.querySelector("#loginPasswordToggle");
const submitButton = document.querySelector("#loginSubmitButton");
const message = document.querySelector("#loginMessage");
const signUpLink = document.querySelector("#goToSignUp");

const nextUrl = readNextUrl();
let isSubmitting = false;

setupPasswordToggle(passwordInput, passwordToggle);

// 회원가입을 마친 뒤에도 원래 가려던 곳으로 돌아가게 한다.
signUpLink.href = `/signup.html?next=${encodeURIComponent(nextUrl)}`;

// 이미 로그인한 상태로 들어오면 곧바로 돌려보낸다.
onAuthStateChanged(auth, (user) => {
  if (user) window.location.replace(nextUrl);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSubmitting) return;

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    message.textContent = "이메일과 비밀번호를 모두 입력해주세요.";
    return;
  }

  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = "로그인 중...";
  message.textContent = "";

  try {
    await signIn(email, password);
    window.location.replace(nextUrl);
  } catch (error) {
    console.error("로그인 오류:", error);
    message.textContent = getAuthErrorMessage(error.code);
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = "로그인";
  }
});
