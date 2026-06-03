import '@quasar/extras/material-icons/material-icons.css';
import 'quasar/src/css/index.sass';
import { createApp } from 'vue';
import { Quasar } from 'quasar';
import { createPinia } from 'pinia';
import { VueQueryPlugin } from '@tanstack/vue-query';
import App from './App.vue';
import router from './router';
import { queryClient } from '@/queries/query-client';
import './styles/main.scss';

createApp(App).use(Quasar).use(createPinia()).use(VueQueryPlugin, { queryClient }).use(router).mount('#app');
