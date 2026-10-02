import UIKit

/// 人员管理：添加 / 编辑 / 删除预约人信息（原生界面）
final class SettingsController: UITableViewController {

    var onPersonsChanged: (() -> Void)?

    private var persons: [[String: String]] = []

    private static let fieldLabels = ["姓名", "备注", "手机号码", "身份证号码", "省份", "城市", "区/县", "网点", "兑换日期", "预约数量"]
    private static let fieldKeys = ["name", "remark", "phone", "idcard", "province", "city", "district", "branch", "exchangeTime", "quantity"]
    private static let fieldHints = ["请输入姓名（必填）", "例如：工行，家属账户", "请输入手机号码", "请输入身份证号码", "请输入省份", "请输入城市", "请输入区/县", "请输入网点", "如 2026-10-01", "请输入预约数量"]

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "人员管理"
        tableView.register(UITableViewCell.self, forCellReuseIdentifier: "cell")
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .add, target: self, action: #selector(addPerson))
        loadPersons()
    }

    private func loadPersons() {
        persons = []
        let json = PersonStore.getPersonsJson()
        if let data = json.data(using: .utf8),
           let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: String]] {
            persons = arr
        }
        tableView.reloadData()
    }

    private func saveAll() {
        guard let data = try? JSONSerialization.data(withJSONObject: persons) else { return }
        let json = String(data: data, encoding: .utf8) ?? "[]"
        PersonStore.savePersonsJson(json)
        onPersonsChanged?()
        // Pro 版：有卡密授权时，把人员信息静默上传云端（供后台核查，失败不打断用户）
        if !LicenseStore.token().isEmpty {
            LicenseClient.saveInfo(personsJson: json) { _, _, _ in }
        }
    }

    @objc private func addPerson() { showForm(person: nil, index: nil) }

    private func showForm(person: [String: String]?, index: Int?) {
        let form = PersonFormController(labels: Self.fieldLabels, keys: Self.fieldKeys, hints: Self.fieldHints, person: person)
        form.onSave = { [weak self] obj in
            guard let self = self else { return }
            if let index = index, index < self.persons.count {
                self.persons[index] = obj
            } else {
                self.persons.append(obj)
            }
            self.saveAll()
            self.loadPersons()
        }
        navigationController?.pushViewController(form, animated: true)
    }

    // MARK: - UITableViewDataSource / Delegate

    override func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        persons.isEmpty ? 1 : persons.count
    }

    override func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        let cell = tableView.dequeueReusableCell(withIdentifier: "cell", for: indexPath)
        if persons.isEmpty {
            cell.textLabel?.text = "暂无人员，点右上角 ＋ 添加"
            cell.textLabel?.textColor = .gray
            return cell
        }
        let p = persons[indexPath.row]
        let name = p["name"] ?? "未命名"
        let remark = p["remark"] ?? ""
        cell.textLabel?.text = remark.isEmpty ? name : "\(name) · \(remark)"
        cell.textLabel?.textColor = .darkText
        cell.accessoryType = .disclosureIndicator
        return cell
    }

    override func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)
        guard indexPath.row < persons.count else { return }
        let p = persons[indexPath.row]
        let alert = UIAlertController(title: p["name"] ?? "人员", message: nil, preferredStyle: .actionSheet)
        alert.addAction(UIAlertAction(title: "编辑", style: .default) { [weak self] _ in
            self?.showForm(person: p, index: indexPath.row)
        })
        alert.addAction(UIAlertAction(title: "删除", style: .destructive) { [weak self] _ in
            guard let self = self else { return }
            self.persons.remove(at: indexPath.row)
            self.saveAll()
            self.loadPersons()
        })
        alert.addAction(UIAlertAction(title: "取消", style: .cancel))
        present(alert, animated: true)
    }
}

/// 人员表单页（10 个字段，独立页面）
final class PersonFormController: UIViewController {

    private let labels: [String]
    private let keys: [String]
    private let hints: [String]
    private let person: [String: String]?
    var onSave: (([String: String]) -> Void)?
    private var fields: [UITextField] = []

