import AVFoundation
import Observation
import SwiftUI
import UniformTypeIdentifiers

struct InterviewListView: View {
    @Bindable var model: AppModel
    @State private var importing = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 16) {
                PhoneCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("全体把握 → 振り返り → 練習").font(.headline)
                        Text("録音と転写から面接の流れを整理し、改善したい回答を練習できます。")
                            .font(.subheadline).foregroundStyle(.secondary)
                        Button { importing = true } label: { Label("面接の録音を取り込む", systemImage: "square.and.arrow.down") }
                            .buttonStyle(.borderedProminent)
                    }
                }
                ForEach(model.pendingInterviews) { draft in
                    PhoneCard {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(draft.title).font(.headline)
                            Label("端末に保存済み・アップロード待ち", systemImage: "arrow.triangle.2.circlepath")
                                .font(.caption).foregroundStyle(.secondary)
                            if let progress = model.interviewUploadProgress { ProgressView(value: progress) }
                            Button("アップロードを再開") { Task { await model.sync() } }.disabled(model.busy)
                        }
                    }
                }
                if let message = model.message { Text(message).font(.caption).foregroundStyle(.secondary) }
                ForEach(model.state.interviews ?? []) { interview in
                    NavigationLink(value: AppRoute.interview(interview.id)) {
                        PhoneCard {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(interview.title).font(.headline).foregroundStyle(.primary)
                                Text("\(interview.date) · \(InterviewPlayer.time(interview.durationSeconds)) · \(interview.statusLabel)")
                                    .font(.caption).foregroundStyle(.secondary)
                                Text("問答 \(interview.exchangeCount ?? 0) · 練習 \(interview.practiceCount ?? 0)")
                                    .font(.caption).foregroundStyle(PhoneStyle.accent)
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }.buttonStyle(.plain)
                }
            }.padding(16).frame(maxWidth: 680)
        }
        .frame(maxWidth: .infinity).background(PhoneStyle.canvas)
        .navigationTitle("面接の振り返り")
        .refreshable { await model.sync() }
        .sheet(isPresented: $importing) { InterviewImportView(model: model) }
    }
}

