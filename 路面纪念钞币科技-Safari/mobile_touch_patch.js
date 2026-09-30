/* mobile_touch_patch.js
 * 手机触屏适配补丁：为银行预约页面上的悬浮窗 (#sx-floating-window) 增加触摸拖拽能力。
 * 纯增量代码，不修改原有任何逻辑；在电脑端自动空转，不影响电脑版使用。
 */
(function () {
  if (window.__SX_MOBILE_TOUCH_PATCH__) return;
  window.__SX_MOBILE_TOUCH_PATCH__ = true;

  var TOUCH_SLOP = 6; // 手指移动超过 6px 才算拖拽，避免误触

  function enhance(win) {
    if (!win || win.__sxTouchBound) return;
    var header = win.querySelector('.sx-floating-header');
    if (!header) return;
    win.__sxTouchBound = true;

    var startX = 0, startY = 0, baseLeft = 0, baseTop = 0, dragging = false;

    header.addEventListener('touchstart', function (e) {
      var t = e.touches[0];
      var rect = win.getBoundingClientRect();
      baseLeft = rect.left;
      baseTop = rect.top;
      startX = t.clientX;
      startY = t.clientY;
      dragging = false;
    }, { passive: true });

    header.addEventListener('touchmove', function (e) {
      var t = e.touches[0];
      var dx = t.clientX - startX;
      var dy = t.clientY - startY;
      if (!dragging && (Math.abs(dx) > TOUCH_SLOP || Math.abs(dy) > TOUCH_SLOP)) {
        dragging = true;
      }
      if (dragging) {
        e.preventDefault(); // 拖拽时阻止页面滚动
        var maxLeft = Math.max(0, window.innerWidth - win.offsetWidth);
        var maxTop = Math.max(0, window.innerHeight - win.offsetHeight);
        var nx = Math.min(Math.max(0, baseLeft + dx), maxLeft);
        var ny = Math.min(Math.max(0, baseTop + dy), maxTop);
        win.style.right = 'auto';
        win.style.transform = 'none';
        win.style.left = nx + 'px';
        win.style.top = ny + 'px';
      }
    }, { passive: false });

    header.addEventListener('touchend', function (e) {
      if (dragging) {
        e.preventDefault(); // 拖拽结束后阻止合成 click，避免误点设置/关闭按钮
        dragging = false;
      }
    }, { passive: false });

    header.addEventListener('touchcancel', function () {
      dragging = false;
    }, { passive: true });
  }

  function scan() {
    enhance(document.getElementById('sx-floating-window'));
  }

  // 悬浮窗是打开银行页面后动态创建的，用 MutationObserver 等它出现
  var observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
