/* ============================================================
   地图路线规划导航 - 主逻辑
   基于高德地图 JS API 2.0
   ============================================================ */

(function () {
    "use strict";

    // ---- State ----
    var map = null;
    var currentMode = "driving";        // driving | walking | riding | transit
    var originCoord = null;             // {lng, lat}
    var destCoord = null;               // {lng, lat}
    var originName = "";
    var destName = "";
    var settingOrigin = true;           // 地图点击当前在设起点还是终点
    var originMarker = null;
    var destMarker = null;
    var routePolylines = [];            // 当前路线折线
    var walkPolylines = [];             // 步行段折线
    var startMarker = null;
    var endMarker = null;
    var stepMarkers = [];
    // 驾车路线缓存 (多方案)
    var drivingRoutesCache = [];
    var currentRouteIndex = 0;

    // ---- DOM 引用 ----
    var $originInput = document.getElementById("origin-input");
    var $destInput = document.getElementById("dest-input");
    var $searchBtn = document.getElementById("search-btn");
    var $swapBtn = document.getElementById("swap-btn");
    var $locateBtn = document.getElementById("locate-btn");
    var $clearBtn = document.getElementById("clear-btn");
    var $clickHint = document.getElementById("click-hint");
    var $loadingOverlay = document.getElementById("loading-overlay");
    var $routePanel = document.getElementById("route-panel");
    var $routeDistance = document.getElementById("route-distance");
    var $routeTime = document.getElementById("route-time");
    var $routeCost = document.getElementById("route-cost");
    var $routeSteps = document.getElementById("route-steps");
    var $taxiInfo = document.getElementById("taxi-info");
    var $noKeyWarning = document.getElementById("no-key-warning");
    var $originBtn = document.getElementById("origin-btn");
    var $destBtn = document.getElementById("dest-btn");
    var $modeBtns = document.querySelectorAll(".mode-btn");
    var $avoidTolls = document.getElementById("avoid-tolls");

    // ---- 初始化 ----
    function init() {
        // 检查 Key 是否配置
        if (!window.AMAP_KEY || window.AMAP_KEY === "YOUR_AMAP_KEY_HERE") {
            $noKeyWarning.classList.add("show");
            return;
        }

        // 检查 AMap 是否可用
        if (typeof AMap === "undefined") {
            console.error("[App] AMap not defined, map disabled");
            $clickHint.textContent = "⚠️ 地图加载失败，请检查网络连接";
            $clickHint.style.display = "block";
            return;
        }

        // 初始化地图
        map = new AMap.Map("map-container", {
            zoom: 13,
            center: [116.397428, 39.90923],
            resizeEnable: true,
            viewMode: "2D",
        });

        // 加载插件
        AMap.plugin(
            [
                "AMap.Driving",
                "AMap.Walking",
                "AMap.Riding",
                "AMap.Transfer",
                "AMap.AutoComplete",
                "AMap.Geocoder",
                "AMap.Geolocation",
            ],
            function () {
                console.log("AMap plugins loaded");
                onPluginsReady();
            }
        );

        // 地图点击事件
        map.on("click", function (e) {
            if (settingOrigin) {
                setOriginFromMap(e.lnglat);
            } else {
                setDestFromMap(e.lnglat);
            }
        });

        // 事件绑定
        bindEvents();

        // 显示提示
        updateClickHint();
    }

    function onPluginsReady() {
        // 自动完成
        initAutocomplete();
    }

    // ---- 事件绑定 ----
    function bindEvents() {
        // 交换起终点
        $swapBtn.addEventListener("click", swapOriginDest);

        // 搜索按钮
        $searchBtn.addEventListener("click", searchRoute);

        // 回车搜索
        $originInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { $destInput.focus(); }
        });
        $destInput.addEventListener("keydown", function (e) {
            if (e.key === "Enter") { searchRoute(); }
        });

        // 出行方式切换
        $modeBtns.forEach(function (btn) {
            btn.addEventListener("click", function () {
                $modeBtns.forEach(function (b) { b.classList.remove("active"); });
                btn.classList.add("active");
                currentMode = btn.dataset.mode;
                // 公交模式隐藏免收费
                $avoidTolls.parentElement.style.display =
                    currentMode === "transit" ? "none" : "";
                if (currentMode === "transit") {
                    $avoidTolls.checked = false;
                }
            });
        });

        // 起点/终点按钮
        $originBtn.addEventListener("click", function () {
            settingOrigin = true;
            $originBtn.classList.add("active");
            $destBtn.classList.remove("active");
            updateClickHint();
        });
        $destBtn.addEventListener("click", function () {
            settingOrigin = false;
            $originBtn.classList.remove("active");
            $destBtn.classList.add("active");
            updateClickHint();
        });

        // 定位
        $locateBtn.addEventListener("click", locateMe);

        // 清除
        $clearBtn.addEventListener("click", clearAll);

        // 快捷城市按钮
        document.querySelectorAll(".quick-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var city = btn.dataset.city;
                if (map) {
                    map.setCity(city);
                } else {
                    alert("地图未加载，无法切换到 " + city);
                }
            });
        });
    }

    // ---- 自动完成 ----
    function initAutocomplete() {
        var autoOrigin = new AMap.AutoComplete({
            input: "origin-input",
            city: "",
            citylimit: false,
        });
        var autoDest = new AMap.AutoComplete({
            input: "dest-input",
            city: "",
            citylimit: false,
        });

        autoOrigin.on("select", function (e) {
            if (e.poi && e.poi.location) {
                setOrigin(e.poi.location, e.poi.name);
            }
        });

        autoDest.on("select", function (e) {
            if (e.poi && e.poi.location) {
                setDest(e.poi.location, e.poi.name);
            }
        });
    }

    // ---- 设置起点 ----
    function setOrigin(lnglat, name) {
        originCoord = { lng: lnglat.lng || lnglat.getLng(), lat: lnglat.lat || lnglat.getLat(), lnglat: lnglat };
        originName = name || lnglat.lng.toFixed(4) + "," + lnglat.lat.toFixed(4);
        $originInput.value = originName;

        if (originMarker) { originMarker.setMap(null); }
        originMarker = new AMap.Marker({
            position: [lnglat.lng, lnglat.lat],
            icon: new AMap.Icon({
                size: new AMap.Size(24, 34),
                image: "https://webapi.amap.com/theme/v1.3/markers/n/mark_g.png",
                imageSize: new AMap.Size(24, 34),
            }),
            anchor: "bottom-center",
            title: "起点: " + name,
        });
        originMarker.setMap(map);
        map.setFitView(null, false, [60, 60, 420, 60]);
    }

    function setOriginFromMap(lnglat) {
        var geocoder = new AMap.Geocoder();
        geocoder.getAddress([lnglat.lng, lnglat.lat], function (status, result) {
            var name = "";
            if (status === "complete" && result.regeocode) {
                name = result.regeocode.formattedAddress || "";
            }
            if (!name) {
                name = lnglat.lng.toFixed(5) + "," + lnglat.lat.toFixed(5);
            }
            setOrigin(lnglat, name);
        });
    }

    // ---- 设置终点 ----
    function setDest(lnglat, name) {
        destCoord = { lng: lnglat.lng || lnglat.getLng(), lat: lnglat.lat || lnglat.getLat(), lnglat: lnglat };
        destName = name || lnglat.lng.toFixed(4) + "," + lnglat.lat.toFixed(4);
        $destInput.value = destName;

        if (destMarker) { destMarker.setMap(null); }
        destMarker = new AMap.Marker({
            position: [lnglat.lng, lnglat.lat],
            icon: new AMap.Icon({
                size: new AMap.Size(24, 34),
                image: "https://webapi.amap.com/theme/v1.3/markers/n/mark_r.png",
                imageSize: new AMap.Size(24, 34),
            }),
            anchor: "bottom-center",
            title: "终点: " + name,
        });
        destMarker.setMap(map);
        map.setFitView(null, false, [60, 60, 420, 60]);
    }

    function setDestFromMap(lnglat) {
        var geocoder = new AMap.Geocoder();
        geocoder.getAddress([lnglat.lng, lnglat.lat], function (status, result) {
            var name = "";
            if (status === "complete" && result.regeocode) {
                name = result.regeocode.formattedAddress || "";
            }
            if (!name) {
                name = lnglat.lng.toFixed(5) + "," + lnglat.lat.toFixed(5);
            }
            setDest(lnglat, name);
        });
    }

    // ---- 交换起终点 ----
    function swapOriginDest() {
        var tmpCoord = originCoord;
        var tmpName = originName;
        var tmpMarker = originMarker;

        if (destCoord) {
            originCoord = destCoord;
            originName = destName;
            originMarker = destMarker;
            $originInput.value = originName;
        } else {
            originCoord = null;
            originName = "";
            originMarker = null;
            $originInput.value = "";
        }

        if (tmpCoord) {
            destCoord = tmpCoord;
            destName = tmpName;
            destMarker = tmpMarker;
            $destInput.value = destName;
        } else {
            destCoord = null;
            destName = "";
            destMarker = null;
            $destInput.value = "";
        }
    }

    // ---- 搜索路线 ----
    function searchRoute() {
        // 验证输入
        if (!$originInput.value.trim() || !$destInput.value.trim()) {
            alert("请输入起点和终点");
            return;
        }

        // 如果坐标未设置，先做地理编码
        if (!originCoord || !destCoord) {
            geocodeAndSearch();
            return;
        }

        $searchBtn.disabled = true;
        $searchBtn.textContent = "正在规划路线...";
        $loadingOverlay.classList.add("show");
        $routePanel.classList.remove("show");
        currentRouteIndex = 0;

        var origin = [originCoord.lng, originCoord.lat];
        var dest = [destCoord.lng, destCoord.lat];

        switch (currentMode) {
            case "driving":
                searchDriving(origin, dest);
                break;
            case "walking":
                searchWalking(origin, dest);
                break;
            case "riding":
                searchRiding(origin, dest);
                break;
            case "transit":
                searchTransit(origin, dest);
                break;
        }
    }

    function geocodeAndSearch() {
        var geocoder = new AMap.Geocoder();
        var tasks = [];

        if (!originCoord && $originInput.value.trim()) {
            tasks.push(
                new Promise(function (resolve) {
                    geocoder.getLocation($originInput.value.trim(), function (status, result) {
                        if (status === "complete" && result.geocodes.length > 0) {
                            var geo = result.geocodes[0];
                            setOrigin(
                                {
                                    lng: geo.location.getLng(),
                                    lat: geo.location.getLat(),
                                    lnglat: geo.location,
                                },
                                geo.formattedAddress || $originInput.value
                            );
                        }
                        resolve();
                    });
                })
            );
        }

        if (!destCoord && $destInput.value.trim()) {
            tasks.push(
                new Promise(function (resolve) {
                    geocoder.getLocation($destInput.value.trim(), function (status, result) {
                        if (status === "complete" && result.geocodes.length > 0) {
                            var geo = result.geocodes[0];
                            setDest(
                                {
                                    lng: geo.location.getLng(),
                                    lat: geo.location.getLat(),
                                    lnglat: geo.location,
                                },
                                geo.formattedAddress || $destInput.value
                            );
                        }
                        resolve();
                    });
                })
            );
        }

        if (tasks.length === 0) {
            alert("请输入有效的起点和终点");
            resetSearchBtn();
            return;
        }

        Promise.all(tasks).then(function () {
            if (originCoord && destCoord) {
                searchRoute();
            } else {
                alert("未能解析起点或终点，请检查输入");
                resetSearchBtn();
            }
        });
    }

    // ---- 驾车路线 ----
    function searchDriving(origin, dest) {
        var driving = new AMap.Driving({
            policy: $avoidTolls.checked ? AMap.DrivingPolicy.LEAST_FEE : AMap.DrivingPolicy.LEAST_TIME,
            extensions: "all",
            showTraffic: true,
        });

        driving.search(origin, dest, function (status, result) {
            if (status === "complete" && result.routes && result.routes.length > 0) {
                drivingRoutesCache = result.routes;
                currentRouteIndex = 0;
                renderDrivingRoute(result);
            } else {
                alert("未找到驾车路线");
            }
            resetSearchBtn();
            $loadingOverlay.classList.remove("show");
        });
    }

    function renderDrivingRoute(result) {
        clearRoute();
        var route = result.routes[currentRouteIndex];

        // 绘制路线
        var steps = route.steps;
        for (var i = 0; i < steps.length; i++) {
            var path = steps[i].path;
            var polyline = new AMap.Polyline({
                path: path,
                strokeColor: "#1677ff",
                strokeWeight: 6,
                strokeOpacity: 0.8,
                lineJoin: "round",
            });
            polyline.setMap(map);
            routePolylines.push(polyline);
        }

        // 起终点标记
        addRouteMarkers(route);

        // 信息面板
        showRoutePanel({
            distance: (route.distance / 1000).toFixed(1),
            time: Math.round(route.time / 60),
            cost: route.tolls || 0,
            steps: route.steps,
            taxi: result.taxi_cost ? "约 " + Math.round(result.taxi_cost) + " 元" : null,
        });

        // 多方案切换提示
        if (drivingRoutesCache.length > 1) {
            showRouteSwitch();
        }
    }

    // ---- 步行路线 ----
    function searchWalking(origin, dest) {
        var walking = new AMap.Walking({});

        walking.search(origin, dest, function (status, result) {
            if (status === "complete" && result.routes && result.routes.length > 0) {
                clearRoute();
                var route = result.routes[0];
                var steps = route.steps;

                for (var i = 0; i < steps.length; i++) {
                    var polyline = new AMap.Polyline({
                        path: steps[i].path,
                        strokeColor: "#52c41a",
                        strokeWeight: 6,
                        strokeOpacity: 0.8,
                        lineJoin: "round",
                    });
                    polyline.setMap(map);
                    routePolylines.push(polyline);
                }

                addRouteMarkers(route);
                showRoutePanel({
                    distance: (route.distance / 1000).toFixed(1),
                    time: Math.round(route.time / 60),
                    cost: null,
                    steps: route.steps,
                    taxi: null,
                });
                document.getElementById("route-switch").style.display = "none";
            } else {
                alert("未找到步行路线");
            }
            resetSearchBtn();
            $loadingOverlay.classList.remove("show");
        });
    }

    // ---- 骑行路线 ----
    function searchRiding(origin, dest) {
        var riding = new AMap.Riding({});

        riding.search(origin, dest, function (status, result) {
            if (status === "complete" && result.routes && result.routes.length > 0) {
                clearRoute();
                var route = result.routes[0];
                var steps = route.steps;

                for (var i = 0; i < steps.length; i++) {
                    var polyline = new AMap.Polyline({
                        path: steps[i].path,
                        strokeColor: "#fa8c16",
                        strokeWeight: 6,
                        strokeOpacity: 0.8,
                        lineJoin: "round",
                    });
                    polyline.setMap(map);
                    routePolylines.push(polyline);
                }

                addRouteMarkers(route);
                showRoutePanel({
                    distance: (route.distance / 1000).toFixed(1),
                    time: Math.round(route.time / 60),
                    cost: null,
                    steps: route.steps,
                    taxi: null,
                });
                document.getElementById("route-switch").style.display = "none";
            } else {
                alert("未找到骑行路线");
            }
            resetSearchBtn();
            $loadingOverlay.classList.remove("show");
        });
    }

    // ---- 公交路线 ----
    function searchTransit(origin, dest) {
        var transfer = new AMap.Transfer({
            city: "北京",
            policy: AMap.TransferPolicy.LEAST_TIME,
            extensions: "all",
        });

        transfer.search(origin, dest, function (status, result) {
            if (status === "complete" && result.plans && result.plans.length > 0) {
                clearRoute();
                var plan = result.plans[0];
                var segments = plan.segments;

                // 绘制各段路线
                for (var i = 0; i < segments.length; i++) {
                    var seg = segments[i];
                    var color = "#1677ff";
                    if (seg.transit && seg.transit.type === "SUBWAY") {
                        color = "#1677ff";
                    } else if (seg.transit && seg.transit.type === "BUS") {
                        color = "#52c41a";
                    } else if (seg.walking) {
                        color = "#999";
                    }

                    var path = [];
                    if (seg.walking && seg.walking.steps) {
                        for (var j = 0; j < seg.walking.steps.length; j++) {
                            path = path.concat(seg.walking.steps[j].path);
                        }
                    }
                    if (seg.bus && seg.bus.buslines) {
                        for (var k = 0; k < seg.bus.buslines.length; k++) {
                            path = path.concat(seg.bus.buslines[k].path);
                        }
                    }
                    if (seg.railway) {
                        path = path.concat(seg.railway.path || []);
                    }
                    if (path.length > 0) {
                        var polyline = new AMap.Polyline({
                            path: path,
                            strokeColor: color,
                            strokeWeight: 6,
                            strokeOpacity: 0.8,
                            lineJoin: "round",
                        });
                        polyline.setMap(map);
                        routePolylines.push(polyline);
                    }
                }

                // 公交站点标记
                addTransitMarkers(segments);

                // 信息面板
                showTransitPanel(plan);
                document.getElementById("route-switch").style.display = "none";
            } else {
                alert("未找到公交路线");
            }
            resetSearchBtn();
            $loadingOverlay.classList.remove("show");
        });
    }

    // ---- 路线标记 ----
    function addRouteMarkers(route) {
        var steps = route.steps;
        if (!steps || steps.length === 0) return;

        // 起点
        var startPath = steps[0].path;
        if (startPath && startPath.length > 0) {
            startMarker = new AMap.Marker({
                position: startPath[0],
                icon: new AMap.Icon({
                    size: new AMap.Size(32, 40),
                    image: "https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png",
                    imageSize: new AMap.Size(32, 40),
                    imageOffset: new AMap.Pixel(0, 0),
                }),
                anchor: "bottom-center",
                zIndex: 100,
            });
            startMarker.setMap(map);
        }

        // 终点
        var endStep = steps[steps.length - 1];
        var endPath = endStep.path;
        if (endPath && endPath.length > 0) {
            var endPos = endPath[endPath.length - 1];
            endMarker = new AMap.Marker({
                position: endPos,
                icon: new AMap.Icon({
                    size: new AMap.Size(32, 40),
                    image: "https://webapi.amap.com/theme/v1.3/markers/n/mark_r.png",
                    imageSize: new AMap.Size(32, 40),
                }),
                anchor: "bottom-center",
                zIndex: 100,
            });
            endMarker.setMap(map);
        }

        // 适配视野
        map.setFitView(routePolylines, false, [60, 60, 420, 60]);
    }

    function addTransitMarkers(segments) {
        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            if (seg.transit && seg.transit.type === "SUBWAY" && seg.transit.stops) {
                for (var j = 0; j < seg.transit.stops.length; j++) {
                    var stop = seg.transit.stops[j];
                    var marker = new AMap.Marker({
                        position: stop.location,
                        content:
                            '<div style="background:#1677ff;color:#fff;width:18px;height:18px;' +
                            'border-radius:50%;text-align:center;line-height:18px;font-size:10px;' +
                            'border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3)">M</div>',
                        offset: new AMap.Pixel(-9, -9),
                        zIndex: 80,
                    });
                    marker.setMap(map);
                    stepMarkers.push(marker);
                }
            }
        }
        if (routePolylines.length > 0) {
            map.setFitView(routePolylines, false, [60, 60, 420, 60]);
        }
    }

    // ---- 路线信息面板 ----
    function showRoutePanel(info) {
        $routeDistance.textContent = info.distance + " km";
        $routeTime.textContent = info.time + " 分钟";
        if (info.cost !== null && info.cost > 0) {
            $routeCost.textContent = info.cost + " 元";
        } else {
            $routeCost.textContent = "0 元";
        }
        $routePanel.classList.add("show");

        if (info.taxi) {
            $taxiInfo.style.display = "block";
            $taxiInfo.textContent = "预估打车费用: " + info.taxi;
        } else {
            $taxiInfo.style.display = "none";
        }

        // 步骤列表
        $routeSteps.innerHTML = "";
        var maxSteps = Math.min(info.steps.length, 30);
        for (var i = 0; i < maxSteps; i++) {
            var step = info.steps[i];
            var icon = getStepIcon(step.instruction);
            var instruction = step.instruction || "";
            var road = step.road || "";

            var div = document.createElement("div");
            div.className = "step-item";
            div.innerHTML =
                '<span class="step-icon">' +
                icon +
                "</span>" +
                '<span class="step-text">' +
                instruction +
                (road ? '<br><span class="road">' + road + "</span>" : "") +
                "</span>";
            $routeSteps.appendChild(div);
        }
    }

    function showTransitPanel(plan) {
        $routeDistance.textContent = (plan.distance / 1000).toFixed(1) + " km";
        $routeTime.textContent = Math.round(plan.time / 60) + " 分钟";
        $routeCost.textContent = (plan.cost || 0) + " 元";
        $routePanel.classList.add("show");
        $taxiInfo.style.display = "none";

        $routeSteps.innerHTML = "";
        var segments = plan.segments;
        for (var i = 0; i < segments.length; i++) {
            var seg = segments[i];
            var trans = seg.transit;
            var walk = seg.walking;
            var icon = "🚶";
            var text = "";

            if (trans) {
                if (trans.type === "SUBWAY") {
                    icon = "🚇";
                    text =
                        "乘坐 " +
                        (trans.lines ? trans.lines[0].name : "地铁") +
                        " (" +
                        trans.stops.length +
                        "站)";
                } else if (trans.type === "BUS") {
                    icon = "🚌";
                    text =
                        "乘坐 " +
                        (trans.lines ? trans.lines[0].name : "公交") +
                        " (" +
                        (trans.stops ? trans.stops.length : "?") +
                        "站)";
                } else {
                    icon = "🚌";
                    text = trans.type + " " + (trans.lines ? trans.lines[0].name : "");
                }
                if (trans.on_station) {
                    text += " - 在「" + trans.on_station + "」上车";
                }
                if (trans.off_station) {
                    text += " - 在「" + trans.off_station + "」下车";
                }
            } else if (walk) {
                icon = "🚶";
                text = "步行 " + (walk.distance > 0 ? (walk.distance / 1000).toFixed(1) + " km" : "");
            }

            var div = document.createElement("div");
            div.className = "step-item";
            div.innerHTML =
                '<span class="step-icon">' +
                icon +
                "</span>" +
                '<span class="step-text">' +
                text +
                "</span>";
            $routeSteps.appendChild(div);
        }
    }

    function showRouteSwitch() {
        var el = document.getElementById("route-switch");
        el.style.display = "flex";
        var prevBtn = document.getElementById("prev-route");
        var nextBtn = document.getElementById("next-route");
        var label = document.getElementById("route-label");

        label.textContent =
            "方案 " + (currentRouteIndex + 1) + "/" + drivingRoutesCache.length;

        var selfShow = showRouteSwitch;
        prevBtn.onclick = function () {
            if (currentRouteIndex > 0) {
                currentRouteIndex--;
                renderDrivingRoute({ routes: drivingRoutesCache });
            }
        };
        nextBtn.onclick = function () {
            if (currentRouteIndex < drivingRoutesCache.length - 1) {
                currentRouteIndex++;
                renderDrivingRoute({ routes: drivingRoutesCache });
            }
        };
    }

    function getStepIcon(instruction) {
        if (!instruction) return "→";
        if (
            instruction.indexOf("左转") >= 0 ||
            instruction.indexOf("向左") >= 0
        )
            return "↰";
        if (
            instruction.indexOf("右转") >= 0 ||
            instruction.indexOf("向右") >= 0
        )
            return "↱";
        if (
            instruction.indexOf("直行") >= 0 ||
            instruction.indexOf("沿") >= 0
        )
            return "↑";
        if (instruction.indexOf("调头") >= 0) return "↶";
        if (
            instruction.indexOf("到达") >= 0 ||
            instruction.indexOf("目的") >= 0
        )
            return "🏁";
        if (instruction.indexOf("进入") >= 0) return "🚗";
        if (
            instruction.indexOf("出口") >= 0 ||
            instruction.indexOf("匝道") >= 0
        )
            return "🛣";
        return "→";
    }

    // ---- 清除 ----
    function clearRoute() {
        routePolylines.forEach(function (p) { p.setMap(null); });
        walkPolylines.forEach(function (p) { p.setMap(null); });
        routePolylines = [];
        walkPolylines = [];
        if (startMarker) { startMarker.setMap(null); startMarker = null; }
        if (endMarker) { endMarker.setMap(null); endMarker = null; }
        stepMarkers.forEach(function (m) { m.setMap(null); });
        stepMarkers = [];
        drivingRoutesCache = [];
        currentRouteIndex = 0;
    }

    function clearAll() {
        clearRoute();
        if (originMarker) { originMarker.setMap(null); originMarker = null; }
        if (destMarker) { destMarker.setMap(null); destMarker = null; }
        originCoord = null;
        destCoord = null;
        originName = "";
        destName = "";
        $originInput.value = "";
        $destInput.value = "";
        $routePanel.classList.remove("show");
        document.getElementById("route-switch").style.display = "none";
        $loadingOverlay.classList.remove("show");
    }

    // ---- 定位 ----
    function locateMe() {
        if (!AMap.Geolocation) return;
        var geolocation = new AMap.Geolocation({
            enableHighAccuracy: true,
            timeout: 10000,
        });
        geolocation.getCurrentPosition(function (status, result) {
            if (status === "complete" && result.position) {
                map.setCenter([result.position.lng, result.position.lat]);
                map.setZoom(15);
                var marker = new AMap.Marker({
                    position: [result.position.lng, result.position.lat],
                    icon: new AMap.Icon({
                        size: new AMap.Size(24, 24),
                        image: "https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png",
                        imageSize: new AMap.Size(24, 24),
                    }),
                });
                marker.setMap(map);
                setTimeout(function () { marker.setMap(null); }, 3000);
                settingOrigin = true;
                setOriginFromMap(result.position);
                $originBtn.classList.add("active");
                $destBtn.classList.remove("active");
                updateClickHint();
            } else {
                alert("定位失败，请允许浏览器获取位置权限");
            }
        });
    }

    // ---- 辅助方法 ----
    function updateClickHint() {
        var hint = settingOrigin
            ? "点击地图设置起点 (绿色标记)"
            : "点击地图设置终点 (红色标记)";
        $clickHint.textContent = hint;
    }

    function resetSearchBtn() {
        $searchBtn.disabled = false;
        $searchBtn.textContent = "规划路线";
    }

    // ---- 启动 ----
    // AMap 由 config.js 动态加载，可能尚未就绪，需等待
    bindEvents();

    function waitForAMap() {
        if (typeof AMap !== "undefined") {
            init();
            return;
        }
        // AMap 动态加载完成时会触发，轮询等待
        var retries = 0;
        var timer = setInterval(function () {
            retries++;
            if (typeof AMap !== "undefined") {
                clearInterval(timer);
                init();
            } else if (retries > 30) { // 最多等 15 秒
                clearInterval(timer);
                console.error("[App] AMap failed to load after 15s");
                var hint = document.getElementById("click-hint");
                if (hint) {
                    hint.textContent = "⚠️ 地图加载超时，请刷新页面";
                    hint.style.display = "block";
                }
            }
        }, 500);
    }

    waitForAMap();

    // ---- 手机端抽屉切换 ----
    (function setupDrawer() {
        var sidebar = document.getElementById("sidebar");
        var handle = sidebar.querySelector(".drawer-handle");
        if (!sidebar || !handle) return;

        var collapsed = false;

        function toggle() {
            collapsed = !collapsed;
            if (collapsed) {
                sidebar.classList.add("collapsed");
            } else {
                sidebar.classList.remove("collapsed");
            }
        }

        handle.addEventListener("click", toggle);

        // 路线规划完成后自动展开抽屉
        var origShow = typeof showRoutePanel === "function" ? showRoutePanel : null;
        if (!origShow) {
            // 用 MutationObserver 监听 route-panel 的显示
            var routePanel = document.getElementById("route-panel");
            if (routePanel) {
                var observer = new MutationObserver(function () {
                    if (routePanel.classList.contains("show") && collapsed) {
                        collapsed = false;
                        sidebar.classList.remove("collapsed");
                    }
                });
                observer.observe(routePanel, { attributes: true, attributeFilter: ["class"] });
            }
        }
    })();
})();