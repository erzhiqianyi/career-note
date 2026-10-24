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

struct CareerQuestion: Codable, Identifiable {
    let id: String
    let title: String
    let questionJa: String
    let meaning: String?
    let outline: String?
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
}

struct APIError: Decodable {
    let error: String?
}
