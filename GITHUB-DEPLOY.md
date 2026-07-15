# 部署到 GitHub Pages - 去 Python 化指南

## 问题
GitHub Pages 是纯静态托管，无法运行 Python 服务器。股票数据接口（腾讯财经）不支持 CORS，浏览器会拦截请求。

## 解决方案：Cloudflare Worker（免费、无需服务器）

### 第一步：部署 Cloudflare Worker

1. 打开 https://dash.cloudflare.com/sign-up/workers （免费注册）
2. 进入 Workers & Pages → 创建应用 → 新建 Worker
3. 给 Worker 起个名字，例如 `stock-proxy`
4. 把项目根目录 `cloudflare-worker.js` 的**全部内容**粘贴到代码编辑器
5. 点击「部署」
6. 部署成功后会得到一个 URL，例如：
   ```
   https://stock-proxy.xxx.workers.dev
   ```

### 第二步：配置 URL

把上面得到的 Worker URL 填入以下两个文件：

**`stock/signals.html`** 第 13 行：
```js
var WORKER_URL = 'https://stock-proxy.xxx.workers.dev';
```

**`stock/index.html`** 第 13 行：
```js
var WORKER_URL = 'https://stock-proxy.xxx.workers.dev';
```

### 第三步：推送到 GitHub Pages

```bash
git add .
git commit -m "添加Cloudflare Worker支持，去除Python依赖"
git push
```

### 本地开发

本地开发仍然可以用 `run.bat`（Python 服务器），因为代码会自动检测 `localhost` 并使用同源代理。

如果不想用 Python，也可以用 Node.js：
```bash
npx serve . -p 8080
```
但这样需要先把 `WORKER_URL` 填好（因为 `npx serve` 没有 `/api/kline` 代理）。

---

## 验证部署是否成功

部署后访问 `http://localhost:8080/stock/signals.html`，点击「刷新分析」，应该能看到买入/卖出清单。

如果看到「请先部署 Cloudflare Worker」提示，说明 `WORKER_URL` 没填对。

---

## Cloudflare Worker 免费额度

- 每天 100,000 次请求（足够个人使用）
- 无限带宽
- 全球 CDN 加速

如果超出额度，可以考虑：
1. 升级到 Cloudflare Workers 付费版（$5/月，1000万次请求）
2. 使用 Vercel Edge Functions（也有免费额度）
