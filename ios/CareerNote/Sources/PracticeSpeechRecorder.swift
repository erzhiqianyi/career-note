import AVFoundation
import Observation
import Speech

/// Records one spoken answer and transcribes the finished file on this device.
@MainActor @Observable
final class PracticeSpeechRecorder {
    enum Phase {
        case idle
        case recording
        case recognizing
        case ready
    }

    private(set) var phase: Phase = .idle
    private(set) var transcript = ""
    private(set) var seconds = 0
    private(set) var recordingURL: URL?
    var errorMessage: String?

    @ObservationIgnored private var recorder: AVAudioRecorder?
    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var timer: Timer?
    @ObservationIgnored private var startedAt: Date?
    @ObservationIgnored private var recognizer: SFSpeechRecognizer?
    @ObservationIgnored private var recognitionTask: SFSpeechRecognitionTask?

    func start(localeID: String) async {
        errorMessage = nil
        guard await microphoneAuthorized() else {
            errorMessage = "请在系统设置中允许 Career Note 使用麦克风。"
            return
        }
        guard await speechAuthorized() else {
            errorMessage = "请在系统设置中允许 Career Note 使用语音识别。"
            return
        }
        guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeID)),
              recognizer.supportsOnDeviceRecognition else {
            errorMessage = "这台设备尚不支持所选语言的本机语音识别。"
            return
        }
        discard()
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true)
            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("career-practice-\(UUID().uuidString).m4a")
            let settings: [String: Any] = [
                AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                AVSampleRateKey: 44_100,
                AVNumberOfChannelsKey: 1,
                AVEncoderBitRateKey: 64_000
            ]
            let recorder = try AVAudioRecorder(url: url, settings: settings)
            guard recorder.record(forDuration: 600) else {
                throw NSError(domain: "CareerNoteSpeech", code: 1,
                              userInfo: [NSLocalizedDescriptionKey: "麦克风未能开始录音。"])
            }
            self.recorder = recorder
            self.recognizer = recognizer
            recordingURL = url
            transcript = ""
            seconds = 0
            startedAt = Date()
            phase = .recording
            timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    guard let self, self.phase == .recording else { return }
                    self.seconds = min(600, Int(Date().timeIntervalSince(self.startedAt ?? .now)))
                    if self.seconds >= 600 { await self.stopAndRecognize() }
                }
            }
        } catch {
            errorMessage = "录音启动失败：\(error.localizedDescription)"
            phase = .idle
        }
    }

    func stopAndRecognize() async {
        guard phase == .recording, let url = recordingURL else { return }
        seconds = min(600, max(1, Int(ceil(recorder?.currentTime ?? 0))))
        recorder?.stop()
        recorder = nil
        timer?.invalidate()
        timer = nil
        try? AVAudioSession.sharedInstance().setActive(false)
        await recognize(url: url)
    }

    func retryRecognition() async {
        guard phase == .ready, let url = recordingURL else { return }
        await recognize(url: url)
    }

    func play() {
        guard let url = recordingURL, phase == .ready else { return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback)
            try session.setActive(true)
            player = try AVAudioPlayer(contentsOf: url)
            player?.play()
        } catch {
            errorMessage = "录音播放失败：\(error.localizedDescription)"
        }
    }

    func discard() {
        recorder?.stop()
        recorder = nil
        player?.stop()
        player = nil
        timer?.invalidate()
        timer = nil
        recognitionTask?.cancel()
        recognitionTask = nil
        recognizer = nil
        if let recordingURL { try? FileManager.default.removeItem(at: recordingURL) }
        recordingURL = nil
        transcript = ""
        seconds = 0
        startedAt = nil
        phase = .idle
        errorMessage = nil
        try? AVAudioSession.sharedInstance().setActive(false)
    }

    private func recognize(url: URL) async {
        guard let recognizer, recognizer.supportsOnDeviceRecognition else {
            errorMessage = "这台设备无法在本机识别该语言。"
            phase = .ready
            return
        }
        phase = .recognizing
        errorMessage = nil
        let request = SFSpeechURLRecognitionRequest(url: url)
        request.requiresOnDeviceRecognition = true
        request.shouldReportPartialResults = false
        request.addsPunctuation = true
        do {
            let text: String = try await withCheckedThrowingContinuation { continuation in
                var completed = false
                recognitionTask = recognizer.recognitionTask(with: request) { result, error in
                    guard !completed else { return }
                    if let error {
                        completed = true
                        continuation.resume(throwing: error)
                    } else if let result, result.isFinal {
                        completed = true
                        continuation.resume(returning: result.bestTranscription.formattedString)
                    }
                }
            }
            transcript = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if transcript.isEmpty { errorMessage = "没有识别到文字，可以重试识别或重新录音。" }
        } catch {
            errorMessage = "本机识别失败：\(error.localizedDescription)"
        }
        recognitionTask = nil
        phase = .ready
    }

    private func microphoneAuthorized() async -> Bool {
        if AVAudioApplication.shared.recordPermission == .granted { return true }
        return await AVAudioApplication.requestRecordPermission()
    }

    private func speechAuthorized() async -> Bool {
        if SFSpeechRecognizer.authorizationStatus() == .authorized { return true }
        return await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status == .authorized)
            }
        }
    }
}
