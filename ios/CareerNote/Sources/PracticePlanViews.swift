import SwiftUI

struct PracticePlanListView: View {
    @Bindable var model: AppModel
    @State private var creating = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                PhoneCard {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("目標から練習を組み立てる").font(.headline)
                        Text("目標と期間を決め、必要な能力・練習・確認方法を整理します。途中の回答に合わせて計画を調整できます。")
                            .font(.subheadline).foregroundStyle(.secondary)
                        Button { creating = true } label: { Label("練習計画を作る", systemImage: "plus") }
                            .buttonStyle(.borderedProminent)
                    }
                }
                ForEach((model.state.practicePlans ?? []).sorted { $0.updatedAt > $1.updatedAt }) { plan in
                    NavigationLink(value: AppRoute.practicePlan(plan.id)) {
                        PhoneCard {
                            VStack(alignment: .leading, spacing: 7) {
                                Text(plan.title).font(.headline).foregroundStyle(.primary)
                                Text(plan.goal).font(.subheadline).foregroundStyle(.secondary)
                                Text("\(plan.startDate)〜\(plan.endDate) · 1日 \(plan.dailyMinutes) 分")
                                    .font(.caption).foregroundStyle(.secondary)
                                Text(plan.statusLabel).font(.caption.bold()).foregroundStyle(PhoneStyle.accent)
                                if let content = plan.content {
                                    Text("練習 \(plan.completedCount(in: model.state.attempts)) / \(content.schedule.count) 件")
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }.buttonStyle(.plain)
                }
                if let message = model.message { Text(message).font(.caption).foregroundStyle(.secondary) }
            }.padding(16).frame(maxWidth: 700)
        }
        .frame(maxWidth: .infinity).background(PhoneStyle.canvas)
        .navigationTitle("練習計画")
        .refreshable { await model.sync() }
        .sheet(isPresented: $creating) { PracticePlanForm(model: model) }
    }
}

struct PracticePlanForm: View {
    @Bindable var model: AppModel
    let original: PracticePlan?
    @Environment(\.dismiss) private var dismiss
    @State private var requestID: String
    @State private var title: String
    @State private var goal: String
    @State private var currentSituation: String
    @State private var startDate: Date
    @State private var endDate: Date
    @State private var dailyMinutes: Int
    @State private var jobID: String
    @State private var interviewID: String
    @State private var sourceAttemptIDs: Set<String>
    @State private var saving = false
    @State private var error: String?

    init(model: AppModel, original: PracticePlan? = nil, sourceInterviewID: String = "") {
        self.model = model; self.original = original
        let interview = model.state.interviews?.first { $0.id == sourceInterviewID }
        _requestID = State(initialValue: original?.id ?? UUID().uuidString)
        _title = State(initialValue: original?.title ?? "")
        _goal = State(initialValue: original?.goal ?? "")
        _currentSituation = State(initialValue: original?.currentSituation ?? "")
        let format = Self.format
        _startDate = State(initialValue: original.flatMap { format.date(from: $0.startDate) } ?? Date())
        _endDate = State(initialValue: original.flatMap { format.date(from: $0.endDate) } ?? Calendar.current.date(byAdding: .month, value: 1, to: Date()) ?? Date())
        _dailyMinutes = State(initialValue: original?.dailyMinutes ?? 20)
        _jobID = State(initialValue: original?.jobId ?? interview?.jobId ?? "")
        _interviewID = State(initialValue: original?.interviewId ?? sourceInterviewID)
        _sourceAttemptIDs = State(initialValue: Set(original?.sourceAttemptIds ?? []))
    }

