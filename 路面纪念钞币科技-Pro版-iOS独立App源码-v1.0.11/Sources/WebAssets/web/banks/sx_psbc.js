/**
 * 路面纪念钞币科技 · 中国邮政储蓄银行（PSBC）适配器
 * element-ui 增强型：协议自动勾选、级联地区、el-select/el-cascader 网点
 */
(function () {
  "use strict";
  const C = window.__SX_COMMON__;

  const adapter = {
    id: "PSBC",
    detect: () => {
      const host = location.hostname || "";
      const path = location.pathname || "";
      return host.includes("psbc") || host.includes("postal") || path.includes("邮政") || path.includes("psbc");
    },

    async waitForOpen() { },

    getSelectorMap: () => ({
      fullName: 'input[name*="name"],input[id*="name"],input[placeholder*="姓名"]',
      idType: 'select[name*="certType"],select[id*="certType"],select[name*="idType"],select[id*="idType"]',
      idNumber:
        'input[name*="idNo"],input[id*="idNo"],input[name*="certNo"],input[id*="certNo"],input[placeholder*="证件号码"]',
      mobile:
        'input[name*="mobile"],input[id*="mobile"],input[name*="phone"],input[id*="phone"],input[placeholder*="手机号"]',
      address:
        'textarea[name*="address"],textarea[id*="address"],input[name*="address"],input[id*="address"],textarea[placeholder*="地址"],input[placeholder*="地址"]',
      province: 'select[name*="province"],select[id*="province"]',
      city: 'select[name*="city"],select[id*="city"]',
      district: 'select[name*="district"],select[id*="district"],select[name*="county"],select[id*="county"]',
      branch: 'input[name*="branch"],input[id*="branch"],input[placeholder*="网点"],.el-cascader input.el-input__inner',
      quantity: 'input[name*="count"],input[id*="count"],input[name*="amount"],input[id*="amount"],input[placeholder*="数量"],input[type="number"]'
    }),

    findInputByKeywords(key) {
      const kw = {
        fullName: ["姓名", "客户姓名", "兑换人"],
        idNumber: ["证件号码", "证件号", "身份证"],
        mobile: ["手机号", "手机号码", "联系电话"],
        address: ["联系地址", "详细地址", "通讯地址"],
        branch: ["网点", "兑换网点", "选择网点"]
      };
      const words = kw[key];
      if (!words) return null;
      for (const el of document.querySelectorAll("input, textarea")) {
        if (!C.isVisible(el)) continue;
        const hay = C.esc(
          (el.getAttribute("placeholder") || "") + "|" + (el.getAttribute("aria-label") || "") + "|" +
          (el.name || "") + "|" + (el.id || "") + "|" + (el.closest("label") ? C.esc(el.closest("label").textContent) : "")
        );
        if (words.some((w) => hay.indexOf(C.esc(w)) >= 0)) return el;
      }
      return null;
    },

    /* element-ui el-select 精确选择：点开下拉 → 匹配选项 → 点击 */
    async selectPsbcElSelect(input, value, placeholderWords) {
      if (!input) return false;
      // 点击展开
      input.click();
      await C.delay(300);
      const menus = document.querySelectorAll(".el-select-dropdown");
      let menu = null;
      for (const m of menus) {
        if (!C.isVisible(m)) continue;
        menu = m;
        break;
      }
      if (!menu) return false;
      const items = menu.querySelectorAll(".el-select-dropdown__item, li[role='option'], li");
      const v = String(value).trim();
      for (const it of items) {
        const t = (it.textContent || "").trim();
        if (t && (t.indexOf(v) >= 0 || v.indexOf(t) >= 0)) {
          it.click();
          await C.delay(150);
          return true;
        }
      }
      // 无匹配 → 选第一个
      const first = menu.querySelector(".el-select-dropdown__item, li[role='option'], li");
      if (first) { first.click(); await C.delay(150); return true; }
      return false;
    },

    async fillForm(person = {}) {
      const selMap = this.getSelectorMap();
      const smart = window.__SX_SMART_FIND__;
      const set = (key, val) => {
        if (val == null || val === "") return;
        let el = null;
        if (selMap[key]) el = C.safeQ(selMap[key]);
        if (!el && smart) el = smart(key);
        if (!el && this.findInputByKeywords) el = this.findInputByKeywords(key);
        if (el) C.fillValue(el, val);
        else console.warn("[PSBC] 未找到", key);
      };

      set("fullName", person.fullName);
      set("idNumber", person.idNumber);
      set("mobile", person.mobile);
      set("address", person.address);

      const idType = C.safeQ(selMap.idType);
      if (idType) C.selectIdType(idType);

      // 省/市/区：优先原生 select；否则 element-ui 级联
      const nativeRegion = C.fillRegionSelects(person, selMap);
      if (!nativeRegion || nativeRegion < 1) {
        // el-cascader 地区：交给 BranchFinder 级联
        const parts = C.resolveBranchParts(person);
        if (parts.length) {
          try {
            const r = await window.__branchFinder__.autoFillBranch(parts, { enableLog: false });
            console.log("[PSBC] BranchFinder 地区/网点结果:", r);
          } catch (e) {
            console.warn("[PSBC] BranchFinder 执行报错:", e);
          }
        }
      }

      // 网点（若未通过 BranchFinder 处理完整路径）
      const parts2 = C.resolveBranchParts(person);
      if (parts2.length) {
        try {
          const r = await window.__branchFinder__.autoFillBranch(parts2, { enableLog: false });
          console.log("[PSBC] BranchFinder 网点结果:", r);
        } catch (e) {
          console.warn("[PSBC] BranchFinder 执行报错:", e);
        }
      }

      const date = C.normalizeExchangeDate(person.exchangeTime);
      const dateEl = C.findExchangeDateInput();
      if (date && dateEl) {
        C.fillValue(dateEl, date);
        console.log("[PSBC] 兑换日期填写成功:", date);
      } else if (person.exchangeTime) {
        console.warn("[PSBC] 未找到兑换日期输入框");
      }

      set("quantity", person.quantity);
      C.autoCheckAgreementCheckboxes();
      console.log("[PSBC] 表单填写完成");
      return { ok: true, bank: "PSBC" };
    },

    async submit() {
      const btn = document.querySelector('button[type="submit"], input[type="submit"], .el-button--primary, .submit, .btn-submit');
      if (btn && !btn.disabled) {
        btn.click();
        console.log("[PSBC] 提交按钮已点击");
        return true;
      }
      console.warn("[PSBC] 未找到提交按钮");
      return false;
    },

    async verifyResult() {
      const text = (document.body.innerText || document.body.textContent || "").toLowerCase();
      return /成功|已受理|完成|预约成功|提交成功|操作成功/.test(text);
    }
  };

  window.shuixian.register(adapter);
})();
