import { defineStore } from 'pinia';
import { browserLeaderAdapters } from '@/service/leader/adapters';
import { createLeaderCoordinator } from '@/service/leader/leader-coordinator-core';

/** Leader election BroadcastChannel（app prefix，避免同 origin 其他頁面碰撞）。 */
const LEADER_CHANNEL = 'socket-meetup:leader';

/**
 * Leader coordinator store：純選舉身份來源（IoC）。
 * 只是把 election core 綁上真實 browser adapters；election 邏輯與測試都在 core。
 * 不得在此 import socket / queryClient / control-coordinator。
 */
export const useLeaderCoordinatorStore = defineStore('leader-coordinator', () =>
  createLeaderCoordinator(browserLeaderAdapters(LEADER_CHANNEL))
);
