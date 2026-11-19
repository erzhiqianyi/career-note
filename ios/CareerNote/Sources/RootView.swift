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
    case interviews
    case companyPractice
    case japanesePractice
    case interview(String)
    case practiceTopic(String)
    case practicePlans
    case practicePlan(String)
    case practiceExercise(planID: String, scheduleID: String)
    case plannedAnswer(packID: String, questionID: String, context: PracticeContext)
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
    var reviewPath: [AppRoute]? = nil
    var archivePath: [AppRoute]? = nil
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
    @State private var reviewPath: [AppRoute] = []
    @State private var archivePath: [AppRoute] = []
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
                reviewPath = []
                archivePath = []
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
                        sidebarItem("复盘", systemImage: "waveform.and.magnifyingglass", tab: 4)
                        sidebarItem("练习", systemImage: "text.book.closed", tab: 1)
                        sidebarItem("简历", systemImage: "doc.text", tab: 2)
                        sidebarItem("不採用归档", systemImage: "archivebox", tab: 5)
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
                    tabContent(4)
                        .tabItem { Label("复盘", systemImage: "waveform.and.magnifyingglass") }
                        .tag(4)
                    tabContent(1)
                        .tabItem { Label("练习", systemImage: "text.book.closed") }
                        .tag(1)
                    tabContent(2)
                        .tabItem { Label("简历", systemImage: "doc.text") }
                        .tag(2)
                    tabContent(5)
                        .tabItem { Label("不採用归档", systemImage: "archivebox") }
                        .tag(5)
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
        case 4:
            NavigationStack(path: pathBinding($reviewPath)) {
                ReviewHomeView(model: model)
                    .navigationDestination(for: AppRoute.self, destination: destination)
            }
        case 5:
            NavigationStack(path: pathBinding($archivePath)) {
                RejectedCompaniesView(model: model)
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
                                    resumePath: resumePath, reviewPath: reviewPath, archivePath: archivePath)
        if let data = try? JSONEncoder().encode(state) { savedNavigation = data }
    }

    private func restoreNavigation(for userID: String) {
        guard restoredUserID != userID else { return }
        restoredUserID = nil
        selectedTab = RootView.launchTab
        companyPath = []
        practicePath = []
        resumePath = []
        reviewPath = []
        archivePath = []
        if let state = try? JSONDecoder().decode(SavedNavigation.self, from: savedNavigation),
           state.userID == userID {
            selectedTab = (0...5).contains(state.selectedTab) ? state.selectedTab : 1
            companyPath = state.companyPath
            practicePath = state.practicePath
            resumePath = state.resumePath
            reviewPath = state.reviewPath ?? []
            archivePath = state.archivePath ?? []
        }
        restoredUserID = userID
    }

    /// Pushed (non top-level) screens hide the tab bar; it returns on the section's root page.
    private func destination(_ route: AppRoute) -> some View {
        routeContent(route).toolbar(.hidden, for: .tabBar)
    }

    @ViewBuilder
    private func routeContent(_ route: AppRoute) -> some View {
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
        case .interviews:
            InterviewListView(model: model)
        case .interview(let id):
            InterviewDetailView(model: model, id: id)
        case .companyPractice:
            CompanyPracticeView(model: model)
        case .japanesePractice:
            PracticePlanListView(model: model, purpose: "japanese")
        case .practiceTopic(let id):
            if let topic = PracticeTopic(rawValue: id) { PracticeTopicView(model: model, topic: topic) }
            else { missingContent }
        case .practicePlans:
            PracticePlanListView(model: model, purpose: "company")
        case .practicePlan(let id):
            PracticePlanDetailView(model: model, id: id)
        case .practiceExercise(let planID, let scheduleID):
            if let plan = model.state.practicePlans?.first(where: { $0.id == planID }),
               let content = plan.content,
               let item = content.schedule.first(where: { $0.id == scheduleID }),
               let exercise = content.exercises.first(where: { $0.id == item.exerciseId }) {
                PracticePlanExerciseDetailView(model: model, plan: plan, exercise: exercise, item: item)
            } else { missingContent }
        case .plannedAnswer(let packID, let questionID, let context):
            if let pack = (model.state.questionSets + BuiltinBank.packs).first(where: { $0.id == packID }),
               let question = pack.questions.first(where: { $0.id == questionID }) {
                AnswerView(model: model, pack: pack, question: question, practiceContext: context)
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
    static let accent = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.48, green: 0.66, blue: 0.98, alpha: 1)
            : UIColor(red: 0.18, green: 0.31, blue: 0.57, alpha: 1)
    })
    /// Solid navy for section banners and step numbers; white text stays readable in both modes.
    static let banner = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0.20, green: 0.33, blue: 0.58, alpha: 1)
            : UIColor(red: 0.09, green: 0.22, blue: 0.43, alpha: 1)
    })
    static let canvas = Color(uiColor: .systemGroupedBackground)
    static let card = Color(uiColor: .secondarySystemGroupedBackground)
    static let listSpacing: CGFloat = 12
    static let contentWidth: CGFloat = 620
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