    private static var format: DateFormatter {
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(identifier: "Asia/Tokyo"); formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("達成したいこと") {
                    TextField("計画名（任意）", text: $title)
                    TextField("例：質問に結論から答え、具体例で説明できる", text: $goal, axis: .vertical)
                        .lineLimit(3...6)
                    TextField("現在困っていること（未評価でも構いません）", text: $currentSituation, axis: .vertical)
                        .lineLimit(3...6)
                }
                Section("期間と使える時間") {
                    DatePicker("開始日", selection: $startDate, displayedComponents: .date)
                        .environment(\.timeZone, TimeZone(identifier: "Asia/Tokyo")!)
                    DatePicker("終了日", selection: $endDate, displayedComponents: .date)
                        .environment(\.timeZone, TimeZone(identifier: "Asia/Tokyo")!)
                    Stepper("1日に使える時間：\(dailyMinutes) 分", value: $dailyMinutes, in: 5...180, step: 5)
                    Text("期間に合わせて能力別の練習と途中の確認を組み立てます。")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section("参考にする資料（任意）") {
                    Picker("会社・職種", selection: $jobID) {
                        Text("通用練習").tag("")
                        ForEach(model.state.jobs) { job in Text("\(job.company) · \(job.role)").tag(job.id) }
                    }
                    Picker("面接の記録", selection: $interviewID) {
                        Text("指定なし").tag("")
                        ForEach((model.state.interviews ?? []).filter { jobID.isEmpty || $0.jobId == jobID }) { interview in Text(interview.title).tag(interview.id) }
                    }
                    ForEach(Array(model.state.attempts.sorted { $0.createdAt > $1.createdAt }.prefix(8))) { attempt in
                        Toggle(isOn: Binding(get: { sourceAttemptIDs.contains(attempt.id) }, set: { selected in
                            if selected { sourceAttemptIDs.insert(attempt.id) } else { sourceAttemptIDs.remove(attempt.id) }
                        })) {
                            Text("\(String(attempt.createdAt.prefix(10))) · \(String(attempt.answer.prefix(60)))")
                                .font(.caption)
                        }
                    }
                }
                Section {
                    Text(original == nil ? "保存後、目標・現状・期間に合わせた計画の作成を依頼します。結果は同期後に表示されます。" : "条件を変更すると計画を作り直します。以前の計画と録音回答は保持します。")
                        .font(.caption).foregroundStyle(.secondary)
                    if let error { Text(error).foregroundStyle(.red) }
                    Button(original == nil ? "保存して計画作成を依頼" : "変更して計画を作り直す") { save() }
                        .disabled(saving || goal.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || Self.format.string(from: endDate) < Self.format.string(from: startDate))
                    if saving { ProgressView("保存中…") }
                }
            }
            .navigationTitle(original == nil ? "練習計画を作る" : "目標・期間を変更")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("閉じる") { dismiss() }.disabled(saving) } }
            .onChange(of: jobID) { _, _ in
                if !(model.state.interviews ?? []).contains(where: { $0.id == interviewID && (jobID.isEmpty || $0.jobId == jobID) }) { interviewID = "" }
            }
        }.interactiveDismissDisabled(saving)
    }

    private func save() {
        saving = true
        let goal = goal.trimmingCharacters(in: .whitespacesAndNewlines)
        let situation = currentSituation.trimmingCharacters(in: .whitespacesAndNewlines)
        let input = PracticePlanInput(title: title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? String(goal.prefix(60)) : title,
                                      goal: goal, currentSituation: situation.isEmpty ? "未評価。初回の回答から確認してください。" : situation,
                                      startDate: Self.format.string(from: startDate), endDate: Self.format.string(from: endDate),
                                      dailyMinutes: dailyMinutes, jobId: jobID, interviewId: interviewID, sourceAttemptIds: sourceAttemptIDs.sorted())
        Task {
            defer { saving = false }
            do { try await model.savePracticePlanRequest(id: requestID, input: input, revision: original?.revision); dismiss() }
            catch { self.error = error.localizedDescription }
        }
    }
}

struct PracticePlanDetailView: View {
    @Bindable var model: AppModel
    let id: String
    @State private var selectedTab = 0
    @State private var editing: PracticePlan?
    @State private var confirmingCompletion = false
    @State private var working = false
    @State private var notice: String?
    @State private var error: String?

