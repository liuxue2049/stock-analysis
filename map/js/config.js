/**
 * 地图配置 - Key 已混淆处理
 *
 * 注意：前端代码无法真正隐藏 Key，此文件仅增加阅读难度。
 * 真正的安全依赖高德控制台的「域名白名单」设置。
 *
 * 请务必在 https://console.amap.com/dev/key/app 的 Web服务白名单中
 * 填入你部署后的域名（如 https://xxx.github.io/map-navigator/），
 * 这样即使他人看到 Key，也无法在自己的域名下调用。
 */
(function () {
    // Key 拆分编码，运行时还原 — 不在代码中出现完整明文 Key
    var _p = [
        "N2MwNA==", "NmM3Zg==", "NzgwMQ==", "Y2Q5Zg==",
        "Nzc2NA==", "YTMxYg==", "NDQ1Ng==", "NjljNA=="
    ];

    // 安全密钥拆分编码
    var _s = [
        "MmVlYQ==", "NDk3NQ==", "MTg5NA==", "MTRkYw==",
        "YzFiYQ==", "YWM5ZA==", "ODI1Nw==", "ZTZjNw=="
    ];

    function _d(arr) {
        return arr.map(function (b) { return atob(b); }).join("");
    }

    var _key = _d(_p);
    var _sec = _d(_s);

    // ① 安全密钥必须在 AMap 主脚本之前设置
    window._AMapSecurityConfig = { securityJsCode: _sec };
    window.AMAP_KEY = _key;

    // ② 动态加载 AMap 主脚本（Key 不出现在 HTML 源码中）
    var script = document.createElement("script");
    script.src = "https://webapi.amap.com/maps?v=2.0&key=" + _key;
    script.onload = function () {
        console.log("[Map] AMap loaded successfully");
        if (typeof AMap !== "undefined") {
            console.log("[Map] AMap version:", AMap.version || "unknown");
        }
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
})();