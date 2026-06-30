import { createRouter, createWebHistory } from 'vue-router'

import SignIn from '../pages/SignIn.vue'
import SignUp from '../pages/SignUp.vue'
import Workspace from '../pages/Workspace.vue'
import WorkspaceLayout from '../layouts/WorkspaceLayout.vue'
import Board from '../pages/Board.vue'
import Calendar from '../pages/Calendar.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/signin' },
    { path: '/signin', component: SignIn },
    { path: '/signup', component: SignUp },
    { path: '/workspaces', component: Workspace },
    {
      path: '/workspaces/:workspaceId',
      component: WorkspaceLayout,
      children: [
        { path: '', redirect: 'board' },
        { path: 'board', component: Board },
        { path: 'calendar', component: Calendar },
      ],
    },
  ],
})

export default router
