import UIKit

/// Pro 版服务器客户端：卡密激活 / 启动验证 / 身份信息云端保存 / 云端 OCR 兜底。
/// 全部走 URLSession（系统原生，无第三方依赖），回调统一回到主线程。
final class LicenseClient {

    /// 服务器地址（以后申请了 HTTPS 把 http 改成 https 即可）
    static let base = "http://121.40.81.223/api/"
    /// 与服务器 config.php 的 API_KEY 保持一致
    static let apiKey = "Lm2026Secret888"

    typealias Callback = (Bool, String, [String: Any]?) -> Void

    /// 设备唯一标识（卸载重装会变，与安卓 ANDROID_ID 语义一致即可）
    static var deviceId: String {
        UIDevice.current.identifierForVendor?.uuidString ?? "unknown-ios"
    }

    /// 激活：POST activate.php {card_key, device_id, key} → 成功返回 token
    static func activate(cardKey: String, cb: @escaping Callback) {
        post("activate.php", [
            "card_key": cardKey.trimmingCharacters(in: .whitespacesAndNewlines),
            "device_id": deviceId,
            "key": apiKey
        ], cb)
    }

    /// 启动验证：POST verify.php {token, device_id, key}
    static func verify(cb: @escaping Callback) {
        post("verify.php", [
            "token": LicenseStore.token(),
            "device_id": deviceId,
            "key": apiKey
        ], cb)
    }

    /// 身份信息云端保存：POST save_info.php（静默，失败不打断用户）
    static func saveInfo(personsJson: String, cb: @escaping Callback) {
        post("save_info.php", [
            "token": LicenseStore.token(),
            "device_id": deviceId,
            "key": apiKey,
            "persons": toServerPersons(personsJson)
        ], cb)
    }

    /// 云端 OCR 兜底：POST ocr.php {image_base64, key} → 返回识别结果
    static func cloudOcr(imageBase64: String, cb: @escaping Callback) {
        post("ocr.php", [
            "image_base64": imageBase64,
            "key": apiKey
        ], cb)
    }

    /// 字段映射：App 本地字段 → 服务器字段（与安卓一致）
    /// idcard→id_card，exchangeTime→ex_date；bank/address 本地没有，留空
    private static func toServerPersons(_ json: String) -> [[String: String]] {
        guard let data = json.data(using: .utf8),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: String]] else {
            return []
        }
        return arr.map { p in
            var o: [String: String] = [:]
            o["name"] = p["name"] ?? ""
            o["remark"] = p["remark"] ?? ""
            o["phone"] = p["phone"] ?? ""
            o["id_card"] = p["idcard"] ?? ""
            o["province"] = p["province"] ?? ""
            o["city"] = p["city"] ?? ""
            o["district"] = p["district"] ?? ""
            o["bank"] = ""
            o["branch"] = p["branch"] ?? ""
            o["address"] = ""
            o["ex_date"] = p["exchangeTime"] ?? ""
            o["quantity"] = p["quantity"] ?? ""
            return o
        }
    }

    private static func post(_ api: String, _ body: [String: Any], _ cb: @escaping Callback) {
        guard let url = URL(string: base + api) else {
            DispatchQueue.main.async { cb(false, "地址错误", nil) }
            return
        }
        var req = URLRequest(url: url)
        req.timeoutInterval = 15
        req.httpMethod = "POST"
        req.setValue("application/json; charset=utf-8", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)

        URLSession.shared.dataTask(with: req) { data, _, err in
            guard let data = data, err == nil else {
                DispatchQueue.main.async { cb(false, "网络请求失败：" + (err?.localizedDescription ?? "未知"), nil) }
                return
            }
            guard let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                DispatchQueue.main.async { cb(false, "服务器返回异常", nil) }
                return
            }
            let code = obj["code"] as? Int ?? 1
            let msg = obj["msg"] as? String ?? ""
            DispatchQueue.main.async { cb(code == 0, msg, obj) }
        }.resume()
    }
}
