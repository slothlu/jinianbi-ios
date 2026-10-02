import UIKit

/// Pro 版授权信息存取（与安卓 LicenseStore 对齐：token / card_type / expires_at）
enum LicenseStore {

    private static let kToken = "sx_license_token"
    private static let kType = "sx_license_type"
    private static let kExpires = "sx_license_expires"

    static func token() -> String {
        UserDefaults.standard.string(forKey: kToken) ?? ""
    }

    static func cardType() -> String {
        UserDefaults.standard.string(forKey: kType) ?? ""
    }

    static func expiresAt() -> String {
        UserDefaults.standard.string(forKey: kExpires) ?? ""
    }

    static func setToken(_ token: String, type: String, expires: String?) {
        UserDefaults.standard.set(token, forKey: kToken)
        UserDefaults.standard.set(type, forKey: kType)
        UserDefaults.standard.set(expires ?? "", forKey: kExpires)
    }

    static func clear() {
        UserDefaults.standard.removeObject(forKey: kToken)
        UserDefaults.standard.removeObject(forKey: kType)
        UserDefaults.standard.removeObject(forKey: kExpires)
    }
}
