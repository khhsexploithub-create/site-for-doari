// 항목별로 '아직 읽지 않은 새 정보'가 몇 개인지 세어서 알려준다.
//
//  notices     : 새로 올라온 공지
//  unionEvents : 새로 등록된 연합회 행사
//  budget      : 내가 낸 예산 신청의 처리 상태가 바뀐 것
//  resources   : 내가 낸 자원 예약의 처리 상태가 바뀐 것
//
// 기준 시각은 users/{uid}/readState 에 저장된 '마지막으로 읽은 시각'이다.
// 한 번도 읽은 적이 없으면 계정을 만든 시각을 기준으로 삼아,
// 가입하기 전에 올라온 글까지 새 글로 보이지 않게 한다.

import { collection, onSnapshot, query, where } from "firebase/firestore";

import { db } from "../firebase.js";
import { NOTICES_COLLECTION } from "../notices/noticeService.js";
import { UNION_EVENTS_COLLECTION } from "../unionEvents/unionEventService.js";
import { getBaseline, subscribeToReadState, toMillis } from "./readState.js";

const EMPTY_COUNTS = { notices: 0, unionEvents: 0, budget: 0, resources: 0, total: 0 };

export function watchNotifications(user, onUpdate) {
  if (!user) {
    onUpdate({ ...EMPTY_COUNTS });
    return () => {};
  }

  const accountCreatedAt = toMillis(user.metadata?.creationTime);

  let lastReadAt = {};
  let notices = [];
  let unionEvents = [];
  let budgetRequests = [];
  let reservations = [];

  const publish = () => {
    const counts = {
      notices: countNewerThan(notices, "createdAt", getBaseline(lastReadAt, "notices", accountCreatedAt)),
      unionEvents: countNewerThan(unionEvents, "createdAt", getBaseline(lastReadAt, "unionEvents", accountCreatedAt)),
      budget: countNewerThan(budgetRequests, "reviewedAt", getBaseline(lastReadAt, "budget", accountCreatedAt)),
      resources: countNewerThan(reservations, "reviewedAt", getBaseline(lastReadAt, "resources", accountCreatedAt))
    };

    counts.total = counts.notices + counts.unionEvents + counts.budget + counts.resources;
    onUpdate(counts);
  };

  const unsubscribers = [
    subscribeToReadState(user.uid, (nextLastReadAt) => {
      lastReadAt = nextLastReadAt;
      publish();
    }),

    watchCollection(collection(db, NOTICES_COLLECTION), (documents) => {
      notices = documents;
      publish();
    }),

    watchCollection(collection(db, UNION_EVENTS_COLLECTION), (documents) => {
      unionEvents = documents;
      publish();
    }),

    watchCollection(
      query(collection(db, "budgetRequests"), where("requesterUid", "==", user.uid)),
      (documents) => {
        budgetRequests = documents;
        publish();
      }
    ),

    watchCollection(
      query(collection(db, "resourceReservations"), where("uid", "==", user.uid)),
      (documents) => {
        reservations = documents;
        publish();
      }
    )
  ];

  publish();

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe?.());
}

// ========================================
// 홈 '새 알림' 칸에 보여줄 목록
// ========================================
//
// 새 공지 · 연합회 행사 · 내 예산/자원 예약 처리 결과를 시간순으로 모아 준다.
// 로그인하지 않았으면 누구나 볼 수 있는 공지와 행사만 보여주고 '읽음' 표시는 하지 않는다.
// onUpdate({ items, unreadCount, isSignedIn })

const BUDGET_STATUS_NAME = { approved: "전체 승인", partial: "일부 승인", rejected: "반려", pending: "승인 대기" };
const RESERVATION_STATUS_NAME = { approved: "승인", rejected: "반려", completed: "사용 완료", pending: "승인 대기" };

