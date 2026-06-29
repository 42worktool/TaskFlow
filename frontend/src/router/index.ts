import { createRouter, createWebHistory } from 'vue-router'

import SignIn from '../pages/SignIn.vue'
import SignUp from '../pages/SignUp.vue'
import Workspace from '../pages/Workspace.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/signin' },
    { path: '/signin', component: SignIn },
    { path: '/signup', component: SignUp },
    { path: '/workspaces', component: Workspace },
  ],
})

export default router