private struct InterviewImportView: View {
    @Bindable var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var jobID = ""
    @State private var date = Date()
    @State private var audio: URL?
    @State private var duration = 0.0
    @State private var fileSize = 0
    @State private var transcriptText: String?
    @State private var transcriptName = ""
    @State private var choosingAudio = false
    @State private var choosingTranscript = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("面接の記録") {
                    TextField("タイトル", text: $title)
                    DatePicker("面接日", selection: $date, displayedComponents: .date)
                    Picker("会社・職種", selection: $jobID) {
                        Text("あとで確認・関連付けなし").tag("")
                        ForEach(model.state.jobs) { job in Text("\(job.company) · \(job.role)").tag(job.id) }
                    }
                }
                Section("録音") {
                    Button("ファイルから録音を選ぶ") { choosingAudio = true }
                    if let audio { Text(audio.lastPathComponent); Text(InterviewPlayer.time(duration)).foregroundStyle(.secondary) }
                    Text("M4A・MP3・WAV など。最大 256 MB／8 時間。ファイル名から会社を推測しません。")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Section("転写（任意）") {
                    Button("TXT／SRT を選ぶ") { choosingTranscript = true }
                    if transcriptText != nil {
                        Text(transcriptName)
                        Button("転写を外す", role: .destructive) { transcriptText = nil; transcriptName = "" }
                    }
                    Text("転写がなくても取り込めます。全体把握、区間分け、振り返りと練習の準備は、取り込み後に順番に行います。")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if let error { Section { Text(error).foregroundStyle(.red) } }
                Section {
                    Button("保存して分析を依頼") { save() }
                        .disabled(audio == nil || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || busy)
                    if busy { ProgressView("録音を確認中…") }
                }
            }
            .navigationTitle("面接を取り込む")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("閉じる") { dismiss() }.disabled(busy) } }
            .fileImporter(isPresented: $choosingAudio, allowedContentTypes: [.audio]) { result in
                Task { await selectAudio(result) }
            }
            .fileImporter(isPresented: $choosingTranscript, allowedContentTypes: [.plainText, UTType(filenameExtension: "srt") ?? .text]) { result in
                do {
                    let url = try result.get()
                    let scoped = url.startAccessingSecurityScopedResource()
                    defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                    let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
                    guard size <= 700_000 else { throw InterviewStore.failure("転写は 700 KB 以内にしてください。") }
                    transcriptText = try String(contentsOf: url, encoding: .utf8)
                    transcriptName = url.lastPathComponent
                    error = nil
                } catch { self.error = error.localizedDescription }
            }
        }.interactiveDismissDisabled(busy)
    }

    private func selectAudio(_ result: Result<URL, Error>) async {
        busy = true
        defer { busy = false }
        do {
            let url = try result.get()
            let scoped = url.startAccessingSecurityScopedResource()
            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
            let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard size > 0, size <= InterviewStore.maxAudioBytes else { throw InterviewStore.failure("録音は空でなく、256 MB 以内にしてください。") }
            let asset = AVURLAsset(url: url)
            let seconds = try await asset.load(.duration).seconds
            guard seconds.isFinite, seconds > 0, seconds <= 8 * 3600 else { throw InterviewStore.failure("録音の長さを確認できません。8 時間以内の音声を選んでください。") }
            audio = url; duration = seconds; fileSize = size
            if title.isEmpty { title = url.deletingPathExtension().lastPathComponent }
            error = nil
        } catch { self.error = error.localizedDescription; audio = nil }
    }

    private func save() {
        guard let audio else { return }
        do {
            let scoped = audio.startAccessingSecurityScopedResource()
            defer { if scoped { audio.stopAccessingSecurityScopedResource() } }
            let transcript = try transcriptText.map { try InterviewTranscriptParser.parse($0, name: transcriptName, duration: duration) }
            let format = DateFormatter(); format.calendar = Calendar(identifier: .gregorian)
            format.timeZone = TimeZone(identifier: "Asia/Tokyo"); format.dateFormat = "yyyy-MM-dd"
            let ext = audio.pathExtension.lowercased()
            let mime = ["mp3": "audio/mpeg", "wav": "audio/wav", "ogg": "audio/ogg", "webm": "audio/webm", "m4a": "audio/mp4", "mp4": "audio/mp4"][ext]
            guard let mime else { throw InterviewStore.failure("M4A・MP3・WAV・OGG・WebM を選んでください。") }
            let draft = InterviewDraft(id: UUID().uuidString, title: title.trimmingCharacters(in: .whitespacesAndNewlines), jobId: jobID,
                                       date: format.string(from: date), durationSeconds: duration, fileName: audio.lastPathComponent,
                                       contentType: mime, size: fileSize, transcript: transcript)
            try model.stageInterview(draft, source: audio)
            dismiss()
        } catch { self.error = error.localizedDescription }
    }
}

@MainActor @Observable
final class InterviewPlayer {
    private(set) var position = 0.0
    private(set) var duration = 0.0
    private(set) var playing = false
    private(set) var ready = false
    var speed: Float = 1 { didSet { if playing { player?.rate = speed } } }
    @ObservationIgnored private var player: AVAudioPlayer?
    @ObservationIgnored private var timer: Timer?
    @ObservationIgnored private var stopAt: Double?
    @ObservationIgnored private var url: URL?

