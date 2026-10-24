import SwiftUI

struct CompanyListView: View {
    @Bindable var model: AppModel
    @State private var search = ""
    @State private var showClosed = false

    private var jobs: [CareerJob] {
        model.state.jobs
            .filter { showClosed || !["未通过", "已撤回"].contains($0.status) }
            .filter { search.isEmpty || ($0.company + " " + $0.role + " " + String($0.companyNumber ?? 0))
                .localizedCaseInsensitiveContains(search) }
            .sorted { sortDate($0) < sortDate($1) }
    }

    private func sortDate(_ job: CareerJob) -> String {
        guard let date = job.nextDate, !date.isEmpty else { return "9999" }
        return date
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text("企业").font(.largeTitle.bold())
                Toggle("显示已结束的职位", isOn: $showClosed)
                    .font(.subheadline)
                SectionHeading(title: "已保存的企业", detail: "\(jobs.count) / \(model.state.jobs.count)")
                if jobs.isEmpty {
                    PhoneCard {
                        Text(model.state.jobs.isEmpty ? "首次联网同步后，这里会显示网页版已保存的企业。" : "没有符合条件的企业。")
                            .foregroundStyle(.secondary)
                    }
                }
                ForEach(jobs) { job in
                    NavigationLink(value: AppRoute.job(job.id)) {
                        PhoneCard {
                            VStack(alignment: .leading, spacing: 9) {
                                HStack(alignment: .top) {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(job.company).font(.headline).foregroundStyle(.primary)
                                        Text(job.role).font(.subheadline).foregroundStyle(.secondary)
                                    }
                                    Spacer(minLength: 4)
                                    Text(job.status).font(.caption.bold())
                                        .foregroundStyle(PhoneStyle.accent)
                                }
                                if let next = job.nextAction, !next.isEmpty {
                                    Label(next, systemImage: "calendar")
                                        .font(.caption).foregroundStyle(.secondary)
                                        .lineLimit(2)
                                }
                                HStack {
                                    Text("资料 \(model.state.materials.filter { $0.jobId == job.id }.count) 份")
                                    let packs = model.state.questionSets.filter { $0.jobId == job.id }
                                    Text("题目 \(packs.reduce(0) { $0 + $1.questions.count }) 道")
                                    Spacer()
                                    if let date = job.nextDate, !date.isEmpty { Text(String(date.prefix(10))) }
                                }
                                .font(.caption).foregroundStyle(.secondary)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(maxWidth: 620, alignment: .leading)
            .padding(16)
            .padding(.bottom, 24)
        }
        .refreshable { await model.sync() }
        .searchable(text: $search, prompt: "搜索企业或职位")
        .background(PhoneStyle.canvas)
        .toolbar(.hidden, for: .navigationBar)
    }
}

struct CompanyDetailView: View {
    @Bindable var model: AppModel
    let job: CareerJob
    @AppStorage("companyDetailSection") private var section = 0

    private var materials: [CareerMaterial] {
        model.state.materials.filter { $0.jobId == job.id }
            .sorted { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
    }
    private var packs: [QuestionSet] { model.state.questionSets.filter { $0.jobId == job.id } }
    private var attempts: [SavedAttempt] {
        let ids = Set(packs.map(\.id))
        return model.state.attempts.filter { ids.contains($0.questionSetId) }
    }
    private var reviews: [AnswerReview] {
        let ids = Set(attempts.map(\.id))
        return model.state.reviews.filter { ids.contains($0.attemptId) }
            .sorted { ($0.createdAt ?? "") > ($1.createdAt ?? "") }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(job.company).font(.title2.bold())
                    Text(job.role).font(.subheadline).foregroundStyle(.secondary)
                    Text(job.status).font(.caption.bold()).foregroundStyle(PhoneStyle.accent)
                }
                Picker("企业内容", selection: $section) {
                    Text("企业").tag(0)
                    Text("资料").tag(1)
                    Text("练习").tag(2)
                    Text("总结").tag(3)
                }
                .pickerStyle(.segmented)
                switch section {
                case 0: info
                case 1: materialList
                case 2: practiceList
                default: summary
                }
            }
            .frame(maxWidth: 620, alignment: .leading)
            .padding(16)
            .padding(.bottom, 32)
        }
        .background(PhoneStyle.canvas)
        .navigationTitle(job.companyNumber.map { "企业 #\($0)" } ?? "企业详情")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ReadingToggleButton() }
    }

    private var info: some View {
        VStack(alignment: .leading, spacing: 18) {
            CompanyInfoSection(title: "公司信息", fields: [
                ("公司标准读音", job.companyReading),
                ("工作地点", job.location), ("员工人数", job.employeeCount),
                ("公司类型", job.companyType), ("雇用形式", job.employmentType),
                ("外国人招聘信息", job.foreigner), ("在留资格支持", job.visa),
                ("投递状态", job.status), ("优先级", job.priority),
                ("下一步", job.nextAction), ("下次日期", job.nextDate),
                ("公司业务与特点", job.business), ("我的跟进记录", job.notes)
            ])
            if let history = job.history, !history.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    SectionHeading(title: "投递时间线", detail: "\(history.count) 条")
                    PhoneCard {
                        VStack(alignment: .leading, spacing: 12) {
                            ForEach(history.reversed()) { item in
                                HStack {
                                    Text(item.status).font(.subheadline.bold())
                                    Spacer()
                                    Text(String(item.at.prefix(10)))
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }
                        }
                    }
                }
            }
            VStack(alignment: .leading, spacing: 10) {
                SectionHeading(title: "招聘信息", detail: nil)
                if let raw = job.url, let url = URL(string: raw), ["http", "https"].contains(url.scheme) {
                    Link(destination: url) {
                        PhoneCard { Label("查看招聘原文", systemImage: "arrow.up.right.square") }
                    }
                }
            }
            CompanyInfoSection(title: "招聘来源与条件", fields: [
                ("来源平台", job.sourcePlatform), ("发现方式", job.sourceChannel),
                ("职位", job.role), ("薪资范围", job.salary),
                ("日语要求", job.japanese), ("信息确认日期", job.sourceDate),
                ("匹配评价", job.matchLevel), ("岗位要求", job.requirements),
                ("工作内容", job.description), ("匹配点", job.matchNotes),
                ("待确认事项", job.unknowns)
            ])
        }
    }

    private var materialList: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeading(title: "准备资料", detail: "\(materials.count) 份")
            if materials.isEmpty { PhoneCard { Text("还没有这家公司的准备资料。").foregroundStyle(.secondary) } }
            ForEach(materials) { material in
                NavigationLink(value: AppRoute.companyMaterial(material.id)) {
                    PhoneCard {
                        VStack(alignment: .leading, spacing: 5) {
                            Text(material.title).font(.headline).foregroundStyle(.primary)
                            Text([material.kind, material.reviewStatus ?? "待核对", String((material.createdAt ?? "").prefix(10))]
                                .filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }

    private var practiceList: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeading(title: "公司练习", detail: "\(packs.reduce(0) { $0 + $1.questions.count }) 道题")
            if packs.isEmpty { PhoneCard { Text("还没有这家公司的题组。").foregroundStyle(.secondary) } }
            ForEach(packs) { pack in
                VStack(alignment: .leading, spacing: 10) {
                    Text(pack.title).font(.headline)
                    Text("\(pack.questions.count) 道题 · 已回答 \(Set(attempts.filter { $0.questionSetId == pack.id }.map(\.questionId)).count) 道")
                        .font(.caption).foregroundStyle(.secondary)
                    if let scenario = pack.scenario, !scenario.isEmpty {
                        Text(scenario).font(.caption).foregroundStyle(.secondary)
                    }
                    ForEach(Array(pack.questions.enumerated()), id: \.element.id) { index, question in
                        PracticeQuestionLink(model: model, pack: pack, question: question, number: index + 1)
                    }
                }
                .padding(.top, 6)
            }
        }
    }

    private var summary: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeading(title: "练习概览", detail: nil)
            PhoneCard {
                Text("题目 \(packs.reduce(0) { $0 + $1.questions.count }) 道 · 回答 \(attempts.count) 次 · 点评 \(reviews.count) 条")
                    .font(.subheadline)
            }
            if !reviews.isEmpty {
                SectionHeading(title: "下次练习重点", detail: nil)
                ForEach(reviews.prefix(5)) { review in
                    PhoneCard {
                        VStack(alignment: .leading, spacing: 6) {
                            if let next = review.nextPractice, !next.isEmpty { Text(next).font(.headline) }
                            RichContent(text: review.summary)
                        }
                    }
                }
            }
            let reports = model.state.reports.filter { ($0.title + $0.content).contains(job.company) }
            if !reports.isEmpty {
                SectionHeading(title: "相关分析", detail: "\(reports.count) 份")
                ForEach(reports.sorted { $0.date > $1.date }) { report in
                    NavigationLink(value: AppRoute.report(report.id)) {
                        PhoneCard { Text(report.title).foregroundStyle(.primary) }
                    }
                }
            }
        }
    }
}

