/**
 * API 配置 - 股票数据代理地址
 *
 * 本地开发 (localhost): 留空, 使用同源 /api/kline (server.py)
 * GitHub Pages: 填写你部署的 Cloudflare Worker URL
 *
 * 如何部署 Cloudflare Worker:
 *   1. 注册 https://dash.cloudflare.com/sign-up/workers (免费)
 *   2. 新建 Worker, 把项目根目录的 cloudflare-worker.js 内容粘贴进去
 *   3. 部署, 复制 Worker URL (例如 https://stock-proxy.xxx.workers.dev)
 *   4. 把下面 API_BASE 改成你的 Worker URL
 */
var API_BASE = '';

// 自动检测: localhost 用同源, 否则用 Worker (如果已配置)
(function autoDetect() {
  var isLocal = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  if (isLocal) {
    API_BASE = '';  // 本地: 同源代理
  }
  // GitHub Pages 上需要手动填写上面的 Worker URL
})();
