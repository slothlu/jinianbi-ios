/**
 * 路面纪念钞币科技 · 通用填表逻辑（sx_common）
 * 提供：字段智能匹配 __SX_SMART_FIND__、证件类型选择、省市区下拉、日期格式化、
 *       兑换日期输入框查找、协议勾选、通用提交、Toast 提示
 */
(function () {
  "use strict";
  if (window.__SX_COMMON_LOADED__) return;
  window.__SX_COMMON_LOADED__ = true;

  /* ============ 字段关键词表 ============ */
  const FIELD_KEYWORDS = {
    fullName: {
      label: ["姓名", "客户姓名", "兑换人姓名", "请填写客户姓名", "请输入姓名", "name", "userName", "customerName"],
      placeholder: ["请输入姓名", "请输入客户姓名", "请输入兑换人姓名", "姓名"],
      name: ["name", "fullName", "userName", "customerName", "realName"],
      id: ["name", "fullName", "userName", "customerName", "realName"]
    },
    idType: {
      label: ["证件类型", "idType", "certType", "id_type"],
      placeholder: [],
      name: ["idType", "certType", "id_type", "cert_type", "idTypeCode"],
      id: ["idType", "certType", "id_type", "cert_type"]
    },
    idNumber: {
      label: ["证件号码", "证件号", "身份证号", "idNumber", "idNo", "certNo", "certNumber"],
      placeholder: ["请输入证件号码", "请输入证件号", "请输入身份证号", "证件号"],
      name: ["idNumber", "idNo", "certNo", "certNumber", "id_number", "cert_no"],
      id: ["idNumber", "idNo", "certNo", "certNumber", "id_number"]
    },
    mobile: {
      label: ["手机号", "手机号码", "联系电话", "mobile", "phone", "mobilePhone", "tel"],
      placeholder: ["请输入手机号", "请输入手机号码", "请输入联系电话", "手机号"],
      name: ["mobile", "phone", "mobilePhone", "tel", "telephone", "contactPhone"],
      id: ["mobile", "phone", "mobilePhone", "tel"]
    },
    address: {
      label: ["详细地址", "地址", "address", "detailAddress", "fullAddress"],
      placeholder: ["请输入详细地址", "请输入地址", "地址"],
      name: ["address", "detailAddress", "fullAddress", "addr"],
      id: ["address", "detailAddress", "fullAddress", "addr"]
    },
    branch: {
      label: ["网点", "兑换网点", "选择网点", "预约网点", "兑换点"],
      placeholder: ["请选择网点", "请输入网点", "网点", "选择网点"],
      name: ["branch", "subbranch", "netpoint"],
      id: ["branch", "subbranch", "netpoint"]
    },
    verifyCode: {
      label: ["验证码", "图形验证码", "图形校验码", "附加码"],
      placeholder: ["请输入验证码", "验证码", "图形验证码", "附加码"],
      name: ["verifyCode", "captcha", "vcode", "verify_code", "code"],
      id: ["verifyCode", "captcha", "vcode", "verify_code", "code"]
    },
    exchangeTime: {
      label: ["兑换日期", "预约日期", "兑换时间"],
      placeholder: ["兑换日期", "预约日期", "兑换时间", "请选择兑换日期", "请选择预约日期"],
      name: ["exchangeDate", "exchangeTime", "appointmentDate", "exDate", "reserveDate", "ex_date"],
      id: ["exchangeDate", "exchangeTime", "appointmentDate", "exDate", "reserveDate"]
    },
    quantity: {
      label: ["数量", "预约数量", "枚数", "份数"],
      placeholder: ["请输入数量", "数量", "预约数量"],
      name: ["quantity", "count", "amount", "num", "nums"],
      id: ["quantity", "count", "amount", "num"]
    }
  };

  /* ============ 工具 ============ */
  function esc(s) {
    return String(s == null ? "" : s).toLowerCase();
  }

  function isVisible(el) {
    if (!el || !el.offsetParent && el.style && el.style.position !== "fixed") {
      // offsetParent 为 null 可能因为 fixed 定位，再查 display/visibility
      if (!el || el.disabled) return false;
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || st.opacity === "0") return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }
    return true;
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function fillValue(el, val) {
    if (!el || val == null) return false;
    const tag = el.tagName ? el.tagName.toLowerCase() : "";
    if (tag === "select") {
      let hit = null;
      const v = String(val).trim();
      if (!v) return false;
      for (const opt of el.options) {
        if (opt.text && esc(opt.text).indexOf(esc(v)) >= 0) { hit = opt.value !== undefined ? opt.value : opt.text; break; }
        if (esc(opt.value) === esc(v)) { hit = opt.value; break; }
      }
      if (hit === null) {
        for (const opt of el.options) {
          const t = opt.text.trim();
          if (t && (v.indexOf(t) >= 0 || t.indexOf(v) >= 0)) { hit = opt.value !== undefined ? opt.value : opt.text; break; }
        }
      }
      if (hit === null) return false;
      el.value = hit;
    } else if (tag === "input" && (el.type === "date" || el.type === "datetime-local")) {
      el.value = String(val).slice(0, 10);
    } else {
      el.value = val;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    try { el.dispatchEvent(new Event("blur", { bubbles: true })); } catch (e) { /* ignore */ }
    return true;
  }

  /* ============ 智能字段匹配：__SX_SMART_FIND__ ============ */
  // 策略1：element-ui 表格行（td 标签 + td 输入框）
  function findInElTable(key) {
    const kw = FIELD_KEYWORDS[key];
    if (!kw) return null;
    const rows = document.querySelectorAll(".el-table__body tr, table tr, .el-table__row");
    for (const row of rows) {
      const tds = row.querySelectorAll("td");
      if (tds.length < 2) continue;
      const labelText = esc(tds[0].textContent || "");
      const words = kw.label.concat(kw.placeholder);
      if (words.some((w) => labelText.indexOf(esc(w)) >= 0)) {
        const cell = tds[1];
        const input = cell.querySelector("input, select, textarea");
        if (input && isVisible(input)) return input;
        // 整行里找
        const any = row.querySelector("input, select, textarea");
        if (any && isVisible(any)) return any;
      }
    }
    return null;
  }

  function findInForm(key) {
    const kw = FIELD_KEYWORDS[key];
    if (!kw) return null;
    const els = document.querySelectorAll("input, select, textarea");
    for (const el of els) {
      if (el.disabled || el.readOnly || !isVisible(el)) continue;
      if (el.type === "hidden" || el.type === "submit" || el.type === "button" || el.type === "password") continue;
      const name = esc(el.name || "");
      const id = esc(el.id || "");
      const ph = esc(el.getAttribute("placeholder") || "");
      const aria = esc(el.getAttribute("aria-label") || "");
      const cls = esc(el.className || "");
      // label[for]
      let labelText = "";
      if (el.id) {
        const lb = document.querySelector('label[for="' + CSS.escape(el.id) + '"]');
        if (lb) labelText = esc(lb.textContent);
      }
      // closest label
      if (!labelText && el.closest) {
        const cl = el.closest("label");
        if (cl) labelText = esc(cl.textContent);
      }
      // 父容器短文本（<200 字符）
      let parentText = "";
      if (!labelText && el.parentElement) {
        const pt = el.parentElement.textContent || "";
        if (pt.length < 200) parentText = esc(pt);
      }
      const hay = name + "|" + id + "|" + ph + "|" + aria + "|" + labelText + "|" + parentText + "|" + cls;
      // name/id：按 _ - 分隔的 token 完全匹配（避免 "num" 误中 "identitynumber" 这类子串）
      const nameIdTokens = ("|" + name + "|" + id + "|")
        .split(/[_\-\|]+/)
        .filter(Boolean);
      for (const w of kw.name.concat(kw.id)) {
        if (nameIdTokens.indexOf(w) >= 0) return el;
      }
      // placeholder / aria / label / parentText / className：关键词子串匹配
      const all = kw.label.concat(kw.placeholder);
      for (const w of all) {
        if (hay.indexOf(esc(w)) >= 0) return el;
      }
    }
    return null;
  }

  function findFieldByKey(key) {
    return findInElTable(key) || findInForm(key);
  }

  /* ============ 证件类型选择 ============ */
  function selectIdType(sel) {
    if (!sel || sel.tagName.toLowerCase() !== "select") return false;
    const hitWords = ["身份证", "居民身份证", "二代身份证", "id_card", "idcard", "id card"];
    for (const opt of sel.options) {
      const t = esc(opt.text);
      const v = esc(opt.value);
      if (hitWords.some((w) => t.indexOf(w) >= 0)) {
        sel.value = opt.value !== undefined ? opt.value : opt.text;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        sel.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }
      if (v === "01" || v === "1" || v === "id" || v === "idc" || v === "IDCARD") {
        sel.value = opt.value;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
        sel.dispatchEvent(new Event("input", { bubbles: true }));
        return true;
      }
    }
    return false;
  }

  /* ============ 省市区下拉 ============ */
  function selectByText(sel, val) {
    if (!sel || !val) return false;
    const v = String(val).trim();
    if (!v) return false;
    if (sel.tagName.toLowerCase() === "select") return fillValue(sel, v);
    return false;
  }

  function fillRegionSelects(person, selectorMap) {
    const map = selectorMap || {};
    const pairs = [
      ["province", person.province],
      ["city", person.city],
      ["district", person.district]
    ];
    let filled = 0;
    for (const [key, val] of pairs) {
      if (!val) continue;
      let sel = null;
      if (map[key]) sel = safeQ(map[key]);
      if (!sel) sel = findFieldByKey(key);
      if (sel) {
        if (sel.tagName.toLowerCase() === "select") {
          if (fillValue(sel, val)) filled++;
        }
        // 非 select（级联输入）交给 BranchFinder
      }
    }
    return filled;
  }

  /* ============ 兑换日期 ============ */
  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function normalizeExchangeDate(val) {
    if (!val) return "";
    let d = null;
    if (val instanceof Date) d = val;
    else {
      const s = String(val).trim();
      // 支持 2026-1-5 / 2026/1/5 / 2026.1.5 / 20260105
      let m = s.match(/^(\d{4})[-\/.年](\d{1,2})[-\/.月](\d{1,2})/);
      if (m) d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
      else if (/^\d{8}$/.test(s)) d = new Date(parseInt(s.slice(0, 4), 10), parseInt(s.slice(4, 6), 10) - 1, parseInt(s.slice(6, 8), 10));
      else d = new Date(s);
    }
    if (isNaN(d.getTime())) return "";
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }

  function findExchangeDateInput() {
    // 优先原生 date 输入框
    const dates = document.querySelectorAll('input[type="date"], input[type="datetime-local"]');
    for (const el of dates) {
      if (isVisible(el) && !el.disabled) return el;
    }
    // placeholder / name / id
    const sels = [
      'input[placeholder*="兑换日期"]',
      'input[placeholder*="预约日期"]',
      'input[placeholder*="兑换时间"]',
      'input[name*="exchangeDate"]',
      'input[id*="exchangeDate"]',
      'input[name*="exchangeTime"]',
      'input[id*="exchangeTime"]',
      'input[name*="appointmentDate"]',
      'input[id*="appointmentDate"]',
      '.el-date-editor input.el-input__inner'
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el && isVisible(el) && !el.disabled) return el;
    }
    return findFieldByKey("exchangeTime");
  }

  /* ============ 协议勾选 ============ */
  function autoCheckAgreementCheckboxes() {
    let checked = 0;
    // element-ui checkbox
    const boxes = document.querySelectorAll(".el-checkbox, .el-checkbox input[type='checkbox'], input[type='checkbox']");
    for (const el of boxes) {
      const cb = el.tagName === "INPUT" ? el : el.querySelector("input[type='checkbox']");
      if (!cb) continue;
      if (!isVisible(cb)) continue;
      if (cb.checked || cb.getAttribute("is-checked") === "true" || cb.closest(".el-checkbox.is-checked")) continue;
      // 排除隐藏的"记住我"类：只勾协议
      try {
        const labelText = esc(cb.closest("label") ? cb.closest("label").textContent : "");
        if (labelText && (labelText.indexOf("协议") >= 0 || labelText.indexOf("同意") >= 0 || labelText.indexOf("阅读并") >= 0)) {
          cb.click();
          checked++;
          continue;
        }
        if (!labelText || labelText.length < 40) {
          cb.click();
          checked++;
        }
      } catch (e) { /* ignore */ }
    }
    return checked;
  }

  /* ============ 提交 ============ */
  // 安全查询：选择器可能含 :contains 等非标准段，逐段尝试，非法段跳过
  function safeQ(sel) {
    if (!sel) return null;
    const parts = String(sel).split(",");
    for (let p of parts) {
      p = p.trim();
      if (!p) continue;
      try {
        const el = document.querySelector(p);
        if (el) return el;
      } catch (e) { /* 非法选择器段，跳过 */ }
    }
    return null;
  }

  // 按文本找提交按钮（替代 :contains）
  function findButtonByText(words) {
    const btns = document.querySelectorAll("button, input[type='submit']");
    for (const b of btns) {
      if (!isVisible(b) || b.disabled) continue;
      const t = esc(b.textContent || "") + "|" + esc(b.value || "");
      if (words.some((w) => t.indexOf(esc(w)) >= 0)) return b;
    }
    return null;
  }

  function defaultSubmit() {
    const sels = 'button[type="submit"], input[type="submit"], .submit, .btn-submit, button.el-button--primary';
    const btn = safeQ(sels);
    if (btn && isVisible(btn) && !btn.disabled) {
      btn.click();
      return true;
    }
    return false;
  }

  /* ============ Toast ============ */
  function showToast(msg, type) {
    type = type || "info";
    const color = type === "success" ? "#16a34a" : type === "warning" ? "#f59e0b" : type === "error" ? "#dc2626" : "#2563eb";
    const el = document.createElement("div");
    el.style.cssText =
      "position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:2147483647;" +
      "padding:10px 20px;border-radius:8px;color:#fff;font-size:14px;background:" + color + ";" +
      "box-shadow:0 4px 16px rgba(0,0,0,.25);max-width:80vw;word-break:break-all;font-family:'Microsoft YaHei',sans-serif;";
    el.textContent = msg;
    document.documentElement.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch (e) { /* ignore */ } }, 4000);
  }

  /* ============ 网点路径解析 ============ */
  function resolveBranchParts(person) {
    if (person && person.branchPath) {
      return String(person.branchPath).split("/").map((s) => s.trim()).filter(Boolean);
    }
    const parts = [];
    if (person && person.province) parts.push(person.province);
    if (person && person.city) parts.push(person.city);
    if (person && person.district) parts.push(person.district);
    if (person && person.branch) parts.push(person.branch);
    return parts;
  }

  window.__SX_SMART_FIND__ = findFieldByKey;
  window.__SX_COMMON__ = {
    FIELD_KEYWORDS,
    esc,
    isVisible,
    delay,
    fillValue,
    selectIdType,
    fillRegionSelects,
    normalizeExchangeDate,
    findExchangeDateInput,
    autoCheckAgreementCheckboxes,
    defaultSubmit,
    safeQ,
    findButtonByText,
    showToast,
    resolveBranchParts
  };
})();
