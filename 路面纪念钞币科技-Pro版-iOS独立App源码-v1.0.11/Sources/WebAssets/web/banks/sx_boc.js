/**
 * 路面纪念钞币科技 · 中国银行（BOC）适配器
 */
(function () {
  "use strict";
  const C = window.__SX_COMMON__;

  const adapter = {
    id: "BOC",
    detect: () => {
      const host = location.hostname || "";
      const path = location.pathname || "";
      return host.includes("boc") || host.includes("bankofchina") || path.includes("中国银行") || path.includes("bankofchina");
    },

    async waitForOpen() { },

    getSelectorMap: () => ({
      fullName:
        'input[name*="name"],input[id*="name"],input[placeholder*="姓名"],input[placeholder*="客户姓名"],input[name*="custName"],input[id*="custName"]',
      idType:
        'select[name*="idType"],select[id*="idType"],select[name*="certType"],select[id*="certType"],select[name*="idtype"],select[id*="idtype"]',
      idNumber:
        'input[name*="idNumber"],input[id*="idNumber"],input[name*="idNo"],input[id*="idNo"],input[name*="certNo"],input[id*="certNo"],input[name*="certNumber"],input[id*="certNumber"],input[placeholder*="证件号码"],input[placeholder*="证件号"],input[placeholder*="身份证号"]',
      mobile:
        'input[name*="mobile"],input[id*="mobile"],input[name*="phone"],input[id*="phone"],input[placeholder*="手机号码"],input[placeholder*="手机号"],input[name*="tel"],input[id*="tel"]',
      address:
        'textarea[name*="address"],textarea[id*="address"],input[name*="address"],input[id*="address"],input[placeholder*="地址"],textarea[placeholder*="地址"]',
      province: 'select[name*="province"],select[id*="province"],select[name*="Province"],select[id*="Province"]',
      city: 'select[name*="city"],select[id*="city"],select[name*="City"],select[id*="City"]',
      district: 'select[name*="district"],select[id*="district"],select[name*="county"],select[id*="county"],select[name*="area"],select[id*="area"]',
      branch: 'input[name*="branch"],input[id*="branch"],input[placeholder*="网点"],.el-cascader input.el-input__inner',
      submitButton: 'button[type="submit"],input[type="submit"],button.el-button--primary'
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
        else console.warn("[BOC] 未找到", key);
      };

      set("fullName", person.fullName);
      set("idNumber", person.idNumber);
      set("mobile", person.mobile);
      set("address", person.address);

      const idType = C.safeQ(selMap.idType);
      if (idType) C.selectIdType(idType);

      C.fillRegionSelects(person, selMap);

      const parts = C.resolveBranchParts(person);
      if (parts.length) {
        try {
          const r = await window.__branchFinder__.autoFillBranch(parts, { enableLog: false });
          console.log("[BOC] BranchFinder 结果:", r);
        } catch (e) {
          console.warn("[BOC] BranchFinder 执行报错:", e);
        }
      }

      const date = C.normalizeExchangeDate(person.exchangeTime);
      const dateEl = C.findExchangeDateInput();
      if (date && dateEl) {
        C.fillValue(dateEl, date);
        console.log("[BOC] 兑换日期填写成功:", date);
      } else if (person.exchangeTime) {
        console.warn("[BOC] 未找到兑换日期输入框");
      }

      set("quantity", person.quantity);
      C.autoCheckAgreementCheckboxes();
      console.log("[BOC] 表单填写完成");
      return { ok: true, bank: "BOC" };
    },

    async submit() {
      const btn = document.querySelector('button[type="submit"], input[type="submit"], button.el-button--primary, .el-button--primary, .submit, .btn-submit');
      if (btn && !btn.disabled) {
        btn.click();
        console.log("[BOC] 提交按钮已点击");
        return true;
      }
      console.warn("[BOC] 未找到提交按钮");
      return false;
    },

    async verifyResult() {
      const text = (document.body.innerText || document.body.textContent || "").toLowerCase();
      return /成功|已受理|完成|预约成功|提交成功|操作成功/.test(text);
    }
  };

  window.shuixian.register(adapter);
})();
