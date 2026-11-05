import Foundation

struct CareerState: Codable {
    var jobs: [CareerJob] = []
    var profile: CareerProfile?
    var resume: [CareerResumeEntry]?
    var today: String?
    var materials: [CareerMaterial] = []
    var reports: [CareerReport] = []
    var tasks: [CareerTask] = []
    var questionSets: [QuestionSet] = []
    var attempts: [SavedAttempt] = []
    var reviews: [AnswerReview] = []
    var interviews: [InterviewSummary]?
    var practicePlans: [PracticePlan]?
    var practicePlanReviews: [PracticePlanReview]?
}

struct InterviewSummary: Codable, Identifiable {
    let id: String
    let revision: Int
    let title: String
    let jobId: String
    let date: String
    let durationSeconds: Double
    let status: String
    let audio: InterviewAudio?
    let segmentCount: Int?
    let exchangeCount: Int?
    let practiceCount: Int?

    var statusLabel: String {
        switch status {
        case "transcript": "全体把握待ち"
        case "flow": "振り返り待ち"
        case "review": "練習の準備待ち"
        case "practice": "練習できます"
        default: "転写待ち"
        }
    }
}

struct InterviewAudio: Codable { let contentType: String; let size: Int; let fileName: String }
struct InterviewTranscript: Codable {
    let source: String
    let originalText: String
    var segments: [InterviewSegment]
}
struct InterviewSegment: Codable, Identifiable {
    let id: String
    let start: Double
    let end: Double
    var speaker: String
    var text: String
    var confirmed: Bool
    var speakerLabel: String {
        switch speaker {
        case "candidate": "本人"
        case "interviewer": "面接官"
        case "other": "その他"
        default: "話者未確認"
        }
    }
}
struct InterviewRange: Codable { let start: Double; let end: Double }
struct InterviewFlow: Codable {
    let overview: String
    let reviewedThroughSeconds: Double
    let sourceNotes: String
    var stages: [InterviewStage]
    var exchanges: [InterviewExchange]
}
struct InterviewStage: Codable, Identifiable {
    let id: String
    var title: String
    let kind: String
    var start: Double
    var end: Double
    var summary: String
}
struct InterviewExchange: Codable, Identifiable {
    let id: String
    var stageId: String
    var question: String
    var answerSummary: String
    var ranges: [InterviewRange]
    var needsConfirmation: Bool
}
struct InterviewReview: Codable {
    let summary: String
    let strengths: String
    let externalFactors: String
    let uncertainties: String
    let improvements: [InterviewImprovement]
}
struct InterviewImprovement: Codable, Identifiable {
    let id: String
    let title: String
    let exchangeIds: [String]
    let observation: String
    let suggestion: String
}
struct InterviewPracticeLink: Codable {
    let questionSetId: String
    let questionId: String
    let exchangeIds: [String]
    let improvementIds: [String]
}
struct InterviewDocument: Codable, Identifiable {
    let id: String
    let revision: Int
    let title: String
    let jobId: String
    let date: String
    let durationSeconds: Double
    let status: String
    let audio: InterviewAudio?
    var transcript: InterviewTranscript?
    let flow: InterviewFlow?
    let review: InterviewReview?
    let practice: [InterviewPracticeLink]?
}

struct InterviewDraft: Codable, Identifiable {
    let id: String
    let title: String
    let jobId: String
    let date: String
    let durationSeconds: Double
    let fileName: String
    let contentType: String
    let size: Int
    let transcript: InterviewTranscript?
}

struct CareerProfile: Codable {
    let summary: String?
    let targetRoles: String?
    let japanese: String?
    let skills: String?
    let experience: String?
    let conditions: String?
    let targetDate: String?
    let updatedAt: String?
}

struct CareerResumeEntry: Codable, Identifiable {
    let id: String
    let kind: String
    let language: String?
    let data: [String: String]
    let verification: String?
    let archived: Bool?
    let sourceNotes: String?
    let updatedAt: String?
}

