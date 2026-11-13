export const PRINTER_RESOURCE_NAME = "3D 프린터";

export const PRINTER_TRAINING_MESSAGE =
  "3D 프린터 사용을 위한 교육이 필요합니다. 교육 이수가 완료되었다면, 자격 습득을 위해 팀즈에서 '26-20721 윤해준'으로 문의해주세요. 교육 참여는 송요한 선생님께 문의해주세요.";

export const resourceList = [
  { category: "공간", name: "화학실", description: "실험 및 화학 관련 동아리 활동 공간" },
  { category: "공간", name: "다산실", description: "회의와 소규모 발표에 적합한 공간" },
  { category: "공간", name: "컴퓨터실", description: "PC 작업과 코딩 활동을 위한 공간" },
  { category: "공간", name: "일반 교실", description: "일반적인 동아리 모임과 활동에 사용하는 교실" },
  { category: "장비", name: "빔프로젝터", description: "발표 및 영상 상영용 프로젝터" },
  { category: "장비", name: "무선 마이크 세트", description: "행사용 무선 마이크 4개 세트" },
  { category: "장비", name: "접이식 음향 스피커", description: "소규모 행사에 사용할 수 있는 이동형 스피커" },
  {
    category: "장비",
    name: PRINTER_RESOURCE_NAME,
    description: "사전 교육을 이수한 계정만 예약할 수 있는 3D 프린터",
    requiresTraining: true
  },
  { category: "물품", name: "접이식 테이블", description: "부스와 회의에 사용할 수 있는 테이블" },
  { category: "물품", name: "행사용 의자", description: "행사 관람 및 진행용 의자" },
  { category: "물품", name: "전시 패널", description: "포스터와 작품 전시에 사용할 수 있는 패널" }
];
