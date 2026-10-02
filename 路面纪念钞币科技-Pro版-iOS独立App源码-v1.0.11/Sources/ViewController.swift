import UIKit
import WebKit
import Vision

/// 主界面：内置浏览器 + 银行页面脚本自动注入
final class ViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {

    private var webView: WKWebView!
    private let urlField = UITextField()
    private let goButton = UIButton(type: .system)

    /// 授权门禁只检查一次（viewDidAppear 首次）
    private var didCheckLicense = false

    private static let injectFiles: [String] = [
        "web/bridge_ios.js",
        "web/banks/BankMatch.js",
        "web/banks/sx_common.js",
        "web/banks/date_fill.js",
        "web/banks/sx_branch_finder.js",
        "web/banks/sx_abc.js",
        "web/banks/sx_boc.js",
        "web/banks/sx_ccb.js",
        "web/banks/sx_icbc.js",
        "web/banks/sx_psbc.js",
        "web/banks/test_bridge.js",
        "web/content.js",
        "web/style_patch.js",
        "web/mobile_touch_patch.js"
    ]

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        title = "路面纪念钞币科技"

        let config = WKWebViewConfiguration()
        config.userContentController.add(self, name: "SXBridge")
        config.allowsInlineMediaPlayback = true

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        // 与桌面扩展适配的页面版本保持一致
        webView.customUserAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)

        urlField.borderStyle = .roundedRect
        urlField.placeholder = "输入网址，如 https://..."
        urlField.keyboardType = .URL
        urlField.autocapitalizationType = .none
        urlField.autocorrectionType = .no
        urlField.returnKeyType = .go
        urlField.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(urlField)

        goButton.setTitle("前往", for: .normal)
        goButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(goButton)

        // 底部操作栏
        let homeBtn = makeBottomButton("主页", action: #selector(goHome))
        let refreshBtn = makeBottomButton("刷新", action: #selector(refreshPage))
        let settingsBtn = makeBottomButton("设置", action: #selector(openSettings))
        let bar = UIStackView(arrangedSubviews: [homeBtn, refreshBtn, settingsBtn])
        bar.axis = .horizontal
        bar.distribution = .fillEqually
        bar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(bar)

        NSLayoutConstraint.activate([
            urlField.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            urlField.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 12),
            goButton.leadingAnchor.constraint(equalTo: urlField.trailingAnchor, constant: 8),
            goButton.centerYAnchor.constraint(equalTo: urlField.centerYAnchor),
            goButton.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -12),
            goButton.widthAnchor.constraint(equalToConstant: 52),

            bar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            bar.heightAnchor.constraint(equalToConstant: 44),

            webView.topAnchor.constraint(equalTo: urlField.bottomAnchor, constant: 8),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: bar.topAnchor, constant: -4)
        ])

        goButton.addTarget(self, action: #selector(navigate), for: .touchUpInside)
        urlField.delegate = self

        loadHome()
    }

    // MARK: - Pro 版授权门禁

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        if !didCheckLicense {
            didCheckLicense = true
            checkLicense()
        }
    }

    /// 授权门禁：没有 token 就弹激活框（公告置顶）；有 token 联网验证，失效重新激活
    private func checkLicense() {
        if LicenseStore.token().isEmpty {
            presentActivate("请先输入卡密激活 Pro 版")
            return
        }
        LicenseClient.verify { [weak self] ok, msg, _ in
            guard let self = self else { return }
            if ok { return }
            LicenseStore.clear()
            self.presentActivate("授权" + (msg.isEmpty ? "失效" : "：" + msg) + "，请重新激活")
        }
    }

    private func presentActivate(_ hint: String) {
        DispatchQueue.main.async {
            let vc = ActivateController()
            vc.hint = hint
            self.present(vc, animated: true, completion: nil)
        }
    }

    private func makeBottomButton(_ title: String, action: Selector) -> UIButton {
        let b = UIButton(type: .system)
        b.setTitle(title, for: .normal)
        b.titleLabel?.font = .systemFont(ofSize: 15, weight: .medium)
        b.addTarget(self, action: action, for: .touchUpInside)
        return b
    }

    @objc private func goHome() { loadHome() }

    @objc private func refreshPage() { webView.reload() }

    @objc private func openSettings() {
        let vc = SettingsController()
        vc.onPersonsChanged = { [weak self] in
            guard let self = self else { return }
            // 同步更新页面内的人员快照，并通知悬浮窗刷新
            self.webView.evaluateJavaScript(
                "window.__SX_PERSONS_JSON__=" + self.personsJsonLiteral()
                + ";window.__sxFirePersonsChanged&&window.__sxFirePersonsChanged()",
                completionHandler: nil)
        }
        navigationController?.pushViewController(vc, animated: true)
    }

    private func loadHome() {
        guard let p = assetIndex["home.html"] else { return }
        webView.loadFileURL(URL(fileURLWithPath: p), allowingReadAccessTo: Bundle.main.bundleURL)
    }

    @objc private func navigate() {
        guard var u = urlField.text?.trimmingCharacters(in: .whitespacesAndNewlines), !u.isEmpty else { return }
        if !u.hasPrefix("http://") && !u.hasPrefix("https://") { u = "https://" + u }
        if let url = URL(string: u) { webView.load(URLRequest(url: url)) }
        urlField.resignFirstResponder()
    }

    // MARK: - WKNavigationDelegate

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let url = webView.url?.absoluteString else { return }
        if url.hasPrefix("http://") || url.hasPrefix("https://") {
            injectScripts(into: webView)
        }
    }

    func webView(_ webView: WKWebView,
                 decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        // 所有链接都在 App 内打开
        decisionHandler(.allow)
    }

    // MARK: - 脚本注入

    private func injectScripts(into view: WKWebView) {
        var sb = "(function(){if(window.__SX_INJECTED__)return;window.__SX_INJECTED__=true;"
        // 同步注入人员数据：悬浮窗/填表逻辑立即拿到人员，不依赖异步回传（避免页面跳转导致丢失）
        sb += "window.__SX_PERSONS_JSON__=" + personsJsonLiteral() + ";"
        for f in Self.injectFiles {
            let code = readAsset(f)
            if code.isEmpty {
                NSLog("[SX] 注入文件缺失: %@", f)
            }
            sb += code + "\n"
        }
        sb += "})();"
        view.evaluateJavaScript(sb) { [weak self] _, err in
            if let err = err {
                NSLog("[SX] 脚本注入失败: %@", err.localizedDescription)
            } else {
                // 自检：确认注入真正生效
                self?.webView.evaluateJavaScript(
                    "JSON.stringify({injected:!!window.__SX_INJECTED__,app:!!window.__SX_APP__,ocr:typeof window.__SX_OCR_RUN__==='function',chrome:!!(window.chrome&&window.chrome.storage),persons:(window.__SX_PERSONS_JSON__||'').length})"
                ) { res, _ in
                    NSLog("[SX] 注入自检: %@", String(describing: res))
                }
            }
        }
    }

    /// 把人员 JSON 转成 JS 字符串字面量，随注入脚本同步写入页面
    private func personsJsonLiteral() -> String {
        let json = PersonStore.getPersonsJson()
        var escaped = json
            .replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\r")
        return "\"" + escaped + "\""
    }

    /// 启动时扫描整个 App 安装包，建立 文件名 → 绝对路径 索引。
    /// 不依赖资源在 bundle 中的具体目录结构（可能带 web/ 或 WebAssets/ 前缀，也可能平铺）。
    private lazy var assetIndex: [String: String] = {
        var idx: [String: String] = [:]
        let fm = FileManager.default
        let base = Bundle.main.bundleURL
        if let en = fm.enumerator(at: base, includingPropertiesForKeys: nil,
                                  options: [.skipsHiddenFiles]) {
            for case let u as URL in en {
                if !u.hasDirectoryPath && !u.lastPathComponent.hasPrefix(".") {
                    idx[u.lastPathComponent] = u.path
                }
            }
        }
        return idx
    }()

    private func readAsset(_ path: String) -> String {
        let file = (path as NSString).lastPathComponent
        guard let p = assetIndex[file] else { return "" }
        return (try? String(contentsOfFile: p, encoding: .utf8)) ?? ""
    }

    // MARK: - WKScriptMessageHandler（JS → 原生）

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "SXBridge",
              let body = message.body as? [String: Any],
              let id = body["id"] as? String,
              let action = body["action"] as? String else { return }
        let payload = body["payload"] as? [String: Any] ?? [:]

        switch action {
        case "storageGet":
            resolve(id, value: ["userSettings": PersonStore.getPersonsJson()])
        case "storageSet":
            if let v = payload["userSettings"] as? String {
                PersonStore.savePersonsJson(v)
            }
            resolve(id, value: nil)
        case "openSettings":
            DispatchQueue.main.async { [weak self] in self?.openSettings() }
            resolve(id, value: nil)
        case "ocr":
            guard let data = try? JSONSerialization.data(withJSONObject: payload),
                  let json = String(data: data, encoding: .utf8) else {
                resolve(id, value: ["error": "OCR参数序列化失败"]); return
            }
            performOCR(bodyJson: json) { [weak self] result in
                self?.resolve(id, value: result)
            }
        default:
            resolve(id, value: nil)
        }
    }

    /// 原生回传结果给页面（自动转成 JS 字面量）
    private func resolve(_ id: String, value: Any?) {
        var js: String
        if let value = value,
           let data = try? JSONSerialization.data(withJSONObject: value),
           let str = String(data: data, encoding: .utf8) {
            js = "window.__sxBridgeResolve&&window.__sxBridgeResolve('\(id)',\(str))"
        } else {
            js = "window.__sxBridgeResolve&&window.__sxBridgeResolve('\(id)','null')"
        }
        DispatchQueue.main.async { [weak self] in
            self?.webView.evaluateJavaScript(js, completionHandler: nil)
        }
    }

    /// OCR 识别：云端优先（服务器验证码模式识别最准），云端失败再回退本地 Apple Vision。
    /// bodyJson 里的 image 字段是 base64（无 data: 前缀）。
    private func performOCR(bodyJson: String, completion: @escaping (Any?) -> Void) {
        guard let data = bodyJson.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let b64 = obj["image"] as? String,
              let imgData = Data(base64Encoded: b64),
              let image = UIImage(data: imgData),
              let cgImage = image.cgImage else {
            completion(["error": "OCR图片解析失败"]); return
        }

        // 云端优先：服务器 v2 验证码模式（二值化+放大300+白名单+单词模式）
        cloudOcrFallback(imageBase64: b64) { [weak self] cloudResult in
            if let r = cloudResult as? [String: Any], r["result"] != nil {
                completion(cloudResult)
            } else {
                // 云端失败/超时 → 本地 Vision 兜底
                self?.runLocalVision(cgImage: cgImage, completion: completion)
            }
        }
    }

    /// 本地 Apple Vision 识别兜底
    private func runLocalVision(cgImage: CGImage, completion: @escaping (Any?) -> Void) {
        let request = VNRecognizeTextRequest { [weak self] request, error in
            if let error = error {
                completion(["error": error.localizedDescription]); return
            }
            guard let observations = request.results as? [VNRecognizedTextObservation] else {
                completion(["error": "本地识别无结果"]); return
            }
            // 按空间位置排序：先按行（中线相近算同一行），行内从左到右
            let sorted = observations.sorted { a, b in
                let ra = a.boundingBox
                let rb = b.boundingBox
                if abs(ra.midY - rb.midY) > 0.02 { return ra.midY > rb.midY }
                return ra.minX < rb.minX
            }
            var raw = ""
            var confSum = 0.0
            var confCount = 0
            for obs in sorted {
                if let cand = obs.topCandidates(1).first {
                    raw += cand.string
                    confSum += Double(cand.confidence)
                    confCount += 1
                }
            }
            let avgConf = confCount > 0 ? confSum / Double(confCount) : 0.0
            // 去掉空白，只保留字母数字（银行验证码为字母+数字）
            let cleaned = raw
                .replacingOccurrences(of: " ", with: "")
                .replacingOccurrences(of: "\n", with: "")
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .filter { $0.isLetter || $0.isNumber }
            // 本地结果可信度校验：置信度不足或结果不可信 → 判定失败
            if cleaned.isEmpty || avgConf < 0.85 || !isPlausibleCaptcha(cleaned) {
                completion(["error": "本地识别失败"])
            } else {
                completion(["result": cleaned])
            }
        }
        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = false
        request.recognitionLanguages = ["en-US"]
        request.minimumTextHeight = 0.01

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        try? handler.perform([request])
    }

    /// 验证码可信度校验：大写字母+数字、长度 3~10；含小写或长度异常视为误识
    private func isPlausibleCaptcha(_ t: String) -> Bool {
        if t.count < 3 || t.count > 10 { return false }
        for ch in t.unicodeScalars {
            if ch.value >= 97 && ch.value <= 122 { return false } // 小写
            if !((ch.value >= 65 && ch.value <= 90) || (ch.value >= 48 && ch.value <= 57)) { return false }
        }
        return true
    }

    /// 云端 OCR 兜底：本地识别失败时把原图 base64 发到服务器 ocr.php
    private func cloudOcrFallback(imageBase64: String, completion: @escaping (Any?) -> Void) {
        LicenseClient.cloudOcr(imageBase64: imageBase64) { ok, msg, data in
            // 兼容字段：服务器返回 text，部分版本也带 result
            let text = (data?["result"] as? String) ?? (data?["text"] as? String) ?? ""
            if ok, !text.isEmpty {
                completion(["result": text])
            } else {
                completion(["error": "识别失败：" + msg])
            }
        }
    }
}

extension ViewController: UITextFieldDelegate {
    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        navigate()
        return true
    }
}
