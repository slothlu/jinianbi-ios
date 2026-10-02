/**
 * 路面纪念钞币科技 · 自动选网点引擎（sx_branch_finder）
 * 策略：扫描含"网点"关键词的可见组件 → 展开下拉 → 多级级联选择（省/市/区/网点）
 * 实现为纯 DOM 事件操作（click/change），稳定可靠，无需拟人化鼠标轨迹。
 */
(function () {
  "use strict";
  if (window.__SX_BRANCH_FINDER_LOADED__) return;
  window.__SX_BRANCH_FINDER_LOADED__ = true;

  const INCLUDE_KEYWORDS = ["兑换网点", "网点", "选择网点", "兑换点", "branch", "exchange"];
  const EXCLUDE_KEYWORDS = ["证件", "身份证", "手机", "验证码", "idtype", "mobile", "phone", "captcha", "邮箱", "email"];

  function esc(s) {
    return String(s == null ? "" : s).toLowerCase();
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.disabled) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function textOf(el) {
    return el ? (el.textContent || el.value || el.getAttribute("placeholder") || "").trim() : "";
  }

  class BranchFinder {
    constructor() {
      this.LOG_PREFIX = "[BranchFinder]";
    }

    log(...args) {
      try { console.log(this.LOG_PREFIX, ...args); } catch (e) { /* ignore */ }
    }

    warn(...args) {
      try { console.warn(this.LOG_PREFIX, ...args); } catch (e) { /* ignore */ }
    }

    /* 解析路径：省/市/区/网点 → parts 数组 */
    parseBranchPath(path) {
      if (!path) return null;
      if (Array.isArray(path)) return { fullPath: path.join("/"), parts: path.map((s) => s.trim()).filter(Boolean) };
      const parts = String(path).split("/").map((s) => s.trim()).filter(Boolean);
      return { fullPath: path, parts };
    }

    /* 查找网点候选组件 */
    findBranchComponents(maxResults = 10) {
      const candidates = [];
      const els = document.querySelectorAll(
        'input[type="text"], input:not([type]), select, [role="textbox"], [role="combobox"], .el-select, .el-cascader'
      );
      for (const el of els) {
        if (!isVisible(el)) continue;
        const hay = esc(
          (el.getAttribute("placeholder") || "") + "|" +
          (el.getAttribute("aria-label") || "") + "|" +
          (el.name || "") + "|" +
          (el.id || "") + "|" +
          (el.closest(".el-form-item") ? textOf(el.closest(".el-form-item").querySelector(".el-form-item__label")) : "")
        );
        // 也可用 closest label
        if (el.closest("label") && !hay.includes(esc(textOf(el.closest("label"))))) {
          /* 保留 label 文本进 hay */
        }
        if (!INCLUDE_KEYWORDS.some((w) => hay.indexOf(esc(w)) >= 0)) continue;
        if (EXCLUDE_KEYWORDS.some((w) => hay.indexOf(esc(w)) >= 0)) continue;
        candidates.push(el);
        if (candidates.length >= maxResults) break;
      }
      return candidates;
    }

    /* 查找可见下拉菜单容器 */
    findDropdownMenus(anchor) {
      const sels = [
        "[role='menu']", ".el-select-dropdown", ".el-popper", ".ant-select-dropdown",
        ".el-cascader-menu", ".cascader-menu", "[class*='dropdown']", "[class*='menu']", "[class*='select']"
      ];
      const menus = [];
      const anchorRect = anchor ? anchor.getBoundingClientRect() : null;
      for (const s of sels) {
        const nodes = document.querySelectorAll(s);
        for (const n of nodes) {
          if (!isVisible(n)) continue;
          // 下拉容器须在锚点附近（≤ 屏幕 60% 宽高范围内）
          const r = n.getBoundingClientRect();
          if (anchorRect) {
            if (r.bottom < anchorRect.top - 10 || r.top > anchorRect.bottom + 600) continue;
          }
          if (r.width < 20 || r.height < 10) continue;
          // 排除 input 自身
          if (n === anchor) continue;
          menus.push(n);
        }
      }
      // 去重（同一容器可能命中多个选择器）
      const seen = new Set();
      const out = [];
      for (const m of menus) {
        if (seen.has(m)) continue;
        seen.add(m);
        out.push(m);
      }
      return out;
    }

    /* 在菜单里查找匹配文本的选项 */
    findOptionByText(menu, part) {
      const p = esc(String(part).trim()).replace(/省分行$|分行$|支行$|营业部.*$|支行.*$/, "");
      if (!p) return null;
      const items = menu.querySelectorAll(
        '[role="menuitem"], li[role="menuitem"], li[role="option"], li, .el-cascader-node, .el-select-dropdown__item, .ant-select-item'
      );
      let best = null;
      let bestScore = 0;
      for (const it of items) {
        const t = esc(textOf(it)).replace(/[\s]/g, "");
        if (!t || t.length < 1) continue;
        let score = 0;
        if (t === p) score = 10;
        else if (t.indexOf(p) >= 0) score = 8;
        else if (p.indexOf(t) >= 0 && t.length >= 2) score = 5;
        if (score > bestScore) { bestScore = score; best = it; }
      }
      return best;
    }

    /* 从单级下拉选择 */
    async selectFromSingleDropdown(parts, anchor) {
      const menus = this.findDropdownMenus(anchor);
      if (!menus.length) return { ok: false, reason: "no-dropdown" };
      const menu = menus[menus.length - 1]; // 最后一个通常是激活的下拉
      const part = parts[parts.length - 1] || parts[0];
      const item = this.findOptionByText(menu, part);
      if (!item) {
        // 没匹配 → 点击第一个可用项（参考版行为）
        const first = menu.querySelector('[role="menuitem"], li[role="option"], li, .el-cascader-node, .el-select-dropdown__item');
        if (first && isVisible(first)) { first.click(); return { ok: true, method: "first-fallback", matched: textOf(first) }; }
        return { ok: false, reason: "no-match" };
      }
      item.click();
      return { ok: true, method: "click", matched: textOf(item) };
    }

    /* 多级级联选择 */
    async selectFromDropdown(parts, anchor) {
      let curAnchor = anchor;
      const matched = [];
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        await delay(250 + Math.floor(Math.random() * 200));
        const menus = this.findDropdownMenus(curAnchor);
        if (!menus.length) {
          this.warn("未找到第", i + 1, "级下拉菜单（", part, "）");
          // 尝试强制展开
          const forced = this.forceOpenDropdown(curAnchor);
          if (!forced) break;
          await delay(400);
          const menus2 = this.findDropdownMenus(curAnchor);
          if (!menus2.length) break;
        }
        const menu = (this.findDropdownMenus(curAnchor)).pop();
        const item = this.findOptionByText(menu, part);
        if (!item) {
          this.warn("第", i + 1, "级未匹配到:", part);
          // 回退：点第一个可用
          const first = menu.querySelector('[role="menuitem"], li[role="option"], li, .el-cascader-node, .el-select-dropdown__item');
          if (first && isVisible(first)) first.click();
          else break;
          matched.push("(首项)");
        } else {
          item.click();
          matched.push(textOf(item));
        }
        curAnchor = item; // 下一级下拉相对此选项展开
      }
      return { ok: matched.length > 0, method: "cascade", matched };
    }

    /* 强制展开下拉 */
    forceOpenDropdown(anchor) {
      if (!anchor) return false;
      try {
        // element-ui：点击 suffix 箭头
        const suffix = anchor.querySelector(".el-input__suffix, .el-select__caret, .el-icon-arrow-down, .el-input__suffix-inner, [class*='suffix'], [class*='arrow'], [class*='caret'], .el-cascader__caret");
        if (suffix) { suffix.click(); return true; }
        anchor.click();
        return true;
      } catch (e) {
        anchor.click();
        return true;
      }
    }

    /* 主入口 */
    async autoFillBranch(branchPath, opts = {}) {
      const { enableLog = true, maxResults = 10 } = opts;
      this.logEnabled = enableLog;
      this.log("网点路径:", branchPath);
      const parsed = this.parseBranchPath(branchPath);
      if (!parsed || !parsed.parts.length) {
        this.warn("网点路径解析失败");
        return { ok: false, reason: "empty-path" };
      }
      const parts = parsed.parts;

      // 找组件
      let comp = null;
      const comps = this.findBranchComponents(maxResults);
      if (comps.length) comp = comps[0];
      if (!comp) {
        this.warn("未找到匹配的网点组件");
        return { ok: false, reason: "no-component" };
      }
      this.log("候选组件:", comp.tagName, comp.getAttribute("placeholder") || comp.id || comp.name || "");

      // 若是原生 select（省/市/区三连下拉）
      if (comp.tagName.toLowerCase() === "select" && parts.length >= 3) {
        // 尝试找省市区三个 select
        const selects = this.findBranchComponents(20).filter((e) => e.tagName.toLowerCase() === "select");
        const order = ["province", "city", "district"];
        let okCount = 0;
        for (let i = 0; i < Math.min(selects.length, parts.length); i++) {
          const sel = selects[i];
          const val = parts[i];
          const hit = this.selectNativeOption(sel, val);
          if (hit) okCount++;
          await delay(300);
        }
        // 网点 select
        if (selects.length > parts.length) {
          const lastSel = selects[parts.length];
          const lastVal = parts[parts.length - 1];
          this.selectNativeOption(lastSel, lastVal);
          await delay(200);
          const btn = document.querySelector('button[type="submit"], .btn-submit, button.el-button--primary');
          if (btn) btn.click();
        }
        return { ok: okCount > 0, method: "native-select", count: okCount };
      }

      // input/el-select/el-cascader：先尝试直接填值（部分页面支持输入过滤）
      if (comp.tagName.toLowerCase() === "input") {
        const lastPart = parts[parts.length - 1];
        try {
          comp.value = lastPart;
          comp.dispatchEvent(new Event("input", { bubbles: true }));
          comp.dispatchEvent(new Event("change", { bubbles: true }));
          await delay(300);
        } catch (e) { /* ignore */ }
      }

      // 展开下拉
      this.forceOpenDropdown(comp);
      await delay(350);
      const menus = this.findDropdownMenus(comp);
      if (!menus.length) {
        this.warn("未找到下拉菜单容器，尝试单级选择");
        const r = await this.selectFromSingleDropdown(parts, comp);
        return r;
      }

      const r = await this.selectFromDropdown(parts, comp);
      if (r.ok) this.log("多级联动选择成功:", r.matched);
      return r;
    }

    /* 原生 select 按文本选 */
    selectNativeOption(sel, val) {
      if (!sel || !val) return false;
      const v = String(val).trim();
      for (const opt of sel.options) {
        const t = (opt.text || "").trim();
        if (t && (t.indexOf(v) >= 0 || v.indexOf(t) >= 0 || esc(t) === esc(v))) {
          sel.value = opt.value !== undefined ? opt.value : opt.text;
          sel.dispatchEvent(new Event("change", { bubbles: true }));
          sel.dispatchEvent(new Event("input", { bubbles: true }));
          return true;
        }
      }
      return false;
    }
  }

  window.__branchFinder__ = new BranchFinder();
  window.BranchFinder = BranchFinder;
  console.log("[BranchFinder] 模块已加载");
})();
