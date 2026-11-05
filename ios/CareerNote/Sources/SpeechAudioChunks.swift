import AVFoundation
import Foundation

/// Each request contains a complete, independently decodable PCM WAV, never sliced M4A bytes.
enum SpeechAudioChunks {
    static func duration(_ url: URL) throws -> Double {
        let file = try AVAudioFile(forReading: url)
        return Double(file.length) / file.processingFormat.sampleRate
    }

    static func wav(_ url: URL, part: Int, duration: Double) throws -> Data {
        let file = try AVAudioFile(forReading: url)
        let rate = file.processingFormat.sampleRate
        let start = Double(part) * 30
        let seconds = min(30, duration - start)
        guard part >= 0, seconds > 0, seconds <= 30,
              let target = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false),
              let converter = AVAudioConverter(from: file.processingFormat, to: target) else { throw failure() }
        let first = AVAudioFramePosition((start * rate).rounded())
        file.framePosition = first
        let count = AVAudioFrameCount(min(Double(file.length - first), (seconds * rate).rounded()))
        guard count > 0, let input = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: count) else { throw failure() }
        try file.read(into: input, frameCount: count)
        let frames = Int((seconds * 16000).rounded())
        guard let output = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: AVAudioFrameCount(frames + 64)) else { throw failure() }
        var supplied = false
        var error: NSError?
        converter.convert(to: output, error: &error) { _, status in
            if supplied { status.pointee = .endOfStream; return nil }
            supplied = true
            status.pointee = .haveData
            return input
        }
        if let error { throw error }
        guard let samples = output.floatChannelData?[0], Int(output.frameLength) <= frames + 64,
              frames - Int(output.frameLength) <= 1600 else { throw failure() }
        var data = Data()
        func word<T: FixedWidthInteger>(_ value: T) {
            var little = value.littleEndian
            withUnsafeBytes(of: &little) { data.append(contentsOf: $0) }
        }
        data.append(contentsOf: "RIFF".utf8); word(UInt32(36 + frames * 2))
        data.append(contentsOf: "WAVEfmt ".utf8); word(UInt32(16)); word(UInt16(1)); word(UInt16(1))
        word(UInt32(16000)); word(UInt32(32000)); word(UInt16(2)); word(UInt16(16))
        data.append(contentsOf: "data".utf8); word(UInt32(frames * 2))
        for index in 0..<frames {
            let value = index < Int(output.frameLength) ? samples[index] : 0
            word(Int16((max(-1, min(1, value.isFinite ? value : 0)) * 32767).rounded()))
        }
        return data
    }
    private static func failure() -> NSError {
        NSError(domain: "CareerNoteSpeech", code: 1, userInfo: [NSLocalizedDescriptionKey: "認識用の音声区間を変換できませんでした。原録音は保持しています。"])
    }
}
