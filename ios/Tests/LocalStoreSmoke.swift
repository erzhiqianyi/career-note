import Foundation

@main struct Smoke {
    static func main() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let stateData = Data("""
        {"jobs":[{"id":"job-1","company":"Sample","role":"Engineer","status":"面试中","nextDate":"2026-10-24"}],"profile":null,"resume":[],"today":"2026-10-24","materials":[],"reports":[],"tasks":[],"questionSets":[],"attempts":[],"reviews":[]}
        """.utf8)
        let state = try JSONDecoder().decode(CareerState.self, from: stateData)
        let pending = PendingAttempt(id: "pending-1", questionSetId: "pack-1", questionId: "q-1", answer: "offline answer", language: "ja", durationSeconds: 32, requestReview: true, createdAt: Date(timeIntervalSince1970: 12345))
        let snapshot = LocalSnapshot(state: state, pending: [pending], lastUpdated: Date(timeIntervalSince1970: 45678), personalizedResumes: [])
        try LocalStore.save(snapshot, uid: "test-user", in: root)
        let read = try LocalStore.load(uid: "test-user", in: root)
        precondition(read?.state.jobs.first?.company == "Sample")
        precondition(read?.pending.first?.answer == "offline answer")
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
