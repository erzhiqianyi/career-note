import AVFoundation
import CryptoKit
import Foundation

@main struct ReferenceSpeechSmoke {
    @MainActor static func main() async throws {
        let userID = "playback-test-\(UUID())"
        let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("ReferenceSpeech")
            .appendingPathComponent(SHA256.hash(data: Data(userID.utf8)).map { String(format: "%02x", $0) }.joined())
        let previousRate = UserDefaults.standard.object(forKey: "audioPlaybackRate")
        defer {
            try? FileManager.default.removeItem(at: cache)
            if let previousRate { UserDefaults.standard.set(previousRate, forKey: "audioPlaybackRate") }
            else { UserDefaults.standard.removeObject(forKey: "audioPlaybackRate") }
        }
        let player = ReferenceSpeechPlayer()
        player.setRate(1)
        await player.play("テスト", userID: userID, voice: "test") { wave() }
        precondition(player.errorMessage == nil, player.errorMessage ?? "")
        precondition(player.isPlaying && abs(player.duration - 2) < 0.05)
        player.pause()
        player.seek(to: 0.5)
        try await Task.sleep(for: .seconds(2.2))
        precondition(!player.isPlaying && abs(player.currentTime - 0.5) < 0.05,
                     "Pausing must preserve the position beyond the original end time")
        player.setRate(2)
        precondition(AudioPlaybackSettings.rate == 2)
        player.resume()
        try await Task.sleep(for: .seconds(1.3))
        precondition(!player.isPlaying && player.currentTime == player.duration,
                     "Completion must follow the actual audio at the selected rate")
        player.seek(to: 0.25)
        player.resume()
        precondition(player.isPlaying)
        NotificationCenter.default.post(name: AVAudioSession.interruptionNotification, object: nil,
            userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue])
        precondition(!player.isPlaying)
        player.resume()
        NotificationCenter.default.post(name: AVAudioSession.routeChangeNotification, object: nil,
            userInfo: [AVAudioSessionRouteChangeReasonKey: AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue])
        precondition(!player.isPlaying)
        player.stop()
        precondition(player.activeSource == nil && player.duration == 0)
        let pending = Task {
            await player.play("キャンセル", userID: userID, voice: "test") {
                try await Task.sleep(for: .milliseconds(250))
                return wave()
            }
        }
        try await Task.sleep(for: .milliseconds(100))
        player.stop()
        await pending.value
        precondition(!player.isPlaying && player.activeSource == nil)
        print("Reference speech playback smoke checks passed")
    }

    static func wave() -> Data {
        var data = Data()
        func text(_ value: String) { data.append(contentsOf: value.utf8) }
        func number<T: FixedWidthInteger>(_ value: T) {
            var little = value.littleEndian
            withUnsafeBytes(of: &little) { data.append(contentsOf: $0) }
        }
        let bytes: UInt32 = 16_000 * 2 * 2
        text("RIFF"); number(bytes + 36); text("WAVEfmt "); number(UInt32(16))
        number(UInt16(1)); number(UInt16(1)); number(UInt32(16_000)); number(UInt32(32_000))
        number(UInt16(2)); number(UInt16(16)); text("data"); number(bytes)
        data.append(Data(count: Int(bytes)))
        return data
    }
}
