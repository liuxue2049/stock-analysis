/**
 * Cloudflare Worker - 股票数据 CORS 代理
 * 部署后可作为 GitHub Pages 的实时数据源
 *
 * 功能:
 *   /api/kline?code=600519   -> 腾讯 K 线数据
 *   /api/quote?code=600519   -> 腾讯实时行情
 *   /api/search?q=茅台        -> 腾讯股票搜索
 *
 * 部署:
 *   1. 注册 https://dash.cloudflare.com/sign-up/workers
 *   2. 新建 Worker, 粘贴本文件内容
 *   3. 部署后记录 URL, 例如: https://stock-proxy.xxx.workers.dev
 *   4. 在 stock-analysis 的 JS 里把 API_BASE 改成这个 URL
 */

const ALLOWED_ORIGINS = [
  'https://your-github-username.github.io',  // 替换为你的 GitHub Pages 域名
  'http://localhost:8080',
  'http://localhost:3000',
  'null',  // file:// 协议
];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-cache',
};

function corsResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

function errorResponse(msg, status = 400) {
  return corsResponse(JSON.stringify({ error: msg }), status);
}

// 腾讯 K 线数据
async function fetchKline(code) {
  if (!/^\d{6}$/.test(code)) throw new Error('股票代码格式错误');
  const symbol = code[0] === '6' || code[0] === '9' ? 'sh' + code : 'sz' + code;
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,180,qfq`;
  const resp = await fetch(url, {
    headers: { 'Referer': 'https://finance.qq.com', 'User-Agent': 'Mozilla/5.0' },
  });
  if (!resp.ok) throw new Error(`腾讯API错误: ${resp.status}`);
  const text = await resp.text();
  return text;
}

// 腾讯实时行情
async function fetchQuote(code) {
  if (!/^\d{6}$/.test(code)) throw new Error('股票代码格式错误');
  const symbol = code[0] === '6' || code[0] === '9' ? 'sh' + code : 'sz' + code;
  const url = `https://qt.gtimg.cn/q=${symbol}`;
  const resp = await fetch(url, {
    headers: { 'Referer': 'https://finance.qq.com', 'User-Agent': 'Mozilla/5.0' },
  });
  if (!resp.ok) throw new Error(`腾讯行情API错误: ${resp.status}`);
  return await resp.text();
}

// 腾讯股票搜索
async function fetchSearch(q) {
  const url = `https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(q)}&t=gp`;
  const resp = await fetch(url, {
    headers: { 'Referer': 'https://finance.qq.com', 'User-Agent': 'Mozilla/5.0' },
  });
  if (!resp.ok) throw new Error(`腾讯搜索API错误: ${resp.status}`);
  return await resp.text();
}

export default {
  async fetch(request, env, ctx) {
    // 处理 CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const code = url.searchParams.get('code') || '';
    const q = url.searchParams.get('q') || '';

    try {
      let body;

      if (path === '/api/kline') {
        body = await fetchKline(code);
        return new Response(body, {
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
        });
      }

      if (path === '/api/quote') {
        body = await fetchQuote(code);
        return new Response(body, {
          headers: { 'Content-Type': 'text/plain; charset=gbk', ...CORS_HEADERS },
        });
      }

      if (path === '/api/search') {
        body = await fetchSearch(q);
        // 腾讯搜索返回的是 text/plain, 可能是 GBK
        return new Response(body, {
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
        });
      }

      return errorResponse('Not Found', 404);
    } catch (e) {
      return errorResponse(e.message, 502);
    }
  },
};
