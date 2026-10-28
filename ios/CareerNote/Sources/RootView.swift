import AuthenticationServices
import AVFoundation
import SwiftUI

enum AppRoute: Hashable, Codable {
    case job(String)
    case companyMaterial(String)
    case material(String)
    case questionSet(String)
    case answer(packID: String, questionID: String)
    case report(String)
    case resumeEntry(String)
    case personalizedResume(String)
    case settings
}

private struct SavedNavigation: Codable {
    let userID: String
    let selectedTab: Int
    let companyPath: [AppRoute]
    let practicePath: [AppRoute]
    let resumePath: [AppRoute]
}

private struct AppFontSize: ViewModifier {
    let selection: String
    let systemSize: DynamicTypeSize

    func body(content: Content) -> some View {
        content.dynamicTypeSize(Self.sizes[selection] ?? systemSize)
    }

    private static let sizes: [String: DynamicTypeSize] = [
        "small": .small,
        "standard": .large,
        "large": .xxxLarge,
        "extraLarge": .accessibility1
    ]
}

struct RootView: View {
    private static var launchTab: Int {
        if ProcessInfo.processInfo.arguments.contains("-careerDesignData") ||
            ProcessInfo.processInfo.arguments.contains("-careerDesignCompany") { return 0 }
        if ProcessInfo.processInfo.arguments.contains("-careerDesignResume") { return 2 }
        return 1
    }

    @Bindable var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @Environment(\.dynamicTypeSize) private var systemDynamicTypeSize
    @AppStorage("appFontSize") private var appFontSize = "system"
    @AppStorage("savedNavigation") private var savedNavigation = Data()
    @State private var selectedTab = RootView.launchTab
    @State private var companyPath: [AppRoute] = []
    @State private var practicePath: [AppRoute] = []
    @State private var resumePath: [AppRoute] = []
    @State private var restoredUserID: String?

