/**
 * 路面纪念钞币科技 · 中国工商银行（ICBC）适配器
 * 硬编码 ID 选择器 + 智能匹配回退
 */
(function () {
  "use strict";
  const C = window.__SX_COMMON__;

  const adapter = {
    id: "ICBC",
    detect: () => (location.hostname || "").includes("icbc"),

    async waitForOpen() { },

    getSelectorMap: () => ({
      fullName: "#custName, input[name=\"custName\"]",
      idType: "#idType, select[name=\"idType\"]",
      idNumber: "#idNo, input[name=\"idNo\"]",
      mobile: "#mobile, input[name=\"mobile\"]",
      address: "#address, textarea[name=\"address\"]",
      zipCode: "#zip, input[name=\"zip\"]",
      province: "select#province",
      city: "select#city",
      district: "select#district",
      submitButton: "button#submit, button.btn-submit, .submit"
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
        else console.warn("[ICBC] 未找到", key);
      };

      set("fullName", person.fullName);
      set("idNumber", person.idNumber);
      set("mobile", person.mobile);
      set("address", person.address);

      const idType = C.safeQ(selMap.idType);
      if (idType) C.selectIdType(idType);

      // 省/市/区（原生 select）
      C.fillRegionSelects(person, selMap);

      // 网点
      const parts = C.resolveBranchParts(person);
      if (parts.length) {
        try {
          const r = await window.__branchFinder__.autoFillBranch(parts, { enableLog: false });
          console.log("[ICBC] BranchFinder 结果:", r);
        } catch (e) {
          console.warn("[ICBC] BranchFinder 执行报错:", e);
        }
      }

      const date = C.normalizeExchangeDate(person.exchangeTime);
      const dateEl = C.findExchangeDateInput();
      if (date && dateEl) {
        C.fillValue(dateEl, date);
        console.log("[ICBC] 兑换日期填写成功:", date);
      } else if (person.exchangeTime) {
        console.warn("[ICBC] 未找到兑换日期输入框");
      }

      set("quantity", person.quantity);
      C.autoCheckAgreementCheckboxes();
      console.log("[ICBC] 表单填写完成");
      return { ok: true, bank: "ICBC" };
    },

    async submit() {
      const btn = document.querySelector('button#submit, button.btn-submit, .submit, button[type="submit"], .el-button--primary');
      if (btn && !btn.disabled) {
        btn.click();
        console.log("[ICBC] 提交按钮已点击");
        return true;
      }
      console.warn("[ICBC] 未找到提交按钮");
      return false;
    },

    async verifyResult() {
      const text = (document.body.innerText || document.body.textContent || "").toLowerCase();
      return /成功|已受理|完成|预约成功|提交成功|操作成功/.test(text);
    }
  };

  window.shuixian.register(adapter);
})();