/// Shared navigation row: bounded summaries, consistent spacing and a clear disclosure.
/// Accessibility sizes expand the content rather than shrinking the user's text.
struct PhoneListRow: View {
    let title: String
    var subtitle: String? = nil
    var metadata: String? = nil
    var status: String? = nil
    var trailing: String? = nil
    var number: String? = nil
    var disclosure = true
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        PhoneCard {
            HStack(spacing: 12) {
                if let number, !typeSize.isAccessibilitySize {
                    Text(number).font(.caption.bold().monospacedDigit())
                        .foregroundStyle(PhoneStyle.accent)
                        .accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 6) {
                    Text(CareerRichText.plain(title))
                        .font(.headline).foregroundStyle(.primary)
                        .lineLimit(typeSize.isAccessibilitySize ? nil : 2)
                        .fixedSize(horizontal: false, vertical: true)
                    if let subtitle, !subtitle.isEmpty {
                        Text(CareerRichText.plain(subtitle)).font(.subheadline).foregroundStyle(.secondary)
                            .lineLimit(typeSize.isAccessibilitySize ? nil : 2)
                    }
                    if let metadata, !metadata.isEmpty {
                        Text(metadata).font(.caption).foregroundStyle(.secondary)
                            .lineLimit(typeSize.isAccessibilitySize ? nil : 2)
                    }
                    if let status, !status.isEmpty {
                        Text(status).font(.caption.weight(.semibold)).foregroundStyle(PhoneStyle.accent)
                    }
                    if let trailing, typeSize.isAccessibilitySize {
                        Text(trailing).font(.caption).foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if let trailing, !typeSize.isAccessibilitySize {
                    Text(trailing).font(.caption).foregroundStyle(.secondary)
                        .fixedSize(horizontal: true, vertical: false)
                }
                if disclosure {
                    Image(systemName: "chevron.right").font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary).accessibilityHidden(true)
                }
            }
            .frame(minHeight: 24)
            .contentShape(Rectangle())
        }
        .accessibilityElement(children: .combine)
    }
}

/// Inline search stays visible on home screens whose navigation bars are hidden.
struct PhoneListSearch: View {
    @Binding var text: String
    let prompt: String

    var body: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(.secondary).accessibilityHidden(true)
            TextField(prompt, text: $text)
                .textInputAutocapitalization(.never).autocorrectionDisabled()
                .submitLabel(.search).accessibilityLabel(prompt)
            if !text.isEmpty {
                Button { text = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary)
                        .frame(minWidth: 32, minHeight: 32)
                }.buttonStyle(.plain).accessibilityLabel("清除搜索")
            }
        }
        .font(.subheadline)
        .padding(.horizontal, 12).frame(minHeight: 44)
        .background(PhoneStyle.card, in: RoundedRectangle(cornerRadius: 12))
    }
}

struct PhoneListEmpty: View {
    let title: String
    let detail: String
    var body: some View {
        PhoneCard {
            VStack(alignment: .leading, spacing: 6) {
                Text(title).font(.headline)
                Text(detail).font(.subheadline).foregroundStyle(.secondary)
            }
        }
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
    var body: some View { PracticePlanListView(model: model, purpose: "all") }
}

private struct CompanyPracticeView: View {
    @Bindable var model: AppModel
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PhoneStyle.listSpacing) {
                NavigationLink(value: AppRoute.practicePlans) {
                    PhoneListRow(title: "公司专题计划")
                }.buttonStyle(.plain)
                ForEach(model.state.questionSets.filter { $0.jobId != "builtin:general" && $0.hasPracticeQuestions }) { pack in
                    NavigationLink(value: AppRoute.questionSet(pack.id)) {
                        PhoneListRow(title: pack.title, trailing: "\(pack.questions.count) 道题")
                    }.buttonStyle(.plain)
                }
            }.padding(16).frame(maxWidth: PhoneStyle.contentWidth)
        }.frame(maxWidth: .infinity).background(PhoneStyle.canvas)
            .navigationTitle("公司预先练习")
    }
}

enum BuiltinBank {
    static let packs: [QuestionSet] = {
        guard let url = Bundle.main.url(forResource: "interview-bank", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let packs = try? JSONDecoder().decode([QuestionSet].self, from: data) else { return [] }
        return packs
    }()
}

struct ReviewHomeView: View {
    @Bindable var model: AppModel
    @State private var creating = false
    @State private var search = ""
    private var interviews: [InterviewSummary] {
        (model.state.interviews ?? []).filter {
            search.isEmpty || ($0.title + " " + $0.date).localizedCaseInsensitiveContains(search)
        }.sorted { $0.date > $1.date }
    }
    private var plans: [PracticePlan] {
        (model.state.practicePlans ?? []).filter {
            $0.isCompanyPractice(in: model.state) &&
            (search.isEmpty || ($0.title + " " + $0.goal).localizedCaseInsensitiveContains(search))
        }.sorted { $0.updatedAt > $1.updatedAt }
    }
    private var packs: [QuestionSet] {
        model.state.questionSets.filter {
            $0.jobId != "builtin:general" && $0.hasPracticeQuestions && (search.isEmpty || $0.title.localizedCaseInsensitiveContains(search))
        }
    }
    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PhoneStyle.listSpacing) {
                HStack {
                    Text("复盘").font(.largeTitle.bold())
                    Spacer()
                    Button { creating = true } label: {
                        Image(systemName: "plus").frame(width: 44, height: 44)
                            .background(PhoneStyle.card, in: Circle())
                    }.accessibilityLabel("制定公司练习计划")
                }
                PhoneListSearch(text: $search, prompt: "搜索面试、公司或计划")
                SectionHeading(title: "实际面试", detail: interviews.count > 3 ? "最近 3 / \(interviews.count) 场" : "\(interviews.count) 场")
                ForEach(interviews.prefix(3)) { interview in
                    InterviewListLink(interview: interview)
                }
                if interviews.isEmpty {
                    PhoneListEmpty(title: "暂无匹配的面试", detail: "可查看全部面试，或导入新的录音。")
                }
                NavigationLink(value: AppRoute.interviews) {
                    PhoneListRow(title: "全部面试与录音导入", trailing: "\((model.state.interviews ?? []).count) 场")
                }.buttonStyle(.plain)
                SectionHeading(title: "公司预先练习", detail: "\(plans.count) 个计划 · \(packs.count) 个题组")
                    .padding(.top, 8)
                ForEach(plans) { plan in PracticePlanLink(model: model, plan: plan) }
                ForEach(packs) { pack in
                    NavigationLink(value: AppRoute.questionSet(pack.id)) {
                        PhoneListRow(title: pack.title, trailing: "\(pack.questions.count) 道题")
                    }.buttonStyle(.plain)
                }
                if plans.isEmpty && packs.isEmpty {
                    PhoneListEmpty(title: "暂无匹配的公司练习", detail: "收到面试安排后，可制定公司练习计划。")
                }
                if PracticeTopic.interviewReview.questionCount(in: model.state) > 0 &&
                    (search.isEmpty || PracticeTopic.interviewReview.title.localizedCaseInsensitiveContains(search)) {
                    NavigationLink(value: AppRoute.practiceTopic(PracticeTopic.interviewReview.rawValue)) {
                        PhoneListRow(title: PracticeTopic.interviewReview.title,
                                     trailing: "\(PracticeTopic.interviewReview.questionCount(in: model.state)) 道题")
                    }.buttonStyle(.plain)
                }
            }.padding(16).frame(maxWidth: PhoneStyle.contentWidth, alignment: .leading)
        }.frame(maxWidth: .infinity).background(PhoneStyle.canvas)
            .scrollDismissesKeyboard(.interactively)
            .toolbar(.hidden, for: .navigationBar)
            .refreshable { await model.sync() }
            .sheet(isPresented: $creating) { PracticePlanForm(model: model, purpose: "company") }
    }
}