    var body: some View {
        Group {
            if model.userID != nil {
                #if DEBUG
                if ProcessInfo.processInfo.arguments.contains("-careerDesignApplication"),
                   let material = model.state.materials.first(where: { $0.kind == "履歴書" }) {
                    NavigationStack { ApplicationDocumentView(model: model, document: material) }
                } else if ProcessInfo.processInfo.arguments.contains("-careerDesignRichMaterial"),
                   let material = model.state.materials.first {
                    NavigationStack {
                        if ["履歴書", "職務経歴書"].contains(material.kind) {
                            ApplicationDocumentView(model: model, document: material)
                        } else {
                            TextDetailView(title: material.title, subtitle: material.kind,
                                           content: material.content)
                        }
                    }
                } else if ProcessInfo.processInfo.arguments.contains("-careerDesignCompanyDetail"),
                   let job = model.state.jobs.first {
                    NavigationStack {
                        CompanyDetailView(model: model, job: job)
                            .navigationDestination(for: AppRoute.self, destination: destination)
                    }
                } else if ProcessInfo.processInfo.arguments.contains("-careerDesignAnswer"),
                   let pack = model.state.questionSets.first,
                   let question = ProcessInfo.processInfo.arguments.contains("-careerDesignReverse")
                        ? pack.questions.first(where: { $0.id == "reverse" }) : pack.questions.first {
                    NavigationStack {
                        AnswerView(model: model, pack: pack, question: question)
                            .navigationDestination(for: AppRoute.self, destination: destination)
                    }
                } else {
                    mainTabs
                }
                #else
                mainTabs
                #endif
            } else {
                LoginView(model: model)
            }
        }
        .modifier(AppFontSize(selection: appFontSize, systemSize: systemDynamicTypeSize))
        .tint(PhoneStyle.accent)
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && model.userID != nil { Task { await model.sync() } }
        }
        .onChange(of: model.userID) { _, userID in
            if let userID {
                restoreNavigation(for: userID)
            } else {
                restoredUserID = nil
                selectedTab = RootView.launchTab
                companyPath = []
                practicePath = []
                resumePath = []
            }
        }
    }

    private var mainTabs: some View {
        Group {
            if horizontalSizeClass == .regular {
                NavigationSplitView {
                    List {
                        sidebarItem("企业", systemImage: "building.2", tab: 0)
                        sidebarItem("日程", systemImage: "calendar", tab: 3)
                        sidebarItem("练习", systemImage: "text.book.closed", tab: 1)
                        sidebarItem("简历", systemImage: "doc.text", tab: 2)
                    }
                    .navigationTitle("Career Note")
                    .listStyle(.sidebar)
                } detail: {
                    tabContent(selectedTab)
                }
            } else {
                TabView(selection: tabSelection) {
                    tabContent(0)
                        .tabItem { Label("企业", systemImage: "building.2") }
                        .tag(0)
                    tabContent(3)
                        .tabItem { Label("日程", systemImage: "calendar") }
                        .tag(3)
                    tabContent(1)
                        .tabItem { Label("练习", systemImage: "text.book.closed") }
                        .tag(1)
                    tabContent(2)
                        .tabItem { Label("简历", systemImage: "doc.text") }
                        .tag(2)
                }
            }
        }
        .onAppear {
            if let userID = model.userID { restoreNavigation(for: userID) }
        }
    }

    private var tabSelection: Binding<Int> {
        Binding(get: { selectedTab }, set: { selectedTab = $0; saveNavigation() })
    }

    private func sidebarItem(_ title: String, systemImage: String, tab: Int) -> some View {
        Button {
            tabSelection.wrappedValue = tab
        } label: {
            Label(title, systemImage: systemImage)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.vertical, 8)
                .foregroundStyle(selectedTab == tab ? PhoneStyle.accent : Color.primary)
        }
        .buttonStyle(.plain)
        .listRowBackground(selectedTab == tab ? PhoneStyle.accent.opacity(0.12) : Color.clear)
        .accessibilityValue(selectedTab == tab ? "已选中" : "")
    }

    @ViewBuilder
    private func tabContent(_ tab: Int) -> some View {
        switch tab {
        case 0:
            NavigationStack(path: pathBinding($companyPath)) {
                CompanyListView(model: model)
                    .navigationDestination(for: AppRoute.self, destination: destination)
            }
        case 1:
            NavigationStack(path: pathBinding($practicePath)) {
                PracticeList(model: model)
                    .navigationDestination(for: AppRoute.self, destination: destination)
            }
        case 2:
            NavigationStack(path: pathBinding($resumePath)) {
                ResumeHomeView(model: model)
                    .navigationDestination(for: AppRoute.self, destination: destination)
            }
        default:
            NavigationStack {
                ScheduleHomeView(model: model)
                    .navigationDestination(for: AppRoute.self, destination: destination)
            }
        }
    }

    private func pathBinding(_ path: Binding<[AppRoute]>) -> Binding<[AppRoute]> {
        Binding(get: { path.wrappedValue }, set: {
            path.wrappedValue = $0
            saveNavigation()
        })
    }

    private func saveNavigation() {
        guard let userID = model.userID, restoredUserID == userID else { return }
        let state = SavedNavigation(userID: userID, selectedTab: selectedTab,
                                    companyPath: companyPath, practicePath: practicePath,
                                    resumePath: resumePath)
        if let data = try? JSONEncoder().encode(state) { savedNavigation = data }
    }

    private func restoreNavigation(for userID: String) {
        guard restoredUserID != userID else { return }
        restoredUserID = nil
        selectedTab = RootView.launchTab
        companyPath = []
        practicePath = []
        resumePath = []
        if let state = try? JSONDecoder().decode(SavedNavigation.self, from: savedNavigation),
           state.userID == userID {
            selectedTab = (0...3).contains(state.selectedTab) ? state.selectedTab : 1
            companyPath = state.companyPath
            practicePath = state.practicePath
            resumePath = state.resumePath
        }
        restoredUserID = userID
    }

    @ViewBuilder
    private func destination(_ route: AppRoute) -> some View {
        switch route {
        case .job(let id):
            if let job = model.state.jobs.first(where: { $0.id == id }) {
                CompanyDetailView(model: model, job: job)
            } else { missingContent }
        case .companyMaterial(let id):
            if let material = model.state.materials.first(where: { $0.id == id }) {
                if ["履歴書", "職務経歴書"].contains(material.kind) {
                    ApplicationDocumentView(model: model, document: material)
                } else {
                    CompanyMaterialDetailView(material: material)
                }
            } else { missingContent }
        case .material(let id):
            if let material = model.state.materials.first(where: { $0.id == id }) {
                if ["履歴書", "職務経歴書"].contains(material.kind) {
                    ApplicationDocumentView(model: model, document: material)
                } else {
                    TextDetailView(title: material.title, subtitle: material.kind,
                                   content: material.content)
                }
            } else { missingContent }
        case .questionSet(let id):
            if let pack = (model.state.questionSets + BuiltinBank.packs).first(where: { $0.id == id }) {
                QuestionList(model: model, pack: pack)
            } else { missingContent }
        case .answer(let packID, let questionID):
            if let pack = (model.state.questionSets + BuiltinBank.packs).first(where: { $0.id == packID }),
               let question = pack.questions.first(where: { $0.id == questionID }) {
                AnswerView(model: model, pack: pack, question: question)
            } else { missingContent }
        case .report(let id):
            if let report = model.state.reports.first(where: { $0.id == id }) {
                TextDetailView(title: report.title, subtitle: report.date, content: report.content)
            } else { missingContent }
        case .resumeEntry(let id):
            if let entry = model.state.resume?.first(where: { $0.id == id }) {
                ResumeEntryDetail(entry: entry)
            } else { missingContent }
        case .personalizedResume(let id):
            if let draft = model.personalizedResumes.first(where: { $0.id == id }) {
                PersonalizedResumeDetail(draft: draft)
            } else { missingContent }
        case .settings:
            SettingsView(model: model)
        }
    }

    private var missingContent: some View {
        ContentUnavailableView("内容暂不可用", systemImage: "tray",
                               description: Text("同步完成后可重试，或返回上一级。"))
    }
}

