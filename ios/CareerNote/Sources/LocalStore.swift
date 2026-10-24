import Foundation
import SQLite3

struct LocalSnapshot: Codable {
    var state: CareerState
    var pending: [PendingAttempt]
    var lastUpdated: Date?
    var personalizedResumes: [CareerPersonalizedResume]?
}

enum LocalStore {
    private static func directory() throws -> URL {
        let base = try FileManager.default.url(
            for: .applicationSupportDirectory, in: .userDomainMask,
            appropriateFor: nil, create: true
        ).appendingPathComponent("CareerNote", isDirectory: true)
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base
    }

    private static func name(for uid: String) -> String {
        Data(uid.utf8).base64EncodedString()
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "+", with: "-")
    }

    static func load(uid: String) throws -> LocalSnapshot? {
        try load(uid: uid, in: directory())
    }

    static func save(_ snapshot: LocalSnapshot, uid: String) throws {
        try save(snapshot, uid: uid, in: directory())
    }

    // Directory overloads allow migration tests to use disposable data.
    static func load(uid: String, in base: URL) throws -> LocalSnapshot? {
        let stem = name(for: uid)
        let database = base.appendingPathComponent(stem + ".sqlite")
        if FileManager.default.fileExists(atPath: database.path),
           let snapshot = try SQLiteStore(url: database).load() {
            return snapshot
        }
        let legacy = base.appendingPathComponent(stem + ".json")
        guard FileManager.default.fileExists(atPath: legacy.path) else {
            if FileManager.default.fileExists(atPath: database.path) {
                throw storeError("本机数据库尚未完成写入，且没有旧缓存可迁移。")
            }
            return nil
        }
        let snapshot = try JSONDecoder().decode(LocalSnapshot.self, from: Data(contentsOf: legacy))
        try save(snapshot, uid: uid, in: base)
        // The previous cache is removed only after the new transaction succeeds.
        try? FileManager.default.removeItem(at: legacy)
        return snapshot
    }

    static func save(_ snapshot: LocalSnapshot, uid: String, in base: URL) throws {
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        try SQLiteStore(url: base.appendingPathComponent(name(for: uid) + ".sqlite")).save(snapshot)
    }
}

private final class SQLiteStore {
    private var db: OpaquePointer?
    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    init(url: URL) throws {
        guard sqlite3_open(url.path, &db) == SQLITE_OK else {
            let detail = db.map { String(cString: sqlite3_errmsg($0)) } ?? "无法打开数据库"
            sqlite3_close(db)
            throw storeError(detail)
        }
        do {
            try FileManager.default.setAttributes(
                [.protectionKey: FileProtectionType.completeUnlessOpen], ofItemAtPath: url.path)
            try execute("PRAGMA journal_mode=DELETE")
            try execute("CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value BLOB NOT NULL)")
            try execute("CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, company TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL, next_date TEXT, payload BLOB NOT NULL)")
            try execute("CREATE INDEX IF NOT EXISTS jobs_next_date ON jobs(next_date)")
            try execute("CREATE TABLE IF NOT EXISTS materials (id TEXT PRIMARY KEY, job_id TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, payload BLOB NOT NULL)")
            try execute("CREATE INDEX IF NOT EXISTS materials_job ON materials(job_id)")
            try execute("CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, date TEXT NOT NULL, payload BLOB NOT NULL)")
            try execute("CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, status TEXT NOT NULL, payload BLOB NOT NULL)")
            try execute("CREATE TABLE IF NOT EXISTS question_sets (id TEXT PRIMARY KEY, job_id TEXT, title TEXT NOT NULL, payload BLOB NOT NULL)")
            try execute("CREATE INDEX IF NOT EXISTS question_sets_job ON question_sets(job_id)")
            try execute("CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, question_set_id TEXT NOT NULL, question_id TEXT NOT NULL, created_at TEXT NOT NULL, payload BLOB NOT NULL)")
            try execute("CREATE INDEX IF NOT EXISTS attempts_question ON attempts(question_set_id, question_id)")
            try execute("CREATE TABLE IF NOT EXISTS reviews (id TEXT PRIMARY KEY, attempt_id TEXT NOT NULL, payload BLOB NOT NULL)")
            try execute("CREATE INDEX IF NOT EXISTS reviews_attempt ON reviews(attempt_id)")
            try execute("CREATE TABLE IF NOT EXISTS resume_entries (id TEXT PRIMARY KEY, kind TEXT NOT NULL, language TEXT, payload BLOB NOT NULL)")
            try execute("CREATE INDEX IF NOT EXISTS resume_kind_language ON resume_entries(kind, language)")
            try execute("CREATE TABLE IF NOT EXISTS personalized_resumes (id TEXT PRIMARY KEY, language TEXT, target_company TEXT, payload BLOB NOT NULL)")
            try execute("CREATE TABLE IF NOT EXISTS pending_attempts (id TEXT PRIMARY KEY, question_set_id TEXT NOT NULL, question_id TEXT NOT NULL, created_at REAL NOT NULL, payload BLOB NOT NULL)")
        } catch {
            sqlite3_close(db)
            db = nil
            throw error
        }
    }

    deinit { sqlite3_close(db) }

    func load() throws -> LocalSnapshot? {
        let version: Int? = try metadata("cache_version")
        guard version == 1 else { return nil }
        var state = CareerState()
        state.jobs = try rows("jobs")
        state.materials = try rows("materials")
        state.reports = try rows("reports")
        state.tasks = try rows("tasks")
        state.questionSets = try rows("question_sets")
        state.attempts = try rows("attempts")
        state.reviews = try rows("reviews")
        state.resume = try rows("resume_entries")
        state.profile = try metadata("profile")
        state.today = try metadata("today")
        let pending: [PendingAttempt] = try rows("pending_attempts")
        let drafts: [CareerPersonalizedResume] = try rows("personalized_resumes")
        let lastUpdated: Date? = try metadata("last_updated")
        return LocalSnapshot(state: state, pending: pending, lastUpdated: lastUpdated,
                             personalizedResumes: drafts)
    }