struct QuestionList: View {
    @Bindable var model: AppModel
    let pack: QuestionSet
    @State private var search = ""
    @State private var savingOrder = false
    @State private var orderError: String?

    /// Follows the practice order saved on the web; positions number the ordered list.
    private var ordered: [CareerQuestion] { model.state.orderedQuestions(of: pack) }
    private var activeOrderName: String? { model.state.questionOrders?.first { $0.id == pack.id }?.activeOrder?.name }
    private var savedOrders: QuestionOrders? { model.state.questionOrders?.first { $0.id == pack.id } }
    private var questions: [CareerQuestion] {
        ordered.filter { $0.category != "日语表达基础" && $0.matchesListSearch(search) }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: PhoneStyle.listSpacing) {
            PhoneListSearch(text: $search, prompt: "搜索题目或内容")
            if let scenario = pack.scenario, !scenario.isEmpty {
                Text(scenario)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .padding(.bottom, 6)
            }
            SectionHeading(title: "练习题目",
                           detail: [activeOrderName, "\(questions.count) 道题"].compactMap { $0 }.joined(separator: " · "))
            if let savedOrders, !savedOrders.orders.isEmpty {
                Menu {
                    Button {
                        chooseOrder(nil, saved: savedOrders)
                    } label: {
                        if savedOrders.activeOrderId == nil { Label("面接の流れ（標準）", systemImage: "checkmark") }
                        else { Text("面接の流れ（標準）") }
                    }
                    ForEach(savedOrders.orders) { order in
                        Button {
                            chooseOrder(order.id, saved: savedOrders)
                        } label: {
                            if savedOrders.activeOrderId == order.id { Label(order.name, systemImage: "checkmark") }
                            else { Text(order.name) }
                        }
                    }
                } label: {
                    Label(activeOrderName ?? "面接の流れ（標準）", systemImage: "list.number")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .disabled(savingOrder)
                if savingOrder { ProgressView("順番を保存しています…").font(.caption) }
                if let orderError { Text(orderError).font(.caption).foregroundStyle(.red) }
            }
            ForEach(questions) { question in
                PracticeQuestionLink(model: model, pack: pack, question: question,
                                     number: (ordered.firstIndex { $0.id == question.id } ?? 0) + 1)
            }
            if questions.isEmpty {
                PhoneListEmpty(title: "没有匹配的题目", detail: "试试其他关键词，或清除搜索。")
            }
            }
            .frame(maxWidth: 620, alignment: .leading)
            .padding(16)
        }
        .background(PhoneStyle.canvas)
        .scrollDismissesKeyboard(.interactively)
        .navigationTitle(CareerRichText.plain(pack.title))
        .navigationBarTitleDisplayMode(.inline)
    }

    private func chooseOrder(_ id: String?, saved: QuestionOrders) {
        guard id != saved.activeOrderId, !savingOrder else { return }
        savingOrder = true
        orderError = nil
        Task {
            do { try await model.selectQuestionOrder(saved, activeOrderID: id) }
            catch { orderError = error.localizedDescription }
            savingOrder = false
        }
    }
}

struct PracticeQuestionLink: View {
    @Bindable var model: AppModel
    let pack: QuestionSet
    let question: CareerQuestion
    let number: Int

    var body: some View {
        NavigationLink(value: AppRoute.answer(packID: pack.id, questionID: question.id)) {
            PhoneListRow(title: question.questionNumber.map { "Q\($0) · \(question.title)" } ?? question.title,
                         subtitle: question.questionJa,
                         number: question.questionNumber == nil ? String(format: "%02d", number) : nil)
        }
        .buttonStyle(.plain)
    }
}

private struct AnswerFollowUpsView: View {
    let items: [AnswerFlow.FollowUp]
    let packID: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(items) { item in
                if let questionID = item.questionId {
                    NavigationLink(value: AppRoute.answer(packID: packID, questionID: questionID)) {
                        Label(CareerRichText.plain(item.question), systemImage: "arrow.right.circle")
                    }
                } else {
                    RichContent(text: item.question)
                }
            }
        }
    }
}