enum PhoneStyle {
    static let accent = Color(red: 0.18, green: 0.31, blue: 0.57)
    static let canvas = Color(uiColor: .systemGroupedBackground)
    static let card = Color(uiColor: .secondarySystemGroupedBackground)
}

struct PhoneCard<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
        content()
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(PhoneStyle.card, in: RoundedRectangle(cornerRadius: 18))
    }
}

struct SectionHeading: View {
    let title: String
    let detail: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).font(.title3.bold())
            Spacer()
            if let detail { Text(detail).font(.caption).foregroundStyle(.secondary) }
        }
        .padding(.horizontal, 2)
    }
}

private struct LoginView: View {
    @Bindable var model: AppModel

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    Image(systemName: "text.book.closed.fill")
                        .font(.system(size: 30))
                        .foregroundStyle(.white)
                        .frame(width: 62, height: 62)
                        .background(PhoneStyle.accent, in: RoundedRectangle(cornerRadius: 18))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 7) {
                        Text("Career Note").font(.largeTitle.bold())
                        Text("随时练习，接着准备。")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                    }
                    PhoneCard {
                        VStack(alignment: .leading, spacing: 10) {
                            Label("面试题随身练", systemImage: "checkmark.circle")
                            Label("离线保存回答", systemImage: "square.and.pencil")
                            Label("联网后同步进度", systemImage: "arrow.triangle.2.circlepath")
                        }
                        .font(.subheadline)
                    }
                    VStack(spacing: 12) {
                        Button {
                            Task { await model.signInWithGoogle() }
                        } label: {
                            Label("使用 Google 登录", systemImage: "g.circle.fill")
                                .frame(maxWidth: .infinity)
                                .frame(height: 50)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(!model.firebaseReady)
                        SignInWithAppleButton(.signIn,
                                              onRequest: model.appleRequest,
                                              onCompletion: model.appleResult)
                            .frame(height: 50)
                            .clipShape(RoundedRectangle(cornerRadius: 12))
                            .disabled(!model.firebaseReady)
                    }
                    Label("登录后自动连接线上同步服务", systemImage: "network")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                    if let message = model.message {
                        Text(message).font(.footnote).foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: 520, alignment: .leading)
                .padding(24)
            }
            .background(PhoneStyle.canvas)
            .navigationBarHidden(true)
        }
    }
}

private struct PracticeList: View {
    @Bindable var model: AppModel
    @State private var scope: PracticeScope = .general

    private enum PracticeScope: Hashable { case general, company }

    private struct GeneralQuestion: Identifiable {
        let pack: QuestionSet
        let question: CareerQuestion
        var id: String { pack.id + "|" + question.id }
    }

    private var generalQuestions: [GeneralQuestion] {
        let personal = model.state.questionSets.filter { $0.jobId == "builtin:general" }
        let hasPersonalLeavingReason = personal.flatMap(\.questions).contains { question in
            let text = CareerRichText.plain(question.title + " " + question.questionJa)
            return text.contains("転職理由") || text.contains("退職理由")
        }
        return (personal + BuiltinBank.packs).flatMap { pack in
            pack.questions.compactMap { question -> GeneralQuestion? in
                if hasPersonalLeavingReason && pack.id == "builtin-conditions" && question.id == "leaving-reason" {
                    return nil
                }
                return GeneralQuestion(pack: pack, question: question)
            }
        }
    }