    init(labels: [String], keys: [String], hints: [String], person: [String: String]?) {
        self.labels = labels
        self.keys = keys
        self.hints = hints
        self.person = person
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .white
        title = person == nil ? "添加人员" : "编辑人员"

        let scroll = UIScrollView()
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.keyboardDismissMode = .interactive
        view.addSubview(scroll)

        // 键盘弹出时让内容上移，避免保存按钮被键盘挡住
        NotificationCenter.default.addObserver(
            self, selector: #selector(keyboardWillShow(_:)),
            name: UIResponder.keyboardWillShowNotification, object: nil)
        NotificationCenter.default.addObserver(
            self, selector: #selector(keyboardWillHide(_:)),
            name: UIResponder.keyboardWillHideNotification, object: nil)

        let stack = UIStackView()
        stack.axis = .vertical
        stack.spacing = 10
        stack.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(stack)

        for (i, label) in labels.enumerated() {
            let lb = UILabel()
            lb.text = label
            lb.font = .systemFont(ofSize: 13, weight: .medium)
            lb.textColor = .darkGray
            stack.addArrangedSubview(lb)

            let tf = UITextField()
            tf.borderStyle = .roundedRect
            tf.autocorrectionType = .no
            tf.placeholder = hints[i]
            tf.text = person?[keys[i]]
            fields.append(tf)
            stack.addArrangedSubview(tf)
        }

        let saveBtn = UIButton(type: .system)
        saveBtn.setTitle("保 存", for: .normal)
        saveBtn.titleLabel?.font = .systemFont(ofSize: 16, weight: .semibold)
        saveBtn.backgroundColor = .systemBlue
        saveBtn.setTitleColor(.white, for: .normal)
        saveBtn.layer.cornerRadius = 8
        saveBtn.heightAnchor.constraint(equalToConstant: 46).isActive = true
        saveBtn.addTarget(self, action: #selector(saveTap), for: .touchUpInside)
        stack.addArrangedSubview(saveBtn)

        NSLayoutConstraint.activate([
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),

            stack.topAnchor.constraint(equalTo: scroll.topAnchor, constant: 16),
            stack.leadingAnchor.constraint(equalTo: scroll.leadingAnchor, constant: 20),
            stack.trailingAnchor.constraint(equalTo: scroll.trailingAnchor, constant: -20),
            stack.bottomAnchor.constraint(equalTo: scroll.bottomAnchor, constant: -20),
            stack.widthAnchor.constraint(equalTo: scroll.widthAnchor, constant: -40)
        ])
    }

    @objc private func keyboardWillShow(_ n: Notification) {
        guard let info = n.userInfo,
              let kb = info[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
        let scroll = view.subviews.compactMap { $0 as? UIScrollView }.first
        scroll?.contentInset.bottom = kb.height
        scroll?.verticalScrollIndicatorInsets.bottom = kb.height
        // 让保存按钮自动滚到可见位置
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
            if let scroll = scroll, let stack = scroll.subviews.first, let last = stack.subviews.last {
                let rect = scroll.convert(last.frame, from: stack)
                scroll.scrollRectToVisible(rect, animated: true)
            }
        }
    }

    @objc private func keyboardWillHide(_ n: Notification) {
        let scroll = view.subviews.compactMap { $0 as? UIScrollView }.first
        scroll?.contentInset.bottom = 0
        scroll?.verticalScrollIndicatorInsets.bottom = 0
    }

    @objc private func saveTap() {
        let name = fields.first?.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        if name.isEmpty {
            let a = UIAlertController(title: nil, message: "姓名不能为空", preferredStyle: .alert)
            a.addAction(UIAlertAction(title: "好", style: .default))
            present(a, animated: true)
            return
        }
        var obj: [String: String] = [:]
        for (i, key) in keys.enumerated() {
            if i < fields.count {
                obj[key] = fields[i].text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            }
        }
        onSave?(obj)
        let a = UIAlertController(title: nil, message: "保存成功", preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "好", style: .default) { [weak self] _ in
            self?.navigationController?.popViewController(animated: true)
        })
        present(a, animated: true)
    }
}
