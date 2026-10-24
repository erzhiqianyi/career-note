import SwiftUI
import PDFKit
import UniformTypeIdentifiers
import WebKit

struct ResumeHomeView: View {
    @Bindable var model: AppModel
    @State private var section = 0
    @State private var language = "ja"
    @State private var showingSettings = false

    private var entries: [CareerResumeEntry] {
        model.state.resume?.filter { $0.archived != true && ($0.language ?? "ja") == language } ?? []
    }
    private var drafts: [CareerPersonalizedResume] {
        model.personalizedResumes.filter { $0.archived != true && ($0.language ?? "ja") == language }
    }
    private var documents: [CareerMaterial] {
        model.state.materials.filter { ["履歴書", "職務経歴書", "業務経歴書"].contains($0.kind) }
            .sorted { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("简历").font(.largeTitle.bold())
                        Text("履历来源与已保存的版本")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button { showingSettings = true } label: {
                        Image(systemName: "gearshape")
                            .frame(width: 44, height: 44)
                            .background(PhoneStyle.card, in: Circle())
                    }
                    .accessibilityLabel("设置与同步")
                }
                Picker("简历内容", selection: $section) {
                    Text("我的履历").tag(0)
                    Text("个性化").tag(1)
                    Text("文稿").tag(2)
                }
                .pickerStyle(.segmented)
                if section < 2 {
                    Picker("语言", selection: $language) {
                        Text("日本語").tag("ja")
                        Text("中文").tag("zh")
                        Text("English").tag("en")
                    }
                    .pickerStyle(.segmented)
                }
                switch section {
                case 0: sourceEntries
                case 1: personalized
                default: materialDocuments
                }
            }
            .frame(maxWidth: 620, alignment: .leading)
            .padding(16)
            .padding(.bottom, 30)
        }
        .background(PhoneStyle.canvas)
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $showingSettings) {
            NavigationStack { SettingsView(model: model) }
        }
    }

    private var sourceEntries: some View {
        VStack(alignment: .leading, spacing: 12) {
            if let profile = model.state.profile {
                SectionHeading(title: "职业摘要", detail: nil)
                PhoneCard {
                    VStack(alignment: .leading, spacing: 8) {
                        if let text = profile.summary, !text.isEmpty { RichContent(text: text) }
                        if let text = profile.targetRoles, !text.isEmpty { RichContent(text: "目标岗位：" + text, markdown: false) }
                        if let text = profile.skills, !text.isEmpty { RichContent(text: "技能：" + text, markdown: false) }
                        if let text = profile.experience, !text.isEmpty { RichContent(text: "经历：" + text, markdown: false) }
                        if let text = profile.japanese, !text.isEmpty { RichContent(text: "日语：" + text, markdown: false) }
                        if let text = profile.conditions, !text.isEmpty { RichContent(text: "求职条件：" + text, markdown: false) }
                    }
                    .font(.subheadline)
                    .textSelection(.enabled)
                }
            }
            SectionHeading(title: "我的履历", detail: "\(entries.count) 条")
            if entries.isEmpty {
                PhoneCard { Text("此语言暂无履历记录；联网后可同步网页版内容。")
                    .foregroundStyle(.secondary) }
            }
            ForEach(entries.sorted { ResumeLabels.rank($0.kind) < ResumeLabels.rank($1.kind) }) { entry in
                NavigationLink { ResumeEntryDetail(entry: entry) } label: {
                    PhoneCard {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(ResumeLabels.kind(entry.kind)).font(.headline).foregroundStyle(.primary)
                            Text(CareerRichText.plain(ResumeLabels.preview(entry))).font(.subheadline)
                                .foregroundStyle(.secondary).lineLimit(2)
                            if let verification = entry.verification {
                                Text(ResumeLabels.verification(verification)).font(.caption)
                                    .foregroundStyle(PhoneStyle.accent)
                            }
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var personalized: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeading(title: "个性化简历", detail: "\(drafts.count) 份")
            if drafts.isEmpty {
                PhoneCard { Text("此语言暂无个性化简历草稿。")
                    .foregroundStyle(.secondary) }
            }
            ForEach(drafts) { draft in
                NavigationLink { PersonalizedResumeDetail(draft: draft) } label: {
                    PhoneCard {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(draft.title).font(.headline).foregroundStyle(.primary)
                            Text([draft.targetCompany, draft.targetRole].compactMap { $0 }
                                .filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var materialDocuments: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeading(title: "已生成文稿", detail: "\(documents.count) 份")
            if documents.isEmpty { PhoneCard { Text("暂无履歴書或職務経歴書文稿。")
                .foregroundStyle(.secondary) } }
            ForEach(documents) { document in
                NavigationLink {
                    if ["履歴書", "職務経歴書"].contains(document.kind) {
                        ApplicationDocumentView(model: model, document: document)
                    } else {
                        TextDetailView(title: document.title, subtitle: document.kind,
                                       content: document.content)
                    }
                } label: {
                    PhoneCard {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(document.title).font(.headline).foregroundStyle(.primary)
                            Text([document.kind, document.reviewStatus ?? "待核对"].joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct ApplicationDocumentView: View {
    @Bindable var model: AppModel
    let document: CareerMaterial
    @State private var files: CareerMaterialFiles?
    @State private var pdf: Data?
    @State private var photo: Data?
    @State private var showOriginal = true
    @State private var choosePDF = false
    @State private var choosePhoto = false
    @State private var busy = false
    @State private var error: String?

    private var isResume: Bool { document.kind == "履歴書" }
    private var html: String { CareerRichText.applicationHTML(document.content, kind: document.kind, photo: photo) }

    var body: some View {
        VStack(spacing: 0) {
            if let files, files.pdf != nil {
                Picker("预览版本", selection: $showOriginal) {
                    Text("原版 PDF").tag(true)
                    Text("A4 排版版").tag(false)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16)
                .padding(.top, 10)
            }
            if let error { Text(error).font(.caption).foregroundStyle(.red).padding(12) }
            if showOriginal, let pdf {
                SavedPDFView(data: pdf)
            } else {
                ApplicationHTMLView(html: html)
            }
        }
        .background(PhoneStyle.canvas)
        .navigationTitle(CareerRichText.plain(document.title))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                if model.canManageMaterialFiles {
                    Menu {
                        Button("上传原版 PDF", systemImage: "doc.badge.plus") { choosePDF = true }
                        if isResume { Button("上传证件照", systemImage: "person.crop.rectangle") { choosePhoto = true } }
                        if files?.pdf != nil { Button("移除 PDF", systemImage: "trash", role: .destructive) { Task { await remove("pdf") } } }
                        if isResume && files?.photo != nil { Button("移除照片", systemImage: "trash", role: .destructive) { Task { await remove("photo") } } }
                    } label: { Image(systemName: "paperclip") }
                    .disabled(busy)
                }
                Button("打印", systemImage: "printer") { printDocument() }
            }
        }
        .fileImporter(isPresented: $choosePDF, allowedContentTypes: [.pdf]) { result in
            Task { await upload(result, kind: "pdf") }
        }
        .fileImporter(isPresented: $choosePhoto, allowedContentTypes: [.png, .jpeg, .webP]) { result in
            Task { await upload(result, kind: "photo") }
        }
        .task(id: document.id) { await loadFiles() }
    }

    private func loadFiles() async {
        guard model.canManageMaterialFiles else { return }
        do {
            let metadata = try JSONDecoder().decode(CareerMaterialFiles.self,
                from: await model.materialFileRequest(id: document.id))
            let pdfBytes = metadata.pdf != nil
                ? try await model.materialFileRequest(id: document.id, kind: "pdf", content: true) : nil
            let photoBytes = isResume && metadata.photo != nil
                ? try await model.materialFileRequest(id: document.id, kind: "photo", content: true) : nil
            files = metadata
            pdf = pdfBytes
            photo = photoBytes
            error = nil
        } catch { self.error = error.localizedDescription }
    }

    private func upload(_ result: Result<URL, Error>, kind: String) async {
        guard model.canManageMaterialFiles else { return }
        do {
            let url = try result.get()
            let access = url.startAccessingSecurityScopedResource()
            defer { if access { url.stopAccessingSecurityScopedResource() } }
            let bytes = try Data(contentsOf: url)
            let ext = url.pathExtension.lowercased()
            let mime: String
            switch kind == "pdf" ? "pdf" : ext {
            case "pdf": mime = "application/pdf"
            case "png": mime = "image/png"
            case "jpg", "jpeg": mime = "image/jpeg"
            case "webp": mime = "image/webp"
            default: throw NSError(domain: "CareerNote", code: 4, userInfo: [NSLocalizedDescriptionKey: "请选择 PDF 或 PNG、JPEG、WebP 照片。"])
            }
            busy = true
            _ = try await model.materialFileRequest(id: document.id, kind: kind,
                method: "POST", data: bytes, mime: mime)
            await loadFiles()
        } catch { self.error = error.localizedDescription }
        busy = false
    }

    private func remove(_ kind: String) async {
        busy = true
        do {
            _ = try await model.materialFileRequest(id: document.id, kind: kind, method: "DELETE")
            await loadFiles()
        } catch { self.error = error.localizedDescription }
        busy = false
    }

    private func printDocument() {
        let controller = UIPrintInteractionController.shared
        let info = UIPrintInfo(dictionary: nil)
        info.jobName = CareerRichText.plain(document.title)
        info.outputType = .general
        controller.printInfo = info
        if showOriginal, let pdf { controller.printingItem = pdf as NSData }
        else { controller.printFormatter = UIMarkupTextPrintFormatter(markupText: html) }
        controller.present(animated: true)
    }
}

private struct SavedPDFView: UIViewRepresentable {
    let data: Data
    func makeUIView(context: Context) -> PDFView {
        let view = PDFView()
        view.autoScales = true
        view.displayMode = .singlePageContinuous
        return view
    }
    func updateUIView(_ view: PDFView, context: Context) {
        if view.document?.dataRepresentation() != data { view.document = PDFDocument(data: data) }
    }
}

private struct ApplicationHTMLView: UIViewRepresentable {
    let html: String
    func makeUIView(context: Context) -> WKWebView {
        let view = WKWebView()
        view.isOpaque = false
        view.backgroundColor = .clear
        view.loadHTMLString(html, baseURL: nil)
        return view
    }
    func updateUIView(_ view: WKWebView, context: Context) {
        if context.coordinator.html != html {
            context.coordinator.html = html
            view.loadHTMLString(html, baseURL: nil)
        }
    }
    func makeCoordinator() -> Coordinator { Coordinator() }
    final class Coordinator { var html = "" }
}

private struct ResumeEntryDetail: View {
    let entry: CareerResumeEntry

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(ResumeLabels.verification(entry.verification ?? "recorded"))
                    .font(.caption).foregroundStyle(PhoneStyle.accent)
                if let updated = entry.updatedAt { Text("更新于 \(String(updated.prefix(10)))")
                    .font(.caption).foregroundStyle(.secondary) }
                PhoneCard {
                    VStack(alignment: .leading, spacing: 14) {
                        ForEach(ResumeLabels.fields(entry), id: \.0) { key, label in
                            if let value = entry.data[key], !value.isEmpty {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(label).font(.caption).foregroundStyle(.secondary)
                                    RichContent(text: value)
                                }
                            }
                        }
                    }
                }
                if let source = entry.sourceNotes, !source.isEmpty {
                    PhoneCard {
                        VStack(alignment: .leading, spacing: 5) {
                            Text("来源与核对").font(.headline)
                            RichContent(text: source)
                        }
                    }
                }
            }
            .frame(maxWidth: 620, alignment: .leading)
            .padding(16)
        }
        .background(PhoneStyle.canvas)
        .navigationTitle(ResumeLabels.kind(entry.kind))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ReadingToggleButton() }
    }
}

private struct PersonalizedResumeDetail: View {
    let draft: CareerPersonalizedResume

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(CareerRichText.plain(draft.content.name)).font(.title.bold())
                    RichContent(text: draft.content.headline, markdown: false)
                    Text(CareerRichText.plain(draft.content.location)).font(.subheadline).foregroundStyle(.secondary)
                }
                if !draft.content.summary.isEmpty { PhoneCard { RichContent(text: draft.content.summary) } }
                ForEach(draft.content.links) { link in
                    if let url = URL(string: link.url) { Link(link.label, destination: url) }
                }
                ForEach(draft.content.sections) { section in
                    VStack(alignment: .leading, spacing: 10) {
                        SectionHeading(title: CareerRichText.plain(section.heading), detail: nil)
                        ForEach(section.items) { item in
                            PhoneCard {
                                VStack(alignment: .leading, spacing: 6) {
                                    RichContent(text: item.title, markdown: false)
                                    Text(CareerRichText.plain([item.subtitle, item.period].filter { !$0.isEmpty }.joined(separator: " · ")))
                                        .font(.caption).foregroundStyle(.secondary)
                                    ForEach(item.bullets, id: \.self) { bullet in
                                        RichContent(text: "- " + bullet)
                                    }
                                }
                                .textSelection(.enabled)
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: 620, alignment: .leading)
            .padding(16)
        }
        .background(PhoneStyle.canvas)
        .navigationTitle(draft.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ReadingToggleButton() }
    }
}

private enum ResumeLabels {
    static let kinds = ["basics", "employment", "education", "project", "skill", "achievement", "language", "preferences", "document"]
    static func rank(_ kind: String) -> Int { kinds.firstIndex(of: kind) ?? kinds.count }
    static func kind(_ value: String) -> String {
        ["basics": "基本资料", "employment": "工作经历", "education": "教育经历",
         "project": "项目经历", "skill": "技能", "achievement": "成果案例",
         "language": "语言能力", "preferences": "求职意向", "document": "文档版本"][value] ?? value
    }
    static func verification(_ value: String) -> String {
        ["recorded": "已记录", "confirmed": "已确认", "pending": "待核对"][value] ?? value
    }
    static func preview(_ entry: CareerResumeEntry) -> String {
        ["name", "employer", "school", "title", "role", "summary"].compactMap { entry.data[$0] }
            .first { !$0.isEmpty } ?? "查看完整内容"
    }
    static func fields(_ entry: CareerResumeEntry) -> [(String, String)] {
        let labels = [
            "name": "姓名 / 名称", "reading": "读音", "birthDate": "出生日期", "postalCode": "邮编",
            "address": "地址", "addressReading": "地址读音", "phone": "电话", "email": "邮箱",
            "contactAddress": "其他联系地址", "headline": "职业定位", "location": "地点", "summary": "摘要",
            "website": "个人网站", "github": "GitHub", "gender": "性别", "employer": "雇主",
            "client": "客户或项目", "role": "职位 / 本人角色", "startDate": "开始年月", "endDate": "结束年月",
            "responsibilities": "职责", "technologies": "使用技术", "school": "学校", "major": "专业或课程",
            "degree": "学位", "details": "补充说明", "problem": "解决的问题", "contribution": "本人贡献",
            "status": "状态", "url": "项目链接", "category": "分类", "usage": "使用场景",
            "years": "使用年数", "title": "标题", "context": "背景与状况", "task": "任务",
            "action": "本人行动", "result": "成果与影响", "measurement": "数字口径与限制",
            "level": "能力说明", "qualification": "资格", "date": "取得年月", "rationale": "匹配依据",
            "roles": "目标岗位", "locations": "希望地点", "availability": "入职时间", "salary": "希望年薪",
            "conditions": "其他条件", "language": "文档语言", "version": "文档版本", "content": "文档正文"
        ]
        return entry.data.keys.sorted().map { ($0, labels[$0] ?? $0) }
    }
}
