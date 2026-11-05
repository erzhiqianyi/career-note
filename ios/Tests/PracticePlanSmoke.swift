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
        let pending = PendingAttempt(id: "offline", questionSetId: "builtin-basics", questionId: "self-intro", answer: "未同期の回答", language: "日语",
                                     durationSeconds: 30, requestReview: true, createdAt: Date(), hasRecording: true, practiceContext: context)
        let review = PracticePlanReview(id: "review", planId: plan.id, planRevision: 2, checkpointId: "final", summary: "改善を確認", nextActions: "別の題で練習", sourceNotes: "Fixture",
                                       assessments: [.init(skillId: "clarity", outcome: "developing", evidenceAttemptIds: [first.id], notes: "練習を続ける")], createdAt: "2026-11-05T04:00:00Z")
        var state = CareerState()
        state.practicePlans = [plan]; state.practicePlanReviews = [review]; state.attempts = [first]
        try LocalStore.save(LocalSnapshot(state: state, pending: [pending], lastUpdated: Date()), uid: "fixture-user", in: directory)
        let loaded = try LocalStore.load(uid: "fixture-user", in: directory)
        precondition(loaded?.state.practicePlans?.first?.endDate == "2027-02-01")
        precondition(loaded?.state.practicePlans?.first?.content?.skills[0].target == "一文で答える")
        precondition(loaded?.state.practicePlanReviews?.first?.assessments[0].evidenceAttemptIds == [first.id])
        precondition(loaded?.pending.first?.practiceContext?.planRevision == 2)
        precondition(loaded?.pending.first?.practiceContext?.keywords == "結論・理由・例")
        precondition(loaded?.state.attempts.first?.practiceContext?.planId == plan.id)
        let other = try LocalStore.load(uid: "other-user", in: directory)
        precondition(other == nil)
        print("Practice plan cache, goal period, evidence, progress isolation and offline answer context passed")
    }
}