    private var companyPacks: [QuestionSet] {
        model.state.questionSets.filter { $0.jobId != "builtin:general" }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                Text("面试练习").font(.largeTitle.bold())
                Picker("练习类型", selection: $scope) {
                    Text("通用练习").tag(PracticeScope.general)
                    Text("公司相关").tag(PracticeScope.company)
                }
                .pickerStyle(.segmented)
                if !model.pending.isEmpty || model.message != nil {
                    PhoneCard {
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: model.pending.isEmpty ? "wifi.slash" : "arrow.triangle.2.circlepath")
                                .foregroundStyle(PhoneStyle.accent)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(model.pending.isEmpty ? "显示本机资料" : "\(model.pending.count) 条回答待同步")
                                    .font(.subheadline.bold())
                                Text("联网后可继续上传，练习随时可用。")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 0)
                            Button("同步") { Task { await model.sync() } }
                                .font(.subheadline.bold())
                                .disabled(model.busy)
                        }
                    }
                }
                if scope == .general {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionHeading(title: "通用面试题", detail: "\(generalQuestions.count) 道")
                        ForEach(Array(generalQuestions.enumerated()), id: \.element.id) { index, item in
                            PracticeQuestionLink(model: model, pack: item.pack, question: item.question, number: index + 1)
                        }
                    }
                } else {
                    packSection("公司相关", packs: companyPacks)
                }
            }
            .frame(maxWidth: 620, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 32)
        }
        .refreshable { await model.sync() }
        .background(PhoneStyle.canvas)
        .toolbar(.hidden, for: .navigationBar)
    }

    @ViewBuilder
    private func packSection(_ title: String, packs: [QuestionSet]) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeading(title: title, detail: "\(packs.count) 组")
            if packs.isEmpty {
                PhoneCard {
                    Text("同步后显示已准备的公司题组。")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            } else {
                ForEach(packs) { pack in
                    NavigationLink(value: AppRoute.questionSet(pack.id)) {
                        PhoneCard {
                            HStack(spacing: 12) {
                                Image(systemName: "list.bullet.rectangle")
                                    .font(.title3)
                                    .foregroundStyle(PhoneStyle.accent)
                                    .frame(width: 38, height: 38)
                                    .background(PhoneStyle.accent.opacity(0.09), in: RoundedRectangle(cornerRadius: 11))
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(pack.title).font(.subheadline.bold()).foregroundStyle(.primary)
                                        .lineLimit(2)
                                    Text("\(pack.questions.count) 道题")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                                Image(systemName: "chevron.right")
                                    .font(.caption.bold())
                                    .foregroundStyle(.tertiary)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

private enum BuiltinBank {
    static let packs: [QuestionSet] = {
        guard let url = Bundle.main.url(forResource: "interview-bank", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let packs = try? JSONDecoder().decode([QuestionSet].self, from: data) else { return [] }
        return packs
    }()
}

struct QuestionList: View {
    @Bindable var model: AppModel
    let pack: QuestionSet

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
            if let scenario = pack.scenario, !scenario.isEmpty {
                Text(scenario)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .padding(.bottom, 6)
            }
            ForEach(Array(pack.questions.enumerated()), id: \.element.id) { index, question in
                PracticeQuestionLink(model: model, pack: pack, question: question, number: index + 1)
            }
            }
            .frame(maxWidth: 620, alignment: .leading)
            .padding(16)
        }
        .background(PhoneStyle.canvas)
        .navigationTitle(CareerRichText.plain(pack.title))
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct PracticeQuestionLink: View {
    @Bindable var model: AppModel
    let pack: QuestionSet
    let question: CareerQuestion
    let number: Int

    var body: some View {
        NavigationLink(value: AppRoute.answer(packID: pack.id, questionID: question.id)) {
            PhoneCard {
                HStack(alignment: .top, spacing: 12) {
                    Text(String(format: "%02d", number))
                        .font(.caption.bold().monospacedDigit())
                        .foregroundStyle(PhoneStyle.accent)
                        .frame(width: 28, alignment: .leading)
                    VStack(alignment: .leading, spacing: 5) {
                        Text(question.title).font(.headline).foregroundStyle(.primary)
                        Text(CareerRichText.plain(question.questionJa)).font(.subheadline)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.bold())
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .buttonStyle(.plain)
    }
}

struct AnswerView: View {
    @Bindable var model: AppModel
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    let pack: QuestionSet
    let question: CareerQuestion
    @State private var speech = PracticeSpeechRecorder()
    @State private var referenceSpeech = ReferenceSpeechPlayer()
    @State private var recognitionLanguage = "ja-JP"
    @State private var showOutline = true
    @State private var showSample = ProcessInfo.processInfo.arguments.contains("-careerDesignReverse")
    @State private var showMoreHints = false
    @State private var saved = false
    @State private var historyPlayer: AVAudioPlayer?
    @State private var historyAudioError: String?

    private var history: [SavedAttempt] {
        model.state.attempts
            .filter { $0.questionSetId == pack.id && $0.questionId == question.id }
            .sorted { $0.createdAt > $1.createdAt }
    }

    private var pending: [PendingAttempt] {
        model.pending
            .filter { $0.questionSetId == pack.id && $0.questionId == question.id }
            .sorted { $0.createdAt > $1.createdAt }
    }

    private var canSave: Bool {
        speech.phase == .ready && speech.recordingURL != nil &&
        !speech.transcript.isEmpty && speech.transcript.count <= 20_000
    }

    private var targetSeconds: String? {
        guard let seconds = question.targetSeconds, seconds > 0 else { return nil }
        return "目安 \(seconds) 秒"
    }

    private var keywordHints: [PracticeKeyword] {
        PracticeKeywords.build(question: question,
                               job: model.state.jobs.first { $0.id == pack.jobId },
                               resume: model.state.resume ?? [])
    }

    private var reverseQuestions: [String] {
        guard question.category == "逆質問", let sample = question.sampleAnswer else { return [] }
        return ReferenceSpeechText.numberedQuestions(sample)
    }

    private func speechButton(for source: String, title: String) -> some View {
        let active = referenceSpeech.activeSource == source
        return Button {
            if active && (referenceSpeech.isPlaying || referenceSpeech.isLoading) {
                referenceSpeech.stop()
            } else {
                let voice = ReferenceSpeechSettings.voice
                Task {
                    await referenceSpeech.play(source, userID: model.userID ?? "local", voice: voice) {
                        try await model.referenceSpeech(questionSetID: pack.id, questionID: question.id,
                                                        source: source, voice: voice)
                    }
                }
            }
        } label: {
            HStack(spacing: 7) {
                if active && referenceSpeech.isLoading {
                    ProgressView().controlSize(.mini)
                } else {
                    Image(systemName: active && referenceSpeech.isPlaying ? "stop.fill" : "speaker.wave.2.fill")
                }
                Text(active && referenceSpeech.isLoading ? "準備中…" :
                     active && referenceSpeech.isPlaying ? "停止" : title)
            }
            .font(.subheadline.weight(.medium))
        }
        .buttonStyle(.bordered)
        .disabled(speech.phase == .recording || speech.phase == .recognizing)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if horizontalSizeClass == .regular {
                    HStack(alignment: .top, spacing: 16) {
                        promptCard.frame(maxWidth: .infinity)
                        answerCard.frame(maxWidth: .infinity)
                    }
                } else {
                    promptCard
                    answerCard
                }
                historyCard
            }
            .frame(maxWidth: horizontalSizeClass == .regular ? 1120 : 620, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 44)
        }
        .background(PhoneStyle.canvas)
        .scrollDismissesKeyboard(.interactively)
        .onDisappear {
            speech.discard()
            referenceSpeech.stop()
            historyPlayer?.stop()
        }
        .navigationTitle(CareerRichText.plain(question.title))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ReadingToggleButton() }
        .alert("已保存", isPresented: $saved) {
            Button("好", role: .cancel) {}
        } message: {
            Text("回答已保存在本机；联网时会自动同步。")
        }
    }

    private var promptCard: some View {
        PhoneCard {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    if let category = question.category, !category.isEmpty {
                        Text(category)
                            .font(.caption.bold())
                            .foregroundStyle(PhoneStyle.accent)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 5)
                            .background(PhoneStyle.accent.opacity(0.09), in: RoundedRectangle(cornerRadius: 7))
                    }
                    Spacer(minLength: 0)
                    if let targetSeconds {
                        Label(targetSeconds, systemImage: "clock")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                RichContent(text: question.questionJa, markdown: false, fontSize: 25)
                    .accessibilityLabel(CareerRichText.plain(question.questionJa))
                if let meaning = question.meaning, !meaning.isEmpty {
                    RichContent(text: meaning, markdown: false, fontSize: 15)
                }
                if !keywordHints.isEmpty {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 84), spacing: 6)],
                              alignment: .leading, spacing: 6) {
                        ForEach(keywordHints) { hint in
                            Text(hint.word)
                                .font(.caption.bold())
                                .foregroundStyle(hint.isGap ? Color.orange : Color.green)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 5)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(hint.isGap ? Color.orange.opacity(0.12) : Color.green.opacity(0.12),
                                            in: Capsule())
                        }
                    }
                }
                if let outline = question.outline, !outline.isEmpty {
                    Divider()
                    DisclosureGroup("回答の組み立て方", isExpanded: $showOutline) {
                        RichContent(text: outline).padding(.top, 8)
                    }
                }
                if let sample = question.sampleAnswer, !sample.isEmpty {
                    Divider()
                    DisclosureGroup("参考回答", isExpanded: $showSample) {
                        VStack(alignment: .leading, spacing: 12) {
                            if reverseQuestions.isEmpty {
                                RichContent(text: sample)
                                speechButton(for: sample, title: "朗読する")
                            } else {
                                ForEach(Array(reverseQuestions.enumerated()), id: \.offset) { index, item in
                                    HStack(alignment: .top, spacing: 12) {
                                        Text(String(format: "%02d", index + 1))
                                            .font(.caption.bold().monospacedDigit())
                                            .foregroundStyle(PhoneStyle.accent)
                                            .frame(width: 30, height: 30)
                                            .background(PhoneStyle.accent.opacity(0.10),
                                                        in: RoundedRectangle(cornerRadius: 8))
                                        VStack(alignment: .leading, spacing: 10) {
                                            RichContent(text: item, markdown: false, fontSize: 18)
                                                .accessibilityLabel(CareerRichText.plain(item))
                                            speechButton(for: item, title: "この質問を朗読")
                                        }
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    }
                                    .padding(14)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .background(PhoneStyle.accent.opacity(0.04),
                                                in: RoundedRectangle(cornerRadius: 14))
                                    .overlay {
                                        RoundedRectangle(cornerRadius: 14)
                                            .strokeBorder(PhoneStyle.accent.opacity(0.12))
                                    }
                                }
                            }
                            if let message = referenceSpeech.errorMessage {
                                Text(message).font(.caption).foregroundStyle(.red)
                            }
                            Text("初回はサーバーが Azure で生成し、Cloudflare R2 に保存します。次回は端末または R2 のキャッシュから再生します。")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                        .padding(.top, 8)
                    }
                }
                if question.why?.isEmpty == false || question.followUps?.isEmpty == false {
                    Button("回答のヒントを詳しく見る") { showMoreHints = true }
                        .font(.subheadline.bold())
                }
            }
        }
        .sheet(isPresented: $showMoreHints) {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        RichContent(text: question.questionJa, markdown: false, fontSize: 22)
                        if let why = question.why, !why.isEmpty {
                            Text("なぜこの質問を練習するか").font(.headline)
                            RichContent(text: why)
                        }
                        if let followUps = question.followUps, !followUps.isEmpty {
                            Text("面接官からの追加質問").font(.headline)
                            RichContent(text: followUps)
                        }
                    }
                    .frame(maxWidth: 620, alignment: .leading)
                    .padding(20)
                }
                .background(PhoneStyle.canvas)
                .navigationTitle("回答のヒント")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("閉じる") { showMoreHints = false }
                    }
                }
            }
        }
    }

    private var answerCard: some View {
        PhoneCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("あなたの回答").font(.headline)
                Text("回答言語").font(.caption).foregroundStyle(.secondary)
                Picker("回答言語", selection: $recognitionLanguage) {
                    Text("日本語").tag("ja-JP")
                    Text("中文").tag("zh-CN")
                }
                .pickerStyle(.segmented)
                .disabled(speech.phase != .idle)

                switch speech.phase {
                case .idle:
                    Button {
                        referenceSpeech.stop()
                        Task { await speech.start(localeID: recognitionLanguage) }
                    } label: {
                        Label("回答を録音", systemImage: "mic.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                case .recording:
                    Button {
                        Task { await speech.stopAndRecognize() }
                    } label: {
                        Label("録音を停止 · \(Self.clock(speech.seconds))", systemImage: "stop.fill")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                case .recognizing:
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("设备上正在识别录音…")
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                case .ready:
                    HStack {
                        Button { speech.play() } label: {
                            Label("再听一次", systemImage: "play.fill")
                        }
                        Spacer()
                        Button {
                            Task { await speech.start(localeID: recognitionLanguage) }
                        } label: {
                            Label("重新录音", systemImage: "arrow.counterclockwise")
                        }
                    }
                    .buttonStyle(.bordered)
                    Button("删除录音并更换语言", role: .destructive) { speech.discard() }
                        .font(.caption)
                }

                Text("录音与语音识别先在本机完成；保存后会按现有同步流程上传回答。")
                    .font(.caption).foregroundStyle(.secondary)
                if let error = speech.errorMessage {
                    Text(error).font(.caption).foregroundStyle(.red)
                }
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("認識した回答").font(.subheadline.bold())
                        Spacer()
                        if speech.seconds > 0 {
                            Text("\(speech.seconds) 秒")
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                    }
                    Text(speech.transcript.isEmpty ? "录音结束后，本机识别的文字会显示在这里。" : speech.transcript)
                        .foregroundStyle(speech.transcript.isEmpty ? Color.secondary : Color.primary)
                        .frame(maxWidth: .infinity, minHeight: 110, alignment: .topLeading)
                        .textSelection(.enabled)
                    if speech.phase == .ready && speech.transcript.isEmpty {
                        Button("重新识别这段录音") {
                            Task { await speech.retryRecognition() }
                        }
                    }
                }
                .padding(12)
                .background(PhoneStyle.canvas, in: RoundedRectangle(cornerRadius: 10))
                Button { save(requestReview: false) } label: {
                    Label("今回の回答を保存", systemImage: "square.and.arrow.down")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(!canSave)
                Button { save(requestReview: true) } label: {
                    Label("保存して AI Agent に講評を依頼", systemImage: "sparkles")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canSave)
            }
        }
    }

    private var historyCard: some View {
        PhoneCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("回答履歴・講評").font(.headline)
                if history.isEmpty && pending.isEmpty {
                    Text("保存した回答はまだありません。")
                        .font(.subheadline).foregroundStyle(.secondary)
                }
                ForEach(pending) { attempt in
                    Divider()
                    Label("同期待ち · \(attempt.language)", systemImage: "arrow.triangle.2.circlepath")
                        .font(.caption.bold()).foregroundStyle(PhoneStyle.accent)
                    Text(attempt.answer).font(.subheadline)
                }
                ForEach(history) { attempt in
                    Divider()
                    DisclosureGroup("\(Self.displayDate(attempt.createdAt)) · \(attempt.language)") {
                        VStack(alignment: .leading, spacing: 10) {
                            Text("この回の原回答").font(.caption.bold()).foregroundStyle(.secondary)
                            RichContent(text: attempt.answer)
                            if attempt.audio != nil {
                                Button {
                                    Task { await playSavedRecording(id: attempt.id) }
                                } label: {
                                    Label("保存した録音を再生", systemImage: "play.fill")
                                }
                                .disabled(speech.phase == .recording || speech.phase == .recognizing)
                            }
                            ForEach(model.state.reviews.filter { $0.attemptId == attempt.id }) { review in
                                Divider()
                                Text("講評").font(.caption.bold()).foregroundStyle(PhoneStyle.accent)
                                RichContent(text: review.summary)
                                if let revised = review.revisedAnswer, !revised.isEmpty {
                                    Text("参考表現").font(.caption.bold()).foregroundStyle(.secondary)
                                    RichContent(text: revised)
                                }
                            }
                        }
                        .padding(.top, 8)
                    }
                }
                if let historyAudioError {
                    Text(historyAudioError).font(.caption).foregroundStyle(.red)
                }
            }
        }
    }

    private func playSavedRecording(id: String) async {
        do {
            referenceSpeech.stop()
            let data = try await model.savedRecording(id: id)
            try AVAudioSession.sharedInstance().setCategory(.playback)
            try AVAudioSession.sharedInstance().setActive(true)
            historyPlayer = try AVAudioPlayer(data: data)
            if let historyPlayer { AudioPlaybackSettings.apply(to: historyPlayer) }
            historyPlayer?.play()
            historyAudioError = nil
        } catch {
            historyAudioError = "录音播放失败：\(error.localizedDescription)"
        }
    }

    private func save(requestReview: Bool) {
        guard canSave else { return }
        let queued = model.queue(questionSetId: pack.id, questionId: question.id,
                                 answer: speech.transcript,
                                 language: recognitionLanguage == "ja-JP" ? "日语" : "中文构思",
                                 duration: speech.seconds, requestReview: requestReview,
                                 recordingURL: speech.recordingURL)
        guard queued else { return }
        saved = true
        speech.discard()
    }

    private static func clock(_ seconds: Int) -> String {
        String(format: "%d:%02d", seconds / 60, seconds % 60)
    }

    private static func displayDate(_ raw: String) -> String {
        let parser = ISO8601DateFormatter()
        parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = parser.date(from: raw) ?? ISO8601DateFormatter().date(from: raw),
              let tokyo = TimeZone(identifier: "Asia/Tokyo") else { return raw }
        let format = DateFormatter()
        format.timeZone = tokyo
        format.dateFormat = "yyyy/MM/dd HH:mm"
        return format.string(from: date)
    }
}

