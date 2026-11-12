import Foundation

@main struct PracticePlanSmoke {
    static func main() throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: directory) }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let content = PracticePlanContent(baselineAnalysis: "未評価", successCriteria: "結論から答える", sourceNotes: "Fictional fixture",
            skills: [PracticePlanSkill(id: "clarity", title: "明確に答える", baseline: "未評価", target: "一文で答える", priority: 1)],
            exercises: [PracticePlanExercise(id: "exercise", title: "短く説明", skillIds: ["clarity"], instructions: "考える→録音→改善→再録音", questionSetId: "builtin-basics", questionId: "self-intro")],
            schedule: [PracticePlanSchedule(id: "session", date: "2026-11-05", exerciseId: "exercise", minutes: 15, targetAttempts: 2)],
            checkpoints: [PracticePlanCheckpoint(id: "final", date: "2027-02-01", title: "確認", criteria: "初回と比較")])
        let plan = PracticePlan(id: "fixture-plan", revision: 2, title: "Fictional plan", goal: "わかりやすく話す", currentSituation: "未評価",
                                startDate: "2026-11-05", endDate: "2027-02-01", dailyMinutes: 20, jobId: "", interviewId: "", sourceAttemptIds: [],
                                status: "active", content: content, updatedAt: "2026-11-05T00:00:00Z")
        let context = PracticeContext(planId: plan.id, planRevision: 2, exerciseId: "exercise", scheduleId: "session", keywords: "結論・理由・例")
        let first = SavedAttempt(id: "first", questionSetId: "builtin-basics", questionId: "self-intro", answer: "架空の最初の回答", language: "日语", createdAt: "2026-11-05T01:00:00Z", durationSeconds: 30, audio: nil, practiceContext: context)
        let second = SavedAttempt(id: "second", questionSetId: "builtin-basics", questionId: "self-intro", answer: "架空の改善後の回答", language: "日语", createdAt: "2026-11-05T02:00:00Z", durationSeconds: 25, audio: nil, practiceContext: context)
        let unrelated = SavedAttempt(id: "other", questionSetId: "builtin-basics", questionId: "self-intro", answer: "通常練習", language: "日语", createdAt: "2026-11-05T03:00:00Z", durationSeconds: 30, audio: nil)
        precondition(plan.completedCount(in: [first, unrelated]) == 0)
        precondition(plan.completedCount(in: [first, second, unrelated]) == 1)
        precondition(plan.attempts(for: content.schedule[0], in: [first, unrelated]).count == 1)
        var sentence = first
        sentence.agentPractice = AgentPractice(stage: "sentence", sessionId: "agent-session", sentenceIndex: 1,
            feedback: "具体例を一つ追加する", nextStep: "次は担当業務を説明する", source: "Current learner message fixture")
        precondition(plan.completedCount(in: [sentence, second]) == 0)
        precondition(plan.attempts(for: content.schedule[0], in: [sentence, first, second]).count == 2)
        precondition(plan.agentPrompt(scheduleID: "session").contains("career_save_practice_turn"))
        let pending = PendingAttempt(id: "offline", questionSetId: "builtin-basics", questionId: "self-intro", answer: "未同期の回答", language: "日语",
                                     durationSeconds: 30, requestReview: true, createdAt: Date(), hasRecording: true, practiceContext: context)
        let written = PendingAttempt(id: "written", questionSetId: "builtin-basics", questionId: "self-intro", answer: "昨日、図書館で本を読みました。", language: "日语",
                                     durationSeconds: 0, requestReview: true, createdAt: Date(), hasRecording: false, practiceContext: context)
        let review = PracticePlanReview(id: "review", planId: plan.id, planRevision: 2, checkpointId: "final", summary: "改善を確認", nextActions: "別の題で練習", sourceNotes: "Fixture",
                                       assessments: [.init(skillId: "clarity", outcome: "developing", evidenceAttemptIds: [first.id], notes: "練習を続ける")], createdAt: "2026-11-05T04:00:00Z")
        var state = CareerState()
        state.questionSets = try JSONDecoder().decode([QuestionSet].self, from: Data(#"""
        [{"id":"builtin-basics","jobId":"builtin:general","title":"Fixture topics","questions":[
          {"id":"self-intro","title":"Intro","questionJa":"Intro","category":"先练必答"},
          {"id":"language","title":"Language","questionJa":"Language","category":"日语表达基础"},
          {"id":"fair","title":"Fair","questionJa":"Fair","category":"フェア基本練習"},
          {"id":"fair-full","title":"Fair mock","questionJa":"Fair mock","category":"総合練習"},
          {"id":"review","title":"Review","questionJa":"Review","category":"面试复盘专项"}]}]
        """#.utf8))
        for topic in PracticeTopic.allCases { precondition(topic.questionCount(in: state) == (topic == .fair ? 2 : 1)) }
        let searchable = try JSONDecoder().decode(CareerQuestion.self, from: Data(#"""
        {"id":"search-fixture","questionNumber":72,"title":"入职准备","questionJa":"{入社|にゅうしゃ}までに、{技術|ぎじゅつ}を{勉強|べんきょう}します。","meaning":"入职前提前学习技术","category":"逆質問"}
        """#.utf8))
        precondition(searchable.matchesListSearch("入社までに"))
        precondition(searchable.matchesListSearch("にゅうしゃまでに"))
        precondition(searchable.matchesListSearch(" q72 "))
        precondition(searchable.matchesListSearch("提前学习"))
        precondition(!searchable.matchesListSearch("does-not-exist"))
        var planJSON = try JSONSerialization.jsonObject(with: JSONEncoder().encode(plan)) as! [String: Any]
        planJSON["interviewId"] = "source-interview"
        let sourcePlan = try JSONDecoder().decode(PracticePlan.self, from: JSONSerialization.data(withJSONObject: planJSON))
        precondition(!sourcePlan.isCompanyPractice(in: state))
        planJSON["jobId"] = "company"
        let companyPlan = try JSONDecoder().decode(PracticePlan.self, from: JSONSerialization.data(withJSONObject: planJSON))
        precondition(companyPlan.isCompanyPractice(in: state))
        state.practicePlans = [sourcePlan]; state.practicePlanReviews = [review]; state.attempts = [sentence]
        try LocalStore.save(LocalSnapshot(state: state, pending: [pending, written], lastUpdated: Date()), uid: "fixture-user", in: directory)
        let loaded = try LocalStore.load(uid: "fixture-user", in: directory)
        precondition(loaded?.state.practicePlans?.first?.endDate == "2027-02-01")
        precondition(loaded?.state.practicePlans?.first?.content?.skills[0].target == "一文で答える")
        precondition(loaded?.state.practicePlanReviews?.first?.assessments[0].evidenceAttemptIds == [first.id])
        precondition(loaded?.pending.first?.practiceContext?.planRevision == 2)
        precondition(loaded?.pending.first?.practiceContext?.keywords == "結論・理由・例")
        precondition(loaded?.pending.count == 2)
        precondition(loaded?.pending.last?.hasRecording == false)
        precondition(loaded?.pending.last?.durationSeconds == 0)
        precondition(loaded?.pending.last?.answer == written.answer)
        precondition(loaded?.pending.last?.practiceContext?.scheduleId == "session")
        precondition(loaded?.state.attempts.first?.practiceContext?.planId == plan.id)
        precondition(loaded?.state.attempts.first?.agentPractice?.stage == "sentence")
        precondition(loaded?.state.attempts.first?.agentPractice?.nextStep == "次は担当業務を説明する")
        let other = try LocalStore.load(uid: "other-user", in: directory)
        precondition(other == nil)
        print("Practice plan cache, goal period, evidence, progress isolation and offline answer context passed")
    }
}