struct CareerPersonalizedResponse: Decodable {
    let drafts: [CareerPersonalizedResume]
}

struct CareerPersonalizedResume: Codable, Identifiable {
    let id: String
    let title: String
    let targetRole: String?
    let targetCompany: String?
    let language: String?
    let archived: Bool?
    let updatedAt: String?
    let content: CareerResumeContent
}

struct CareerResumeContent: Codable {
    let name: String
    let headline: String
    let summary: String
    let location: String
    let links: [CareerResumeLink]
    let sections: [CareerResumeSection]
}

struct CareerResumeLink: Codable, Identifiable {
    var id: String { url }
    let label: String
    let url: String
}

struct CareerResumeSection: Codable, Identifiable {
    var id: String { heading }
    let heading: String
    let items: [CareerResumeItem]
}

struct CareerResumeItem: Codable, Identifiable {
    var id: String { title + "|" + period }
    let title: String
    let subtitle: String
    let period: String
    let bullets: [String]
}

struct CareerMaterial: Codable, Identifiable {
    let id: String
    let title: String
    let kind: String
    let content: String
    let jobId: String?
    let createdAt: String?
    let reviewStatus: String?
    let sourceNotes: String?
}

struct CareerMaterialFile: Decodable {
    let kind: String
    let size: Int
    let uploadedAt: String
}

struct CareerMaterialFiles: Decodable {
    let pdf: CareerMaterialFile?
    let photo: CareerMaterialFile?
}

struct CareerTask: Codable, Identifiable {
    let id: String
    let kind: String
    let status: String
    let instructions: String?
}

struct CareerJob: Codable, Identifiable {
    let id: String
    let company: String
    let companyReading: String?
    let role: String
    let status: String
    let description: String?
    let requirements: String?
    let nextAction: String?
    let nextDate: String?
    let companyNumber: Int?
    let url: String?
    let business: String?
    let employeeCount: String?
    let companyType: String?
    let employmentType: String?
    let japanese: String?
    let foreigner: String?
    let visa: String?
    let salary: String?
    let location: String?
    let sourceDate: String?
    let sourcePlatform: String?
    let sourceChannel: String?
    let matchLevel: String?
    let matchNotes: String?
    let unknowns: String?
    let priority: String?
    let rating: Int?
    let notes: String?
    let history: [CareerJobHistory]?
    let updatedAt: String?
}

struct CareerJobHistory: Codable, Identifiable {
    var id: String { status + "|" + at }
    let status: String
    let at: String
}

struct CareerReport: Codable, Identifiable {
    let id: String
    let title: String
    let content: String
    let date: String
    let sourceNotes: String?
}

struct QuestionSet: Codable, Identifiable {
    let id: String
    let title: String
    let scenario: String?
    let questions: [CareerQuestion]
    let jobId: String?
    let plan: String?
    let sourceNotes: String?
}

struct AnswerFlow: Codable {
    struct Node: Codable, Identifiable {
        let id: String
        let title: String
        let cue: String?
        let detail: String?
        let cautions: String?
    }
    struct FollowUp: Codable, Identifiable {
        let id: String
        let question: String
        let nodeId: String?
        let questionId: String?
    }
    let version: Int
    let nodes: [Node]
    let followUps: [FollowUp]
}

struct CareerQuestion: Codable, Identifiable {
    let id: String
    let title: String
    let questionJa: String
    let meaning: String?
    let outline: String?
    var answerFlow: AnswerFlow? = nil
    let sampleAnswer: String?
    let targetSeconds: Int?
    let category: String?
    let why: String?
    let followUps: String?
}

struct SavedAttempt: Codable, Identifiable {
    let id: String
    let questionSetId: String
    let questionId: String
    let answer: String
    let language: String
    let createdAt: String
    let durationSeconds: Int?
    let audio: SavedAttemptAudio?
    var practiceContext: PracticeContext? = nil
}

