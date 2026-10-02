/**
 * 路面纪念钞币科技 · 银行适配器注册表
 * 与参考版 shuixian 接口对齐：register / detect / get / all
 */
(function () {
  "use strict";
  if (window.shuixian) return;

  const adapters = [];

  function register(adapter) {
    if (!adapter || !adapter.id) return;
    const i = adapters.findIndex((a) => a.id === adapter.id);
    if (i >= 0) adapters[i] = adapter;
    else adapters.push(adapter);
  }

  // 按顺序检测当前页面属于哪家银行，返回适配器对象；不匹配返回 null
  function detect() {
    for (const a of adapters) {
      try {
        if (a.detect && a.detect()) return a;
      } catch (e) { /* ignore */ }
    }
    return null;
  }

  function get(id) {
    return adapters.find((a) => a.id === id) || null;
  }

  function all() {
    return adapters.slice();
  }

  window.shuixian = { register, detect, get, all };
})();
