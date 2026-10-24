import AuthenticationServices
import SwiftUI

struct RootView: View {
    @Bindable var model: AppModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var selectedTab = ProcessInfo.processInfo.arguments.contains("-careerDesignData") ||
        ProcessInfo.processInfo.arguments.contains("-careerDesignCompany") ? 0 :
        ProcessInfo.processInfo.arguments.contains("-careerDesignResume") ? 2 : 1

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
                    NavigationStack { CompanyDetailView(model: model, job: job) }
                } else if ProcessInfo.processInfo.arguments.contains("-careerDesignAnswer"),
                   let pack = model.state.questionSets.first,
                   let question = pack.questions.first {
                    NavigationStack {
                        AnswerView(model: model, pack: pack, question: question)
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
        .tint(PhoneStyle.accent)
        .onChange(of: scenePhase) { _, phase in
            if phase == .active && model.userID != nil { Task { await model.sync() } }
        }
    }

    private var mainTabs: some View {
        TabView(selection: $selectedTab) {
            NavigationStack { CompanyListView(model: model) }
                .tabItem { Label("企业", systemImage: "building.2") }
                .tag(0)
            NavigationStack { PracticeList(model: model) }
                .tabItem { Label("练习", systemImage: "text.book.closed") }
                .tag(1)
            NavigationStack { ResumeHomeView(model: model) }
                .tabItem { Label("简历", systemImage: "doc.text") }
                .tag(2)
        }
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
    @State private var showAllPacks = false

    private var today: String {
        let format = DateFormatter()
        format.calendar = Calendar(identifier: .gregorian)
        format.timeZone = TimeZone(identifier: "Asia/Tokyo")
        format.dateFormat = "yyyy-MM-dd"
        return format.string(from: .now)
    }

    private var todayReport: CareerReport? {
        model.state.reports.filter { $0.date.hasPrefix(today) }
            .sorted { $0.date > $1.date }.first
    }

    private var focus: [(pack: QuestionSet, question: CareerQuestion, reason: String)] {
        let packs = model.state.questionSets + BuiltinBank.packs
        let answered = Set(model.state.attempts.map { $0.questionSetId + "|" + $0.questionId } +
                           model.pending.map { $0.questionSetId + "|" + $0.questionId })
        var picked = Set<String>()
        var result: [(pack: QuestionSet, question: CareerQuestion, reason: String)] = []
        func add(_ pack: QuestionSet, reason: String, allowRepeat: Bool = false,
                 preferredQuestionID: String? = nil) {
            guard result.count < 3 else { return }
            let question = pack.questions.first { $0.id == preferredQuestionID } ??
                pack.questions.first { !answered.contains(pack.id + "|" + $0.id) } ??
                (allowRepeat ? pack.questions.first : nil)
            guard let question else { return }
            let key = pack.id + "|" + question.id
            guard picked.insert(key).inserted else { return }
            result.append((pack, question, reason))
        }
        let due = model.state.jobs.filter {
            !["未通过", "已撤回", "内定"].contains($0.status) &&
            $0.nextDate?.isEmpty == false && String($0.nextDate!.prefix(10)) <= today
        }.sorted { ($0.nextDate ?? "") < ($1.nextDate ?? "") }
        for job in due {
            for pack in packs where pack.jobId == job.id {
                add(pack, reason: "今日到期 · \(job.company)", allowRepeat: true)
            }
        }
        for review in model.state.reviews.sorted(by: { ($0.createdAt ?? "") > ($1.createdAt ?? "") }) {
            guard let next = review.nextPractice, !next.isEmpty,
                  let attempt = model.state.attempts.first(where: { $0.id == review.attemptId }),
                  let pack = packs.first(where: { $0.id == attempt.questionSetId }) else { continue }
            add(pack, reason: "点评后复练：\(next)", allowRepeat: true,
                preferredQuestionID: attempt.questionId)
        }
        for pack in model.state.questionSets { add(pack, reason: "公司题组 · 尚未练习") }
        for pack in BuiltinBank.packs { add(pack, reason: "通用题库 · 尚未练习") }
        return result
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("今日重点").font(.largeTitle.bold())
                        Text("\(today) · 先完成今天最相关的练习")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    Button { Task { await model.sync() } } label: {
                        Image(systemName: "arrow.clockwise")
                            .font(.headline)
                            .frame(width: 44, height: 44)
                            .background(PhoneStyle.card, in: Circle())
                    }
                    .disabled(model.busy)
                    .accessibilityLabel("同步")
                }
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
                if let report = todayReport {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionHeading(title: "今日简报", detail: nil)
                        NavigationLink {
                            TextDetailView(title: report.title, subtitle: report.date, content: report.content)
                        } label: {
                            PhoneCard {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(report.title).font(.headline).foregroundStyle(.primary)
                                    Text(report.content).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeading(title: "今天练这几题", detail: "\(focus.count) 道")
                    if focus.isEmpty {
                        PhoneCard { Text("同步题组后，这里会列出今日练习重点。")
                            .foregroundStyle(.secondary) }
                    }
                    ForEach(Array(focus.enumerated()), id: \.offset) { _, item in
                        NavigationLink {
                            AnswerView(model: model, pack: item.pack, question: item.question)
                        } label: {
                            PhoneCard {
                                VStack(alignment: .leading, spacing: 7) {
                                    Text(item.reason).font(.caption.bold())
                                        .foregroundStyle(PhoneStyle.accent).lineLimit(2)
                                    Text(item.question.title).font(.headline).foregroundStyle(.primary)
                                    Text(item.pack.title).font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                DisclosureGroup("浏览全部题组", isExpanded: $showAllPacks) {
                    VStack(alignment: .leading, spacing: 18) {
                        packSection("公司题组", packs: model.state.questionSets)
                        packSection("通用面试题", packs: BuiltinBank.packs)
                    }
                    .padding(.top, 12)
                }
                .font(.subheadline.bold())
            }
            .frame(maxWidth: 620, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 32)
        }
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
                    NavigationLink {
                        QuestionList(model: model, pack: pack)
                    } label: {
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
            ForEach(pack.questions) { question in
                NavigationLink {
                    AnswerView(model: model, pack: pack, question: question)
                } label: {
                    PhoneCard {
                        HStack(alignment: .top, spacing: 12) {
                            Text(String(format: "%02d", (pack.questions.firstIndex { $0.id == question.id } ?? 0) + 1))
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
            .frame(maxWidth: 620, alignment: .leading)
            .padding(16)
        }
        .background(PhoneStyle.canvas)
        .navigationTitle(CareerRichText.plain(pack.title))
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct AnswerView: View {
    @Bindable var model: AppModel
    let pack: QuestionSet
    let question: CareerQuestion
    @State private var answer = ""
    @State private var language = "日语"
    @State private var requestReview = false
    @State private var startedAt = Date()
    @State private var saved = false

    private var history: [SavedAttempt] {
        model.state.attempts.filter { $0.questionSetId == pack.id && $0.questionId == question.id }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 10) {
                    PhoneCard {
                        VStack(alignment: .leading, spacing: 12) {
                            RichContent(text: question.questionJa, markdown: false)
                            if let meaning = question.meaning, !meaning.isEmpty {
                                RichContent(text: meaning, markdown: false)
                            }
                            if let outline = question.outline, !outline.isEmpty {
                                Divider()
                                DisclosureGroup("回答提示") {
                                    RichContent(text: outline).padding(.top, 4)
                                }
                            }
                            if let sample = question.sampleAnswer, !sample.isEmpty {
                                DisclosureGroup("参考回答") {
                                    RichContent(text: sample).padding(.top, 4)
                                }
                            }
                        }
                    }
                }
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeading(title: "我的回答", detail: "离线也能保存")
                    PhoneCard {
                        VStack(alignment: .leading, spacing: 12) {
                            Picker("回答语言", selection: $language) {
                                Text("日语").tag("日语")
                                Text("中文构思").tag("中文构思")
                                Text("中日混合").tag("中日混合")
                            }
                            .pickerStyle(.segmented)
                            TextEditor(text: $answer)
                                .frame(height: 165)
                                .scrollContentBackground(.hidden)
                                .accessibilityLabel("回答内容")
                            HStack {
                                Text("写下自己的回答")
                                Spacer()
                                Text("\(answer.count) / 20000")
                            }
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            Divider()
                            Toggle("同步后请 Codex 点评", isOn: $requestReview)
                                .font(.subheadline)
                        }
                    }
                }
                if !history.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        SectionHeading(title: "历史回答", detail: "\(history.count) 次")
                        PhoneCard {
                            DisclosureGroup("查看此前的回答") {
                                VStack(alignment: .leading, spacing: 14) {
                                    ForEach(history.reversed()) { attempt in
                                        Divider()
                                        Text(attempt.createdAt)
                                            .font(.caption)
                                            .foregroundStyle(.secondary)
                                        RichContent(text: attempt.answer)
                                        ForEach(model.state.reviews.filter { $0.attemptId == attempt.id }) { review in
                                            RichContent(text: review.summary)
                                        }
                                    }
                                }
                                .padding(.top, 8)
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: 620, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 44)
        }
        .background(PhoneStyle.canvas)
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle(CareerRichText.plain(question.title))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ReadingToggleButton()
            Button("保存") {
                model.queue(questionSetId: pack.id, questionId: question.id,
                            answer: answer, language: language,
                            duration: min(3600, max(0, Int(Date().timeIntervalSince(startedAt)))),
                            requestReview: requestReview)
                saved = true
                answer = ""
                startedAt = Date()
            }
            .disabled(answer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || answer.count > 20_000)
        }
        .alert("已保存", isPresented: $saved) {
            Button("好", role: .cancel) {}
        } message: {
            Text("回答已保存在本机；联网时会自动同步。")
        }
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
    @State private var discardID: String?

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
                Toggle("显示日语假名", isOn: $showJapaneseReadings)
                Text("只在应用内显示资料中已保存的读音；不会猜测人名或修改原文。")
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
