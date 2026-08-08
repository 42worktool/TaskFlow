// 공개 화면과 인증 화면, 워크스페이스 하위 화면의 URL 구조와 접근 가드를 정의한다.
import { createRouter, createWebHistory } from 'vue-router'

import SignIn from '../pages/SignIn.vue'
import SignUp from '../pages/SignUp.vue'
import Workspace from '../pages/Workspace.vue'
import WorkspaceLayout from '../layouts/WorkspaceLayout.vue'
import Board from '../pages/Board.vue'
import Calendar from '../pages/Calendar.vue'
import Dashboard from '../pages/Dashboard.vue'
import Search from '../pages/Search.vue'
import AccountRoute from '../pages/AccountRoute.vue'
import Profile from '../pages/Profile.vue'
import PrivacyPolicy from '../pages/PrivacyPolicy.vue'
import TermsOfService from '../pages/TermsOfService.vue'
import AcceptInvite from '../pages/AcceptInvite.vue'
import { authState, initializeAuth } from '../services/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/signin' },
    { path: '/signin', component: SignIn },
    { path: '/signup', component: SignUp },
    { path: '/privacy', component: PrivacyPolicy },
    { path: '/terms', component: TermsOfService },
    { path: '/account', component: AccountRoute, meta: { requiresAuth: true } },
    { path: '/profiles/:userId', component: Profile },
    {
      path: '/friends',
      redirect: { path: '/workspaces', query: { messenger: 'friends' } },
    },
    { path: '/workspaces', component: Workspace, meta: { requiresAuth: true } },
    { path: '/invite/:token', component: AcceptInvite, meta: { requiresAuth: true } },
    { path: '/search', component: Search, meta: { requiresAuth: true } },
    {
      path: '/workspaces/:workspaceId',
      component: WorkspaceLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', redirect: '/' },
        { path: 'board', component: Board },
        { path: 'calendar', component: Calendar },
        { path: 'dashboard', component: Dashboard },
        {
          path: 'chat',
          // 채팅은 독립 콘텐츠가 아니라 보드 위 메신저이므로 기존 URL은 보드+패널 상태로 보정한다.
          redirect: (to) => ({
            path: `/workspaces/${String(to.params.workspaceId)}/board`,
            query: { messenger: 'chat' },
          }),
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  // refresh cookie 확인이 끝나기 전에 리다이렉트하면 로그인 사용자가 잠깐 튕기므로 먼저 초기화한다.
  await initializeAuth()

  if (to.meta.requiresAuth && !authState.user) {
    // 로그인 뒤 원래 작업으로 돌아갈 수 있도록 전체 경로를 redirect query에 보존한다.
    return {
      path: '/signin',
      query: { redirect: to.fullPath },
    }
  }

  if ((to.path === '/signin' || to.path === '/signup') && authState.user) {
    return '/workspaces'
  }

  return true
})

export default router