private struct PracticeKeyword: Identifiable {
    let word: String
    let isGap: Bool
    var id: String { word.lowercased() }
}

/// A compact native counterpart of the website's résumé/job keyword chips.
/// Only text already present in the saved question, posting, and résumé is shown.
private enum PracticeKeywords {
    private static let concepts = [
        "設計", "運用", "品質", "障害", "性能", "改善", "分散", "金融", "医療", "決済", "要件定義",
        "監視", "自動化", "移行", "最適化", "基盤", "規制", "可視化", "保守", "調査", "顧客対応",
        "英語", "日本語", "個人開発", "協業", "顧客", "コスト", "テスト", "レビュー"
    ]
    private static let ignored = Set(["the", "and", "for", "with", "web", "api", "app", "データ",
                                      "システム", "プロジェクト", "チーム", "サービス", "スキル"])
    private static let pattern = try! NSRegularExpression(
        pattern: "[A-Za-z][A-Za-z0-9+#./-]*[A-Za-z0-9+#]|[ァ-ヶー]{3,}"
    )

    private static func terms(_ text: String) -> [String] {
        let plain = CareerRichText.plain(text)
        let range = NSRange(plain.startIndex..., in: plain)
        var found = pattern.matches(in: plain, range: range).compactMap { match -> String? in
            guard let range = Range(match.range, in: plain) else { return nil }
            let word = String(plain[range])
            return ignored.contains(word.lowercased()) ? nil : word
        }
        found += concepts.filter { plain.contains($0) }
        var seen = Set<String>()
        return found.filter { seen.insert($0.lowercased()).inserted }
    }

