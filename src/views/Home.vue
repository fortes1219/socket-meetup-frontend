<template>
  <q-layout view="hHh lpR fFf">
    <q-header elevated>
      <q-toolbar>
        <q-icon name="candlestick_chart" size="sm" />
        <q-toolbar-title>Socket Meetup</q-toolbar-title>
        <q-chip color="positive" text-color="white" icon="sensors">Realtime Ready</q-chip>
      </q-toolbar>
    </q-header>

    <q-page-container>
      <q-page class="home-view">
        <q-card class="home-card">
          <q-card-section>
            <div class="text-h5">Kline Demo</div>
            <div class="text-body2 text-grey-7">Quasar UI 已接入。下一步會串接交易對、歷史 K 線與即時行情。</div>
          </q-card-section>

          <q-separator />

          <q-card-actions align="right">
            <q-btn flat color="primary" icon="refresh" label="重新整理" />
            <q-btn unelevated color="primary" icon="show_chart" label="查看行情" />
          </q-card-actions>
        </q-card>

        <q-banner class="home-banner bg-blue-1 text-primary" rounded>
          <template #avatar>
            <q-icon name="info" />
          </template>
          首頁目前僅作為 Quasar 元件 smoke test。
        </q-banner>
      </q-page>
    </q-page-container>
  </q-layout>
</template>

<style lang="scss" scoped>
.home-view {
  display: grid;
  align-content: start;
  gap: 1rem;
  padding: 2rem;
  background: #f8fafc;
}

.home-card,
.home-banner {
  width: min(100%, 48rem);
  margin-inline: auto;
}
</style>
