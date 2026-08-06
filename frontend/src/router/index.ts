import { createRouter, createWebHistory } from 'vue-router'

import SignIn from '../pages/SignIn.vue'
import SignUp from '../pages/SignUp.vue'
import Workspace from '../pages/Workspace.vue'
import WorkspaceLayout from '../layouts/WorkspaceLayout.vue'
import Board from '../pages/Board.vue'
import Calendar from '../pages/Calendar.vue'
import Dashboard from '../pages/Dashboard.vue'
import Search from '../pages/Search.vue'
import Account from '../pages/Account.vue'
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
    { path: '/account', component: Account, meta: { requiresAuth: true } },
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
        { path: '', redirect: 'board' },
        { path: 'board', component: Board },
        { path: 'calendar', component: Calendar },
        { path: 'dashboard', component: Dashboard },
        {
          path: 'chat',
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
  await initializeAuth()

  if (to.meta.requiresAuth && !authState.user) {
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