struct SavedAttemptAudio: Codable {
    let contentType: String
    let size: Int
}

struct AnswerReview: Codable, Identifiable {
    let id: String
    let attemptId: String
    let summary: String
    let revisedAnswer: String?
    let nextPractice: String?
    let createdAt: String?
}

struct PendingAttempt: Codable, Identifiable {
    let id: String
    let questionSetId: String
    let questionId: String
    let answer: String
    let language: String
    let durationSeconds: Int
    let requestReview: Bool
    let createdAt: Date
    var hasRecording: Bool? = nil
    var practiceContext: PracticeContext? = nil
}

struct PracticeContext: Codable, Hashable {
    let planId: String
    let planRevision: Int
    let exerciseId: String
    let scheduleId: String
    var keywords: String
}

struct PracticePlanInput: Codable {
    let title: String
    let goal: String
    let currentSituation: String
    let startDate: String
    let endDate: String
    let dailyMinutes: Int
    let jobId: String
    let interviewId: String
    let sourceAttemptIds: [String]
}

struct PracticePlan: Codable, Identifiable {
    let id: String
    let revision: Int
    let title: String
    let goal: String
    let currentSituation: String
    let startDate: String
    let endDate: String
    let dailyMinutes: Int
    let jobId: String
    let interviewId: String
    let sourceAttemptIds: [String]
    let status: String
    let content: PracticePlanContent?
    let updatedAt: String

    var statusLabel: String {
        switch status {
        case "active": "練習中"
        case "paused": "休止中"
        case "completed": "本人確認済み・完了"
        default: "計画の作成待ち"
        }
    }

    func attempts(for item: PracticePlanSchedule, in attempts: [SavedAttempt]) -> [SavedAttempt] {
        guard let exercise = content?.exercises.first(where: { $0.id == item.exerciseId }) else { return [] }
        return attempts.filter {
            $0.practiceContext?.planId == id && $0.practiceContext?.scheduleId == item.id &&
            $0.practiceContext?.exerciseId == item.exerciseId &&
            $0.questionSetId == exercise.questionSetId && $0.questionId == exercise.questionId
        }.sorted { $0.createdAt < $1.createdAt }
    }

    func completedCount(in attempts: [SavedAttempt]) -> Int {
        content?.schedule.filter { self.attempts(for: $0, in: attempts).count >= $0.targetAttempts }.count ?? 0
    }
}
struct PracticePlanContent: Codable {
    let baselineAnalysis: String
    let successCriteria: String
    let sourceNotes: String
    let skills: [PracticePlanSkill]
    let exercises: [PracticePlanExercise]
    let schedule: [PracticePlanSchedule]
    let checkpoints: [PracticePlanCheckpoint]
}
struct PracticePlanSkill: Codable, Identifiable {
    let id: String
    let title: String
    let baseline: String
    let target: String
    let priority: Int
}
struct PracticePlanExercise: Codable, Identifiable {
    let id: String
    let title: String
    let skillIds: [String]
    let instructions: String
    let questionSetId: String
    let questionId: String
}
struct PracticePlanSchedule: Codable, Identifiable {
    let id: String
    let date: String
    let exerciseId: String
    let minutes: Int
    let targetAttempts: Int
}
struct PracticePlanCheckpoint: Codable, Identifiable {
    let id: String
    let date: String
    let title: String
    let criteria: String
}
struct PracticePlanReview: Codable, Identifiable {
    struct Assessment: Codable {
        let skillId: String
        let outcome: String
        let evidenceAttemptIds: [String]
        let notes: String
        var outcomeLabel: String {
            switch outcome {
            case "reached": "基準に到達"
            case "developing": "練習を継続"
            default: "判断材料が不足"
            }
        }
    }
    let id: String
    let planId: String
    let planRevision: Int
    let checkpointId: String
    let summary: String
    let nextActions: String
    let sourceNotes: String
    let assessments: [Assessment]
    let createdAt: String
}

struct APIError: Decodable {
    let error: String?
}
