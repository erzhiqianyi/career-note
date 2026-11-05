import AVFoundation
import Foundation

@main struct SpeechAudioSmoke {
    static func main() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: root) }
        // Stereo 44.1 kHz AAC exercises decoding, downmixing, resampling, and the short last chunk.
        let url = root.appendingPathComponent("synthetic.m4a")
        do {
            let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 2)!
            let file = try AVAudioFile(forWriting: url, settings: [AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: 44100, AVNumberOfChannelsKey: 2], commonFormat: .pcmFormatFloat32, interleaved: false)
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 44100)!
            buffer.frameLength = 44100
            for c in 0..<2 { for i in 0..<44100 { buffer.floatChannelData![c][i] = Float(sin(Double(i) * 2 * .pi * 440 / 44100) * 0.1) } }
            for _ in 0..<31 { try file.write(from: buffer) }
        }
        let duration = try SpeechAudioChunks.duration(url)
        precondition(abs(duration - 31) < 0.1)
        for part in 0..<Int(ceil(duration / 30)) {
            let data = try SpeechAudioChunks.wav(url, part: part, duration: duration)
            let frames = Int((min(30, duration - Double(part) * 30) * 16000).rounded())
            precondition(data.count == 44 + frames * 2)
            let chunk = root.appendingPathComponent("chunk-\(part).wav")
            try data.write(to: chunk)
            let file = try AVAudioFile(forReading: chunk)
            precondition(file.fileFormat.sampleRate == 16000 && file.fileFormat.channelCount == 1)
            precondition(file.length == frames)
            let audio = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length))!
            try file.read(into: audio)
            precondition((0..<Int(audio.frameLength)).contains { abs(audio.floatChannelData![0][$0]) > 0.01 })
        }
        // Container duration can differ slightly from decoded AAC frames; tolerate only a tiny final pad.
        let padded = try SpeechAudioChunks.wav(url, part: 1, duration: duration + 0.02)
        precondition(padded.count == 44 + Int(((duration + 0.02 - 30) * 16000).rounded()) * 2)
        print("Speech audio: independent WAV chunks and AAC conversion passed")
    }
}
