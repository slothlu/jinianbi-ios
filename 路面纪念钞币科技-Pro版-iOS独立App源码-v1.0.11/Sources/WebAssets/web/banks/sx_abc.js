/**
 * 路面纪念钞币科技 · 中国农业银行（ABC）适配器
 * 选择器知识来自参考版反混淆分析；逻辑为本项目自行实现。
 */
(function () {
  "use strict";
  const C = window.__SX_COMMON__;

  const adapter = {
    id: "ABC",
    detect: () =>
      (location.hostname || "").includes("abchina") ||
      (location.hostname || "").includes("eapply.abchina.com.cn") ||
      (location.pathname || "").includes("农业银行") ||
      (location.pathname || "").includes("CoinSearch") ||
      (location.pathname || "").includes("coin"),

    async waitForOpen() { /* 页面即表单，无需等待 */ },

    getSelectorMap: () => ({
      fullName:
        'input[name*="name"],input[id*="name"],input[placeholder*="姓名"],input[name*="userName"],input[name*="customerName"],input[name*="realName"],input[id*="userName"],input[id*="customerName"],input[id*="realName"],input[name*="custName"],input[id*="custName"]',
      idType:
        'select[name*="idType"],select[id*="idType"],select[name*="certType"],select[id*="certType"],select[name*="idTypeCode"],select[id*="idTypeCode"],select[value*="身份证"],select[value*="IDCARD"],select[value*="1010"]',
      idNumber:
        'input[name*="idNumber"],input[id*="idNumber"],input[name*="idNo"],input[id*="idNo"],input[name*="certNo"],input[id*="certNo"],input[name*="certNumber"],input[id*="certNumber"],input[placeholder*="证件号码"],input[placeholder*="证件号"],input[placeholder*="身份证号"],input[name*="idCardNo"],input[id*="idCardNo"],input[name*="idCard"],input[id*="idCard"]',
      mobile:
        'input[name*="mobile"],input[id*="mobile"],input[name*="phone"],input[id*="phone"],input[placeholder*="手机号码"],input[placeholder*="手机号"],input[name*="mobilePhone"],input[id*="mobilePhone"],input[name*="tel"],input[id*="tel"],input[name*="telephone"],input[id*="telephone"]',
      address:
        'input[name*="address"],input[id*="address"],textarea[name*="address"],textarea[id*="address"],input[placeholder*="地址"],textarea[placeholder*="地址"],input[name*="detailAddress"],textarea[name*="detailAddress"]',
      province: 'select[name*="province"],select[id*="province"],select[name*="Province"],select[id*="Province"]',
      city: 'select[name*="city"],select[id*="city"],select[name*="City"],select[id*="City"]',
      district:
        'select[name*="district"],select[id*="district"],select[name*="District"],select[id*="District"],select[name*="county"],select[id*="county"],select[name*="area"],select[id*="area"]',
      verifyCode:
        'input[name*="verifyCode"],input[id*="verifyCode"],input[name*="captcha"],input[id*="captcha"],input[name*="vcode"],input[id*="vcode"],input[placeholder*="验证码"],input[placeholder*="图形验证码"],input[placeholder*="附加码"]',
      submitButton:
        'input[type="submit"][value*="提交"],input[type="submit"][value*="确认"],input[type="submit"][value*="预约"],button[type="submit"],button:contains("提交"),button:contains("确认"),button:contains("预约")'
    }),

    /* 银行专属关键词匹配（备用） */
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
        else console.warn("[ABC] 未找到", key);
      };

      set("fullName", person.fullName);
      set("idNumber", person.idNumber);
      set("mobile", person.mobile);
      set("address", person.address);

      // 证件类型
      const idType = C.safeQ(selMap.idType);
      if (idType) C.selectIdType(idType);

      // 省/市/区
      C.fillRegionSelects(person, selMap);

      // 网点：自动选网点
      const parts = C.resolveBranchParts(person);
      if (parts.length) {
        try {
          const r = await window.__branchFinder__.autoFillBranch(parts, { enableLog: false });
          console.log("[ABC] BranchFinder 结果:", r);
        } catch (e) {
          console.warn("[ABC] BranchFinder 执行报错:", e);
        }
      }

      // 兑换日期
      const date = C.normalizeExchangeDate(person.exchangeTime);
      const dateEl = C.findExchangeDateInput();
      if (date && dateEl) {
        C.fillValue(dateEl, date);
        console.log("[ABC] 兑换日期填写成功:", date);
      } else if (person.exchangeTime) {
        console.warn("[ABC] 未找到兑换日期输入框");
      }

      // 数量
      set("quantity", person.quantity);

      // 协议勾选
      C.autoCheckAgreementCheckboxes();

      console.log("[ABC] 表单填写完成");
      return { ok: true, bank: "ABC" };
    },

    async submit() {
      const sel = this.getSelectorMap().submitButton;
      const btn = C.safeQ(sel) || C.findButtonByText(["提交", "确认", "预约"]);
      if (btn && !btn.disabled) {
        btn.click();
        console.log("[ABC] 提交按钮已点击");
        return true;
      }
      console.warn("[ABC] 未找到提交按钮");
      return false;
    },

    async verifyResult() {
      const text = (document.body.innerText || document.body.textContent || "").toLowerCase();
      return /成功|已受理|完成|预约成功|提交成功|操作成功/.test(text);
    }
  };

  window.shuixian.register(adapter);
})();