    static func build(question: CareerQuestion, job: CareerJob?,
                      resume: [CareerResumeEntry]) -> [PracticeKeyword] {
        let resumeText = resume.filter { $0.archived != true && $0.kind != "document" }
            .flatMap { $0.data.values }.joined(separator: "\n").lowercased()
        guard !resumeText.isEmpty else { return [] }
        let questionText = [question.title, question.questionJa, question.meaning, question.outline,
                            question.followUps, question.why].compactMap { $0 }.joined(separator: "\n")
        let questionTerms = terms(questionText)
        let jobText = [job?.requirements, job?.description, job?.matchNotes]
            .compactMap { $0 }.joined(separator: "\n")
        let jobTerms = terms(jobText)
        var seen = Set<String>()
        let matched = (questionTerms + jobTerms).filter {
            seen.insert($0.lowercased()).inserted && resumeText.contains($0.lowercased())
        }.prefix(12).map { PracticeKeyword(word: $0, isGap: false) }
        let gaps = jobTerms.filter { !resumeText.contains($0.lowercased()) &&
            (questionText.localizedCaseInsensitiveContains($0) || (job?.matchNotes ?? "").localizedCaseInsensitiveContains($0))
        }.prefix(6).map { PracticeKeyword(word: $0, isGap: true) }
        return matched + gaps
    }
}

