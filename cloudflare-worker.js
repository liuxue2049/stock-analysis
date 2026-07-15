/**
 * Cloudflare Worker - 股票数据 + 高德地图 API 代理
 *
 * 功能:
 *   /api/kline?code=600519    -> 腾讯 K 线数据
 *   /api/quote?code=600519    -> 腾讯实时行情
 *   /api/search?q=茅台         -> 腾讯股票搜索
 *   /api/amap/config          -> 返回高德 Key（从环境变量读取，不暴露在源码中）
 *   /api/chat                 -> 智谱 AI 对话代理（流式/非流式）
 *
 * 环境变量（在 Cloudflare Dashboard → Worker → Settings → Variables 中设置）:
 *   AMAP_KEY       - 高德 Web 服务 Key
 *   AMAP_SEC       - 高德安全密钥
 *   ZHIPU_API_KEY  - 智谱 AI API Key
 *   ALLOWED_ORIGIN - 你的 GitHub Pages 域名（如 https://xxx.github.io）
 *
 * 部署:
 *   1. 在 Cloudflare Dashboard 添加上述环境变量
 *   2. 重新部署本文件
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const origin = request.headers.get('Origin') || '';

    // 允许的来源（环境变量 > 默认列表）
    let allowedOrigins = [];
    if (env.ALLOWED_ORIGIN) {
      allowedOrigins = env.ALLOWED_ORIGIN.split(',').map(s => s.trim());
    }
    allowedOrigins.push('http://localhost:8080', 'http://localhost:3000', 'null');

    const isAllowed = allowedOrigins.includes(origin);
    const allowOrigin = isAllowed ? origin : (allowedOrigins[0] || '');

    const CORS_HEADERS = {
      'Access-Control-Allow-Origin': allowOrigin,
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-cache',
    };

    const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
    });

    const errorResponse = (msg, status = 400) => jsonResponse({ error: msg }, status);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      // ===== 高德地图配置端点 =====
      if (path === '/api/amap/config') {
        const key = env.AMAP_KEY || '';
        const sec = env.AMAP_SEC || '';
        if (!key) return errorResponse('高德 Key 未配置，请在 Worker 环境变量中设置 AMAP_KEY', 500);
        return jsonResponse({ key, securityJsCode: sec });
      }

      // ===== 股票数据端点 =====
      const code = url.searchParams.get('code') || '';
      const q = url.searchParams.get('q') || '';

      if (path === '/api/kline') {
        if (!/^\d{6}$/.test(code)) return errorResponse('股票代码格式错误');
        const symbol = (code[0] === '6' || code[0] === '9') ? 'sh' + code : 'sz' + code;
        const apiUrl = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,180,qfq`;
        const resp = await fetch(apiUrl, {
          headers: { 'Referer': 'https://finance.qq.com', 'User-Agent': 'Mozilla/5.0' },
        });
        if (!resp.ok) return errorResponse(`腾讯API错误: ${resp.status}`, 502);
        return new Response(await resp.text(), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
        });
      }

      if (path === '/api/quote') {
        if (!/^\d{6}$/.test(code)) return errorResponse('股票代码格式错误');
        const symbol = (code[0] === '6' || code[0] === '9') ? 'sh' + code : 'sz' + code;
        const apiUrl = `https://qt.gtimg.cn/q=${symbol}`;
        const resp = await fetch(apiUrl, {
          headers: { 'Referer': 'https://finance.qq.com', 'User-Agent': 'Mozilla/5.0' },
        });
        if (!resp.ok) return errorResponse(`腾讯行情API错误: ${resp.status}`, 502);
        return new Response(await resp.text(), {
          headers: { 'Content-Type': 'text/plain; charset=gbk', ...CORS_HEADERS },
        });
      }

      if (path === '/api/search') {
        const apiUrl = `https://smartbox.gtimg.cn/s3/?q=${encodeURIComponent(q)}&t=gp`;
        const resp = await fetch(apiUrl, {
          headers: { 'Referer': 'https://finance.qq.com', 'User-Agent': 'Mozilla/5.0' },
        });
        if (!resp.ok) return errorResponse(`腾讯搜索API错误: ${resp.status}`, 502);
        return new Response(await resp.text(), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS_HEADERS },
        });
      }

      // ===== AI 对话端点（智谱 GLM，支持 SSE 流式 + 非流式） =====
      if (path === '/api/chat' && request.method === 'POST') {
        const apiKey = env.ZHIPU_API_KEY || '';
        if (!apiKey) return errorResponse('智谱 API Key 未配置，请在 Worker 环境变量中设置 ZHIPU_API_KEY', 500);

        const body = await request.json();
        const apiUrl = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';

        const resp = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });

        // 透传响应（JSON 和 SSE text/event-stream 均支持）
        const respHeaders = new Headers();
        respHeaders.set('Access-Control-Allow-Origin', allowOrigin);
        respHeaders.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
        respHeaders.set('Access-Control-Allow-Headers', 'Content-Type');
        if (resp.headers.get('Content-Type')) {
          respHeaders.set('Content-Type', resp.headers.get('Content-Type'));
        }
        return new Response(resp.body, {
          status: resp.status,
          headers: respHeaders,
        });
      }

      return errorResponse('Not Found', 404);
    } catch (e) {
      return errorResponse(e.message, 502);
    }
  },
};
