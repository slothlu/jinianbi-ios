/* 测试站桥接：让 App 在 jiangbkvir.github.io 模拟预约测试页上也能识别银行并弹出悬浮窗。
   原脚本靠 hostname/pathname 含银行英文关键字（icbc/boc/ccb/abc/psbc）识别银行，
   而测试页域名是 jiangbkvir.github.io，不满足。此脚本覆盖 detect()，
   当打开测试站子页面时按 pathname 中的中文银行名匹配已注册的适配器。 */
(function () {
  try {
    var sx = window.shuixian;
    if (!sx || typeof sx.detect !== 'function') return;
    var origDetect = sx.detect;
    var TEST_HOST = 'jiangbkvir';
    sx.detect = function () {
      try {
        var host = String(location.hostname || '');
        var path = String(location.pathname || '');
        if (host.indexOf(TEST_HOST) !== -1 || path.indexOf('test-pages') !== -1) {
          var page = decodeURIComponent(path);
          var banks = [
            ['工商', 'ICBC'],
            ['建设', 'CCB'],
            ['中国银行', 'BOC'],
            ['农业', 'ABC'],
            ['邮政', 'PSBC'],
            ['交通', 'BOCOM'],
            ['华夏', 'HXB'],
            ['浦发', 'SPDB']
          ];
          var all = (typeof sx.all === 'function') ? sx.all() : {};
          var keys = Object.keys(all || {});
          for (var i = 0; i < banks.length; i++) {
            if (page.indexOf(banks[i][0]) !== -1) {
              for (var j = 0; j < keys.length; j++) {
                var ad = all[keys[j]];
                if (ad && ad.id && String(ad.id).toUpperCase() === banks[i][1]) return ad;
              }
              return null; // 该银行没有适配器（交通/华夏/浦发），按不支持处理
            }
          }
        }
      } catch (e) { console.warn('[SX] test bridge error:', e); }
      return origDetect();
    };
  } catch (e) { /* 忽略 */ }
})();
