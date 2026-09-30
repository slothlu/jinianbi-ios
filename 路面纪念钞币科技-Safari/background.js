/* background.js
 * 已取消卡密验证功能：本文件仅保留「打开扩展弹窗」的消息处理。
 * 内容脚本（银行页面悬浮窗）的所有功能均不依赖本文件中的验证逻辑。
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) return;

  // 银行页面悬浮窗的「设置」按钮请求打开扩展弹窗
  if (message.type === 'OPEN_LICENSE_POPUP') {
    try {
      if (chrome.action && typeof chrome.action.openPopup === 'function') {
        chrome.action.openPopup(() => {
          if (chrome.runtime.lastError) {
            console.warn('尝试打开扩展弹窗失败：', chrome.runtime.lastError.message);
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
          } else {
            sendResponse({ ok: true });
          }
        });
        return true;
      }
      sendResponse({ ok: false, error: '当前环境不支持自动打开扩展弹窗，请通过浏览器菜单打开扩展' });
      return false;
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
      return false;
    }
  }
});