export function watchNotificationFeed(user, onUpdate, { limit = 3 } = {}) {
  const accountCreatedAt = toMillis(user?.metadata?.creationTime);

  let lastReadAt = {};
  let notices = [];
  let unionEvents = [];
  let budgetRequests = [];
  let reservations = [];

  const publish = () => {
    const baseline = (section) =>
      user ? getBaseline(lastReadAt, section, accountCreatedAt) : Number.POSITIVE_INFINITY;

    const items = [
      ...notices.map((notice) => ({
        section: "notices",
        time: toMillis(notice.createdAt),
        tag: notice.category === "urgent" ? "긴급 공지" : "공지",
        tone: notice.category === "urgent" ? "urgent" : notice.category === "event" ? "event" : "",
        title: notice.title || "제목 없음",
        meta: notice.authorName || "연합회",
        href: "/notices.html"
      })),
      ...unionEvents.map((unionEvent) => ({
        section: "unionEvents",
        time: toMillis(unionEvent.createdAt),
        tag: "연합회 행사",
        tone: "event",
        title: unionEvent.title || "행사",
        meta: [unionEvent.date, unionEvent.location].filter(Boolean).join(" · "),
        href: "/union-events.html"
      })),
      ...budgetRequests
        .filter((request) => toMillis(request.reviewedAt) > 0)
        .map((request) => ({
          section: "budget",
          time: toMillis(request.reviewedAt),
          tag: "예산 처리 결과",
          tone: "result",
          title: `${request.clubName ?? ""} 예산 신청 · ${BUDGET_STATUS_NAME[request.status] ?? "처리됨"}`.trim(),
          meta: "품목별 결과 확인하기",
          href: "/budget.html"
        })),
      ...reservations
        .filter((reservation) => toMillis(reservation.reviewedAt) > 0)
        .map((reservation) => ({
          section: "resources",
          time: toMillis(reservation.reviewedAt),
          tag: "자원 예약",
          tone: "result",
          title: `${reservation.resourceName ?? "자원"} · ${RESERVATION_STATUS_NAME[reservation.status] ?? "처리됨"}`,
          meta: [reservation.date, reservation.startTime && `${reservation.startTime}~${reservation.endTime ?? ""}`]
            .filter(Boolean)
            .join(" "),
          href: "/resources.html"
        }))
    ]
      .filter((item) => item.time > 0)
      .map((item) => ({ ...item, unread: item.time > baseline(item.section) }))
      .sort((first, second) => second.time - first.time);

    onUpdate({
      items: items.slice(0, limit),
      unreadCount: items.filter((item) => item.unread).length,
      isSignedIn: Boolean(user)
    });
  };

  const unsubscribers = [
    watchCollection(collection(db, NOTICES_COLLECTION), (documents) => {
      notices = documents;
      publish();
    }),
    watchCollection(collection(db, UNION_EVENTS_COLLECTION), (documents) => {
      unionEvents = documents;
      publish();
    })
  ];

  if (user) {
    unsubscribers.push(
      subscribeToReadState(user.uid, (nextLastReadAt) => {
        lastReadAt = nextLastReadAt;
        publish();
      }),
      watchCollection(
        query(collection(db, "budgetRequests"), where("requesterUid", "==", user.uid)),
        (documents) => {
          budgetRequests = documents;
          publish();
        }
      ),
      watchCollection(
        query(collection(db, "resourceReservations"), where("uid", "==", user.uid)),
        (documents) => {
          reservations = documents;
          publish();
        }
      )
    );
  }

  return () => unsubscribers.forEach((unsubscribe) => unsubscribe?.());
}

function watchCollection(reference, onDocuments) {
  return onSnapshot(
    reference,
    (snapshot) => onDocuments(snapshot.docs.map((document) => document.data())),
    (error) => {
      // 권한이 없거나 아직 컬렉션이 없을 수 있다. 알림은 부가 기능이므로 조용히 넘긴다.
      console.error("알림 조회 오류:", error);
      onDocuments([]);
    }
  );
}

function countNewerThan(documents, field, baselineMillis) {
  return documents.filter((document) => {
    const time = toMillis(document?.[field]);
    return time > 0 && time > baselineMillis;
  }).length;
}
