/* date_fill.js — 通用兑换日期自动点选逻辑
 * 解决：各银行预约页面日期控件类型不同（文本框 / 原生select / el-select下拉 /
 *       vant picker / 自定义日历选择器），原脚本只能往文本框直接赋值，
 *       日历类控件填不上。本脚本在 fillForm 完成后自动兜底：
 *       1) 文本框 → 直接赋值
 *       2) 原生 select → 匹配 option 选中
 *       3) readonly/自定义控件 → 模拟点击打开弹层 → 在弹出层自动点选目标日期 → 点确认
 */
(function () {
  if (window.__SX_DATE_FILL__) return;
  window.__SX_DATE_FILL__ = true;

  var log = function (m) { try { console.log('[SX DateFill] ' + m); } catch (e) {} };

  function pad(n) { return ('0' + n).slice(-2); }
  function norm(s) { return String(s || '').replace(/\s+/g, '').toLowerCase(); }
  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function hidden(el) {
    if (!el) return true;
    try {
      if (el.style && (el.style.display === 'none' || el.style.visibility === 'hidden')) return true;
      if (el.disabled) return true;
    } catch (e) {}
    return false;
  }

  // 从填表数据中提取目标日期，标准化为 YYYY-MM-DD
  function extractTarget(payload) {
    if (!payload) return '';
    var v = payload.exchangeTime || payload.exchangeDate || payload.date || payload.exchange_date || payload.bookDate;
    if (v == null) return '';
    v = String(v);
    var m = v.match(/(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*日?/);
    if (m) return m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    return '';
  }

  var DATE_WORDS = ['兑换日期', '预约日期', '兑换时间', '预约时间', '预约兑换日期', '选择兑换日期', '选择兑换时间'];

  // 查找页面上的日期控件，返回 {control, kind}
  function findDateControl() {
    // A. 直接扫描 input/select
    var controls = Array.prototype.slice.call(document.querySelectorAll('input, select'));
    for (var i = 0; i < controls.length; i++) {
      var el = controls[i];
      if (hidden(el)) continue;
      var ph = norm(el.getAttribute('placeholder') || '');
      var idn = norm(el.id || '');
      var nm = norm(el.name || '');
      var hit = false;
      for (var k = 0; k < DATE_WORDS.length; k++) {
        var w = norm(DATE_WORDS[k]);
        if (ph.indexOf(w) >= 0 || idn.indexOf(w) >= 0 || nm.indexOf(w) >= 0) { hit = true; break; }
      }
      if (!hit && (idn.indexOf('date') >= 0 || idn.indexOf('time') >= 0 || nm.indexOf('date') >= 0 || nm.indexOf('time') >= 0)) hit = true;
      if (!hit && (el.type === 'date' || el.type === 'datetime-local')) hit = true;
      if (hit) return { control: el, kind: el.tagName === 'SELECT' ? 'select' : 'input' };
    }

    // B. 按"兑换日期/预约日期"等文本标签找关联控件
    var textEls = Array.prototype.slice.call(document.querySelectorAll('label, span, p, em, h1, h2, h3, div'));
    for (var j = 0; j < textEls.length; j++) {
      var t = textEls[j];
      var txt = norm(t.textContent || '');
      var isLabel = false;
      for (var m = 0; m < DATE_WORDS.length; m++) {
        var w2 = norm(DATE_WORDS[m]);
        if (txt === w2 || txt.indexOf(w2) >= 0) { isLabel = true; break; }
      }
      if (!isLabel) continue;
      // B1. label[for=id]
      var f = t.getAttribute && t.getAttribute('for');
      if (f) {
        var linked = document.getElementById(f);
        if (linked && !hidden(linked)) {
          return { control: linked, kind: linked.tagName === 'SELECT' ? 'select' : (linked.tagName === 'INPUT' ? 'input' : 'custom') };
        }
      }
      // B2. 父级容器内找控件
      var scope = t.parentElement;
      if (scope) {
        var inner = scope.querySelector('input, select');
        if (inner && !hidden(inner)) return { control: inner, kind: inner.tagName === 'SELECT' ? 'select' : 'input' };
        var inner2 = scope.querySelector('[ng-click], .el-select, .e-select-edate, [data-value], .mySelect, .select_value, span[data-value], .van-field, .date-picker, .input.date');
        if (inner2 && !hidden(inner2)) return { control: inner2, kind: 'custom' };
      }
      // B3. 兄弟元素链
      var nxt = t.nextElementSibling;
      var guard = 0;
      while (nxt && guard < 5) {
        guard++;
        var c1 = nxt.querySelector('input, select');
        if (c1 && !hidden(c1)) return { control: c1, kind: c1.tagName === 'SELECT' ? 'select' : 'input' };
        if (nxt.tagName === 'INPUT' || nxt.tagName === 'SELECT') return { control: nxt, kind: nxt.tagName === 'SELECT' ? 'select' : 'input' };
        if (nxt.tagName === 'SPAN' || nxt.tagName === 'DIV' || nxt.tagName === 'LABEL') {
          var nt = norm(nxt.textContent || '');
          if (nt.indexOf('请选择') >= 0 || nxt.getAttribute('ng-click') || /select/i.test(nxt.className || '') || nxt.getAttribute('data-value')) {
            return { control: nxt, kind: 'custom' };
          }
        }
        nxt = nxt.nextElementSibling;
      }
    }
    return null;
  }

  function currentValue(ctrl) {
    var el = ctrl.control;
    try {
      if (ctrl.kind === 'custom') return norm(el.getAttribute('data-value') || el.textContent || el.value || '');
      return norm(el.value || '');
    } catch (e) { return ''; }
  }

  // 在弹出层中点击目标日期
  function pickInPopup(target) {
    var Y = target.slice(0, 4), M = parseInt(target.slice(5, 7), 10), D = parseInt(target.slice(8, 10), 10);
    var dateCandidates = [
      target,                        // 2026-10-01
      Y + '年' + M + '月' + D + '日',  // 2026年10月1日
      Y + '/' + pad(M) + '/' + pad(D),
      Y + '.' + pad(M) + '.' + pad(D),
      pad(M) + '月' + D + '日',
      M + '月' + D + '日',
      pad(M) + '-' + pad(D),
      M + '-' + D
    ];
    var popups = Array.prototype.slice.call(document.querySelectorAll(
      '.el-select-dropdown, .el-picker-panel, .el-date-picker, .el-date-table, .van-picker, .van-popup, ' +
      '[role=listbox], [role=dialog], [class*=dropdown], [class*=picker], [class*=calendar], [class*=popup], ' +
      '[class*=datePanel], [class*=datepanel], [class*=panel], [class*=edate], .e-datelist, [class*=select-pop], [class*=date-drop]'
    )).filter(function (p) {
      try { return !hidden(p) && norm(p.textContent).length > 0 && p.offsetParent !== null; } catch (e) { return false; }
    });
    if (!popups.length) {
      // 弹层无特征 class 时，退化为全页面找日期选项（仅当页面确实有日期选项文本）
      popups = [document.body];
    }

    for (var pi = 0; pi < popups.length; pi++) {
      var root = popups[pi];
      var cells = Array.prototype.slice.call(root.querySelectorAll('li, td, div, span, a, button, .el-select-dropdown__item, .van-picker-column__item, .van-picker__item'));
      // 1) 精确/包含文本匹配
      for (var c = 0; c < cells.length; c++) {
        var el1 = cells[c];
        if (hidden(el1)) continue;
        var tx = norm(el1.textContent);
        if (!tx || tx.length > 30) continue;
        for (var d = 0; d < dateCandidates.length; d++) {
          if (tx === norm(dateCandidates[d]) || tx.indexOf(norm(dateCandidates[d])) >= 0) {
            try { el1.click(); } catch (e) {}
            log('点击日期项: ' + tx);
            return true;
          }
        }
      }
      // 2) 正则匹配完整日期 / 月日
      for (var c2 = 0; c2 < cells.length; c2++) {
        var el2 = cells[c2];
        if (hidden(el2)) continue;
        var tx2 = norm(el2.textContent);
        if (!tx2 || tx2.length > 30) continue;
        var mm = tx2.match(/(\d{4})\s*[年\-/.]\s*(\d{1,2})\s*[月\-/.]\s*(\d{1,2})\s*日?/);
        if (mm && mm[1] === Y && parseInt(mm[2], 10) === M && parseInt(mm[3], 10) === D) {
          try { el2.click(); } catch (e) {}
          log('点击日期项(正则): ' + tx2);
          return true;
        }
        var m2 = tx2.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
        if (m2 && parseInt(m2[1], 10) === M && parseInt(m2[2], 10) === D) {
          try { el2.click(); } catch (e) {}
          log('点击日期项(月日): ' + tx2);
          return true;
        }
      }
      // 3) 日历网格：弹层标题含目标年月 → 点对应日数字格子
      var popTxt = norm(root.textContent);
      var hasYm = popTxt.indexOf(Y + '年') >= 0 && popTxt.indexOf(M + '月') >= 0;
      if (hasYm) {
        for (var c3 = 0; c3 < cells.length; c3++) {
          var el3 = cells[c3];
          if (hidden(el3)) continue;
          var tx3 = norm(el3.textContent);
          if (tx3 === String(D) || tx3 === pad(D)) {
            try { el3.click(); } catch (e) {}
            log('点击日历格子: ' + tx3);
            return true;
          }
        }
      }
    }
    return false;
  }

  // 弹层里点"确定/确认/完成/保存"
  function confirmPick() {
    try {
      var btns = Array.prototype.slice.call(document.querySelectorAll('button, .el-button, .van-picker__confirm, .btn, [role=button], a'));
      for (var i = 0; i < btns.length; i++) {
        var b = btns[i];
        if (hidden(b)) continue;
        var tx = norm(b.textContent);
        if (tx === '确定' || tx === '确认' || tx === '完成' || tx === '保存' || tx === '好的' || tx === 'OK' || tx === 'ok') {
          try { b.click(); } catch (e) {}
          log('点击确认: ' + tx);
          return;
        }
      }
    } catch (e) {}
  }

  // 填充日期主流程
  async function fillDate(ctrl, target) {
    try {
      if (ctrl.kind === 'select') {
        var sel = ctrl.control;
        var matched = null;
        for (var i = 0; i < sel.options.length; i++) {
          var o = sel.options[i];
          if (o.value === target || norm(o.textContent) === norm(target)) { matched = o; break; }
        }
        if (matched) {
          sel.value = matched.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          log('select 已选 ' + sel.value);
          return true;
        }
        log('select 无匹配选项');
        return false;
      }

      if (ctrl.kind === 'input') {
        var inp = ctrl.control;
        var readOnly = inp.readOnly || inp.getAttribute('readonly') !== null;
        if (inp.type === 'date' || (!readOnly && inp.type !== 'date')) {
          inp.value = target;
          inp.dispatchEvent(new Event('input', { bubbles: true }));
          inp.dispatchEvent(new Event('change', { bubbles: true }));
          log('input 已填 ' + target);
          return true;
        }
        // readonly → 模拟点击打开弹层
        try { inp.click(); } catch (e) {}
        await delay(150);
        var ok1 = pickInPopup(target);
        await delay(200);
        confirmPick();
        return ok1;
      }

      // custom → 点击打开弹层
      try { ctrl.control.click(); } catch (e) {}
      await delay(150);
      var ok2 = pickInPopup(target);
      await delay(200);
      confirmPick();
      return ok2;
    } catch (e) { log('fillDate 异常: ' + (e && e.message)); return false; }
  }

  // 提取目标日期（兼容 fillForm 的 {profile, region, payload} 结构）
  function pickTarget(data) {
    var p = (data && typeof data.payload === 'object' && data.payload) || data;
    return extractTarget(p);
  }

  // 填充日期主流程（含重试：部分页面日期控件延迟渲染）
  async function runDateFill(payload) {
    var target = pickTarget(payload);
    if (!target) return;
    var maxTry = 3;
    for (var t = 0; t < maxTry; t++) {
      var ctrl = findDateControl();
      if (ctrl) {
        var cur = currentValue(ctrl);
        if (cur && cur.indexOf(target) >= 0) { log('日期已填，跳过'); return; }
        log('开始填充日期 ' + target + '，控件类型: ' + ctrl.kind);
        var done = await fillDate(ctrl, target);
        await delay(150);
        confirmPick();
        var after = currentValue(ctrl);
        log('填充后控件值: ' + after);
        if (after && after.indexOf(target) >= 0) return;
      } else {
        log('未找到日期控件，等待重试 ' + (t + 1) + '/' + maxTry);
      }
      await delay(300 * (t + 1));
    }
  }

  // 全局入口：fillForm 完成后的日期兜底
  window.__SX_DATE_FILL_AFTER__ = async function (payload) {
    try { await runDateFill(payload); } catch (e) { log('兜底异常: ' + (e && e.message)); }
  };

  // 兜底 1：包装 shuixian.register（适配器 fillForm 完成后执行）
  var sx = window.shuixian;
  if (sx && typeof sx.register === 'function') {
    var origRegister = sx.register;
    sx.register = function (adapter) {
      if (adapter && typeof adapter.fillForm === 'function') {
        var origFill = adapter.fillForm;
        adapter.fillForm = async function (data) {
          try {
            return await origFill.call(this, data);
          } finally {
            try { await window.__SX_DATE_FILL_AFTER__(data); } catch (e) {}
          }
        };
      }
      return origRegister.call(sx, adapter);
    };
    log('日期兜底已挂载(shuixian.register)');
  } else {
    log('未找到 shuixian.register，日期兜底未挂载');

    // 兜底 2：若 register 不可用，改 hook 主填表流程 __SX_FILL_FORM__
    var origMain = window.__SX_FILL_FORM__;
    if (typeof origMain === 'function') {
      window.__SX_FILL_FORM__ = async function (data) {
        try {
          return await origMain(data);
        } finally {
          try { await window.__SX_DATE_FILL_AFTER__(data); } catch (e) {}
        }
      };
      log('日期兜底已挂载(__SX_FILL_FORM__)');
    }
  }

  // 兜底 3：即使 register 已挂载，也额外 hook 主填表流程，双保险
  var origMain2 = window.__SX_FILL_FORM__;
  if (typeof origMain2 === 'function' && !window.__SX_FILL_FORM___HOOKED__) {
    window.__SX_FILL_FORM___HOOKED__ = true;
    window.__SX_FILL_FORM__ = async function (data) {
      try {
        return await origMain2(data);
      } finally {
        try { await window.__SX_DATE_FILL_AFTER__(data); } catch (e) {}
      }
    };
    log('主流程日期兜底已挂载');
  }
})();