    func save(_ snapshot: LocalSnapshot) throws {
        try execute("BEGIN IMMEDIATE")
        do {
            try replace("jobs", snapshot.state.jobs) { [$0.id, $0.company, $0.role, $0.status, $0.nextDate] }
            try replace("materials", snapshot.state.materials) { [$0.id, $0.jobId, $0.kind, $0.title] }
            try replace("reports", snapshot.state.reports) { [$0.id, $0.date] }
            try replace("tasks", snapshot.state.tasks) { [$0.id, $0.status] }
            try replace("question_sets", snapshot.state.questionSets) { [$0.id, $0.jobId, $0.title] }
            try replace("attempts", snapshot.state.attempts) { [$0.id, $0.questionSetId, $0.questionId, $0.createdAt] }
            try replace("reviews", snapshot.state.reviews) { [$0.id, $0.attemptId] }
            try replace("resume_entries", snapshot.state.resume ?? []) { [$0.id, $0.kind, $0.language] }
            try replace("personalized_resumes", snapshot.personalizedResumes ?? []) { [$0.id, $0.language, $0.targetCompany] }
            try replace("pending_attempts", snapshot.pending) {
                [$0.id, $0.questionSetId, $0.questionId, String($0.createdAt.timeIntervalSince1970)]
            }
            try execute("DELETE FROM metadata")
            try putMetadata("profile", snapshot.state.profile)
            try putMetadata("today", snapshot.state.today)
            try putMetadata("last_updated", snapshot.lastUpdated)
            try putMetadata("cache_version", 1)
            try execute("COMMIT")
        } catch {
            try? execute("ROLLBACK")
            throw error
        }
    }

    private func replace<T: Encodable>(_ table: String, _ values: [T],
                                       columns: (T) -> [String?]) throws {
        try execute("DELETE FROM \(table)")
        for value in values {
            let fields = columns(value)
            let placeholders = Array(repeating: "?", count: fields.count + 1).joined(separator: ",")
            try statement("INSERT INTO \(table) VALUES (\(placeholders))") { query in
                for (index, field) in fields.enumerated() {
                    bind(field, to: query, at: Int32(index + 1))
                }
                bind(try encoder.encode(value), to: query, at: Int32(fields.count + 1))
                try step(query)
            }
        }
    }

    private func rows<T: Decodable>(_ table: String) throws -> [T] {
        var result: [T] = []
        try statement("SELECT payload FROM \(table) ORDER BY rowid") { query in
            while true {
                let status = sqlite3_step(query)
                if status == SQLITE_DONE { break }
                guard status == SQLITE_ROW else { throw storeError(errorMessage) }
                result.append(try decoder.decode(T.self, from: blob(query, column: 0)))
            }
        }
        return result
    }

    private func putMetadata<T: Encodable>(_ key: String, _ value: T?) throws {
        guard let value else { return }
        try statement("INSERT INTO metadata VALUES (?, ?)") { query in
            bind(key, to: query, at: 1)
            bind(try encoder.encode(value), to: query, at: 2)
            try step(query)
        }
    }

    private func metadata<T: Decodable>(_ key: String) throws -> T? {
        var result: T?
        try statement("SELECT value FROM metadata WHERE key = ?") { query in
            bind(key, to: query, at: 1)
            let status = sqlite3_step(query)
            if status == SQLITE_ROW {
                result = try decoder.decode(T.self, from: blob(query, column: 0))
            } else if status != SQLITE_DONE {
                throw storeError(errorMessage)
            }
        }
        return result
    }

    private func execute(_ sql: String) throws {
        guard sqlite3_exec(db, sql, nil, nil, nil) == SQLITE_OK else { throw storeError(errorMessage) }
    }

    private func statement(_ sql: String, body: (OpaquePointer) throws -> Void) throws {
        var query: OpaquePointer?
        guard sqlite3_prepare_v2(db, sql, -1, &query, nil) == SQLITE_OK, let query else {
            throw storeError(errorMessage)
        }
        defer { sqlite3_finalize(query) }
        try body(query)
    }

    private func step(_ query: OpaquePointer) throws {
        guard sqlite3_step(query) == SQLITE_DONE else { throw storeError(errorMessage) }
    }

    private func bind(_ value: String?, to query: OpaquePointer, at index: Int32) {
        guard let value else { sqlite3_bind_null(query, index); return }
        sqlite3_bind_text(query, index, value, -1, SQLITE_TRANSIENT)
    }

    private func bind(_ value: Data, to query: OpaquePointer, at index: Int32) {
        _ = value.withUnsafeBytes { bytes in
            sqlite3_bind_blob(query, index, bytes.baseAddress, Int32(value.count), SQLITE_TRANSIENT)
        }
    }

    private func blob(_ query: OpaquePointer, column: Int32) -> Data {
        let count = Int(sqlite3_column_bytes(query, column))
        guard let pointer = sqlite3_column_blob(query, column) else { return Data() }
        return Data(bytes: pointer, count: count)
    }

    private var errorMessage: String { String(cString: sqlite3_errmsg(db)) }
}

private let SQLITE_TRANSIENT = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

private func storeError(_ detail: String) -> NSError {
    NSError(domain: "CareerNote.LocalStore", code: 1,
            userInfo: [NSLocalizedDescriptionKey: detail])
}
