/* bridge_ios.js — iOS 独立 App 桥接层
 * 把扩展的 chrome.* API 桥接到 iOS 原生能力（人员存储、设置页、OCR 转发）。
 * 与安卓版 bridge.js 等效，走 WKWebView 的 messageHandlers.SXBridge 通道。
 */
(function () {
  if (window.__SX_APP__) return; // 幂等保护
  window.__SX_APP__ = true;

  var seq = 0;
  var pending = {};
  var onChangedCbs = [];

  function sxNative(action, payload, cb) {
    var id = 'sx' + (++seq);
    if (typeof cb === 'function') pending[id] = cb;
    try {
      window.webkit.messageHandlers.SXBridge.postMessage({
        id: id,
        action: action,
        payload: payload || {}
      });
    } catch (e) {
      if (typeof cb === 'function') { delete pending[id]; cb({ error: String(e) }); }
    }
  }

  // 原生侧回传结果：window.__sxBridgeResolve('id', 'json字符串')
  window.__sxBridgeResolve = function (id, jsonStr) {
    var cb = pending[id];
    if (!cb) return;
    delete pending[id];
    var data = null;
    try { data = JSON.parse(jsonStr || 'null'); } catch (e) { data = null; }
    cb(data);
  };

  window.chrome = {
    storage: {
      local: {
        get: function (keys, cb) {
          var need = false;
          if (keys === null) need = true;
          else if (Array.isArray(keys)) need = keys.indexOf('userSettings') >= 0;
          else if (keys && typeof keys === 'object' && keys.hasOwnProperty('userSettings')) need = true;
          else if (typeof keys === 'string' && keys === 'userSettings') need = true;
          if (!need) { if (typeof cb === 'function') cb({}); return; }
          // 优先使用注入时同步携带的人员数据（绕开异步回传的时序问题）
          if (window.__SX_PERSONS_JSON__ !== undefined) {
            var out0 = {};
            out0.userSettings = window.__SX_PERSONS_JSON__;
            if (typeof cb === 'function') cb(out0);
            return;
          }
          sxNative('storageGet', {}, function (r) {
            var out = {};
            if (r && typeof r.userSettings === 'string') out.userSettings = r.userSettings;
            if (typeof cb === 'function') cb(out);
          });
        },
        set: function (obj, cb) {
          if (obj && obj['userSettings'] !== undefined) {
            var v = typeof obj['userSettings'] === 'string'
              ? obj['userSettings']
              : JSON.stringify(obj['userSettings']);
            sxNative('storageSet', { userSettings: v }, function () {
              if (typeof cb === 'function') cb();
            });
          } else if (typeof cb === 'function') cb();
        },
        remove: function (keys, cb) {
          if (typeof cb === 'function') cb();
        },
        onChanged: {
          addListener: function (fn) {
            if (typeof fn === 'function' && onChangedCbs.indexOf(fn) < 0) onChangedCbs.push(fn);
          }
        }
      }
    },
    runtime: {
      sendMessage: function (msg, cb) {
        if (msg && msg.type === 'OPEN_LICENSE_POPUP') {
          sxNative('openSettings', {}, function () {});
          if (typeof cb === 'function') cb({ ok: true });
          return;
        }
        if (msg && msg.type === 'SX_GET_CONFIG') {
          if (typeof cb === 'function') cb(null);
          return;
        }
        if (typeof cb === 'function') cb(null);
      },
      getURL: function (p) {
        return '';
      },
      onMessage: {
        addListener: function (fn) {
          window.__sxOnMessage = fn;
        }
      },
      lastError: null
    }
  };

  // 人员数据在 App 侧变化时，页面刷新悬浮窗列表
  window.__sxFirePersonsChanged = function () {
    var newVal = window.__SX_PERSONS_JSON__ !== undefined ? window.__SX_PERSONS_JSON__ : '[]';
    onChangedCbs.forEach(function (fn) {
      try { fn({ userSettings: { newValue: newVal } }, 'local'); } catch (e) {}
    });
  };

  // 内联 OCR 执行器：替代 ocrInject.js，走 iOS 原生转发（绕开 CORS）
  window.__SX_OCR_RUN__ = function () {
    var send = function (id, text, error) {
      try {
        window.postMessage(
          { type: 'SX_OCR_RESULT', id: id || 'unknown', text: text || null, error: error || null },
          '*'
        );
      } catch (e) {}
    };
    var cfgEl = document.querySelector('script[type="application/json"][id^="sx_ocr_config_"]');
    if (!cfgEl) { send('unknown', null, '未找到OCR配置元素'); return; }
    var cfg = {};
    try { cfg = JSON.parse(cfgEl.textContent || '{}'); } catch (e) {}
    try { if (cfgEl.parentNode) cfgEl.parentNode.removeChild(cfgEl); } catch (e) {}
    var messageId = cfg.messageId;
    var imageDataUrl = cfg.imageDataUrl;
    if (!messageId || !imageDataUrl) { send(messageId || 'unknown', null, 'OCR配置不完整'); return; }
    var b64 = imageDataUrl.indexOf(',') >= 0 ? imageDataUrl.slice(imageDataUrl.indexOf(',') + 1) : imageDataUrl;
    var payload = {
      image: b64,
      png_fix: !!cfg.pngFix,
      color_filter_colors: cfg.colorFilterColors || null
    };
    sxNative('ocr', payload, function (r) {
      if (r && r.error) { send(messageId, null, r.error); return; }
      var text = '';
      if (r) {
        text = r.result || (r.data && (r.data.result || r.data.text)) || r.code || r.message || '';
        text = typeof text === 'string' ? text : String(text || '');
      }
      if (!text) { send(messageId, null, 'OCR接口未返回识别结果'); return; }
      text = text.replace(/\s+/g, '').trim();
      send(messageId, text, null);
    });
  };
})();