struct CompanyMaterialDetailView: View {
    let material: CareerMaterial

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(material.kind).font(.caption).foregroundStyle(.secondary)
                if let source = material.sourceNotes, !source.isEmpty {
                    PhoneCard {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("来源与核对").font(.headline)
                            RichContent(text: source)
                        }
                    }
                }
                PhoneCard { RichContent(text: material.content) }
            }
            .padding(16)
            .padding(.bottom, 80)
        }
        .background(PhoneStyle.canvas)
        .navigationTitle(CareerRichText.plain(material.title))
        .toolbar { ReadingToggleButton() }
    }
}

private struct CompanyInfoSection: View {
    let title: String
    let fields: [(String, String?)]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeading(title: title, detail: nil)
            PhoneCard {
                VStack(alignment: .leading, spacing: 14) {
                    ForEach(fields.indices, id: \.self) { index in
                        let (label, value) = fields[index]
                        VStack(alignment: .leading, spacing: 3) {
                            Text(label).font(.caption).foregroundStyle(.secondary)
                            if let value, !value.isEmpty {
                                if value.contains("{") || value.contains("\n") {
                                    RichContent(text: value, markdown: false)
                                } else {
                                    Text(value).font(.subheadline).textSelection(.enabled)
                                }
                            } else {
                                Text("待确认").font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                        if index < fields.count - 1 { Divider() }
                    }
                }
            }
        }
    }
}
