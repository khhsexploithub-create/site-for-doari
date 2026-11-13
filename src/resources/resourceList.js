export const PRINTER_RESOURCE_NAME = "3D 프린터";

export const PRINTER_TRAINING_MESSAGE =
  "3D 프린터 사용을 위한 교육이 필요합니다. 교육 이수가 완료되었다면, 자격 습득을 위해 팀즈에서 '26-20721 윤해준'으로 문의해주세요. 교육 참여는 송요한 선생님께 문의해주세요.";

// 공간 예약은 신청 즉시 사용이 확정되는 구조가 아니다.
export const SPACE_RESERVATION_NOTICE =
  "공간은 신청한다고 바로 사용할 수 있는 것이 아닙니다. 신청 내용을 선생님께서 확인하신 뒤 해당 교실 담당 선생님께 전달드리고, 승인이 된 다음에 사용할 수 있습니다. 여유 있게 미리 신청해주세요.";

const space = (
  floor,
  name,
  description = "동아리 활동과 모임에 사용할 수 있는 공간",
  options = {}
) => ({
  category: "공간",
  floor,
  name: `${floor} · ${name}`,
  description,
  ...options
});

// 예약 신청을 받을 수 있는 자원만 담는다.
// (평면도에만 보이고 예약은 할 수 없는 교실·시설은 FLOOR_PLANS 에서 처리한다.)
export const resourceList = [
  space("5층", "컴퓨터실", "PC 작업과 코딩 활동을 위한 공간"),

  space("4층", "2-3 교실"),
  space("4층", "2-2 교실"),
  space("4층", "2-1 교실"),
  space("4층", "1-1 교실"),
  space("4층", "1-2 교실"),
  space("4층", "1-3 교실"),

  space("3층", "세미나실", "회의, 토론과 소규모 발표를 위한 공간"),
  space("3층", "2-8 교실"),
  space("3층", "2-7 교실"),
  space("3층", "2-6 교실"),
  space("3층", "2-5 교실"),

  space("1층", "다산실", "물리·지구과학 실험과 탐구 활동을 위한 공간"),
  space("1층", "화학실", "화학 실험과 탐구 활동을 위한 공간"),

  {
    category: "장비",
    name: PRINTER_RESOURCE_NAME,
    description: "사전 교육을 이수한 계정만 예약할 수 있는 3D 프린터",
    requiresTraining: true
  },
  { category: "장비", name: "노트북", description: "발표, 문서 작업과 동아리 활동에 사용할 수 있는 노트북" },
  { category: "장비", name: "스탠바이미", description: "이동식 스크린. 부스, 발표와 상영에 사용할 수 있습니다." },

  { category: "물품", name: "콘센트", description: "부스와 행사장에서 전원을 끌어올 때 사용하는 콘센트" },
  { category: "물품", name: "이젤", description: "패널과 작품을 세워 전시할 때 사용하는 이젤" },
  { category: "물품", name: "판넬", description: "포스터와 작품 전시에 사용할 수 있는 판넬" }
];
