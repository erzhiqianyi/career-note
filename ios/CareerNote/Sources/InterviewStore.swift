import Foundation

enum InterviewStore {
    static let maxAudioBytes = 256 * 1024 * 1024

    static func directory(uid: String, id: String) throws -> URL {
        guard !id.isEmpty, id.unicodeScalars.allSatisfy({ CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:_-").contains($0) }) else {
            throw failure("面接の識別子が正しくありません。")
        }
        let user = Data(uid.utf8).base64EncodedString().replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "+", with: "-")
        let base = try FileManager.default.url(for: .applicationSupportDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
            .appendingPathComponent("CareerNote/Interviews/\(user)/\(id)", isDirectory: true)
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUnlessOpen], ofItemAtPath: base.path)
        return base
    }

    static func audioURL(uid: String, id: String) throws -> URL {
        try directory(uid: uid, id: id).appendingPathComponent("original.audio")
    }

    static func stage(_ draft: InterviewDraft, source: URL, uid: String) throws {
        let folder = try directory(uid: uid, id: draft.id)
        let audio = try audioURL(uid: uid, id: draft.id)
        do {
            try FileManager.default.copyItem(at: source, to: audio)
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUnlessOpen], ofItemAtPath: audio.path)
            try JSONEncoder().encode(draft).write(to: folder.appendingPathComponent("pending.json"), options: [.atomic, .completeFileProtectionUnlessOpen])
        } catch {
            try? FileManager.default.removeItem(at: folder)
            throw error
        }
    }

    static func pending(uid: String) throws -> [InterviewDraft] {
        let root = try directory(uid: uid, id: "index").deletingLastPathComponent()
        return try FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil).compactMap { folder in
            let url = folder.appendingPathComponent("pending.json")
            guard FileManager.default.fileExists(atPath: url.path) else { return nil }
            return try JSONDecoder().decode(InterviewDraft.self, from: Data(contentsOf: url))
        }.sorted { $0.id < $1.id }
    }

    static func finish(uid: String, id: String) throws {
        let url = try directory(uid: uid, id: id).appendingPathComponent("pending.json")
        if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
    }

    static func cache(_ document: InterviewDocument, uid: String) throws {
        try JSONEncoder().encode(document).write(to: directory(uid: uid, id: document.id).appendingPathComponent("document.json"), options: [.atomic, .completeFileProtectionUnlessOpen])
    }

    static func cached(uid: String, id: String) throws -> InterviewDocument? {
        let url = try directory(uid: uid, id: id).appendingPathComponent("document.json")
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        return try JSONDecoder().decode(InterviewDocument.self, from: Data(contentsOf: url))
    }

    static func failure(_ message: String) -> NSError {
        NSError(domain: "CareerInterview", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
    }
}

enum InterviewTranscriptParser {
    /// SRT and the timestamped TXT exported by local Whisper. Untimed text stays in originalText.
    static func parse(_ source: String, name: String, duration: Double) throws -> InterviewTranscript {
        guard !source.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, source.utf8.count <= 700_000 else {
            throw InterviewStore.failure("転写は空でなく、700 KB 以内の UTF-8 テキストにしてください。")
        }
        let pattern = #"\[?(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})\]?\s*(.*)"#
        let regex = try NSRegularExpression(pattern: pattern)
        let lines = source.components(separatedBy: .newlines)
        var segments: [InterviewSegment] = []
        var active: InterviewSegment?
        func flush() {
            if let value = active, !value.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { segments.append(value) }
            active = nil
        }
        for line in lines {
            let range = NSRange(line.startIndex..<line.endIndex, in: line)
            if let match = regex.firstMatch(in: line, range: range) {
                flush()
                func capture(_ n: Int) -> String { Range(match.range(at: n), in: line).map { String(line[$0]) } ?? "" }
                let start = seconds(capture(1)), end = seconds(capture(2))
                guard start >= 0, end > start, end <= duration + 0.05, start >= (segments.last?.start ?? 0) else {
                    throw InterviewStore.failure("転写の時刻が録音の長さと一致しません。元の録音と転写の組み合わせを確認してください。")
                }
                active = InterviewSegment(id: "segment-\(segments.count + 1)", start: start, end: end, speaker: "unknown", text: capture(3), confirmed: false)
            } else if line.trimmingCharacters(in: .whitespaces).isEmpty { flush() }
            else if var value = active {
                value.text += (value.text.isEmpty ? "" : "\n") + line
                active = value
            }
        }
        flush()
        guard segments.count <= 5000, segments.allSatisfy({ $0.text.count <= 12000 }) else { throw InterviewStore.failure("転写の区間が多すぎるか、一つの区間が長すぎます。") }
        return InterviewTranscript(source: name, originalText: source, segments: segments)
    }

    private static func seconds(_ value: String) -> Double {
        value.replacingOccurrences(of: ",", with: ".").split(separator: ":").reduce(0) { $0 * 60 + (Double($1) ?? 0) }
    }
}
