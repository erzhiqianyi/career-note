import AVFoundation
import CryptoKit
import Foundation
import Observation
import Security

enum AudioPlaybackSettings {
    static var rate: Float {
        let saved = UserDefaults.standard.object(forKey: "audioPlaybackRate") as? Double ?? 1
        return saved.isFinite ? Float(min(2, max(0.5, saved))) : 1
    }

    @discardableResult
    static func apply(to player: AVAudioPlayer) -> Float {
        player.enableRate = true
        player.rate = rate
        return player.rate
    }
}

enum ReferenceSpeechSettings {
    static let voices = ["ja-JP-NanamiNeural", "ja-JP-KeitaNeural"]
    private static let regionName = "azureSpeechRegion"
    private static let voiceName = "azureSpeechVoice"
    private static let keyService = "CareerNote.AzureSpeech"
    private static let keyAccount = "subscriptionKey"
    private static let migrationName = "referenceSpeechWorkerMigration"

    static var voice: String {
        let saved = UserDefaults.standard.string(forKey: voiceName) ?? ""
        return voices.contains(saved) ? saved : voices[0]
    }

    static func saveVoice(_ voice: String) {
        guard voices.contains(voice) else { return }
        UserDefaults.standard.set(voice, forKey: voiceName)
    }

    /// The old device key is no longer used; erase it after this version is installed.
    static func removeLegacyCredentials() {
        guard !UserDefaults.standard.bool(forKey: migrationName) else { return }
        let result = SecItemDelete(keyQuery() as CFDictionary)
        guard result == errSecSuccess || result == errSecItemNotFound else { return }
        UserDefaults.standard.removeObject(forKey: regionName)
        UserDefaults.standard.set(true, forKey: migrationName)
    }

    private static func keyQuery() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: keyService,
         kSecAttrAccount as String: keyAccount]
    }
}

enum SpeechError: LocalizedError {
    case emptyText, invalidAudio

    var errorDescription: String? {
        switch self {
        case .emptyText: "参考回答没有可朗读的文字。"
        case .invalidAudio: "サーバーから再生可能な音声が返りませんでした。"
        }
    }
}

enum ReferenceSpeechText {
    static func numberedQuestions(_ source: String) -> [String] {
        let lines = source.components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        guard lines.count > 1, lines.allSatisfy({ line in
            guard let scalar = line.unicodeScalars.first else { return false }
            return (0x2460...0x2473).contains(scalar.value)
        }) else { return [] }
        return lines.map { String($0.dropFirst()).trimmingCharacters(in: .whitespacesAndNewlines) }
    }

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

/// Purgeable, user-scoped MP3 cache. Worker audio uses a new versioned key.
actor ReferenceSpeechCache {
    static let shared = ReferenceSpeechCache()
    private let fileManager = FileManager.default

    private func directory(for userID: String) -> URL {
        fileManager.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ReferenceSpeech", isDirectory: true)
            .appendingPathComponent(digest(userID), isDirectory: true)
    }

    private func digest(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private func file(text: String, voice: String, userID: String) -> URL {
        directory(for: userID)
            .appendingPathComponent(digest("worker-v1\u{0}\(voice)\u{0}\(text)"))
            .appendingPathExtension("mp3")
    }

    func audio(text: String, voice: String, userID: String) -> Data? {
        let url = file(text: text, voice: voice, userID: userID)
        guard let data = try? Data(contentsOf: url), !data.isEmpty else { return nil }
        try? fileManager.setAttributes([.modificationDate: Date()], ofItemAtPath: url.path)
        return data
    }

    func save(_ data: Data, text: String, voice: String, userID: String) {
        let url = file(text: text, voice: voice, userID: userID)
        do {
            try fileManager.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try data.write(to: url, options: .atomic)
            try fileManager.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                                          ofItemAtPath: url.path)
            trim(directory: url.deletingLastPathComponent())
        } catch {
            try? fileManager.removeItem(at: url)
        }
    }

    private func trim(directory: URL) {
        let keys: Set<URLResourceKey> = [.contentModificationDateKey, .fileSizeKey]
        let urls = (try? fileManager.contentsOfDirectory(at: directory, includingPropertiesForKeys: Array(keys))) ?? []
        let entries: [(url: URL, date: Date, size: Int)] = urls.compactMap { url in
            guard let values = try? url.resourceValues(forKeys: keys) else { return nil }
            return (url, values.contentModificationDate ?? .distantPast, values.fileSize ?? 0)
        }.sorted { $0.date < $1.date }
        var count = entries.count
        var size = entries.reduce(0) { $0 + $1.size }
        for entry in entries {
            guard count > 80 || size > 24 * 1024 * 1024 else { break }
            try? fileManager.removeItem(at: entry.url)
            count -= 1
            size -= entry.size
        }
    }
}

@MainActor @Observable
final class ReferenceSpeechPlayer {
    private(set) var isLoading = false
    private(set) var isPlaying = false
    private(set) var activeSource: String?
    var errorMessage: String?
    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var generation = UUID()

    func play(_ source: String, userID: String, voice: String,
              fetchAudio: () async throws -> Data) async {
        stop()
        errorMessage = nil
        let text = ReferenceSpeechText.plain(source)
        guard !text.isEmpty else {
            errorMessage = SpeechError.emptyText.localizedDescription
            return
        }
        let current = generation
        activeSource = source
        isLoading = true
        do {
            let cached = await ReferenceSpeechCache.shared.audio(text: text, voice: voice, userID: userID)
            guard current == generation else { return }
            let data: Data
            if let cached {
                data = cached
            } else { data = try await fetchAudio() }
            guard current == generation else { return }
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback)
            try session.setActive(true)
            let audio = try AVAudioPlayer(data: data)
            let playbackRate = AudioPlaybackSettings.apply(to: audio)
            guard audio.play() else { throw SpeechError.invalidAudio }
            player = audio
            isPlaying = true
            isLoading = false
            if cached == nil {
                await ReferenceSpeechCache.shared.save(data, text: text, voice: voice, userID: userID)
            }
            try? await Task.sleep(nanoseconds: UInt64(audio.duration / Double(playbackRate) * 1_000_000_000))
            if current == generation { stop() }
        } catch {
            guard current == generation else { return }
            isLoading = false
            isPlaying = false
            activeSource = nil
            errorMessage = error.localizedDescription
        }
    }

    func stop() {
        generation = UUID()
        player?.stop()
        player = nil
        isLoading = false
        isPlaying = false
        activeSource = nil
    }
}
