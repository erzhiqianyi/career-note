import CryptoKit
import AuthenticationServices
import CryptoKit
import FirebaseAuth
import FirebaseCore
import GoogleSignIn
import Observation
import SwiftUI
import UIKit

@main
struct CareerNoteApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView(model: model)
                .onOpenURL { GIDSignIn.sharedInstance.handle($0) }
                .task { model.start() }
        }
    }
}

@MainActor @Observable
final class AppModel {
    var state = CareerState()
    var pending: [PendingAttempt] = []
    var pendingInterviews: [InterviewDraft] = []
    var interviewUploadProgress: Double?
    var personalizedResumes: [CareerPersonalizedResume] = []
    var lastUpdated: Date?
    var userID: String?
    var accountName = ""
    var message: String?
    var busy = false
    var apiAddress: String {
        guard let host = Bundle.main.object(forInfoDictionaryKey: "CAREER_API_HOST") as? String,
              !host.isEmpty, !host.contains("$(") else { return "" }
        return "https://\(host)"
    }
    var firebaseReady = false
    #if DEBUG
    var isDesignPreview = false
    #endif
    private var listener: AuthStateDidChangeListenerHandle?

    func start() {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-careerDesignLogin") {
            guard !isDesignPreview else { return }
            isDesignPreview = true
            firebaseReady = true
            return
        }
        if ProcessInfo.processInfo.arguments.contains("-careerDesignPreview") {
            guard !isDesignPreview else { return }
            isDesignPreview = true
            userID = "design-preview"
            accountName = "设计预览 · 示例数据"
            state = ProcessInfo.processInfo.arguments.contains("-careerDesignLists") ? DesignPreview.listState : DesignPreview.state
            personalizedResumes = DesignPreview.personalizedResumes
            pending = DesignPreview.pending
            lastUpdated = Date()
            return
        }
        #endif
        guard listener == nil else { return }
        guard let path = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
              let options = FirebaseOptions(contentsOfFile: path) else {
            message = "请先按 iOS 设置说明添加 Firebase 配置。"
            return
        }
        FirebaseApp.configure(options: options)
        firebaseReady = true
        listener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in self?.selectUser(user) }
        }
    }

    private func selectUser(_ user: User?) {
        let nextID = user?.uid
        guard nextID != userID else { return }
        userID = nextID
        accountName = user?.email ?? user?.displayName ?? ""
        state = CareerState()
        pending = []
        pendingInterviews = []
        interviewUploadProgress = nil
        personalizedResumes = []
        lastUpdated = nil
        guard let nextID else { return }
        do {
            pendingInterviews = try InterviewStore.pending(uid: nextID)
            if let snapshot = try LocalStore.load(uid: nextID) {
                state = snapshot.state
                pending = snapshot.pending
                personalizedResumes = snapshot.personalizedResumes ?? []
                lastUpdated = snapshot.lastUpdated
            }
        } catch { message = "本机缓存读取失败：\(error.localizedDescription)" }
        Task { await sync() }
    }

    private var baseURL: URL? {
        guard let url = URL(string: apiAddress),
              url.scheme == "https" || (url.scheme == "http" && ["localhost", "127.0.0.1"].contains(url.host)),
              url.user == nil, url.password == nil, url.query == nil, url.fragment == nil
        else { return nil }
        return url
    }

    private func request(_ path: String, body: PendingAttempt? = nil) async throws -> Data {
        guard let baseURL else { throw NSError(domain: "CareerNote", code: 1, userInfo: [NSLocalizedDescriptionKey: "应用未配置线上同步服务地址。"]) }
        guard let user = Auth.auth().currentUser, user.uid == userID else {
            throw NSError(domain: "CareerNote", code: 2, userInfo: [NSLocalizedDescriptionKey: "请先登录。"])
        }
        var request = URLRequest(url: baseURL.appending(path: "api/career/" + path))
        request.setValue("Bearer \(try await user.getIDToken())", forHTTPHeaderField: "Authorization")
        if let body {
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            var payload: [String: Any] = [
                "clientRequestId": body.id,
                "questionSetId": body.questionSetId,
                "questionId": body.questionId,
                "answer": body.answer,
                "language": body.language,
                "durationSeconds": body.durationSeconds,
                "requestReview": body.requestReview
            ]
            if let context = body.practiceContext { payload["practiceContext"] = try JSONSerialization.jsonObject(with: JSONEncoder().encode(context)) }
            request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            let detail = (try? JSONDecoder().decode(APIError.self, from: data).error) ?? "服务器请求失败"
            throw NSError(domain: "CareerNote", code: 3, userInfo: [NSLocalizedDescriptionKey: detail])
        }
        return data
    }

    private func uploadRecording(uid: String, localID: String, serverID: String) async throws {
        guard let baseURL else { throw NSError(domain: "CareerNote", code: 1, userInfo: [NSLocalizedDescriptionKey: "应用未配置线上同步服务地址。"]) }
        guard let user = Auth.auth().currentUser, user.uid == uid else {
            throw NSError(domain: "CareerNote", code: 2, userInfo: [NSLocalizedDescriptionKey: "请先登录。"])
        }
        var components = URLComponents(url: baseURL.appending(path: "api/career/attempts/audio"),
                                       resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "id", value: serverID)]
        var request = URLRequest(url: components.url!)
        request.httpMethod = "POST"
        request.setValue("Bearer \(try await user.getIDToken())", forHTTPHeaderField: "Authorization")
        request.setValue("audio/mp4", forHTTPHeaderField: "Content-Type")
        request.httpBody = try LocalStore.recordingData(uid: uid, attemptID: localID)
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            let detail = (try? JSONDecoder().decode(APIError.self, from: data).error) ?? "录音上传失败"
            throw NSError(domain: "CareerNote", code: 4, userInfo: [NSLocalizedDescriptionKey: detail])
        }
    }

    func savedRecording(id: String) async throws -> Data {
        guard let baseURL else { throw NSError(domain: "CareerNote", code: 1, userInfo: [NSLocalizedDescriptionKey: "应用未配置线上同步服务地址。"]) }
        guard let user = Auth.auth().currentUser, user.uid == userID else {
            throw NSError(domain: "CareerNote", code: 2, userInfo: [NSLocalizedDescriptionKey: "请先登录。"])
        }
        var components = URLComponents(url: baseURL.appending(path: "api/career/attempts/audio"),
                                       resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "id", value: id)]
        var request = URLRequest(url: components.url!)
        request.setValue("Bearer \(try await user.getIDToken())", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            let detail = (try? JSONDecoder().decode(APIError.self, from: data).error) ?? "录音读取失败"
            throw NSError(domain: "CareerNote", code: 4, userInfo: [NSLocalizedDescriptionKey: detail])
        }
        return data
    }

    func referenceSpeech(questionSetID: String, questionID: String, source: String,
                         voice: String) async throws -> Data {
        guard let baseURL else { throw NSError(domain: "CareerNote", code: 1, userInfo: [NSLocalizedDescriptionKey: "音声サーバーのアドレスが設定されていません。"]) }
        guard let user = Auth.auth().currentUser, user.uid == userID else {
            throw NSError(domain: "CareerNote", code: 2, userInfo: [NSLocalizedDescriptionKey: "先にログインしてください。"])
        }
        var request = URLRequest(url: baseURL.appending(path: "api/career/reference-speech"))
        request.httpMethod = "POST"
        request.timeoutInterval = 45
        request.setValue("Bearer \(try await user.getIDToken())", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "questionSetId": questionSetID, "questionId": questionID,
            "source": source, "voice": voice
        ])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            let detail = (try? JSONDecoder().decode(APIError.self, from: data).error) ?? "音声の取得に失敗しました。"
            throw NSError(domain: "CareerNote", code: 3, userInfo: [NSLocalizedDescriptionKey: detail])
        }
        guard !data.isEmpty, response.value(forHTTPHeaderField: "Content-Type")?.lowercased().contains("audio") == true else {
            throw SpeechError.invalidAudio
        }
        ReferenceSpeechSettings.removeLegacyCredentials()
        return data
    }

    var canManageMaterialFiles: Bool {
        #if DEBUG
        if isDesignPreview { return false }
        #endif
        return userID != nil && firebaseReady && !apiAddress.isEmpty
    }

    func materialFileRequest(id: String, kind: String? = nil, content: Bool = false,
                             method: String = "GET", data: Data? = nil, mime: String? = nil) async throws -> Data {
        guard let baseURL else { throw NSError(domain: "CareerNote", code: 1, userInfo: [NSLocalizedDescriptionKey: "应用未配置线上同步服务地址。"]) }
        guard let user = Auth.auth().currentUser, user.uid == userID else {
            throw NSError(domain: "CareerNote", code: 2, userInfo: [NSLocalizedDescriptionKey: "请先登录。"])
        }
        let path = content ? "api/career/material-files/content" : "api/career/material-files"
        var components = URLComponents(url: baseURL.appending(path: path), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "id", value: id)]
        if let kind { components.queryItems?.append(URLQueryItem(name: "kind", value: kind)) }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.setValue("Bearer \(try await user.getIDToken())", forHTTPHeaderField: "Authorization")
        if let data {
            request.httpBody = data
            request.setValue(mime ?? "application/octet-stream", forHTTPHeaderField: "Content-Type")
        }
        let (result, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            let detail = (try? JSONDecoder().decode(APIError.self, from: result).error) ?? "文件请求失败"
            throw NSError(domain: "CareerNote", code: 3, userInfo: [NSLocalizedDescriptionKey: detail])
        }
        return result
    }

    @discardableResult
    private func persist() -> Bool {
        guard let userID else { return false }
        do {
            try LocalStore.save(LocalSnapshot(state: state, pending: pending, lastUpdated: lastUpdated,
                                              personalizedResumes: personalizedResumes), uid: userID)
            return true
        } catch {
            message = "本机保存失败：\(error.localizedDescription)"
            return false
        }
    }

    @discardableResult
    func queue(questionSetId: String, questionId: String, answer: String, language: String,
               duration: Int, requestReview: Bool, recordingURL: URL? = nil, practiceContext: PracticeContext? = nil) -> Bool {
        guard let userID, !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        guard answer.count <= 20_000 else {
            message = "回答不能超过 20,000 字。"
            return false
        }
        let id = UUID().uuidString
        if let recordingURL {
            do { try LocalStore.storeRecording(from: recordingURL, uid: userID, attemptID: id) }
            catch {
                LocalStore.removeRecording(uid: userID, attemptID: id)
                message = "录音本机保存失败：\(error.localizedDescription)"
                return false
            }
        }
        pending.append(PendingAttempt(
            id: id, questionSetId: questionSetId, questionId: questionId,
            answer: answer, language: language, durationSeconds: duration,
            requestReview: requestReview, createdAt: Date(), hasRecording: recordingURL != nil, practiceContext: practiceContext
        ))
        guard persist() else {
            pending.removeLast()
            if recordingURL != nil { LocalStore.removeRecording(uid: userID, attemptID: id) }
            return false
        }
        Task { await sync() }
        return true
    }

    func sync() async {
        #if DEBUG
        if isDesignPreview { return }
        #endif
        guard let syncingUID = userID, !busy else { return }
        busy = true
        defer {
            busy = false
            if userID != syncingUID && userID != nil { Task { await sync() } }
        }
        do {
            // Keep each answer in the queue until the server confirms it.
            while let first = pending.first {
                let response = try await request("attempts", body: first)
                guard userID == syncingUID else { return }
                if first.hasRecording == true {
                    let saved = try JSONDecoder().decode(SavedAttempt.self, from: response)
                    try await uploadRecording(uid: syncingUID, localID: first.id, serverID: saved.id)
                    guard userID == syncingUID else { return }
                }
                pending.removeFirst()
                guard persist() else {
                    pending.insert(first, at: 0)
                    throw NSError(domain: "CareerNote", code: 5,
                                  userInfo: [NSLocalizedDescriptionKey: "本机回答队列保存失败，请稍后重试。"])
                }
                if first.hasRecording == true {
                    LocalStore.removeRecording(uid: syncingUID, attemptID: first.id)
                }
            }
            // A long interview upload must not prevent normal answers or cached state from syncing.
            var interviewError: String?
            do { try await syncInterviews(uid: syncingUID) }
            catch {
                guard userID == syncingUID else { return }
                interviewError = "面接のアップロードは再開できます。\(error.localizedDescription)"
            }
            let fresh = try JSONDecoder().decode(CareerState.self, from: await request("state"))
            guard userID == syncingUID else { return }
            state = fresh
            lastUpdated = Date()
            message = interviewError
            persist()
            do {
                let result = try JSONDecoder().decode(CareerPersonalizedResponse.self,
                                                      from: await request("personalized-resumes"))
                guard userID == syncingUID else { return }
                personalizedResumes = result.drafts
                persist()
            } catch {
                guard userID == syncingUID else { return }
                message = "个性化简历暂未更新，显示本机版本。\(error.localizedDescription)"
            }
        } catch {
            guard userID == syncingUID else { return }
            message = !pendingInterviews.isEmpty ? "\(pendingInterviews.count) 件の面接がアップロード待ちです。\(error.localizedDescription)" : pending.isEmpty
                ? "当前离线，显示本机数据。\(error.localizedDescription)"
                : "有 \(pending.count) 条回答等待同步。\(error.localizedDescription)"
        }
    }

    func interviewRequest(_ path: String, method: String = "GET", body: Data? = nil,
                          mime: String = "application/json", uid: String) async throws -> Data {
        guard userID == uid, let user = Auth.auth().currentUser, user.uid == uid, let baseURL else {
            throw InterviewStore.failure("同じアカウントでログインしてください。")
        }
        let pieces = path.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        var components = URLComponents(url: baseURL.appending(path: "api/career/" + pieces[0]), resolvingAgainstBaseURL: false)!
        if pieces.count > 1 { components.percentEncodedQuery = String(pieces[1]) }
        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        request.timeoutInterval = 120
        request.setValue("Bearer \(try await user.getIDToken())", forHTTPHeaderField: "Authorization")
        request.setValue(mime, forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        let (data, response) = try await URLSession.shared.data(for: request)
        guard userID == uid else { throw CancellationError() }
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            throw InterviewStore.failure((try? JSONDecoder().decode(APIError.self, from: data).error) ?? "面接データを同期できませんでした。")
        }
        return data
    }

    func transcribeRecording(url: URL, jobID: String, language: String, uid: String,
                             interviewID: String? = nil, interviewDuration: Double? = nil) async throws -> String {
        let measured = try await Task.detached { try SpeechAudioChunks.duration(url) }.value
        let duration = interviewDuration ?? measured
        guard abs(measured - duration) < 0.1 else { throw InterviewStore.failure("録音の長さが一致しません。") }
        let payload: [String: Any] = ["id": jobID, "target": interviewID == nil ? "practice" : "interview",
            "interviewId": interviewID ?? "", "language": language, "durationSeconds": duration]
        _ = try await interviewRequest("speech", method: "POST", body: JSONSerialization.data(withJSONObject: payload), uid: uid)
        struct Status: Decodable { let chunkCount: Int; let completedParts: [Int] }
        let status = try JSONDecoder().decode(Status.self, from: await interviewRequest("speech/status?id=\(jobID)", uid: uid))
        let completed = Set(status.completedParts)
        for part in 0..<status.chunkCount {
            try Task.checkCancellation()
            if !completed.contains(part) {
                let bytes = try await Task.detached { try SpeechAudioChunks.wav(url, part: part, duration: duration) }.value
                _ = try await interviewRequest("speech/chunk?id=\(jobID)&part=\(part)", method: "POST", body: bytes, mime: "audio/wav", uid: uid)
            }
            if interviewID != nil { interviewUploadProgress = Double(part + 1) / Double(status.chunkCount) }
        }
        struct Result: Decodable { let text: String }
        return try JSONDecoder().decode(Result.self, from: await interviewRequest("speech/complete", method: "POST",
            body: JSONSerialization.data(withJSONObject: ["id": jobID]), uid: uid)).text
    }

    func transcribeInterview(_ document: InterviewDocument, uid: String, language: String = "ja") async throws -> InterviewDocument {
        defer { if userID == uid { interviewUploadProgress = nil } }
        let url = try await downloadInterviewAudio(id: document.id, uid: uid)
        _ = try await transcribeRecording(url: url, jobID: "interview-" + SHA256.hash(data: Data(document.id.utf8)).map { String(format: "%02x", $0) }.joined() + "-" + language,
            language: language, uid: uid, interviewID: document.id, interviewDuration: document.durationSeconds)
        try await requestInterviewAnalysis(id: document.id, uid: uid)
        return try await loadInterview(id: document.id, uid: uid)
    }

    func stageInterview(_ draft: InterviewDraft, source: URL) throws {
        guard let uid = userID else { throw InterviewStore.failure("ログインしてください。") }
        try InterviewStore.stage(draft, source: source, uid: uid)
        pendingInterviews = try InterviewStore.pending(uid: uid)
        Task { await sync() }
    }

    func savePracticePlanRequest(id: String, input: PracticePlanInput, revision: Int? = nil) async throws {
        guard let uid = userID else { throw InterviewStore.failure("ログインしてください。") }
        var payload: [String: Any] = ["id": id, "input": try JSONSerialization.jsonObject(with: JSONEncoder().encode(input))]
        if let revision { payload["revision"] = revision }
        let data = try await interviewRequest("practice-plans" + (revision == nil ? "" : "/edit"), method: "POST",
                                              body: JSONSerialization.data(withJSONObject: payload), uid: uid)
        let plan = try JSONDecoder().decode(PracticePlan.self, from: data)
        state.practicePlans = (state.practicePlans ?? []).filter { $0.id != plan.id } + [plan]
        guard persist() else { throw InterviewStore.failure("計画はサーバーに保存されましたが、端末の保存に失敗しました。同期してください。") }
        await sync()
    }

    func requestPracticePlanTask(id: String, checkpointID: String? = nil) async throws {
        guard let uid = userID else { throw InterviewStore.failure("ログインしてください。") }
        var payload: [String: Any] = ["id": id, "kind": checkpointID == nil ? "planning" : "review"]
        if let checkpointID { payload["checkpointId"] = checkpointID }
        _ = try await interviewRequest("practice-plans/request", method: "POST", body: JSONSerialization.data(withJSONObject: payload), uid: uid)
        await sync()
    }

    func setPracticePlanStatus(id: String, revision: Int, status: String) async throws {
        guard let uid = userID else { throw InterviewStore.failure("ログインしてください。") }
        let payload: [String: Any] = ["id": id, "revision": revision, "status": status]
        let data = try await interviewRequest("practice-plans/status", method: "POST", body: JSONSerialization.data(withJSONObject: payload), uid: uid)
        let plan = try JSONDecoder().decode(PracticePlan.self, from: data)
        state.practicePlans = (state.practicePlans ?? []).filter { $0.id != plan.id } + [plan]
        persist()
    }

    private func syncInterviews(uid: String) async throws {
        defer { if userID == uid { interviewUploadProgress = nil } }
        for draft in try InterviewStore.pending(uid: uid) {
            guard userID == uid else { throw CancellationError() }
            func post(_ path: String, _ value: [String: Any]) async throws -> Data {
                try await interviewRequest(path, method: "POST", body: JSONSerialization.data(withJSONObject: value), uid: uid)
            }
            _ = try await post("interviews", ["id": draft.id, "title": draft.title, "jobId": draft.jobId,
                                               "date": draft.date, "durationSeconds": draft.durationSeconds])
            struct Receipt: Decodable {
                struct Part: Decodable { let partNumber: Int }
                let complete: Bool; let partSize: Int; let parts: [Part]
            }
            let upload = try JSONDecoder().decode(Receipt.self, from: await post("interviews/upload", [
                "id": draft.id, "size": draft.size, "contentType": draft.contentType, "fileName": draft.fileName
            ]))
            if !upload.complete {
                let handle = try FileHandle(forReadingFrom: InterviewStore.audioURL(uid: uid, id: draft.id))
                defer { try? handle.close() }
                let count = Int(ceil(Double(draft.size) / Double(upload.partSize)))
                let completed = Set(upload.parts.map(\.partNumber))
                for part in 1...count {
                    if !completed.contains(part) {
                        try handle.seek(toOffset: UInt64((part - 1) * upload.partSize))
                        let bytes = try handle.read(upToCount: min(upload.partSize, draft.size - (part - 1) * upload.partSize)) ?? Data()
                        _ = try await interviewRequest("interviews/upload-part?id=\(draft.id)&part=\(part)", method: "POST", body: bytes, mime: "application/octet-stream", uid: uid)
                    }
                    interviewUploadProgress = Double(part) / Double(count)
                }
                _ = try await post("interviews/upload-complete", ["id": draft.id])
            }
            var document = try JSONDecoder().decode(InterviewDocument.self, from: await interviewRequest("interviews/document?id=\(draft.id)", uid: uid))
            if document.transcript == nil, let transcript = draft.transcript {
                let data = try JSONSerialization.jsonObject(with: JSONEncoder().encode(transcript))
                document = try JSONDecoder().decode(InterviewDocument.self, from: await post("interviews/stage", [
                    "id": draft.id, "revision": document.revision, "stage": "transcript", "data": data
                ]))
            }
            if document.status != "practice" { _ = try await post("interviews/request-analysis", ["id": draft.id]) }
            try InterviewStore.cache(document, uid: uid)
            let summary = InterviewSummary(id: document.id, revision: document.revision, title: document.title, jobId: document.jobId,
                                           date: document.date, durationSeconds: document.durationSeconds, status: document.status,
                                           audio: document.audio, segmentCount: document.transcript?.segments.count,
                                           exchangeCount: document.flow?.exchanges.count, practiceCount: document.practice?.count)
            state.interviews = (state.interviews ?? []).filter { $0.id != document.id } + [summary]
            guard persist() else { throw InterviewStore.failure("端末の面接一覧を保存できませんでした。再同期してください。") }
            try InterviewStore.finish(uid: uid, id: draft.id)
            pendingInterviews = try InterviewStore.pending(uid: uid)
        }
    }

    func loadInterview(id: String, uid: String) async throws -> InterviewDocument {
        let data = try await interviewRequest("interviews/document?id=\(id)", uid: uid)
        let document = try JSONDecoder().decode(InterviewDocument.self, from: data)
        try InterviewStore.cache(document, uid: uid)
        return document
    }

    func saveInterviewTranscript(id: String, revision: Int, transcript: InterviewTranscript, uid: String) async throws -> InterviewDocument {
        try await saveInterviewStage(id: id, revision: revision, stage: "transcript", value: transcript, uid: uid)
    }

    func saveInterviewStage<T: Encodable>(id: String, revision: Int, stage: String, value: T, uid: String) async throws -> InterviewDocument {
        let value = try JSONSerialization.jsonObject(with: JSONEncoder().encode(value))
        let body = try JSONSerialization.data(withJSONObject: ["id": id, "revision": revision, "stage": stage, "data": value])
        let data = try await interviewRequest("interviews/stage", method: "POST", body: body, uid: uid)
        let saved = try JSONDecoder().decode(InterviewDocument.self, from: data)
        try InterviewStore.cache(saved, uid: uid)
        return saved
    }

    func requestInterviewAnalysis(id: String, uid: String) async throws {
        _ = try await interviewRequest("interviews/request-analysis", method: "POST",
                                       body: JSONSerialization.data(withJSONObject: ["id": id]), uid: uid)
        await sync()
    }

    func downloadInterviewAudio(id: String, uid: String) async throws -> URL {
        guard userID == uid else { throw CancellationError() }
        let target = try InterviewStore.audioURL(uid: uid, id: id)
        if FileManager.default.fileExists(atPath: target.path) { return target }
        guard let user = Auth.auth().currentUser, user.uid == uid, userID == uid, let baseURL else {
            throw InterviewStore.failure("同じアカウントでログインしてください。")
        }
        var components = URLComponents(url: baseURL.appending(path: "api/career/interviews/audio"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "id", value: id)]
        var request = URLRequest(url: components.url!)
        request.setValue("Bearer \(try await user.getIDToken())", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 300
        let (file, response) = try await URLSession.shared.download(for: request)
        defer { try? FileManager.default.removeItem(at: file) }
        guard userID == uid else { throw CancellationError() }
        guard let response = response as? HTTPURLResponse, response.statusCode == 200,
              response.value(forHTTPHeaderField: "Content-Type")?.hasPrefix("audio/") == true else {
            throw InterviewStore.failure("録音をダウンロードできませんでした。")
        }
        try FileManager.default.moveItem(at: file, to: target)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUnlessOpen], ofItemAtPath: target.path)
        return target
    }

    func discardPending(id: String) {
        if let userID, pending.first(where: { $0.id == id })?.hasRecording == true {
            LocalStore.removeRecording(uid: userID, attemptID: id)
        }
        pending.removeAll { $0.id == id }
        persist()
    }

    func signInWithGoogle() async {
        guard let clientID = FirebaseApp.app()?.options.clientID,
              let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let controller = scene.keyWindow?.rootViewController else {
            message = "Google 登录配置不完整。"
            return
        }
        do {
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: controller)
            guard let idToken = result.user.idToken?.tokenString else { throw NSError(domain: "CareerNote", code: 4) }
            let credential = GoogleAuthProvider.credential(
                withIDToken: idToken, accessToken: result.user.accessToken.tokenString
            )
            _ = try await Auth.auth().signIn(with: credential)
        } catch { message = "Google 登录失败：\(error.localizedDescription)" }
    }

    func appleRequest(_ request: ASAuthorizationAppleIDRequest) {
        let nonce = UUID().uuidString.replacingOccurrences(of: "-", with: "")
        appleNonce = nonce
        request.requestedScopes = [.fullName, .email]
        request.nonce = SHA256.hash(data: Data(nonce.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    private var appleNonce: String?

    func appleResult(_ result: Result<ASAuthorization, Error>) {
        guard case let .success(authorization) = result,
              let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let token = String(data: tokenData, encoding: .utf8),
              let nonce = appleNonce else {
            if case let .failure(error) = result { message = "Apple 登录失败：\(error.localizedDescription)" }
            return
        }
        appleNonce = nil
        Task {
            do {
                let firebaseCredential = OAuthProvider.appleCredential(
                    withIDToken: token, rawNonce: nonce, fullName: credential.fullName
                )
                _ = try await Auth.auth().signIn(with: firebaseCredential)
            } catch { message = "Apple 登录失败：\(error.localizedDescription)" }
        }
    }

    func signOut() {
        #if DEBUG
        if isDesignPreview { return }
        #endif
        do { try Auth.auth().signOut() }
        catch { message = "退出登录失败：\(error.localizedDescription)" }
    }
}
