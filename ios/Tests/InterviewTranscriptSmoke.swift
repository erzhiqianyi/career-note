import Foundation

@main struct InterviewTranscriptSmoke {
    static func main() throws {
        let srt = """
        1
        00:00:00,000 --> 00:00:03,500
        経験を教えてください。

        2
        00:00:03,500 --> 00:00:09,000
        Javaを使いました。
        設計も担当しました。

        """
        let transcript = try InterviewTranscriptParser.parse(srt, name: "fixture.srt", duration: 10)
        precondition(transcript.originalText == srt)
        precondition(transcript.segments.count == 2)
        precondition(transcript.segments[1].start == 3.5)
        precondition(transcript.segments[1].text == "Javaを使いました。\n設計も担当しました。")
        precondition(transcript.segments.allSatisfy { !$0.confirmed && $0.speaker == "unknown" })
        let txt = "# Whisper\n[00:00:01.250 --> 00:00:02.500] 質問\n[00:00:03.000 --> 00:00:07.000] 回答"
        let whisper = try InterviewTranscriptParser.parse(txt, name: "fixture.txt", duration: 10)
        precondition(whisper.segments.count == 2 && whisper.segments[0].start == 1.25)
        let plain = try InterviewTranscriptParser.parse("未校正の文章。", name: "plain.txt", duration: 10)
        precondition(plain.segments.isEmpty && plain.originalText == "未校正の文章。")
        for invalid in ["", "[00:00:03.000 --> 00:00:02.000] reversed", "[00:00:00.000 --> 00:00:11.000] outside recording"] {
            do { _ = try InterviewTranscriptParser.parse(invalid, name: "invalid.txt", duration: 10); fatalError("Accepted invalid transcript") }
            catch { /* Expected: invalid timestamps must not silently enter the source library. */ }
        }
        let roundTrip = try JSONDecoder().decode(InterviewTranscript.self, from: JSONEncoder().encode(transcript))
        precondition(roundTrip.segments[1].text == transcript.segments[1].text)
        print("Interview SRT/TXT parsing, uncertainty, source preservation and timing checks passed")
    }
}