    private var plan: PracticePlan? { model.state.practicePlans?.first { $0.id == id } }
    private var today: String {
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = TimeZone(identifier: "Asia/Tokyo"); formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                if let plan {
                    overview(plan)
                    if plan.content != nil {
                        Picker("計画の表示", selection: $selectedTab) {
                            Text("練習").tag(0); Text("能力・目標").tag(1); Text("振り返り").tag(2)
                        }.pickerStyle(.segmented)
                        if selectedTab == 0 { schedule(plan) }
                        else if selectedTab == 1 { skills(plan) }
                        else { checkpoints(plan) }
                    } else {
                        PhoneCard {
                            VStack(alignment: .leading, spacing: 10) {
                                Text("計画の作成待ち").font(.headline)
                                Text("目標・現状・期間から、能力と練習の組み合わせを準備しています。作成依頼だけでは練習の完了にはなりません。")
                                    .font(.subheadline).foregroundStyle(.secondary)
                                Button("計画作成を依頼・再開") { request() }.disabled(working)
                            }
                        }
                    }
                } else { Text("計画を同期してください。") }
                if working { ProgressView() }
                if let notice { Text(notice).font(.caption).foregroundStyle(PhoneStyle.accent) }
                if let error { Text(error).font(.footnote).foregroundStyle(.red) }
            }.padding(16).frame(maxWidth: 720)
        }
        .frame(maxWidth: .infinity).background(PhoneStyle.canvas)
        .navigationTitle("練習計画").navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.sync() }
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Menu {
                    Button("同期") { Task { await model.sync() } }
                    if let plan {
                        Button("目標・期間を変更") { editing = plan }
                        if plan.content != nil {
                            Button("計画の調整を依頼") { request() }
                            Button(plan.status == "active" ? "休止する" : "練習を再開する") { changeStatus(plan.status == "active" ? "paused" : "active") }
                            if plan.status != "completed" { Button("目標の達成を確認して完了") { confirmingCompletion = true } }
                        }
                    }
                } label: { Image(systemName: "ellipsis.circle") }
                .disabled(working)
            }
        }
        .sheet(item: $editing) { PracticePlanForm(model: model, original: $0) }
        .confirmationDialog("目標を達成したことを確認しましたか？", isPresented: $confirmingCompletion, titleVisibility: .visible) {
            Button("達成を確認して完了する") { changeStatus("completed") }
            Button("キャンセル", role: .cancel) {}
        } message: { Text("練習回数や期間の終了だけでは目標達成にはなりません。回答と振り返りを確認して判断してください。") }
    }

    private func overview(_ plan: PracticePlan) -> some View {
        PhoneCard {
            VStack(alignment: .leading, spacing: 10) {
                Text(plan.title).font(.title2.bold())
                RichContent(text: plan.goal)
                Text("\(plan.startDate)〜\(plan.endDate) · 1日 \(plan.dailyMinutes) 分 · v\(plan.revision)")
                    .font(.caption).foregroundStyle(.secondary)
                Text(plan.statusLabel).font(.caption.bold()).foregroundStyle(PhoneStyle.accent)
                if let content = plan.content {
                    let complete = plan.completedCount(in: model.state.attempts)
                    ProgressView(value: Double(complete), total: Double(max(1, content.schedule.count)))
                    Text("実施した練習：\(complete) / \(content.schedule.count) 件。目標の達成状況は振り返りで確認します。")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }

    @ViewBuilder private func schedule(_ plan: PracticePlan) -> some View {
        let items = (plan.content?.schedule ?? []).sorted { ($0.date, $0.id) < ($1.date, $1.id) }
        let overdue = items.filter { $0.date < today && plan.attempts(for: $0, in: model.state.attempts).count < $0.targetAttempts }
        if !overdue.isEmpty {
            Text("未実施の練習が \(overdue.count) 件あります。無理に詰め込まず、必要なら計画の調整を依頼できます。")
                .font(.caption).foregroundStyle(.secondary)
        }
        ForEach(items) { item in
            if let exercise = plan.content?.exercises.first(where: { $0.id == item.exerciseId }) {
                PracticePlanExerciseCard(model: model, plan: plan, exercise: exercise, item: item, isToday: item.date == today)
            }
        }
    }

    @ViewBuilder private func skills(_ plan: PracticePlan) -> some View {
        if let content = plan.content {
            PhoneCard {
                VStack(alignment: .leading, spacing: 10) {
                    Text("現在の状態").font(.headline); RichContent(text: content.baselineAnalysis)
                    Text("目標の確認方法").font(.headline); RichContent(text: content.successCriteria)
                }
            }
            ForEach(content.skills.sorted { $0.priority < $1.priority }) { skill in
                PhoneCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("\(skill.title) · 優先度 \(skill.priority)").font(.headline)
                        Text("現在").font(.caption.bold()); RichContent(text: skill.baseline)
                        Text("目指す状態").font(.caption.bold()); RichContent(text: skill.target)
                        ForEach(content.exercises.filter { $0.skillIds.contains(skill.id) }) { exercise in
                            Text("• \(exercise.title)").font(.subheadline)
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private func checkpoints(_ plan: PracticePlan) -> some View {
        ForEach((plan.content?.checkpoints ?? []).sorted { $0.date < $1.date }) { checkpoint in
            PhoneCard {
                VStack(alignment: .leading, spacing: 10) {
                    Text(checkpoint.title).font(.headline)
                    Text(checkpoint.date).font(.caption).foregroundStyle(.secondary)
                    RichContent(text: checkpoint.criteria)
                    Button("保存した回答から振り返る") { request(checkpoint.id) }.disabled(working)
                    let reviews = (model.state.practicePlanReviews ?? []).filter { $0.planId == id && $0.checkpointId == checkpoint.id }.sorted { $0.createdAt > $1.createdAt }
                    ForEach(reviews) { review in
                        Divider()
                        Text("計画 v\(review.planRevision) · \(String(review.createdAt.prefix(10)))").font(.caption).foregroundStyle(.secondary)
                        RichContent(text: review.summary)
                        ForEach(Array(review.assessments.enumerated()), id: \.offset) { _, assessment in
                            Text("\(plan.content?.skills.first(where: { $0.id == assessment.skillId })?.title ?? assessment.skillId)：\(assessment.outcomeLabel)")
                                .font(.subheadline.bold())
                            RichContent(text: assessment.notes)
                        }
                        Text("次に取り組むこと").font(.caption.bold())
                        RichContent(text: review.nextActions)
                    }
                }
            }
        }
    }

    private func request(_ checkpointID: String? = nil) {
        working = true; notice = nil; error = nil
        Task {
            defer { working = false }
            do {
                try await model.requestPracticePlanTask(id: id, checkpointID: checkpointID)
                notice = "依頼を保存しました。結果は完了後に同期して表示します。"
            } catch { self.error = error.localizedDescription }
        }
    }

    private func changeStatus(_ status: String) {
        guard let plan else { return }
        working = true; error = nil
        Task {
            defer { working = false }
            do { try await model.setPracticePlanStatus(id: id, revision: plan.revision, status: status) }
            catch { self.error = error.localizedDescription }
        }
    }
}

private struct PracticePlanExerciseCard: View {
    @Bindable var model: AppModel
    let plan: PracticePlan
    let exercise: PracticePlanExercise
    let item: PracticePlanSchedule
    let isToday: Bool

    var body: some View {
        let attempts = plan.attempts(for: item, in: model.state.attempts)
        let pending = model.pending.filter { $0.practiceContext?.planId == plan.id && $0.practiceContext?.scheduleId == item.id }
        PhoneCard {
            VStack(alignment: .leading, spacing: 10) {
                Text("\(item.date)\(isToday ? " · 今日" : "") · \(item.minutes) 分").font(.caption.bold()).foregroundStyle(PhoneStyle.accent)
                Text(exercise.title).font(.headline)
                RichContent(text: exercise.instructions)
                Text("保存済み \(attempts.count) / \(item.targetAttempts) 回\(pending.isEmpty ? "" : " · 同期待ち \(pending.count) 回")")
                    .font(.caption).foregroundStyle(.secondary)
                if let pack = (model.state.questionSets + BuiltinBank.packs).first(where: { $0.id == exercise.questionSetId }),
                   let question = pack.questions.first(where: { $0.id == exercise.questionId }) {
                    NavigationLink(attempts.isEmpty ? "録音して練習" : "改善点を確認してもう一度練習",
                                   value: AppRoute.plannedAnswer(packID: pack.id, questionID: question.id,
                                     context: PracticeContext(planId: plan.id, planRevision: plan.revision, exerciseId: exercise.id, scheduleId: item.id, keywords: "")))
                        .disabled(plan.status != "active")
                } else { Text("関連する練習題を同期してください。") }
                ForEach(attempts) { attempt in
                    DisclosureGroup("\(String(attempt.createdAt.prefix(10))) · \(attempt.durationSeconds ?? 0) 秒") {
                        VStack(alignment: .leading, spacing: 10) {
                            if let keywords = attempt.practiceContext?.keywords, !keywords.isEmpty { Text("構思：\(keywords)").font(.caption) }
                            RichContent(text: attempt.answer)
                            ForEach(model.state.reviews.filter { $0.attemptId == attempt.id }) { review in
                                Text("改善のヒント").font(.caption.bold())
                                RichContent(text: review.summary)
                                if let next = review.nextPractice { RichContent(text: next) }
                            }
                        }.padding(.top, 8)
                    }
                }
            }
        }
    }
}
