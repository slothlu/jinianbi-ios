/* content.js — App 版全自动编排（安卓 / iOS 共用）
 * 依赖注入顺序：bridge.js(bridge_ios.js) → BankMatch → sx_common → date_fill →
 *               sx_branch_finder → 5家适配器 → test_bridge → 本文件
 * 能力：银行识别 → 人员一键全自动（填表+日期兜底+验证码自动识别+自动提交）
 *      浮窗（可拖动/公告卖卡/设置入口）· 验证码变化自动监听 · SPA 路由重挂载
 * 与电脑端插件版的差异：无卡密门禁（App 原生已做）、OCR 走 App 原生链路、
 *      人员读 __SX_PERSONS_JSON__ / chrome.storage(userSettings)、支持手机 touch 拖动
 */
(function () {
  if (window.__SX_APP_CONTENT__) return;
  window.__SX_APP_CONTENT__ = true;
  if (!window.__SX_APP__) return; // 仅独立 App 内生效，避免误注入浏览器

  var C = window.__SX_COMMON__ || {};
  var floatingWindow = null;
  var isDragging = false;
  var dragOffset = { x: 0, y: 0 };
  var personsData = [];
  var captchaObserver = null;
  var lastCaptchaSignature = "";
  var captchaObserverPrimed = false;
  var captchaLoadTarget = null;
  var captchaLoadHandler = null;
  var _ocrSeq = 0;
  var _ocrWaiters = {};

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function log(m) { try { console.log("[SX App] " + m); } catch (e) {} }
  function warn(m) { try { console.warn("[SX App] " + m); } catch (e) {} }

  function toast(msg, kind) {
    kind = kind || "info";
    try {
      var box = document.querySelector(".sx-app-toast-container");
      if (!box) {
        box = document.createElement("div");
        box.className = "sx-app-toast-container";
        box.style.cssText = "position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:9999999;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;";
        (document.body || document.documentElement).appendChild(box);
      }
      var t = document.createElement("div");
      t.className = "sx-app-toast-item";
      t.textContent = msg;
      t.style.cssText =
        "max-width:80vw;padding:10px 16px;border-radius:8px;font-size:13px;color:#fff;" +
        "background:" + (kind === "success" ? "linear-gradient(135deg,#4CAF50,#2E7D32)" :
          kind === "warning" ? "linear-gradient(135deg,#FF9800,#F57C00)" :
            "linear-gradient(135deg,#2563eb,#1e40af)") + ";" +
        "box-shadow:0 4px 12px rgba(0,0,0,.18);opacity:0;transition:opacity .25s ease,transform .25s ease;";
      box.appendChild(t);
      requestAnimationFrame(function () { t.style.opacity = "1"; });
      setTimeout(function () {
        t.style.opacity = "0";
        setTimeout(function () { try { t.remove(); } catch (e) {} }, 250);
      }, 3000);
    } catch (e) { /* 兜底：忽略 */ }
  }

  /* ============ 人员读取 ============ */
  function normalizePersons(raw) {
    try {
      var d = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (Array.isArray(d)) return d;
      if (d && typeof d === "object" && d.name) return [d];
    } catch (e) {}
    return [];
  }
  function loadPersons() {
    return new Promise(function (resolve) {
      try {
        // iOS：注入时同步携带
        if (window.__SX_PERSONS_JSON__ !== undefined) {
          resolve(normalizePersons(window.__SX_PERSONS_JSON__));
          return;
        }
        // 安卓：bridge.js 将 userSettings 桥接到 AndroidBridge.getPersons()
        if (window.chrome && window.chrome.storage && window.chrome.storage.local) {
          chrome.storage.local.get(["userSettings"], function (r) {
            var raw = (r && r.userSettings) || null;
            if (!raw && r && r.persons) raw = r.persons; // 兼容
            resolve(normalizePersons(raw));
          });
          return;
        }
        resolve([]);
      } catch (e) { resolve([]); }
    });
  }

  /* 人员 → 适配器入参（适配器用 fullName/idNumber/mobile；date_fill 用 exchangeTime） */
  function toAdapterPerson(p) {
    if (!p) return {};
    var idn = p.id_card || p.idcard || "";
    var dt = p.ex_date || p.exchangeTime || "";
    return {
      fullName: p.name || p.fullName || "",
      name: p.name || p.fullName || "",
      remark: p.remark || "",
      mobile: p.phone || p.mobile || "",
      phone: p.phone || p.mobile || "",
      idNumber: idn,
      id_card: idn,
      idcard: idn,
      idType: p.idType || "身份证",
      province: p.province || "",
      city: p.city || "",
      district: p.district || "",
      branch: p.branch || "",
      address: p.address || "",
      exchangeTime: dt,
      exchangeDate: dt,
      ex_date: dt,
      quantity: p.quantity || ""
    };
  }

  /* ============ 银行识别 ============ */
  function isSupportedBankPage() {
    try {
      var sx = window.shuixian;
      return !!(sx && typeof sx.detect === "function" && sx.detect());
    } catch (e) { return false; }
  }

  /* ============ 验证码自动监听（变化自动重识别） ============ */
  function findCaptchaImage() {
    // 1) el-form-item / label 含 验证码/图形码/校验码/附加码
    var items = Array.prototype.slice.call(document.querySelectorAll(".el-form-item"));
    for (var i = 0; i < items.length; i++) {
      var lb = items[i].querySelector(".el-form-item__label");
      if (!lb) continue;
      var t = (lb.textContent || "").replace(/\s+/g, "");
      if (!/验证码|图形码|校验码|附加码/.test(t)) continue;
      var img = items[i].querySelector("img, canvas");
      if (img && img.offsetParent !== null) return img;
    }
    // 2) 通用 label
    var labels = Array.prototype.slice.call(document.querySelectorAll("label, .form-label, td"));
    for (var j = 0; j < labels.length; j++) {
      var t2 = (labels[j].textContent || "").replace(/\s+/g, "");
      if (!/验证码|图形码|校验码|附加码/.test(t2)) continue;
      var scope = labels[j].closest(".el-form-item, tr, .form-group") || labels[j].parentElement;
      if (!scope) continue;
      var img2 = scope.querySelector("img, canvas");
      if (img2 && img2.offsetParent !== null) return img2;
      var sib = scope.parentElement;
      if (sib) {
        var img3 = sib.querySelector("img, canvas");
        if (img3 && img3.offsetParent !== null) return img3;
      }
    }
    // 3) 兜底选择器
    var sels = [
      "img[alt*='验证码']", "img[alt*='校验码']", "img[alt*='附加码']",
      "img[id*='captcha']", "img[id*='verifyCode']", "img[class*='captcha']",
      "canvas[id*='captcha']", "canvas[class*='captcha']",
      ".verify-code-container img", ".verify-code-container canvas",
      "img[src*='verifyCode']", "img[src*='captcha']", "img[src*='ValidateCode']"
    ];
    for (var k = 0; k < sels.length; k++) {
      var el = document.querySelector(sels[k]);
      if (el && el.offsetParent !== null) return el;
    }
    return null;
  }

  function findCaptchaInput() {
    var inputs = Array.prototype.slice.call(document.querySelectorAll("input"));
    for (var i = 0; i < inputs.length; i++) {
      var el = inputs[i];
      if (el.type === "hidden" || el.disabled) continue;
      var nm = String(el.name || "").toLowerCase();
      var ph = String(el.getAttribute("placeholder") || "").toLowerCase();
      var id = String(el.id || "").toLowerCase();
      if (/captcha|verifycode|vcode|验证码|附加码|校验码|图形码/.test(nm + "|" + ph + "|" + id)) return el;
    }
    return null;
  }

  function getCurrentCaptchaSignature(img) {
    try {
      if (!img) return "";
      if (img.tagName === "SCRIPT") return img.dataset && img.dataset.captchaBase64 ? img.dataset.captchaBase64.slice(0, 200) : "";
      if (img.tagName === "CANVAS") {
        try { return img.toDataURL("image/png"); } catch (e) {}
        return img.className || "";
      }
      return img.getAttribute("src") || img.currentSrc || img.className || "";
    } catch (e) { return ""; }
  }

  function observeCaptchaChanges() {
    if (captchaObserver) return;
    var body = document.body;
    if (!body) return;
    var isCaptchaNode = function (n) {
      if (!n || n.nodeType !== 1 || typeof n.matches !== "function") return false;
      if (n.matches("img,canvas")) return true;
      return false;
    };
    captchaObserver = new MutationObserver(function (mutations) {
      try {
        var hit = mutations.some(function (m) {
          if (m.type === "attributes") {
            var n = m.target;
            if (!n || typeof n.matches !== "function") return false;
            if (n.matches("img,canvas")) return true;
            var attr = m.attributeName || "";
            return attr === "src" || attr === "data-src";
          }
          if (m.type === "childList") {
            var added = Array.prototype.slice.call(m.addedNodes || []).some(isCaptchaNode);
            var removed = Array.prototype.slice.call(m.removedNodes || []).some(isCaptchaNode);
            return added || removed;
          }
          return false;
        });
        if (hit) handleCaptchaChange();
      } catch (e) {}
    });
    captchaObserver.observe(body, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ["src", "data-src", "style", "class"]
    });
  }

  function handleCaptchaChange(reason) {
    var sig = getCurrentCaptchaSignature(findCaptchaImage());
    if (!sig) return;
    if (!captchaObserverPrimed) { captchaObserverPrimed = true; lastCaptchaSignature = sig; return; }
    if (sig === lastCaptchaSignature) return;
    lastCaptchaSignature = sig;
    runOcr();
  }

  /* ============ 图片 → base64 ============ */
  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () {
        var d = fr.result;
        if (typeof d === "string") resolve(d); else reject(new Error("读取失败"));
      };
      fr.onerror = function () { reject(fr.error || new Error("读取失败")); };
      fr.readAsDataURL(blob);
    });
  }
  async function getImageBase64(img) {
    try {
      if (!img) return "";
      if (img.tagName === "CANVAS" && typeof img.toDataURL === "function") return img.toDataURL("image/png");
      var src = img.getAttribute("src") || img.currentSrc || "";
      if (/^data:image/i.test(src)) return src.split(",")[1] || "";
      // canvas 兜底（跨域图片在部分银行页不能直接 fetch）
      try {
        if (img.complete !== false) {
          var cv = document.createElement("canvas");
          cv.width = img.naturalWidth || img.width || 120;
          cv.height = img.naturalHeight || img.height || 40;
          var ctx = cv.getContext("2d");
          if (ctx) { ctx.drawImage(img, 0, 0); return cv.toDataURL("image/png"); }
        }
      } catch (e) {}
      if (!src) return "";
      var res = await fetch(src, { mode: "cors", cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      var blob = await res.blob();
      return await blobToBase64(blob);
    } catch (e) { warn("获取验证码图片失败: " + e.message); return ""; }
  }

  /* ============ OCR：App 原生链路 ============ */
  window.addEventListener("message", function (ev) {
    var d = ev.data;
    if (!d || d.type !== "SX_OCR_RESULT") return;
    var w = _ocrWaiters[d.id];
    if (!w) return;
    delete _ocrWaiters[d.id];
    if (d.error) w.reject(new Error(d.error));
    else w.resolve(d.text || "");
  });

  function appOcr(b64) {
    return new Promise(function (resolve, reject) {
      var id = "sx_ocr_" + Date.now() + "_" + (++_ocrSeq);
      var cfgEl = document.createElement("script");
      cfgEl.type = "application/json";
      cfgEl.id = "sx_ocr_config_" + id;
      cfgEl.textContent = JSON.stringify({
        messageId: id,
        imageDataUrl: "data:image/png;base64," + b64,
        pngFix: false,
        colorFilterColors: null
      });
      (document.head || document.documentElement || document.body).appendChild(cfgEl);
      _ocrWaiters[id] = { resolve: resolve, reject: reject };
      try {
        if (typeof window.__SX_OCR_RUN__ === "function") window.__SX_OCR_RUN__();
        else { throw new Error("App OCR 桥未就绪"); }
      } catch (e) {
        if (_ocrWaiters[id]) { delete _ocrWaiters[id]; reject(e); }
      }
      setTimeout(function () {
        if (_ocrWaiters[id]) {
          delete _ocrWaiters[id];
          reject(new Error("OCR 超时"));
        }
      }, 20000);
    });
  }

  async function runOcr() {
    try {
      var img = findCaptchaImage();
      if (!img) return { ok: false, msg: "未找到验证码图片，请手动输入" };
      var b64 = await getImageBase64(img);
      if (!b64) return { ok: false, msg: "验证码图片读取失败，请手动输入" };
      var text = await appOcr(b64);
      text = String(text || "").replace(/\s+/g, "").trim();
      if (!text) return { ok: false, msg: "识别结果为空，请手动输入" };
      var input = findCaptchaInput();
      if (input) {
        input.value = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true, msg: "验证码已自动填入：" + text };
      }
      return { ok: true, msg: "识别成功：" + text + "（请手动填入）" };
    } catch (e) {
      warn("OCR 识别失败: " + (e && e.message));
      return { ok: false, msg: "识别失败：" + ((e && e.message) || e) };
    }
  }

  /* ============ 一键全自动填表 ============ */
  function fillFormWithPerson(person) {
    var sx = window.shuixian;
    if (!sx || typeof sx.detect !== "function") { toast("页面脚本未就绪，请刷新重试", "warning"); return; }
    var bank = null;
    try { bank = sx.detect(); } catch (e) {}
    if (!bank) { toast("当前页面不是支持的银行预约页", "warning"); return; }
    var p = toAdapterPerson(person);
    log("开始填写：银行=" + (bank.id || "?"));

    (async function () {
      try {
        if (typeof bank.waitForOpen === "function") { try { await bank.waitForOpen(); } catch (e) {} }
        if (typeof bank.fillForm === "function") {
          await bank.fillForm(p);
        } else if (typeof defaultFillForm === "function") {
          defaultFillForm(bank, p);
        }
        // 通用兜底：协议勾选
        if (C && typeof C.autoCheckAgreementCheckboxes === "function") {
          try { C.autoCheckAgreementCheckboxes(); } catch (e) {}
        }
        toast((p.name || "该人员") + " 信息已填写", "success");
        // 验证码自动识别
        var ocrR = await runOcr();
        if (ocrR.ok) toast(ocrR.msg, "success");
        else if (ocrR.msg) toast(ocrR.msg, "warning");
        // 自动提交
        if (typeof bank.submit === "function") {
          await delay(600);
          log("自动提交...");
          try { await bank.submit(); } catch (e) { warn("提交执行异常: " + e.message); }
          toast((p.name || "该人员") + " 已提交", "success");
        }
        if (typeof bank.verifyResult === "function") {
          try {
            var ok = await bank.verifyResult();
            if (ok) toast("预约成功！", "success");
          } catch (e) {}
        }
        log("全自动流程完成");
      } catch (err) {
        warn("填写流程出错: " + (err && err.message || err));
        toast("填写失败：" + ((err && err.message) || err), "warning");
      }
    })();
  }

  // 适配器无 fillForm 时的默认填写（用 getSelectorMap）
  function defaultFillForm(bank, p) {
    try {
      if (!bank || typeof bank.getSelectorMap !== "function") return;
      var sel = bank.getSelectorMap();
      var set = function (s, v) {
        if (!s || v == null || v === "") return;
        var el = document.querySelector(s);
        if (el) {
          el.value = v;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
      };
      set(sel.fullName, p.name);
      set(sel.idNumber, p.id_card);
      set(sel.mobile, p.phone);
      if (sel.idType) {
        var it = document.querySelector(sel.idType);
        if (it) {
          var opts = it.querySelectorAll("option");
          for (var i = 0; i < opts.length; i++) {
            if (opts[i].text.indexOf("身份证") >= 0 || opts[i].value === "01") {
              it.value = opts[i].value;
              it.dispatchEvent(new Event("change", { bubbles: true }));
              break;
            }
          }
        }
      }
      if (sel.regionSelects) {
        var parts = [p.province, p.city, p.district];
        for (var j = 0; j < sel.regionSelects.length && j < parts.length; j++) {
          var rs = document.querySelector(sel.regionSelects[j]);
          if (rs && parts[j]) {
            var opts2 = rs.querySelectorAll("option");
            for (var k = 0; k < opts2.length; k++) {
              if (opts2[k].text.indexOf(parts[j]) >= 0) {
                rs.value = opts2[k].value;
                rs.dispatchEvent(new Event("change", { bubbles: true }));
                break;
              }
            }
          }
        }
      }
      if (sel.branch && p.branch) set(sel.branch, p.branch);
    } catch (e) { warn("默认填写异常: " + e.message); }
  }

  /* ============ 浮窗 ============ */
  function openSettings() {
    try {
      if (window.chrome && window.chrome.runtime && typeof window.chrome.runtime.sendMessage === "function") {
        chrome.runtime.sendMessage({ type: "OPEN_LICENSE_POPUP" }, function () {});
      }
    } catch (e) {}
  }

  function copyWechat() {
    try {
      var ta = document.createElement("textarea");
      ta.value = "lumiannb666";
      ta.style.cssText = "position:fixed;opacity:0;";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      toast("微信号已复制：lumiannb666", "success");
    } catch (e) {
      toast("微信号：lumiannb666", "info");
    }
  }

  function buildFloat() {
    if (floatingWindow) { try { floatingWindow.remove(); } catch (e) {} }
    floatingWindow = document.createElement("div");
    floatingWindow.id = "sx-app-float";
    floatingWindow.style.cssText =
      "position:fixed;top:120px;right:16px;width:236px;z-index:9999998;" +
      "background:#fff;border-radius:14px;box-shadow:0 8px 32px rgba(0,0,0,.18);" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;" +
      "user-select:none;overflow:hidden;";

    var style = document.createElement("style");
    style.textContent =
      ".sx-app-float-head{background:linear-gradient(135deg,#2563eb,#1e40af);color:#fff;padding:10px 12px;" +
      "display:flex;justify-content:space-between;align-items:center;cursor:move;}" +
      ".sx-app-float-title{font-size:13px;font-weight:600;}" +
      ".sx-app-float-actions{display:flex;align-items:center;gap:4px;}" +
      ".sx-app-float-btn{background:rgba(255,255,255,.2);border:none;color:#fff;font-size:14px;width:26px;height:26px;" +
      "border-radius:6px;cursor:pointer;display:flex;align-items:center;justify-content:center;}" +
      ".sx-app-announce{background:#FFFBEB;border:1px solid #FCD34D;border-radius:10px;padding:8px 10px;margin:8px;" +
      "font-size:11px;color:#78350F;line-height:1.5;cursor:pointer;}" +
      ".sx-app-body{padding:4px 8px 10px;max-height:320px;overflow-y:auto;}" +
      ".sx-app-person{background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:9px 10px;margin-bottom:7px;" +
      "cursor:pointer;transition:all .15s;}" +
      ".sx-app-person:active{background:#eef2ff;border-color:#2563eb;}" +
      ".sx-app-person-name{font-size:13px;font-weight:600;color:#111827;display:flex;align-items:baseline;gap:6px;}" +
      ".sx-app-person-remark{font-size:11px;color:#9ca3af;font-weight:400;}" +
      ".sx-app-person-info{font-size:11px;color:#6b7280;margin-top:3px;line-height:1.4;word-break:break-all;}" +
      ".sx-app-empty{text-align:center;padding:18px 8px;color:#9ca3af;font-size:12px;}" +
      ".sx-app-foot{display:flex;gap:8px;padding:8px;}" +
      ".sx-app-go{flex:1;padding:9px 0;background:linear-gradient(135deg,#2563eb,#1e40af);color:#fff;border:none;" +
      "border-radius:8px;font-size:13px;cursor:pointer;}" +
      ".sx-app-go:active{background:#1e3a8a;}";
    (document.head || document.documentElement).appendChild(style);

    floatingWindow.innerHTML =
      '<div class="sx-app-float-head"><span class="sx-app-float-title">路面纪念钞币科技</span>' +
      '<div class="sx-app-float-actions">' +
      '<button class="sx-app-float-btn" id="sx-app-set" title="添加/管理人员">⚙</button>' +
      '<button class="sx-app-float-btn" id="sx-app-close" title="关闭">×</button>' +
      '</div></div>' +
      '<div class="sx-app-announce" id="sx-app-wx">' +
      '需要出纪念物品的可以➕微信 <b>lumiannb666</b><br/>（点击复制）</div>' +
      '<div class="sx-app-body" id="sx-app-list"><div class="sx-app-empty">加载中...</div></div>' +
      '<div class="sx-app-foot">' +
      '<button class="sx-app-go" id="sx-app-all">一键全自动（第一个人）</button></div>';
    (document.body || document.documentElement).appendChild(floatingWindow);

    // 公告 → 复制微信
    var wxEl = floatingWindow.querySelector("#sx-app-wx");
    if (wxEl) wxEl.addEventListener("click", copyWechat);

    // 设置 / 关闭
    var setBtn = floatingWindow.querySelector("#sx-app-set");
    if (setBtn) setBtn.addEventListener("click", function (e) { e.stopPropagation(); openSettings(); });
    var closeBtn = floatingWindow.querySelector("#sx-app-close");
    if (closeBtn) closeBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      try { floatingWindow.remove(); } catch (err) {}
      floatingWindow = null;
    });

    // 一键全自动：第一个人
    var goBtn = floatingWindow.querySelector("#sx-app-all");
    if (goBtn) goBtn.addEventListener("click", function () {
      if (personsData.length === 0) { toast("还没有人员，先点 ⚙ 添加", "warning"); return; }
      fillFormWithPerson(personsData[0]);
    });

    // 拖动（touch + mouse）
    var head = floatingWindow.querySelector(".sx-app-float-head");
    function onDown(x, y) {
      if (floatingWindow) {
        isDragging = true;
        var r = floatingWindow.getBoundingClientRect();
        dragOffset.x = x - r.left;
        dragOffset.y = y - r.top;
      }
    }
    function onMove(x, y) {
      if (!isDragging || !floatingWindow) return;
      var maxX = window.innerWidth - floatingWindow.offsetWidth;
      var maxY = window.innerHeight - floatingWindow.offsetHeight;
      var nx = Math.max(0, Math.min(x - dragOffset.x, maxX));
      var ny = Math.max(0, Math.min(y - dragOffset.y, maxY));
      floatingWindow.style.left = nx + "px";
      floatingWindow.style.top = ny + "px";
      floatingWindow.style.right = "auto";
    }
    function onUp() { isDragging = false; }
    if (head) {
      head.addEventListener("touchstart", function (e) {
        var t = e.touches[0]; onDown(t.clientX, t.clientY);
      }, { passive: true });
      head.addEventListener("touchmove", function (e) {
        if (!isDragging) return;
        var t = e.touches[0]; onMove(t.clientX, t.clientY);
        try { e.preventDefault(); } catch (err) {}
      }, { passive: false });
      head.addEventListener("touchend", onUp);
      head.addEventListener("mousedown", function (e) { onDown(e.clientX, e.clientY); });
      document.addEventListener("mousemove", function (e) { onMove(e.clientX, e.clientY); });
      document.addEventListener("mouseup", onUp);
    }

    // 渲染人员列表
    loadPersons().then(function (list) {
      personsData = list;
      renderPersonList();
    });
  }

  function renderPersonList() {
    var listEl = floatingWindow && floatingWindow.querySelector("#sx-app-list");
    if (!listEl) return;
    if (personsData.length === 0) {
      listEl.innerHTML = '<div class="sx-app-empty">暂无人员信息<br/>点右上角 ⚙ 添加</div>';
      return;
    }
    var html = "";
    for (var i = 0; i < personsData.length; i++) {
      var p = personsData[i];
      var name = esc(p.name || "未命名");
      var remark = p.remark ? esc(p.remark) : "";
      var info = [p.idcard || p.id_card || "", p.phone || p.mobile || ""]
        .filter(function (s) { return s; }).join(" · ");
      html += '<div class="sx-app-person" data-idx="' + i + '">' +
        '<div class="sx-app-person-name">' + name +
        (remark ? '<span class="sx-app-person-remark">-' + remark + '</span>' : '') +
        '</div>' +
        (info ? '<div class="sx-app-person-info">' + esc(info) + '</div>' : '') +
        '</div>';
    }
    listEl.innerHTML = html;
    var cards = listEl.querySelectorAll(".sx-app-person");
    for (var j = 0; j < cards.length; j++) {
      cards[j].addEventListener("click", function () {
        var idx = parseInt(this.getAttribute("data-idx"), 10);
        var p = personsData[idx];
        if (p) fillFormWithPerson(p);
      });
    }
  }

  /* ============ 初始化 ============ */
  function tryInit() {
    if (floatingWindow) return;
    if (!isSupportedBankPage()) return;
    buildFloat();
  }

  function boot() {
    // 暴露主填表入口（date_fill.js 的兜底 hook 目标，也便于外部调用/测试）
    window.__SX_FILL_FORM__ = fillFormWithPerson;
    tryInit();
    // 监听 App 侧人员变化 → 刷新列表
    try {
      if (window.chrome && window.chrome.storage && window.chrome.storage.local &&
          window.chrome.storage.local.onChanged) {
        chrome.storage.local.onChanged.addListener(function (changes, area) {
          if (!changes || area !== "local") return;
          if (changes.userSettings && floatingWindow) {
            loadPersons().then(function (list) {
              personsData = list;
              renderPersonList();
            });
          }
        });
      }
      if (window.__sxFirePersonsChanged) { /* bridge 已触发 onChanged */ }
    } catch (e) {}

    // 监听验证码变化（银行页）
    observeCaptchaChanges();

    // SPA 路由/延迟加载 → 周期性重挂载浮窗
    setInterval(function () {
      try {
        if (!floatingWindow && isSupportedBankPage()) buildFloat();
      } catch (e) {}
    }, 2000);
  }

  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(boot, 600);
  } else {
    window.addEventListener("DOMContentLoaded", function () { setTimeout(boot, 600); });
  }
})();