private struct AnswerFlowView: View {
    let flow: AnswerFlow
    let packID: String
    @State private var expandedStep: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(flow.nodes.enumerated()), id: \.element.id) { index, step in
                HStack(alignment: .top, spacing: 12) {
                    Text("\(index + 1)")
                        .font(.subheadline.bold().monospacedDigit())
                        .foregroundStyle(.white)
                        .frame(width: 28, height: 28)
                        .background(PhoneStyle.banner, in: Circle())
                        .accessibilityLabel("ステップ \(index + 1)")
                    VStack(alignment: .leading, spacing: 6) {
                        let related = flow.followUps.filter { $0.nodeId == step.id }
                        if step.detail?.isEmpty == false || step.cautions?.isEmpty == false || !related.isEmpty {
                            DisclosureGroup(isExpanded: Binding(
                                get: { expandedStep == step.id },
                                set: { expandedStep = $0 ? step.id : nil }
                            )) {
                                VStack(alignment: .leading, spacing: 12) {
                                    if let detail = step.detail, !detail.isEmpty { RichContent(text: detail) }
                                    if let cautions = step.cautions, !cautions.isEmpty {
                                        Text("表現の注意点").font(.caption.bold())
                                        RichContent(text: cautions)
                                    }
                                    if !related.isEmpty {
                                        Text("関連する追加質問").font(.caption.bold())
                                        AnswerFollowUpsView(items: related, packID: packID)
                                    }
                                }.padding(.top, 8)
                            } label: {
                                Text(step.title).font(.subheadline.weight(.medium))
                            }
                        } else {
                            Text(step.title)
                                .font(.subheadline.weight(.medium))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        if let cue = step.cue, !cue.isEmpty {
                            Text(CareerRichText.plain(cue)).font(.caption).foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 4)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(PhoneStyle.accent.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
            }
        }
    }
}

/// Turns off the navigation back-swipe while the practice page is visible, so horizontal
/// swipes only move between cards. The back button still works.
private struct PopGestureDisabler: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> Controller { Controller() }
    func updateUIViewController(_ controller: Controller, context: Context) {}

    final class Controller: UIViewController {
        private var saved: [(UIGestureRecognizer, Bool)] = []

        override func viewDidAppear(_ animated: Bool) {
            super.viewDidAppear(animated)
            guard saved.isEmpty, let navigation = navigationController else { return }
            var gestures = [navigation.interactivePopGestureRecognizer].compactMap { $0 }
            if #available(iOS 26.0, *), let content = navigation.interactiveContentPopGestureRecognizer {
                gestures.append(content)
            }
            saved = gestures.map { ($0, $0.isEnabled) }
            gestures.forEach { $0.isEnabled = false }
        }

        override func viewWillDisappear(_ animated: Bool) {
            super.viewWillDisappear(animated)
            saved.forEach { $0.0.isEnabled = $0.1 }
            saved = []
        }
    }
}

/// One swipeable card of the practice question, modeled on the printed Q&A sheets:
/// keywords, answer flow, reference answer, notes and follow-up questions.
private enum AnswerSection: String, Identifiable {
    case intro, flow, sample, related
    var id: String { rawValue }

    var title: String {
        switch self {
        case .intro: "面接質問"
        case .flow: "回答フロー"
        case .sample: "参考回答"
        case .related: "関連質問"
        }
    }

    var icon: String {
        switch self {
        case .intro: "person.fill"
        case .flow: "list.number"
        case .sample: "doc.text.fill"
        case .related: "bubble.left.and.bubble.right.fill"
        }
    }
}

private struct AnswerSectionCard<Content: View>: View {
    let section: AnswerSection
    @ViewBuilder let content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label(section.title, systemImage: section.icon)
                .font(.headline)
                .foregroundStyle(.white)
                .padding(.leading, 14)
                .padding(.trailing, 22)
                .padding(.vertical, 9)
                .background(PhoneStyle.banner, in: UnevenRoundedRectangle(
                    topLeadingRadius: 17, bottomLeadingRadius: 0,
                    bottomTrailingRadius: 22, topTrailingRadius: 4))
                .padding(.top, -16)
                .padding(.leading, -16)
                .accessibilityAddTraits(.isHeader)
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(PhoneStyle.card, in: RoundedRectangle(cornerRadius: 18))
        .overlay { RoundedRectangle(cornerRadius: 18).strokeBorder(PhoneStyle.accent.opacity(0.22)) }
    }
}

private struct KeywordChip: View {
    let text: String
    var tint: Color = PhoneStyle.accent
    var filled = true

    var body: some View {
        Text(text)
            .font(.subheadline.weight(.medium))
            .foregroundStyle(filled ? Color.primary : tint)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .frame(maxWidth: .infinity, minHeight: 40, alignment: .leading)
            .background(tint.opacity(filled ? 0.09 : 0.12), in: RoundedRectangle(cornerRadius: 10))
    }
}

struct AnswerView: View {
    @AppStorage("practiceRecognitionProvider") private var recognitionProvider = "local"
    @Bindable var model: AppModel
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    let pack: QuestionSet
    let question: CareerQuestion
    var practiceContext: PracticeContext? = nil
    @State private var copiedReference = false
    @State private var answerMode = "voice"
    @State private var typedAnswer = ""
    @State private var initializedAnswerMode = false
    @State private var practiceKeywords = ""
    @State private var speech = PracticeSpeechRecorder()
    @State private var referenceSpeech = ReferenceSpeechPlayer()
    /// Reads one tapped sentence or reverse question; the bottom player keeps the full answer.
    @State private var sentenceSpeech = ReferenceSpeechPlayer(systemControls: false)
    @State private var recognitionLanguage = "ja-JP"
    @State private var selectedSection: AnswerSection?
    @State private var showAnswers = false
    @State private var selectedReading = 0
    @State private var sectionForward = true
    @GestureState private var sectionDrag: CGFloat = 0
    @State private var showMoreHints = false
    @State private var saved = false
    @State private var historyPlayer: AVAudioPlayer?
    @State private var historyAudioError: String?

    private var history: [SavedAttempt] {
        model.state.attempts
            .filter { $0.questionSetId == pack.id && $0.questionId == question.id }
            .filter { attempt in
                guard let context = practiceContext else { return true }
                return attempt.practiceContext?.planId == context.planId && attempt.practiceContext?.scheduleId == context.scheduleId
            }
            .sorted { $0.createdAt > $1.createdAt }
    }

