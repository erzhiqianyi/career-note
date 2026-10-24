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
            state = DesignPreview.state
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
        personalizedResumes = []
        lastUpdated = nil
        guard let nextID else { return }
        do {
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
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "clientRequestId": body.id,
                "questionSetId": body.questionSetId,
                "questionId": body.questionId,
                "answer": body.answer,
                "language": body.language,
                "durationSeconds": body.durationSeconds,
                "requestReview": body.requestReview
            ])
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode) else {
            let detail = (try? JSONDecoder().decode(APIError.self, from: data).error) ?? "服务器请求失败"
            throw NSError(domain: "CareerNote", code: 3, userInfo: [NSLocalizedDescriptionKey: detail])
        }
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

    private func persist() {
        guard let userID else { return }
        do {
            try LocalStore.save(LocalSnapshot(state: state, pending: pending, lastUpdated: lastUpdated,
                                              personalizedResumes: personalizedResumes), uid: userID)
        } catch { message = "本机保存失败：\(error.localizedDescription)" }
    }

    func queue(questionSetId: String, questionId: String, answer: String, language: String, duration: Int, requestReview: Bool) {
        guard userID != nil, !answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        guard answer.count <= 20_000 else {
            message = "回答不能超过 20,000 字。"
            return
        }
        pending.append(PendingAttempt(
            id: UUID().uuidString, questionSetId: questionSetId, questionId: questionId,
            answer: answer, language: language, durationSeconds: duration,
            requestReview: requestReview, createdAt: Date()
        ))
        persist()
        Task { await sync() }
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
                _ = try await request("attempts", body: first)
                guard userID == syncingUID else { return }
                pending.removeFirst()
                persist()
            }
            let fresh = try JSONDecoder().decode(CareerState.self, from: await request("state"))
            guard userID == syncingUID else { return }
            state = fresh
            lastUpdated = Date()
            message = nil
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
            message = pending.isEmpty
                ? "当前离线，显示本机数据。\(error.localizedDescription)"
                : "有 \(pending.count) 条回答等待同步。\(error.localizedDescription)"
        }
    }

    func discardPending(id: String) {
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
