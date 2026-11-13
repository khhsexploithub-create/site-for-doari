// 신청 항목별 자동승인 설정.
//
// settings/reservationAutoApproval 문서 하나에 { items: { "<항목 이름>": true } } 로 담는다.
//  - 문서가 없거나 항목이 없거나 false 이면 자동승인이 꺼진 것이다. (기본값은 항상 '승인 대기')
//  - 켜고 끄는 것은 관리자만 할 수 있다. 읽기는 로그인한 구성원이 모두 할 수 있다.
//  - 이미 접수된 신청은 바꾸지 않는다. 설정을 바꾼 뒤의 신규 신청부터 적용된다.
//  - 클라이언트가 승인 상태를 마음대로 정하지 못하도록, 같은 설정을 firestore.rules 가 다시 확인한다.

import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

import { db } from "../firebase.js";

export const AUTO_APPROVAL_COLLECTION = "settings";
export const AUTO_APPROVAL_DOC_ID = "reservationAutoApproval";

function settingReference() {
  return doc(db, AUTO_APPROVAL_COLLECTION, AUTO_APPROVAL_DOC_ID);
}

// 켜진 항목 이름만 담은 객체를 돌려준다. 읽지 못하면 모두 꺼진 것으로 본다.
export async function getAutoApprovalItems() {
  try {
    const snapshot = await getDoc(settingReference());
    const items = snapshot.exists() ? snapshot.data()?.items : null;

    if (!items || typeof items !== "object") return {};

    return Object.fromEntries(
      Object.entries(items).filter(([, enabled]) => enabled === true)
    );
  } catch (error) {
    console.error("자동승인 설정 조회 오류:", error);
    return {};
  }
}

export function isAutoApprovalOn(items, resourceName) {
  return items?.[resourceName] === true;
}

// 관리자 전용. items 는 { 항목 이름: true } 이고, 꺼진 항목은 담지 않는다.
export async function saveAutoApprovalItems(items, uid) {
  const enabled = Object.fromEntries(
    Object.entries(items).filter(([, value]) => value === true)
  );

  await setDoc(settingReference(), {
    items: enabled,
    updatedAt: serverTimestamp(),
    updatedBy: uid ?? ""
  });

  return enabled;
}