    func load(_ url: URL) throws {
        guard self.url != url else { return }
        stop()
        player = try AVAudioPlayer(contentsOf: url)
        player?.enableRate = true
        player?.prepareToPlay()
        self.url = url; duration = player?.duration ?? 0; ready = true
    }
    func play(_ range: InterviewRange? = nil) throws {
        guard let player else { return }
        try AVAudioSession.sharedInstance().setCategory(.playback)
        try AVAudioSession.sharedInstance().setActive(true)
        if let range { seek(range.start); stopAt = range.end } else { stopAt = nil }
        if player.currentTime >= player.duration { player.currentTime = 0 }
        player.rate = speed
        guard player.play() else { throw InterviewStore.failure("録音を再生できませんでした。") }
        playing = true
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.15, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, let player = self.player else { return }
                self.position = player.currentTime
                if let end = self.stopAt, self.position >= end { self.pause() }
                else if !player.isPlaying { self.pause() }
            }
        }
    }
    func pause() { player?.pause(); playing = false; timer?.invalidate(); timer = nil }
    func seek(_ seconds: Double) { position = min(duration, max(0, seconds)); player?.currentTime = position }
    func stop() { pause(); player = nil; url = nil; ready = false; position = 0; duration = 0 }
    static func time(_ seconds: Double) -> String {
        let n = max(0, Int(seconds.isFinite ? seconds : 0))
        return n >= 3600 ? String(format: "%d:%02d:%02d", n / 3600, n / 60 % 60, n % 60) : String(format: "%d:%02d", n / 60, n % 60)
    }
}

struct InterviewDetailView: View {
    @Bindable var model: AppModel
    let id: String
    @State private var document: InterviewDocument?
    @State private var player = InterviewPlayer()
    @State private var tab = 0
    @State private var error: String?
    @State private var working = false
    @State private var editor: InterviewEditor?
    @State private var cachedUserID: String?

