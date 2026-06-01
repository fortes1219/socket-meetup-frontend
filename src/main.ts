import '@quasar/extras/material-icons/material-icons.css';
import 'quasar/src/css/index.sass';
import { createApp } from 'vue';
import { Quasar } from 'quasar';
import App from './App.vue';
import router from './router';
import './styles/main.scss';

createApp(App).use(Quasar).use(router).mount('#app');
