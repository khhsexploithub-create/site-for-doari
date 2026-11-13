import "./style.css";

import {
  createApplication
} from "./applicationService.js";


const form =
  document.querySelector("#applicationForm");

const submitButton =
  document.querySelector("#submitButton");

const resultMessage =
  document.querySelector("#resultMessage");


form.addEventListener(
  "submit",
  async (event) => {

    // 페이지 새로고침 방지
    event.preventDefault();


    const name =
      document.querySelector("#name").value;

    const category =
      document.querySelector("#category").value;

    const message =
      document.querySelector("#message").value;


    // 신청 중 중복 클릭 방지
    submitButton.disabled = true;

    submitButton.textContent =
      "신청 중...";

    resultMessage.textContent = "";


    try {

      await createApplication(
        name,
        category,
        message
      );


      resultMessage.textContent =
        "신청이 완료되었습니다.";

      form.reset();


    } catch (error) {

      console.error(error);

      resultMessage.textContent =
        "신청 중 오류가 발생했습니다.";

    } finally {

      submitButton.disabled = false;

      submitButton.textContent =
        "신청하기";

    }

  }
);