    private enum InterviewEditor: Identifiable {
        case segment(InterviewSegment)
        case stage(InterviewStage)
        case exchange(InterviewExchange)
        case plan
        var id: String {
            switch self {
            case .segment(let item): "segment:" + item.id
            case .stage(let item): "stage:" + item.id
            case .exchange(let item): "exchange:" + item.id
            case .plan: "practice-plan"
            }
        }
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 18) {
                if let document {
                    Text(document.title).font(.title2.bold())
                    Text("\(document.date) · \(InterviewPlayer.time(document.durationSeconds)) · v\(document.revision)")
                        .font(.caption).foregroundStyle(.secondary)
                    playerCard(document)
                    Picker("表示", selection: $tab) {
                        Text("面接の流れ").tag(0); Text("振り返り").tag(1); Text("練習").tag(2); Text("転写").tag(3)
                    }.pickerStyle(.segmented)
                    if tab == 0 { flowContent(document) }
                    else if tab == 1 { reviewContent(document) }
                    else if tab == 2 { practiceContent(document) }
                    else { transcriptContent(document) }
                } else if working { ProgressView("面接を読み込み中…") }
                if let error { Text(error).font(.footnote).foregroundStyle(.red) }
            }.padding(16).frame(maxWidth: 720)
        }
        .frame(maxWidth: .infinity).background(PhoneStyle.canvas)
        .navigationTitle("面接の振り返り").navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button { Task { await reload() } } label: { Image(systemName: "arrow.clockwise") }.disabled(working)
                    .accessibilityLabel("面接を更新")
            }
        }
        .task(id: model.userID) { await reload() }
        .onDisappear { player.stop() }
        .sheet(item: $editor) { selected in
            switch selected {
            case .segment(let segment): InterviewSegmentEditor(segment: segment) { try await saveSegment($0) }
            case .stage(let stage): InterviewStageEditor(stage: stage) { try await saveStage($0) }
            case .exchange(let exchange): InterviewExchangeEditor(exchange: exchange) { try await saveExchange($0) }
            case .plan: PracticePlanForm(model: model, sourceInterviewID: id)
            }
        }
    }

    private func playerCard(_ document: InterviewDocument) -> some View {
        PhoneCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Button {
                        if player.playing { player.pause() } else { play(nil) }
                    } label: { Label(player.playing ? "一時停止" : "録音を再生", systemImage: player.playing ? "pause.fill" : "play.fill") }
                        .disabled(working || document.audio == nil)
                    Spacer()
                    Picker("再生速度", selection: $player.speed) {
                        Text("0.75×").tag(Float(0.75)); Text("1×").tag(Float(1)); Text("1.25×").tag(Float(1.25)); Text("1.5×").tag(Float(1.5))
                    }.pickerStyle(.menu)
                }
                if player.ready {
                    Slider(value: Binding(get: { player.position }, set: { player.seek($0) }), in: 0...max(1, player.duration))
                        .accessibilityLabel("録音の再生位置")
                    Text("\(InterviewPlayer.time(player.position)) / \(InterviewPlayer.time(player.duration))").font(.caption.monospacedDigit())
                } else {
                    Text("他の端末の録音は初回にダウンロードします。保存後はオフラインでも回聴できます。")
                        .font(.caption).foregroundStyle(.secondary)
                }
                if working { ProgressView() }
            }
        }
    }

    @ViewBuilder private func flowContent(_ document: InterviewDocument) -> some View {
        if let flow = document.flow {
            PhoneCard { RichContent(text: flow.overview) }
            ForEach(flow.stages) { stage in
                PhoneCard {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text(stage.title).font(.headline)
                            Spacer()
                            Button("修正") { editor = .stage(stage) }.font(.caption)
                        }
                        rangeButton(InterviewRange(start: stage.start, end: stage.end))
                        RichContent(text: stage.summary)
                        ForEach(flow.exchanges.filter { $0.stageId == stage.id }) { exchange in
                            Divider()
                            HStack(alignment: .top) {
                                Text(exchange.question).font(.subheadline.bold())
                                Spacer()
                                Button("修正") { editor = .exchange(exchange) }.font(.caption)
                            }
                            if exchange.needsConfirmation { Label("問答の区切り・内容を要確認", systemImage: "questionmark.circle").font(.caption) }
                            RichContent(text: exchange.answerSummary)
                            ForEach(Array(exchange.ranges.enumerated()), id: \.offset) { _, range in rangeButton(range) }
                        }
                    }
                }
            }
        } else { pendingCard("全体把握・フロー分析待ち", detail: "最初に面接全体を読み、実際の順番で環節と問答を整理します。") }
    }

    @ViewBuilder private func reviewContent(_ document: InterviewDocument) -> some View {
        if let review = document.review {
            PhoneCard {
                VStack(alignment: .leading, spacing: 10) {
                    RichContent(text: review.summary)
                    Text("良かった点").font(.headline); RichContent(text: review.strengths)
                    Text("会社・案件側の条件").font(.headline); RichContent(text: review.externalFactors)
                    Text("未確認の点").font(.headline); RichContent(text: review.uncertainties)
                }
            }
            ForEach(review.improvements) { improvement in
                PhoneCard {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(improvement.title).font(.headline)
                        RichContent(text: improvement.observation)
                        RichContent(text: improvement.suggestion)
                        ForEach(document.flow?.exchanges.filter { improvement.exchangeIds.contains($0.id) } ?? []) { exchange in
                            Text(exchange.question).font(.caption.bold())
                            ForEach(Array(exchange.ranges.enumerated()), id: \.offset) { _, range in rangeButton(range) }
                        }
                    }
                }
            }
        } else { pendingCard("振り返り待ち", detail: "面接全体の流れを整理してから、原回答に基づく改善点をまとめます。") }
    }

    @ViewBuilder private func practiceContent(_ document: InterviewDocument) -> some View {
        ForEach((model.state.practicePlans ?? []).filter { $0.interviewId == id }) { plan in
            NavigationLink(value: AppRoute.practicePlan(plan.id)) {
                PhoneCard {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("日程に沿って練習", systemImage: "calendar")
                            .font(.caption).foregroundStyle(PhoneStyle.accent)
                        Text(plan.title).font(.headline)
                        Text("\(plan.startDate) – \(plan.endDate) · \(plan.dailyMinutes) 分 / 日")
                            .font(.caption).foregroundStyle(.secondary)
                        Text("文法・文の組み立て・動詞の練習も、文字または録音で回答できます。")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }.buttonStyle(.plain)
        }
        Button { editor = .plan } label: { Label("この面接から練習計画を作る", systemImage: "target") }
        if let links = document.practice, !links.isEmpty {
            ForEach(Array(links.enumerated()), id: \.offset) { _, link in
                PhoneCard {
                    VStack(alignment: .leading, spacing: 10) {
                        if let pack = model.state.questionSets.first(where: { $0.id == link.questionSetId }),
                           let question = pack.questions.first(where: { $0.id == link.questionId }) {
                            Text(question.title).font(.headline)
                            Text(CareerRichText.plain(question.questionJa)).font(.subheadline)
                            ForEach(document.review?.improvements.filter { link.improvementIds.contains($0.id) } ?? []) { improvement in
                                RichContent(text: improvement.suggestion)
                            }
                            ForEach(document.flow?.exchanges.filter { link.exchangeIds.contains($0.id) } ?? []) { exchange in
                                ForEach(Array(exchange.ranges.enumerated()), id: \.offset) { _, range in rangeButton(range) }
                            }
                            NavigationLink("この質問を録音して練習", value: AppRoute.answer(packID: pack.id, questionID: question.id))
                            let attempts = model.state.attempts.filter { $0.questionSetId == pack.id && $0.questionId == question.id }
                            Text("練習 \(attempts.count) 回 · 原回答は上の録音から回聴できます")
                                .font(.caption).foregroundStyle(.secondary)
                        } else { Text("関連する練習題を同期してください。") }
                    }
                }
            }
        } else { pendingCard("練習の準備待ち", detail: "振り返りから優先する改善点を選び、元の問答に関連する練習を用意します。") }
    }

    @ViewBuilder private func transcriptContent(_ document: InterviewDocument) -> some View {
        if let transcript = document.transcript {
            Text("話者・用語・数字には認識誤りが含まれます。修正前の転写は保持されます。")
                .font(.caption).foregroundStyle(.secondary)
            if transcript.segments.isEmpty {
                PhoneCard { RichContent(text: transcript.originalText) }
            }
            ForEach(transcript.segments) { segment in
                PhoneCard {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text(segment.speakerLabel).font(.caption.bold())
                            if !segment.confirmed { Text("未校正").font(.caption).foregroundStyle(.secondary) }
                            Spacer()
                            Button("修正") { editor = .segment(segment) }
                        }
                        Button { play(InterviewRange(start: segment.start, end: segment.end)) } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                Text(InterviewPlayer.time(segment.start)).font(.caption.monospacedDigit()).foregroundStyle(PhoneStyle.accent)
                                Text(segment.text).foregroundStyle(.primary).multilineTextAlignment(.leading)
                            }.frame(maxWidth: .infinity, alignment: .leading)
                        }.buttonStyle(.plain)
                    }
                }
            }
        } else {
            PhoneCard {
                VStack(alignment: .leading, spacing: 12) {
                    Text("Cloudflare で転写").font(.headline)
                    Text("録音を30秒ずつ送信して時間付きの転写を作成します。完了するまでアプリを開いてください。中断後は認識済みの区間から再開できます。")
                        .font(.caption).foregroundStyle(.secondary)
                    if let progress = model.interviewUploadProgress { ProgressView(value: progress) }
                    Button("転写を開始・再開") {
                        guard let uid = model.userID else { return }
                        working = true
                        Task {
                            defer { working = false }
                            do { self.document = try await model.transcribeInterview(document, uid: uid); error = nil }
                            catch { self.error = error.localizedDescription }
                        }
                    }.disabled(working || document.audio == nil)
                }
            }
        }
    }

    private func pendingCard(_ title: String, detail: String) -> some View {
        PhoneCard {
            VStack(alignment: .leading, spacing: 10) {
                Text(title).font(.headline)
                Text(detail).font(.subheadline).foregroundStyle(.secondary)
                Text("分析を依頼すると、全体把握から順番に処理します。結果は完了後の同期で表示されます。")
                    .font(.caption).foregroundStyle(.secondary)
                Button("分析を依頼・再開") {
                    guard let uid = model.userID else { return }
                    Task {
                        do { try await model.requestInterviewAnalysis(id: id, uid: uid); error = nil }
                        catch { self.error = error.localizedDescription }
                    }
                }.disabled(working)
            }
        }
    }

    private func rangeButton(_ range: InterviewRange) -> some View {
        Button { play(range) } label: {
            Label("\(InterviewPlayer.time(range.start))–\(InterviewPlayer.time(range.end)) を回聴", systemImage: "play.circle")
        }.font(.caption).disabled(working)
    }

    private func reload() async {
        guard let uid = model.userID else { return }
        if cachedUserID != uid {
            document = nil; player.stop(); error = nil; editor = nil; cachedUserID = uid
        }
        if document == nil { document = try? InterviewStore.cached(uid: uid, id: id) }
        working = true
        defer { working = false }
        do {
            let loaded = try await model.loadInterview(id: id, uid: uid)
            guard model.userID == uid else { return }
            document = loaded; error = nil
        } catch {
            guard model.userID == uid else { return }
            self.error = document == nil ? error.localizedDescription : "オフラインの保存済み記録を表示しています。\(error.localizedDescription)"
        }
    }

    private func play(_ range: InterviewRange?) {
        guard let uid = model.userID else { return }
        working = true
        Task {
            defer { working = false }
            do {
                let url = try await model.downloadInterviewAudio(id: id, uid: uid)
                guard model.userID == uid else { return }
                try player.load(url); try player.play(range); error = nil
            } catch { self.error = error.localizedDescription }
        }
    }

    private func saveSegment(_ segment: InterviewSegment) async throws {
        guard let document, let uid = model.userID, var transcript = document.transcript,
              let index = transcript.segments.firstIndex(where: { $0.id == segment.id }) else { return }
        transcript.segments[index] = segment
        self.document = try await model.saveInterviewTranscript(id: id, revision: document.revision, transcript: transcript, uid: uid)
        try await model.requestInterviewAnalysis(id: id, uid: uid)
    }

    private func saveStage(_ stage: InterviewStage) async throws {
        guard let document, let uid = model.userID, var flow = document.flow,
              let index = flow.stages.firstIndex(where: { $0.id == stage.id }) else { return }
        flow.stages[index] = stage
        self.document = try await model.saveInterviewStage(id: id, revision: document.revision, stage: "flow", value: flow, uid: uid)
        try await model.requestInterviewAnalysis(id: id, uid: uid)
    }

    private func saveExchange(_ exchange: InterviewExchange) async throws {
        guard let document, let uid = model.userID, var flow = document.flow,
              let index = flow.exchanges.firstIndex(where: { $0.id == exchange.id }) else { return }
        flow.exchanges[index] = exchange
        self.document = try await model.saveInterviewStage(id: id, revision: document.revision, stage: "flow", value: flow, uid: uid)
        try await model.requestInterviewAnalysis(id: id, uid: uid)
    }
}

