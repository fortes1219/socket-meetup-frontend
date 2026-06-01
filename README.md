# Socket Meetup Frontend

Socket meetup demo 的 Vue 前端專案。

## 開發指令

```bash
npm run dev
npm run build
```

目前入口路由為 `/`，對應 `src/views/Home.vue`。

## Docker

```bash
docker build -t socket-meetup-frontend .
docker run --rm -p 8080:80 socket-meetup-frontend
```
