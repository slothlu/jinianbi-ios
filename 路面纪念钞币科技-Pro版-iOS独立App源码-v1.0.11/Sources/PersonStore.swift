import UIKit
import WebKit

/// 人员数据存取（与扩展 chrome.storage.local 的 userSettings 格式一致：JSON 字符串数组）
enum PersonStore {

    private static let key = "sx_persons"

    static func getPersonsJson() -> String {
        let v = UserDefaults.standard.string(forKey: key)
        guard let v = v, !v.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return "[]" }
        return v
    }

    static func savePersonsJson(_ json: String) {
        UserDefaults.standard.set(json.isEmpty ? "[]" : json, forKey: key)
    }
}
