import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// 주소를 깔끔하게 쓰기 위한 재작성 규칙.
// 실제 서비스에서는 firebase.json 의 rewrites 가 같은 일을 하고,
// 이 플러그인은 개발 서버(npm run dev)와 미리보기(npm run preview)용이다.
// firebase.json 을 고치면 여기도 함께 고쳐야 한다.
const ROUTES = [
  { pattern: /^\/activity\/assignment\/[^/]+\/?$/, file: '/assignment-detail.html' },
  { pattern: /^\/activity\/submit\/[^/]+\/?$/, file: '/submission-form.html' },
  { pattern: /^\/activity\/submission\/[^/]+\/[^/]+\/?$/, file: '/submission-detail.html' },
  { pattern: /^\/activity\/(?:notice\/)?[^/]+\/?$/, file: '/activity-detail.html' },
  { pattern: /^\/event\/[^/]+\/?$/, file: '/event-detail.html' },
]

function cleanUrlRoutes() {
  const rewrite = (request, _response, next) => {
    const path = (request.url ?? '').split('?')[0]
    const route = ROUTES.find(({ pattern }) => pattern.test(path))

    if (route) {
      request.url = route.file
    }

    next()
  }

  // 훅에서 값을 돌려주면 vite 가 그것을 후처리 훅으로 다시 부르므로,
  // use() 의 반환값이 새어나가지 않도록 중괄호로 감싼다.
  return {
    name: 'clean-url-routes',
    configureServer(server) {
      server.middlewares.use(rewrite)
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite)
    }
  }
}

export default defineConfig({
  plugins: [cleanUrlRoutes()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin.html'),
        budget: resolve(import.meta.dirname, 'budget.html'),
        activity: resolve(import.meta.dirname, 'activity.html'),
        activityDetail: resolve(import.meta.dirname, 'activity-detail.html'),
        assignmentDetail: resolve(import.meta.dirname, 'assignment-detail.html'),
        submissionDetail: resolve(import.meta.dirname, 'submission-detail.html'),
        submissionForm: resolve(import.meta.dirname, 'submission-form.html'),
        resources: resolve(import.meta.dirname, 'resources.html'),
        calendar: resolve(import.meta.dirname, 'calendar.html'),
        eventDetail: resolve(import.meta.dirname, 'event-detail.html'),
        subcommittee: resolve(import.meta.dirname, 'subcommittee.html'),
        unionEvents: resolve(import.meta.dirname, 'union-events.html'),
        notices: resolve(import.meta.dirname, 'notices.html'),
        login: resolve(import.meta.dirname, 'login.html'),
        signup: resolve(import.meta.dirname, 'signup.html')
      }
    }
  }
})