    private var pending: [PendingAttempt] {
        model.pending
            .filter { $0.questionSetId == pack.id && $0.questionId == question.id }
            .filter { attempt in
                guard let context = practiceContext else { return true }
                return attempt.practiceContext?.planId == context.planId && attempt.practiceContext?.scheduleId == context.scheduleId
            }
            .sorted { $0.createdAt > $1.createdAt }
    }

    private var canSave: Bool {
        if answerMode == "text" {
            let text = typedAnswer.trimmingCharacters(in: .whitespacesAndNewlines)
            return !text.isEmpty && text.count <= 20_000
        }
        return speech.phase == .ready && speech.recordingURL != nil &&
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

    /// Items read one at a time: numbered reverse questions, otherwise the answer's sentences.
    /// A one-sentence answer is shown and read whole.
    private var readingItems: [String] {
        guard !reverseQuestions.isEmpty else {
            let sentences = ReferenceSpeechText.sentences(question.sampleAnswer ?? "")
            return sentences.count > 1 ? sentences : []
        }
        return reverseQuestions
    }

    private var reverseQuestions: [String] {
        guard question.category == "逆質問", let sample = question.sampleAnswer else { return [] }
        return ReferenceSpeechText.numberedQuestions(sample)
    }

    /// Compact reference-answer player: play/pause, position, loop and speed.
    private func speechPlayer(for source: String) -> some View {
        let active = referenceSpeech.activeSource == source
        let loading = active && referenceSpeech.isLoading
        let playing = active && referenceSpeech.isPlaying
        let ready = active && referenceSpeech.duration > 0
        return HStack(spacing: 12) {
            Button {
                if loading {
                    referenceSpeech.stop()
                } else if active && ready {
                    if playing { referenceSpeech.pause() } else {
                        sentenceSpeech.stop()
                        referenceSpeech.resume()
                    }
                } else {
                    sentenceSpeech.stop()
                    let voice = ReferenceSpeechSettings.voice
                    Task {
                        await referenceSpeech.play(source, userID: model.userID ?? "local", voice: voice) {
                            try await model.referenceSpeech(questionSetID: pack.id, questionID: question.id,
                                                            source: source, voice: voice)
                        }
                    }
                }
            } label: {
                ZStack {
                    Circle().fill(PhoneStyle.banner)
                    if loading {
                        ProgressView().controlSize(.small).tint(.white)
                    } else {
                        Image(systemName: playing ? "pause.fill" : "play.fill")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.white)
                            .offset(x: playing ? 0 : 1)
                    }
                }
                .frame(width: 40, height: 40)
            }
            .buttonStyle(.plain)
            .accessibilityLabel(loading ? "読み込みをキャンセル" : playing ? "一時停止" : "朗読を再生")
            VStack(spacing: 0) {
                Slider(value: Binding(get: { ready ? referenceSpeech.currentTime : 0 },
                                      set: { referenceSpeech.seek(to: $0) }),
                       in: 0...max(ready ? referenceSpeech.duration : 1, 0.1))
                    .disabled(!ready)
                    .accessibilityLabel("再生位置")
                HStack {
                    Text(playbackTime(ready ? referenceSpeech.currentTime : 0))
                    Spacer()
                    Text(ready ? playbackTime(referenceSpeech.duration) : "--:--")
                }
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.secondary)
            }
            Button { referenceSpeech.setLooping(!referenceSpeech.isLooping) } label: {
                Image(systemName: "repeat")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(referenceSpeech.isLooping ? Color.white : PhoneStyle.accent)
                    .frame(width: 32, height: 32)
                    .background(referenceSpeech.isLooping ? PhoneStyle.banner : PhoneStyle.accent.opacity(0.1),
                                in: Circle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("繰り返し再生")
            .accessibilityAddTraits(referenceSpeech.isLooping ? .isSelected : [])
            Menu {
                ForEach([0.5, 0.75, 1, 1.25, 1.5, 1.75, 2], id: \.self) { speed in
                    Button {
                        referenceSpeech.setRate(Float(speed))
                    } label: {
                        if Float(speed) == referenceSpeech.rate {
                            Label("\(speed.formatted())×", systemImage: "checkmark")
                        } else { Text("\(speed.formatted())×") }
                    }
                }
            } label: {
                Text("\(Double(referenceSpeech.rate).formatted())×")
                    .font(.subheadline.weight(.semibold).monospacedDigit())
                    .foregroundStyle(PhoneStyle.accent)
                    .frame(minWidth: 40, minHeight: 32)
            }
            .accessibilityLabel("再生速度")
        }
        .disabled(speech.phase == .recording || speech.phase == .recognizing)
    }

    private func playbackTime(_ seconds: TimeInterval) -> String {
        let total = Int(max(0, seconds))
        return String(format: "%d:%02d", total / 60, total % 60)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                promptCard
            }
            .frame(maxWidth: horizontalSizeClass == .regular ? 1120 : 620, alignment: .leading)
            .padding(.horizontal, 16)
            .padding(.top, 16)
            .padding(.bottom, 24)
        }
        .background(PhoneStyle.canvas)
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom, spacing: 0) { bottomBar }
        .background(PopGestureDisabler())
        .onAppear {
            guard !initializedAnswerMode else { return }
            answerMode = question.category == "日语表达基础" ? "text" : "voice"
            initializedAnswerMode = true
        }
        .onDisappear {
            speech.discard()
            referenceSpeech.stop()
            sentenceSpeech.stop()
            historyPlayer?.stop()
        }
        .navigationTitle(question.questionNumber.map { "Q\($0) · \(CareerRichText.plain(question.title))" } ?? CareerRichText.plain(question.title))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                ShareLink(item: agentPrompt) {
                    Label("Agent で練習", systemImage: "sparkles")
                }
                Button { showAnswers = true } label: {
                    Label("回答を記録・履歴", systemImage: "mic.badge.plus")
                }
                ReadingToggleButton()
            }
        }
        .sheet(isPresented: $showAnswers) {
            NavigationStack {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        if let context = practiceContext {
                        PhoneCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("計画に沿って練習").font(.headline)
                                if let plan = model.state.practicePlans?.first(where: { $0.id == context.planId }) {
                                    Text(plan.goal).font(.subheadline)
                                    if let exercise = plan.content?.exercises.first(where: { $0.id == context.exerciseId }) {
                                        RichContent(text: exercise.instructions)
                                    }
                                }
                                Text("答える前にキーワードを三つまで整理しましょう。中国語・日本語のどちらでも構いません。")
                                    .font(.caption).foregroundStyle(.secondary)
                                TextField("キーワード", text: $practiceKeywords, axis: .vertical)
                                    .textFieldStyle(.roundedBorder)
                                Text("回答 → 一つの改善点を確認 → もう一度回答。実際の回答が計画に記録されます。")
                                    .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                        answerCard
                        historyCard
                    }
                    .frame(maxWidth: 620, alignment: .leading)
                    .padding(16)
                }
                .background(PhoneStyle.canvas)
                .scrollDismissesKeyboard(.interactively)
                .navigationTitle("回答を記録・履歴")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("閉じる") { showAnswers = false }
                            .disabled(speech.phase == .recording || speech.phase == .recognizing)
                    }
                }
                .alert("已保存", isPresented: $saved) {
                    Button("好", role: .cancel) {}
                } message: {
                    Text("回答已保存在本机；联网时会自动同步。")
                }
            }
            .interactiveDismissDisabled(speech.phase == .recording || speech.phase == .recognizing)
        }
    }

    private var flowCues: [String] {
        guard let flow = question.answerFlow, flow.version == 1 else { return [] }
        var seen = Set<String>()
        return flow.nodes.compactMap { node in
            guard let cue = node.cue.map(CareerRichText.plain), !cue.isEmpty else { return nil }
            return seen.insert(cue).inserted ? cue : nil
        }
    }

    private var unlinkedFollowUps: [AnswerFlow.FollowUp] {
        guard let flow = question.answerFlow, flow.version == 1 else { return [] }
        return flow.followUps.filter { $0.nodeId == nil }
    }

    private var agentPrompt: String {
        practiceContext.flatMap { context in
            model.state.practicePlans?.first { $0.id == context.planId }?.agentPrompt(scheduleID: context.scheduleId)
        } ?? "请通过 Career Note MCP 读取 career_get_practice_plan_guide 和已有专题计划，围绕题组 \(pack.id) 的问题 \(question.id) 按计划练习。先关键词，再一次一句，最后由我组成完整回答；用 career_save_practice_turn 保存原话、反馈、nextStep，换聊天先读回接续。"
    }

    private var hasFlow: Bool {
        guard let flow = question.answerFlow else { return false }
        return flow.version == 1 && !flow.nodes.isEmpty
    }

    private var sections: [AnswerSection] {
        var result: [AnswerSection] = [.intro]
        if hasFlow || question.outline?.isEmpty == false || question.why?.isEmpty == false { result.append(.flow) }
        if question.sampleAnswer?.isEmpty == false { result.append(.sample) }
        if question.answerFlow?.version == 1 ? !unlinkedFollowUps.isEmpty : question.followUps?.isEmpty == false {
            result.append(.related)
        }
        return result
    }

    private var currentSection: AnswerSection? {
        let available = sections
        if let selectedSection, available.contains(selectedSection) { return selectedSection }
        if ProcessInfo.processInfo.arguments.contains("-careerDesignReverse"), available.contains(.sample) { return .sample }
        return available.first
    }

    private func showSection(_ target: AnswerSection) {
        let available = sections
        guard let from = currentSection.flatMap(available.firstIndex(of:)),
              let to = available.firstIndex(of: target), from != to else { return }
        sectionForward = to > from
        // Apply the direction first so the outgoing card leaves on the matching side.
        DispatchQueue.main.async {
            withAnimation(.spring(response: 0.34, dampingFraction: 0.88)) { selectedSection = target }
        }
    }

    private func stepSection(_ offset: Int) {
        let available = sections
        guard let current = currentSection, let index = available.firstIndex(of: current) else { return }
        let next = index + offset
        guard available.indices.contains(next) else { return }
        showSection(available[next])
    }

    private var promptCard: some View {
        sectionPager
        .sheet(isPresented: $showMoreHints) { hintsSheet }
    }

    private var sectionPager: some View {
        let available = sections
        let current = currentSection ?? available[0]
        let index = available.firstIndex(of: current) ?? 0
        return VStack(spacing: 12) {
            ZStack {
                sectionCard(current)
                    .id(current)
                    .transition(.asymmetric(
                        insertion: .move(edge: sectionForward ? .trailing : .leading).combined(with: .opacity),
                        removal: .move(edge: sectionForward ? .leading : .trailing).combined(with: .opacity)))
            }
            .offset(x: sectionDrag)
            .clipped()
            .contentShape(Rectangle())
            .simultaneousGesture(
                DragGesture(minimumDistance: 24)
                    .updating($sectionDrag) { value, state, _ in
                        let width = value.translation.width
                        guard abs(width) > abs(value.translation.height) * 1.4 else { return }
                        let atEdge = (width > 0 && index == 0) || (width < 0 && index == available.count - 1)
                        state = width * (atEdge ? 0.15 : 0.35)
                    }
                    .onEnded { value in
                        let width = value.predictedEndTranslation.width
                        guard abs(value.translation.width) > abs(value.translation.height) * 1.4,
                              abs(width) > 70 else { return }
                        stepSection(width < 0 ? 1 : -1)
                    }
            )
            .animation(.interactiveSpring, value: sectionDrag)
            .accessibilityAction(named: "次のカード") { stepSection(1) }
            .accessibilityAction(named: "前のカード") { stepSection(-1) }
        }
    }

    /// Small bottom-pinned page dots; swiping the card is the way to move between sections.
    @ViewBuilder
    private var sectionDots: some View {
        let available = sections
        if available.count > 1, let current = currentSection, let index = available.firstIndex(of: current) {
            HStack(spacing: 6) {
                ForEach(available) { item in
                    Capsule()
                        .fill(item == current ? PhoneStyle.banner : PhoneStyle.accent.opacity(0.25))
                        .frame(width: item == current ? 16 : 6, height: 6)
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(.regularMaterial, in: Capsule())
            .animation(.easeOut(duration: 0.2), value: current)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(available.count) 枚中 \(index + 1) 枚目：\(current.title)")
            .accessibilityAdjustableAction { direction in
                switch direction {
                case .increment: stepSection(1)
                case .decrement: stepSection(-1)
                default: break
                }
            }
        }
    }

    @ViewBuilder
    private func sectionCard(_ section: AnswerSection) -> some View {
        AnswerSectionCard(section: section) {
            switch section {
            case .intro: introContent
            case .flow: flowContent
            case .sample: sampleContent
            case .related:
                if !unlinkedFollowUps.isEmpty {
                    AnswerFollowUpsView(items: unlinkedFollowUps, packID: pack.id)
                } else if let followUps = question.followUps {
                    RichContent(text: followUps)
                }
            }
        }
    }

    private var introContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                if let number = question.questionNumber {
                    Button {
                        UIPasteboard.general.string = "Q\(number)"
                        copiedReference = true
                    } label: {
                        Label("Q\(number)", systemImage: copiedReference ? "checkmark" : "doc.on.doc")
                            .font(.caption.bold().monospacedDigit())
                    }
                    .accessibilityLabel("質問番号 Q\(number) をコピー")
                }
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
            RichContent(text: question.questionJa, markdown: false, fontSize: 23)
                .accessibilityLabel(CareerRichText.plain(question.questionJa))
            if let meaning = question.meaning, !meaning.isEmpty {
                RichContent(text: meaning, markdown: false, fontSize: 15)
            }
            if !flowCues.isEmpty || !keywordHints.isEmpty {
                Label("キーワード", systemImage: "key.fill")
                    .font(.subheadline.bold())
                    .foregroundStyle(PhoneStyle.accent)
                    .padding(.top, 4)
                keywordsContent
            }
        }
    }

    private var flowContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            if hasFlow, let flow = question.answerFlow {
                AnswerFlowView(flow: flow, packID: pack.id).id(question.id)
                if let outline = question.outline, !outline.isEmpty {
                    DisclosureGroup("詳しい説明・注意点") {
                        RichContent(text: outline).padding(.top, 8)
                    }
                    .font(.subheadline)
                }
            } else if let outline = question.outline, !outline.isEmpty {
                RichContent(text: outline)
            }
            if question.why?.isEmpty == false {
                Button("回答のヒントを詳しく見る") { showMoreHints = true }
                    .font(.subheadline.bold())
            }
        }
    }

    private var keywordsContent: some View {
        let columns = [GridItem(.adaptive(minimum: 140), spacing: 8)]
        return VStack(alignment: .leading, spacing: 12) {
            if !flowCues.isEmpty {
                LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
                    ForEach(flowCues, id: \.self) { KeywordChip(text: $0) }
                }
            }
            if !keywordHints.isEmpty {
                if !flowCues.isEmpty {
                    Text("求人・履歴書との対応").font(.caption.bold()).foregroundStyle(.secondary)
                }
                LazyVGrid(columns: columns, alignment: .leading, spacing: 8) {
                    ForEach(keywordHints) { hint in
                        KeywordChip(text: hint.word, tint: hint.isGap ? .orange : .green, filled: false)
                    }
                }
            }
        }
    }

    private var sampleContent: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let sample = question.sampleAnswer {
                if readingItems.isEmpty {
                    RichContent(text: sample)
                } else {
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(Array(readingItems.enumerated()), id: \.offset) { index, item in
                            let selected = index == selectedReading
                            let active = sentenceSpeech.activeSource == item
                            let sounding = active && (sentenceSpeech.isLoading || sentenceSpeech.isPlaying)
                            if index > 0 { Divider().padding(.leading, 42) }
                            HStack(alignment: .center, spacing: 12) {
                                Text(String(format: "%02d", index + 1))
                                    .font(.subheadline.bold().monospacedDigit())
                                    .foregroundStyle(selected ? PhoneStyle.accent : Color.secondary)
                                    .frame(width: 30, alignment: .leading)
                                RichContent(text: item, markdown: reverseQuestions.isEmpty, fontSize: 18)
                                    .allowsHitTesting(false)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                Group {
                                    if active && sentenceSpeech.isLoading {
                                        ProgressView().controlSize(.mini)
                                    } else {
                                        Image(systemName: sounding ? "speaker.wave.2.fill" : "speaker.wave.2")
                                            .font(.caption)
                                            .foregroundStyle(PhoneStyle.accent)
                                            .opacity(sounding ? 1 : 0.45)
                                    }
                                }
                                .frame(width: 18)
                                .accessibilityHidden(true)
                            }
                            .padding(.vertical, 12)
                            .overlay(alignment: .leading) {
                                Capsule().fill(PhoneStyle.accent)
                                    .frame(width: 3)
                                    .padding(.vertical, 10)
                                    .offset(x: -16)
                                    .opacity(selected ? 1 : 0)
                            }
                            .contentShape(Rectangle())
                            .onTapGesture { readSentence(item, at: index) }
                            .disabled(speech.phase == .recording || speech.phase == .recognizing)
                            .accessibilityElement(children: .ignore)
                            .accessibilityLabel(CareerRichText.plain(item))
                            .accessibilityHint(sounding ? "読み上げを停止" : "この文だけを読み上げる")
                            .accessibilityAddTraits(selected ? [.isButton, .isSelected] : .isButton)
                        }
                    }
                }
            }
        }
    }

    /// The bottom read-aloud control always plays the whole 参考回答; tapped sentences use their own player.
    private var speechSource: String? {
        guard let sample = question.sampleAnswer, !sample.isEmpty else { return nil }
        return sample
    }

    /// Reads only the tapped sentence. A playing full answer is paused, keeping its position;
    /// tapping the sentence that is sounding stops it.
    private func readSentence(_ item: String, at index: Int) {
        selectedReading = index
        if sentenceSpeech.activeSource == item && (sentenceSpeech.isLoading || sentenceSpeech.isPlaying) {
            sentenceSpeech.stop()
            return
        }
        if referenceSpeech.isLoading { referenceSpeech.stop() }
        else if referenceSpeech.isPlaying { referenceSpeech.pause() }
        let voice = ReferenceSpeechSettings.voice
        Task {
            await sentenceSpeech.play(item, userID: model.userID ?? "local", voice: voice) {
                try await model.referenceSpeech(questionSetID: pack.id, questionID: question.id,
                                                source: item, voice: voice)
            }
        }
    }

    private var bottomBar: some View {
        VStack(spacing: 8) {
            if currentSection == .sample, let source = speechSource {
                VStack(alignment: .leading, spacing: 6) {
                    speechPlayer(for: source)
                    if let message = sentenceSpeech.errorMessage ?? referenceSpeech.errorMessage {
                        Text(message).font(.caption).foregroundStyle(.red)
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 10)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
                .padding(.horizontal, 16)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            }
            sectionDots
        }
        .padding(.bottom, 6)
        .animation(.easeOut(duration: 0.2), value: currentSection)
    }

    private var hintsSheet: some View {
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

    private func startRecording() async {
        if recognitionProvider == "cloudflare" {
            guard let uid = model.userID else { return }
            let jobID = "practice-" + UUID().uuidString
            let language = recognitionLanguage == "zh-CN" ? "zh" : "ja"
            await speech.start(localeID: recognitionLanguage, cloud: { url in
                try await model.transcribeRecording(url: url, jobID: jobID, language: language, uid: uid)
            })
        } else { await speech.start(localeID: recognitionLanguage) }
    }

    private var answerCard: some View {
        PhoneCard {
            VStack(alignment: .leading, spacing: 14) {
                Text("あなたの回答").font(.headline)
                Picker("回答方法", selection: $answerMode) {
                    Text("文字で回答").tag("text")
                    Text("録音で回答").tag("voice")
                }
                .pickerStyle(.segmented)
                .disabled(speech.phase != .idle)
                Text("回答言語").font(.caption).foregroundStyle(.secondary)
                Picker("回答言語", selection: $recognitionLanguage) {
                    Text("日本語").tag("ja-JP")
                    Text("中文").tag("zh-CN")
                }
                .pickerStyle(.segmented)
                .disabled(speech.phase != .idle)

                if answerMode == "text" {
                    Text("自分で作った文を入力してください。一行に一文で構いません。保存後の答え直しは別の回答として残ります。")
                        .font(.caption).foregroundStyle(.secondary)
                    TextEditor(text: $typedAnswer)
                        .frame(minHeight: 180)
                        .padding(8)
                        .scrollContentBackground(.hidden)
                        .background(PhoneStyle.canvas, in: RoundedRectangle(cornerRadius: 10))
                        .accessibilityLabel("文字の回答")
                    Text("\(typedAnswer.count) / 20,000")
                        .font(.caption.monospacedDigit()).foregroundStyle(.secondary)
                } else {
                Picker("音声認識", selection: $recognitionProvider) {
                    Text("端末内").tag("local")
                    Text("Cloudflare").tag("cloudflare")
                }.pickerStyle(.segmented).disabled(speech.phase != .idle)
                switch speech.phase {
                case .idle:
                    Button {
                        referenceSpeech.stop()
                        sentenceSpeech.stop()
                        Task { await startRecording() }
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
                        Text("録音を認識しています…")
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
                            Task { await startRecording() }
                        } label: {
                            Label("重新录音", systemImage: "arrow.counterclockwise")
                        }
                    }
                    .buttonStyle(.bordered)
                    Button("删除录音并更换语言", role: .destructive) { speech.discard() }
                        .font(.caption)
                }

                Text(recognitionProvider == "cloudflare" ? "Cloudflare に音声を送信して認識します。通信が必要です。失敗時も画面を閉じるまでは録音を保持します。" : "音声認識は端末内で処理します。保存後に回答を同期します。")
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
                    Text(speech.transcript.isEmpty ? "录音结束后，识别的文字会显示在这里。" : speech.transcript)
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
                }
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
            sentenceSpeech.stop()
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
        var context = practiceContext
        context?.keywords = String(practiceKeywords.prefix(1000))
        let queued = model.queue(questionSetId: pack.id, questionId: question.id,
                                 answer: answerMode == "text" ? typedAnswer.trimmingCharacters(in: .whitespacesAndNewlines) : speech.transcript,
                                 language: recognitionLanguage == "ja-JP" ? "日语" : "中文构思",
                                 duration: answerMode == "text" ? 0 : speech.seconds, requestReview: requestReview,
                                 recordingURL: answerMode == "text" ? nil : speech.recordingURL, practiceContext: context)
        guard queued else { return }
        saved = true
        if answerMode == "text" { typedAnswer = "" } else { speech.discard() }
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
