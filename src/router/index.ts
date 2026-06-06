import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: () => import('@/views/home/Home.vue')
    },
    {
      path: '/manage/trading-pairs',
      name: 'AdminTradingPairs',
      component: () => import('@/views/admin-trading-pairs/AdminTradingPairs.vue')
    }
  ]
});

export default router;
