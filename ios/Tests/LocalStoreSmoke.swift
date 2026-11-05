import Foundation

@main struct Smoke {
    static func main() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let stateData = Data("""
        {"jobs":[{"id":"job-1","company":"Sample","role":"Engineer","status":"面试中","nextDate":"2026-10-24"}],"profile":null,"resume":[],"today":"2026-10-24","materials":[],"reports":[],"tasks":[],"questionSets":[],"attempts":[],"reviews":[]}
        """.utf8)
        var state = try JSONDecoder().decode(CareerState.self, from: stateData)
        precondition(state.interviews == nil)
        state.interviews = [InterviewSummary(id: "fixture-interview", revision: 4, title: "Fictional interview", jobId: "job-1", date: "2026-11-05", durationSeconds: 120,
                                            status: "flow", audio: nil, segmentCount: 2, exchangeCount: 1, practiceCount: 0)]
        let flowPack = #"{"id":"flow-pack","title":"Practice","questions":[{"id":"q1","title":"Project","questionJa":"説明してください","outline":"Original notes","answerFlow":{"version":1,"nodes":[{"id":"background","title":"背景","cue":"要点","detail":"説明","cautions":"注意"}],"followUps":[{"id":"why","question":"なぜ？","nodeId":"background","questionId":"q2"}]}},{"id":"q2","title":"Why","questionJa":"なぜ？"}]}"#
        state.questionSets = [try JSONDecoder().decode(QuestionSet.self, from: Data(flowPack.utf8))]
        let pending = PendingAttempt(id: "pending-1", questionSetId: "pack-1", questionId: "q-1", answer: "offline answer", language: "ja", durationSeconds: 32, requestReview: true, createdAt: Date(timeIntervalSince1970: 12345), hasRecording: true)
        let snapshot = LocalSnapshot(state: state, pending: [pending], lastUpdated: Date(timeIntervalSince1970: 45678), personalizedResumes: [])
        try LocalStore.save(snapshot, uid: "test-user", in: root)
        let read = try LocalStore.load(uid: "test-user", in: root)
        precondition(read?.state.jobs.first?.company == "Sample")
        precondition(read?.state.interviews?.first?.revision == 4)
        precondition(read?.state.interviews?.first?.statusLabel == "振り返り待ち")
        precondition(read?.state.questionSets.first?.questions.first?.answerFlow?.nodes.first?.id == "background")
        precondition(read?.state.questionSets.first?.questions.first?.answerFlow?.followUps.first?.questionId == "q2")
        precondition(read?.state.questionSets.first?.questions.last?.answerFlow == nil)
        precondition(read?.pending.first?.answer == "offline answer")
        precondition(read?.pending.first?.hasRecording == true)
        precondition(read?.lastUpdated == snapshot.lastUpdated)
        var duplicate = snapshot
        duplicate.state.jobs.append(state.jobs[0])
        do {
            try LocalStore.save(duplicate, uid: "test-user", in: root)
            preconditionFailure("duplicate primary key should fail")
        } catch {
            let afterRollback = try LocalStore.load(uid: "test-user", in: root)
            precondition(afterRollback?.state.jobs.count == 1)
            precondition(afterRollback?.pending.first?.answer == "offline answer")
        }
        let legacy = root.appendingPathComponent(Data("legacy-user".utf8).base64EncodedString() + ".json")
        try JSONEncoder().encode(snapshot).write(to: legacy)
        let migrated = try LocalStore.load(uid: "legacy-user", in: root)
        precondition(migrated?.pending.first?.id == "pending-1")
        precondition(!FileManager.default.fileExists(atPath: legacy.path))
        let migratedAgain = try LocalStore.load(uid: "legacy-user", in: root)
        precondition(migratedAgain?.state.jobs.count == 1)
        print("SQLite round-trip and legacy migration passed")
    }
}
