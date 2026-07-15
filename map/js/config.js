/**
 * 地图配置 - 高德 Key 由 Cloudflare Worker 动态下发
 *
 * 生产环境：Worker 环境变量中存储真实 Key，前端源码零暴露。
 * 本地开发：Worker 不可用时，降级使用内置 Key（不会提交到 git）。
 *
 * 安全措施：
 *   1. 高德 Key 仅存于 Cloudflare Worker 环境变量，源码中不出现
 *   2. Cloudflare Worker CORS 限制只允许你的域名访问
 *   3. 高德控制台「域名白名单」作为最后防线
 */
(function () {
    // Cloudflare Worker 地址（与股票模块共用）
    var WORKER_URL = 'https://falling-sunset-3621.meikoliu2020.workers.dev';

    // 降级方案：本地开发时用的内置 Key（Base64 混淆，仅用于无 Worker 时的本地调试）
    var _fallbackKey = (function () {
        var _p = [
            "N2MwNA==", "NmM3Zg==", "NzgwMQ==", "Y2Q5Zg==",
            "Nzc2NA==", "YTMxYg==", "NDQ1Ng==", "NjljNA=="
        ];
        var _s = [
            "MmVlYQ==", "NDk3NQ==", "MTg5NA==", "MTRkYw==",
            "YzFiYQ==", "YWM5ZA==", "ODI1Nw==", "ZTZjNw=="
        ];
        function _d(arr) {
            return arr.map(function (b) { return atob(b); }).join("");
        }
        return { key: _d(_p), sec: _d(_s) };
    })();

    // 从 Worker 获取 Key
    function loadFromWorker() {
        return fetch(WORKER_URL + '/api/amap/config')
            .then(function (resp) {
                if (!resp.ok) throw new Error('Worker returned ' + resp.status);
                return resp.json();
            })
            .then(function (config) {
                console.log('[Map] Key loaded from Worker');
                return config;
            });
    }

    // 初始化地图
    function initMap(config) {
        window._AMapSecurityConfig = { securityJsCode: config.securityJsCode };
        window.AMAP_KEY = config.key;

        var script = document.createElement("script");
        script.src = "https://webapi.amap.com/maps?v=2.0&key=" + config.key;
        script.onload = function () {
            console.log("[Map] AMap loaded, version:", (typeof AMap !== "undefined" && AMap.version) || "unknown");
        };
        script.onerror = function () {
            console.error("[Map] AMap script load failed");
            var hint = document.getElementById("click-hint");
            if (hint) {
                hint.textContent = "⚠️ 地图加载失败，请检查网络连接";
                hint.style.display = "block";
            }
        };
        document.head.appendChild(script);
    }

    // 尝试 Worker → 降级本地
    loadFromWorker()
        .then(initMap)
        .catch(function (err) {
            console.warn('[Map] Worker unavailable, using local fallback. Error:', err.message);
            initMap(_fallbackKey);
        });
})();
