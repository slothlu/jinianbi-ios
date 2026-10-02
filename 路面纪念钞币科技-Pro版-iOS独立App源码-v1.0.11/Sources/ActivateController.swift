import UIKit

/// 激活授权页（Pro 版门禁）：公告（卖卡联系方式）置顶 + 卡密输入。
/// 不可关闭，激活成功后才自动消失。
final class ActivateController: UIViewController, UITextFieldDelegate {

    /// 激活框提示语（如「请先输入卡密激活 Pro 版」「授权已过期，请重新激活」）
    var hint: String = ""

    private let keyField = UITextField()
    private let statusLabel = UILabel()
    private let activateBtn = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        title = "激活授权"

        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.keyboardDismissMode = .interactive
        view.addSubview(scroll)

        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 14
        stack.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(stack)

        // ===== 标题 =====
        let titleLb = UILabel()
        titleLb.text = "🔑 路面纪念钞币科技 · Pro 版"
        titleLb.font = .systemFont(ofSize: 18, weight: .bold)
        titleLb.textAlignment = .center
        titleLb.textColor = UIColor(red: 0.11, green: 0.30, blue: 0.85, alpha: 1)
        stack.addArrangedSubview(titleLb)

        // ===== 提示语 =====
        let hintLb = UILabel()
        hintLb.text = hint.isEmpty ? "请先输入卡密激活" : hint
        hintLb.font = .systemFont(ofSize: 14)
        hintLb.textColor = .darkGray
        hintLb.textAlignment = .center
        hintLb.numberOfLines = 0
        stack.addArrangedSubview(hintLb)

        // ===== 公告卡片（置顶）=====
        stack.addArrangedSubview(makeNoticeCard())

        // ===== 卡密输入框 =====
        keyField.borderStyle = .roundedRect
        keyField.placeholder = "请输入卡密（12位）"
        keyField.autocapitalizationType = .allCharacters
        keyField.autocorrectionType = .no
        keyField.returnKeyType = .go
        keyField.font = .systemFont(ofSize: 17, weight: .medium)
        keyField.textAlignment = .center
        keyField.heightAnchor.constraint(equalToConstant: 46).isActive = true
        keyField.delegate = self
        stack.addArrangedSubview(keyField)

        // ===== 激活按钮 =====
        activateBtn.setTitle("激 活", for: .normal)
        activateBtn.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        activateBtn.backgroundColor = UIColor(red: 0.11, green: 0.30, blue: 0.85, alpha: 1)
        activateBtn.setTitleColor(.white, for: .normal)
        activateBtn.layer.cornerRadius = 8
        activateBtn.heightAnchor.constraint(equalToConstant: 46).isActive = true
        activateBtn.addTarget(self, action: #selector(activateTap), for: .touchUpInside)
        stack.addArrangedSubview(activateBtn)

        // ===== 状态提示 =====
        statusLabel.font = .systemFont(ofSize: 13)
        statusLabel.textColor = .systemRed
        statusLabel.textAlignment = .center
        statusLabel.numberOfLines = 0
        stack.addArrangedSubview(statusLabel)

        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),

            stack.topAnchor.constraint(equalTo: scroll.topAnchor, constant: 24),
            stack.leadingAnchor.constraint(equalTo: scroll.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: scroll.trailingAnchor, constant: -20),
            stack.bottomAnchor.constraint(equalTo: scroll.bottomAnchor, constant: -24),
            stack.widthAnchor.constraint(equalTo: scroll.widthAnchor, constant: -40)
        ])
    }

    /// 公告卡片：黄底 + 二维码 + 微信号（点击复制）
    private func makeNoticeCard() -> UIView {
        let card = UIView()
        card.backgroundColor = UIColor(red: 1.0, green: 0.98, blue: 0.92, alpha: 1)
        card.layer.cornerRadius = 12
        card.layer.borderWidth = 1
        card.layer.borderColor = UIColor(red: 0.99, green: 0.83, blue: 0.30, alpha: 1).cgColor

        let st = UIStackView()
        st.axis = .vertical
        st.spacing = 8
        st.translatesAutoresizingMaskIntoConstraints = false
        card.addSubview(st)

        let t1 = UILabel()
        t1.text = "需要出纪念物品的可以➕微信\n售后问题也可以➕"
        t1.font = .systemFont(ofSize: 14)
        t1.textColor = UIColor(red: 0.47, green: 0.31, blue: 0.06, alpha: 1)
        t1.textAlignment = .center
        t1.numberOfLines = 0
        st.addArrangedSubview(t1)

        // 二维码（App 内置公告图片 wechat_qr.webp）
        if let path = findAsset("wechat_qr.webp"), let img = UIImage(contentsOfFile: path) {
            let iv = UIImageView(image: img)
            iv.contentMode = .scaleAspectFit
            iv.layer.cornerRadius = 10
            iv.clipsToBounds = true
            iv.heightAnchor.constraint(equalToConstant: 140).isActive = true
            st.addArrangedSubview(iv)
        }

        let wx = UILabel()
        wx.text = "微信号：lumiannb666（点击复制）"
        wx.font = .systemFont(ofSize: 14, weight: .semibold)
        wx.textColor = UIColor(red: 0.11, green: 0.30, blue: 0.85, alpha: 1)
        wx.textAlignment = .center
        wx.isUserInteractionEnabled = true
        wx.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(copyWechat)))
        st.addArrangedSubview(wx)

        NSLayoutConstraint.activate([
            st.topAnchor.constraint(equalTo: card.topAnchor, constant: 12),
            st.leadingAnchor.constraint(equalTo: card.leadingAnchor, constant: 12),
            st.trailingAnchor.constraint(equalTo: card.trailingAnchor, constant: -12),
            st.bottomAnchor.constraint(equalTo: card.bottomAnchor, constant: -12)
        ])
        return card
    }

    @objc private func copyWechat() {
        UIPasteboard.general.string = "lumiannb666"
        let a = UIAlertController(title: nil, message: "微信号已复制：lumiannb666", preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "好", style: .default))
        present(a, animated: true)
    }

    @objc private func activateTap() {
        let key = keyField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if key.isEmpty {
            statusLabel.text = "请输入卡密"
            return
        }
        statusLabel.text = "激活中，请稍候…"
        activateBtn.isEnabled = false

        LicenseClient.activate(cardKey: key) { [weak self] ok, msg, data in
            guard let self = self else { return }
            self.activateBtn.isEnabled = true
            if ok {
                let token = data?["token"] as? String ?? ""
                let type = data?["card_type"] as? String ?? "permanent"
                let exp = data?["expires_at"] as? String
                LicenseStore.setToken(token, type: type, expires: exp)
                self.dismiss(animated: true, completion: nil)
            } else {
                self.statusLabel.text = "激活失败：" + msg
            }
        }
    }

    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        activateTap()
        return true
    }

    /// 扫描整个 App 安装包找文件（与 ViewController.assetIndex 同法）
    private func findAsset(_ name: String) -> String? {
        let fm = FileManager.default
        let base = Bundle.main.bundleURL
        if let en = fm.enumerator(at: base, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]) {
            for case let u as URL in en {
                if !u.hasDirectoryPath && u.lastPathComponent == name {
                    return u.path
                }
            }
        }
        return nil
    }
}