private struct InterviewStageEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State var stage: InterviewStage
    let save: (InterviewStage) async throws -> Void
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                TextField("環節名", text: $stage.title)
                TextField("開始（秒）", value: $stage.start, format: .number).keyboardType(.decimalPad)
                TextField("終了（秒）", value: $stage.end, format: .number).keyboardType(.decimalPad)
                Section("要約") { TextEditor(text: $stage.summary).frame(minHeight: 140) }
                Section {
                    Text("問答の範囲を含む時刻にしてください。変更すると振り返りと練習の関連付けを再分析します。")
                        .font(.caption).foregroundStyle(.secondary)
                    if let error { Text(error).foregroundStyle(.red) }
                    Button("修正して再分析") {
                        busy = true
                        Task { do { try await save(stage); dismiss() } catch { self.error = error.localizedDescription }; busy = false }
                    }.disabled(busy || stage.title.isEmpty || stage.summary.isEmpty || stage.end <= stage.start)
                }
            }.navigationTitle("面接の区切りを修正")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("閉じる") { dismiss() }.disabled(busy) } }
        }.interactiveDismissDisabled(busy)
    }
}

private struct InterviewExchangeEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State var exchange: InterviewExchange
    let save: (InterviewExchange) async throws -> Void
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("質問") { TextEditor(text: $exchange.question).frame(minHeight: 70) }
                Section("原回答の要約") { TextEditor(text: $exchange.answerSummary).frame(minHeight: 100) }
                ForEach(exchange.ranges.indices, id: \.self) { index in
                    Section("録音範囲 \(index + 1)（秒）") {
                        TextField("開始", value: Binding(get: { exchange.ranges[index].start }, set: {
                            exchange.ranges[index] = InterviewRange(start: $0, end: exchange.ranges[index].end)
                        }), format: .number).keyboardType(.decimalPad)
                        TextField("終了", value: Binding(get: { exchange.ranges[index].end }, set: {
                            exchange.ranges[index] = InterviewRange(start: exchange.ranges[index].start, end: $0)
                        }), format: .number).keyboardType(.decimalPad)
                    }
                }
                Toggle("問答の内容・区切りを要確認", isOn: $exchange.needsConfirmation)
                Section {
                    Text("元の環節の範囲内で修正してください。振り返りと練習の関連付けは再分析します。")
                        .font(.caption).foregroundStyle(.secondary)
                    if let error { Text(error).foregroundStyle(.red) }
                    Button("修正して再分析") {
                        busy = true
                        Task { do { try await save(exchange); dismiss() } catch { self.error = error.localizedDescription }; busy = false }
                    }.disabled(busy || exchange.question.isEmpty || exchange.answerSummary.isEmpty || exchange.ranges.contains { $0.end <= $0.start })
                }
            }.navigationTitle("問答を修正")
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("閉じる") { dismiss() }.disabled(busy) } }
        }.interactiveDismissDisabled(busy)
    }
}

private struct InterviewSegmentEditor: View {
    @Environment(\.dismiss) private var dismiss
    @State var segment: InterviewSegment
    let save: (InterviewSegment) async throws -> Void
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("話者") {
                    Picker("話者", selection: $segment.speaker) {
                        Text("未確認").tag("unknown"); Text("本人").tag("candidate")
                        Text("面接官").tag("interviewer"); Text("その他").tag("other")
                    }
                    Toggle("音声と照合済み", isOn: $segment.confirmed)
                }
                Section("転写") { TextEditor(text: $segment.text).frame(minHeight: 180) }
                Section {
                    Text("修正前の版を保持します。修正後は面接の流れ・振り返り・練習の関連付けを再分析します。既に録音した練習回答は残ります。")
                        .font(.caption).foregroundStyle(.secondary)
                    if let error { Text(error).foregroundStyle(.red) }
                    Button("修正して再分析") {
                        busy = true
                        Task {
                            do { try await save(segment); dismiss() }
                            catch { self.error = error.localizedDescription }
                            busy = false
                        }
                    }.disabled(busy || segment.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .navigationTitle("転写を修正")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("閉じる") { dismiss() }.disabled(busy) } }
        }.interactiveDismissDisabled(busy)
    }
}