struct TextDetailView: View {
    let title: String
    let subtitle: String
    let content: String

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text(subtitle).font(.caption).foregroundStyle(.secondary)
                PhoneCard { RichContent(text: content) }
            }
            .frame(maxWidth: 620, alignment: .leading)
            .padding(16)
            .padding(.bottom, 80)
        }
        .background(PhoneStyle.canvas)
        .navigationTitle(CareerRichText.plain(title))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ReadingToggleButton() }
    }
}

struct SettingsView: View {
    @Bindable var model: AppModel
    @AppStorage("showJapaneseReadings") private var showJapaneseReadings = true
    @AppStorage("appFontSize") private var appFontSize = "system"
    @AppStorage("audioPlaybackRate") private var audioPlaybackRate = 1.0
    @State private var discardID: String?
    @State private var speechVoice = ReferenceSpeechSettings.voice

    var body: some View {
        Form {
            Section("账户") {
                Text(model.accountName)
                Button("退出登录", role: .destructive) { model.signOut() }
            }
            Section("同步") {
                LabeledContent("服务", value: model.apiAddress.isEmpty ? "未配置" : model.apiAddress)
                Button("立即同步") { Task { await model.sync() } }
                    .disabled(model.busy)
                if let message = model.message { Text(message).foregroundStyle(.secondary) }
            }
            Section("阅读") {
                Picker("字体大小", selection: $appFontSize) {
                    Text("跟随系统").tag("system")
                    Text("较小").tag("small")
                    Text("标准").tag("standard")
                    Text("较大").tag("large")
                    Text("特大").tag("extraLarge")
                }
                Text("示例：面试问题与阅读资料")
                    .foregroundStyle(.secondary)
                Toggle("显示日语假名", isOn: $showJapaneseReadings)
                Text("只在应用内显示资料中已保存的读音；不会猜测人名或修改原文。")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            Section("参考回答の音声") {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("播放速度")
                        Spacer()
                        Text(audioPlaybackRate.formatted(.number.precision(.fractionLength(2))) + "×")
                            .monospacedDigit()
                    }
                    Slider(value: $audioPlaybackRate, in: 0.5...2.0, step: 0.05) {
                        Text("播放速度")
                    } minimumValueLabel: {
                        Text("0.5×").font(.caption)
                    } maximumValueLabel: {
                        Text("2×").font(.caption)
                    }
                }
                Text("适用于参考回答朗读和练习录音回放。")
                    .font(.footnote).foregroundStyle(.secondary)
                Picker("日语语音", selection: $speechVoice) {
                    Text("Nanami · 女声").tag(ReferenceSpeechSettings.voices[0])
                    Text("Keita · 男声").tag(ReferenceSpeechSettings.voices[1])
                }
                .onChange(of: speechVoice) { _, voice in ReferenceSpeechSettings.saveVoice(voice) }
                Text("音声は Career Note サーバーが生成して Cloudflare R2 に保存します。端末には再生用キャッシュだけを置き、Azure キーは不要です。")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            if !model.pending.isEmpty {
                Section("待同步回答") {
                    ForEach(model.pending) { attempt in
                        VStack(alignment: .leading) {
                            Text(attempt.createdAt.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption).foregroundStyle(.secondary)
                            Text(attempt.answer).lineLimit(3)
                            Button("丢弃这条回答", role: .destructive) { discardID = attempt.id }
                        }
                    }
                }
            }
        }
        .navigationTitle("设置")
        .confirmationDialog("删除本机待同步的回答？", isPresented: Binding(
            get: { discardID != nil },
            set: { if !$0 { discardID = nil } }
        )) {
            Button("删除回答", role: .destructive) {
                if let discardID { model.discardPending(id: discardID) }
                discardID = nil
            }
        }
    }
}
