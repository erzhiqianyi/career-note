import AVFoundation
import Foundation
import Observation
import Security

struct SpeechConfiguration {
    let region: String
    let voice: String
    let key: String
}

enum ReferenceSpeechSettings {
    static let voices = ["ja-JP-NanamiNeural", "ja-JP-KeitaNeural"]
    private static let regionName = "azureSpeechRegion"
    private static let voiceName = "azureSpeechVoice"
    private static let keyService = "CareerNote.AzureSpeech"
    private static let keyAccount = "subscriptionKey"

    static var region: String { UserDefaults.standard.string(forKey: regionName) ?? "" }
    static var voice: String {
        let saved = UserDefaults.standard.string(forKey: voiceName) ?? ""
        return voices.contains(saved) ? saved : voices[0]
    }
    static var hasKey: Bool { key != nil }

    static var configuration: SpeechConfiguration? {
        guard !region.isEmpty, let key else { return nil }
        return SpeechConfiguration(region: region, voice: voice, key: key)
    }

    static func save(region: String, voice: String, newKey: String) throws {
        let cleanRegion = region.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard cleanRegion.range(of: #"^[a-z0-9]+$"#, options: .regularExpression) != nil else {
            throw SpeechError.invalidRegion
        }
        guard voices.contains(voice) else { throw SpeechError.invalidVoice }
        let cleanKey = newKey.trimmingCharacters(in: .whitespacesAndNewlines)
        if !cleanKey.isEmpty { try saveKey(cleanKey) }
        UserDefaults.standard.set(cleanRegion, forKey: regionName)
        UserDefaults.standard.set(voice, forKey: voiceName)
    }

    static func removeKey() {
        SecItemDelete(keyQuery() as CFDictionary)
    }

    private static var key: String? {
        var query = keyQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func saveKey(_ key: String) throws {
        let bytes = Data(key.utf8)
        var add = keyQuery()
        add[kSecValueData as String] = bytes
        add[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let result = SecItemAdd(add as CFDictionary, nil)
        if result == errSecDuplicateItem {
            let update = [kSecValueData as String: bytes]
            guard SecItemUpdate(keyQuery() as CFDictionary, update as CFDictionary) == errSecSuccess else {
                throw SpeechError.keychain
            }
        } else if result != errSecSuccess {
            throw SpeechError.keychain
        }
    }

    private static func keyQuery() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: keyService,
         kSecAttrAccount as String: keyAccount]
    }
}

enum SpeechError: LocalizedError {
    case invalidRegion, invalidVoice, keychain, missingConfiguration, emptyText, tooLong
    case unauthorized, rateLimited, unavailable, invalidAudio

    var errorDescription: String? {
        switch self {
        case .invalidRegion: "请输入 Azure Speech 资源的区域代码，例如 japaneast。"
        case .invalidVoice: "请选择受支持的日语语音。"
        case .keychain: "本机密钥保存失败，请检查设备设置后重试。"
        case .missingConfiguration: "请先在设置中填写 Azure 区域和密钥。"
        case .emptyText: "参考回答没有可朗读的文字。"
        case .tooLong: "参考回答过长，暂时无法一次朗读。"
        case .unauthorized: "Azure 密钥或区域不匹配，请检查设置。"
        case .rateLimited: "Azure 请求过于频繁，请稍后重试。"
        case .unavailable: "Azure 发音暂时不可用，请稍后重试。"
        case .invalidAudio: "Azure 没有返回可播放的音频。"
        }
    }
}

protocol SpeechSynthesisProvider {
    func synthesize(text: String, configuration: SpeechConfiguration) async throws -> Data
}

struct AzureSpeechProvider: SpeechSynthesisProvider {
    var session: URLSession = .shared

    func synthesize(text: String, configuration: SpeechConfiguration) async throws -> Data {
        guard !text.isEmpty else { throw SpeechError.emptyText }
        guard text.count <= 3_000 else { throw SpeechError.tooLong }
        guard let url = URL(string: "https://\(configuration.region).tts.speech.microsoft.com/cognitiveservices/v1") else {
            throw SpeechError.invalidRegion
        }
        let escaped = text.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&apos;")
        let ssml = "<speak version=\"1.0\" xml:lang=\"ja-JP\"><voice name=\"\(configuration.voice)\">\(escaped)</voice></speak>"
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue(configuration.key, forHTTPHeaderField: "Ocp-Apim-Subscription-Key")
        request.setValue("application/ssml+xml; charset=utf-8", forHTTPHeaderField: "Content-Type")
        request.setValue("audio-24khz-96kbitrate-mono-mp3", forHTTPHeaderField: "X-Microsoft-OutputFormat")
        request.setValue("CareerNote-iOS", forHTTPHeaderField: "User-Agent")
        request.httpBody = Data(ssml.utf8)
        let (data, response) = try await session.data(for: request)
        guard let response = response as? HTTPURLResponse else { throw SpeechError.unavailable }
        switch response.statusCode {
        case 200: break
        case 401, 403: throw SpeechError.unauthorized
        case 429: throw SpeechError.rateLimited
        default: throw SpeechError.unavailable
        }
        guard !data.isEmpty, response.value(forHTTPHeaderField: "Content-Type")?.lowercased().contains("audio") == true else {
            throw SpeechError.invalidAudio
        }
        return data
    }
}

enum ReferenceSpeechText {
    static func plain(_ source: String) -> String {
        CareerRichText.plain(source)
            .replacingOccurrences(of: #"\[([^\]]+)\]\([^)]+\)"#, with: "$1", options: .regularExpression)
            .replacingOccurrences(of: #"(?m)^\s{0,3}(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s+)"#,
                                  with: "", options: .regularExpression)
            .replacingOccurrences(of: "**", with: "")
            .replacingOccurrences(of: "`", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

@MainActor @Observable
final class ReferenceSpeechPlayer {
    private(set) var isLoading = false
    private(set) var isPlaying = false
    var errorMessage: String?
    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var generation = UUID()

    func play(_ source: String, provider: any SpeechSynthesisProvider = AzureSpeechProvider()) async {
        stop()
        errorMessage = nil
        guard let configuration = ReferenceSpeechSettings.configuration else {
            errorMessage = SpeechError.missingConfiguration.localizedDescription
            return
        }
        let current = generation
        isLoading = true
        do {
            let data = try await provider.synthesize(text: ReferenceSpeechText.plain(source), configuration: configuration)
            guard current == generation else { return }
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback)
            try session.setActive(true)
            let audio = try AVAudioPlayer(data: data)
            guard audio.play() else { throw SpeechError.invalidAudio }
            player = audio
            isPlaying = true
            isLoading = false
            try? await Task.sleep(nanoseconds: UInt64(audio.duration * 1_000_000_000))
            if current == generation { stop() }
        } catch {
            guard current == generation else { return }
            isLoading = false
            isPlaying = false
            errorMessage = error.localizedDescription
        }
    }

    func stop() {
        generation = UUID()
        player?.stop()
        player = nil
        isLoading = false
        isPlaying = false
    }
}
