#if DEBUG
import Foundation

enum DesignPreview {
    static let state: CareerState = {
        let json = #"""
        {
          "jobs": [
            {"id":"sample-job-1","companyNumber":6,"company":"示例科技株式会社","role":"iOS 工程师","status":"面试中","description":"开发面向日语学习者的 iOS 应用。","requirements":"Swift、SwiftUI；能用日语说明项目经历。","business":"提供日语学习与求职准备工具。","employeeCount":"约 120 人（示例）","companyType":"产品公司","employmentType":"正式员工","japanese":"商务日语","foreigner":"有招聘经历，细节待确认","visa":"需向招聘方确认","salary":"按经验面议","location":"东京都","sourceDate":"2026-10-20","sourcePlatform":"招聘网站","sourceChannel":"主动发现","matchLevel":"优先准备","matchNotes":"移动端经验与岗位方向相关。","unknowns":"具体团队和面试安排。","priority":"高","notes":"已保存招聘页面，等待进一步联系。","history":[{"status":"关注中","at":"2026-10-20T10:00:00Z"},{"status":"面试中","at":"2026-10-22T10:00:00Z"}],"nextAction":"准备技术面试","nextDate":"2026-10-24"},
            {"id":"sample-job-2","company":"样例产品设计","role":"前端工程师","status":"准备投递","description":"参与招聘平台的界面开发。","requirements":"React、TypeScript。","nextAction":"核对职位要求","nextDate":"2026-10-30"}
          ],
          "profile": {"summary":"有移动端与网页项目经验，正在准备日语面试。","targetRoles":"iOS 工程师、前端工程师","japanese":"以简洁日语说明技术经历"},
          "resume": [{"id":"sample-resume","kind":"employment","language":"ja","data":{"employer":"示例科技","role":"iOS 工程师","responsibilities":"负责学习页面与离线练习功能。","technologies":"SwiftUI"},"verification":"confirmed","archived":false,"sourceNotes":"虚构的设计预览资料。","updatedAt":"2026-10-23T09:00:00Z"}],
          "today": "2026-10-24",
          "materials": [{"id":"sample-material","title":"示例科技 · 面试准备","kind":"面试准备","jobId":"sample-job-1","reviewStatus":"待核对","createdAt":"2026-10-23T09:00:00Z","content":"# {自己紹介|じこしょうかい}（60 秒）\n\nはじめまして。私は iOS アプリの{開発|かいはつ}を担当しました。\n\n## {経験|けいけん}の要点\n\n- SwiftUI で学習画面を作成\n- オフライン練習を改善\n\n**準備すること**：具体例を一つ説明する。"},
            {"id":"sample-application","title":"示例履歴書","kind":"履歴書","reviewStatus":"待核对","createdAt":"2026-10-24T09:00:00Z","content":"# 履歴書\n\n2026年10月24日現在\n\n## 基本情報\n\n| 項目 | 内容 |\n| --- | --- |\n| 氏名 | 山田 太郎 |\n| 住所 | 東京都 |\n\n## 学歴・職歴\n\n| 年 | 月 | 内容 |\n| --- | --- | --- |\n| 2023 | 4 | 示例科技株式会社 入社 |\n\n## 志望動機\n\n学習アプリの開発に取り組みたいと考えています。\n\n## 内部確認\n\n- これは提出用文面に含めない。"}],
          "reports": [{"id":"sample-report","title":"今天的准备重点","content":"先练 60 秒自我介绍，再准备一段项目经历。","date":"2026-10-24"}],
          "tasks": [{"id":"sample-task","kind":"回答点评","status":"待处理","instructions":"等待 Agent 点评最新回答"}],
          "questionSets": [{"id":"sample-pack","jobId":"sample-job-1","title":"示例科技 · 第一轮面试","scenario":"以下为模拟练习题，并非公司真题。","questions":[
            {"id":"intro","title":"60 秒自我介绍","questionJa":"自己紹介をお願いします。","meaning":"请介绍自己。","outline":"当前方向 → 一个相关项目 → 想继续做的工作","answerFlow":{"version":1,"nodes":[{"id":"direction","title":"現在の方向","cue":"モバイルアプリの開発","detail":"架空の設計プレビューです。","cautions":"実際の経験に合わせて話す。"},{"id":"project","title":"関連するプロジェクト"},{"id":"future","title":"今後取り組みたい仕事"}],"followUps":[{"id":"project-detail","nodeId":"project","questionId":"project","question":"担当したプロジェクトについて教えてください。"},{"id":"why","question":"なぜこの仕事を選びましたか。"}]},"sampleAnswer":"本人的事实请自行填写。","targetSeconds":60},
            {"id":"project","title":"介绍项目经历","questionJa":"担当したプロジェクトについて教えてください。","meaning":"请介绍你负责的项目。","outline":"背景 → 个人行动 → 结果","targetSeconds":90},
            {"id":"reverse","title":"逆質問","questionJa":"{何|なに}か{質問|しつもん}はありますか。","meaning":"あなたからの質問","outline":"一つずつ質問し、回答を聞いてから次を選ぶ。","sampleAnswer":"① JavaやSpring Bootの{開発案件|かいはつあんけん}はありますか。\n\n② {設計|せっけい}から{運用|うんよう}まで、どの{工程|こうてい}を{担当|たんとう}しますか。\n\n③ {日本語|にほんご}はどのような{場面|ばめん}で{使います|つかいます}か。\n\n④ {募集|ぼしゅう}の{背景|はいけい}を{教えて|おしえて}いただけますか。","targetSeconds":90,"category":"逆質問"}
          ]},
          {"id":"sample-general-pack","jobId":"builtin:general","title":"我的通用面试练习","scenario":"不针对具体公司。","questions":[
            {"id":"leaving","title":"転職理由","questionJa":"転職理由を教えてください。","meaning":"请说明转职理由。","outline":"经历 → 选择 → 今后","sampleAnswer":"これまでの経験を活かして働きたいです。","targetSeconds":90}
          ]}],
          "attempts": [{"id":"sample-attempt","questionSetId":"sample-pack","questionId":"intro","answer":"アプリ開発をしています。SwiftUIで画面を作りました。","language":"日语","createdAt":"2026-10-22T09:00:00Z"}],
          "reviews": [{"id":"sample-review","attemptId":"sample-attempt","summary":"可以补充你负责的具体功能。","revisedAnswer":"SwiftUIを使って、学習画面を開発しました。"}]
        }
        """#
        var state = (try? JSONDecoder().decode(CareerState.self, from: Data(json.utf8))) ?? CareerState()
        if let index = state.reports.firstIndex(where: { $0.id == "sample-report" }) {
            let format = DateFormatter()
            format.calendar = Calendar(identifier: .gregorian)
            format.timeZone = TimeZone(identifier: "Asia/Tokyo")
            format.dateFormat = "yyyy-MM-dd"
            let report = state.reports[index]
            state.reports[index] = CareerReport(id: report.id, title: report.title,
                                               content: report.content, date: format.string(from: .now),
                                               sourceNotes: report.sourceNotes)
        }
        return state
    }()

    /// A growing library fixture, kept entirely offline and separate from real user data.
    static let listState: CareerState = {
        var result = state
        let questionJSON: [[String: Any]] = (0..<40).map { index in
            let category = index < 11 ? "先练必答" : index < 18 ? "日语表达基础" : index < 30 ? "フェア基本練習" : "面试复盘专项"
            return ["id": "list-question-\(index)", "questionNumber": index + 1,
                    "title": index == 0 ? "入职前应准备的技术与知识" : "\(["说明项目背景", "动词与助词搭配", "介绍自己的工作经历", "确认初期职责与团队期待"][index % 4])（\(index + 1)）",
                    "questionJa": index == 0 ? "{入社|にゅうしゃ}までに、{勉強|べんきょう}しておくとよい{技術|ぎじゅつ}や{知識|ちしき}はありますか。" : "これまでの経験と、担当した仕事について、簡単に説明してください。",
                    "category": category, "meaning": "虚构列表设计验证题目", "targetSeconds": 60]
        }
        let packJSON: [String: Any] = ["id": "list-general", "jobId": "builtin:general", "title": "示例通用练习", "questions": questionJSON]
        if let data = try? JSONSerialization.data(withJSONObject: packJSON),
           let pack = try? JSONDecoder().decode(QuestionSet.self, from: data) {
            result.questionSets = result.questionSets.filter { $0.jobId != "builtin:general" } + [pack]
        }
        let plans: [[String: Any]] = (0..<7).map { index in
            let status = index < 4 ? "active" : index == 4 ? "paused" : "completed"
            let title = ["面试表达改善｜一周训练", "日语表达｜动词、助词与完整句子", "逆質問｜入职准备与初期角色期待", "长标题示例｜向不同背景的面试官清楚介绍复杂项目中的个人职责和成果", "招聘会｜展位交流", "自我介绍｜基础训练", "项目说明｜复习"][index]
            return ["id": "list-plan-\(index)", "revision": 1, "title": title,
                    "goal": "虚构设计验证：先理解问题，再用一句结论和一个依据表达；完整目标保留在计划详情，列表只显示日期、状态与进度。",
                    "currentSituation": "虚构设计数据，不代表真实练习结果。", "startDate": "2026-11-06", "endDate": "2026-11-12",
                    "dailyMinutes": 20, "jobId": "", "interviewId": "", "sourceAttemptIds": [], "status": status,
                    "updatedAt": "2026-11-0\(9 - index)T09:00:00Z",
                    "content": ["baselineAnalysis": "虚构设计验证", "successCriteria": "只通过真实回答评价，次数不代表达标", "sourceNotes": "Fictional list fixture",
                                "skills": [], "exercises": [["id": "list-exercise", "title": "提问练习", "skillIds": [], "instructions": "先关键词，再组成一句话。", "questionSetId": "list-general", "questionId": "list-question-0"]],
                                "schedule": (0..<15).map { ["id": "list-schedule-\($0)", "date": "2026-11-06", "exerciseId": "list-exercise", "minutes": 10, "targetAttempts": 2] as [String: Any] }, "checkpoints": []]]
        }
        if let data = try? JSONSerialization.data(withJSONObject: plans) {
            result.practicePlans = try? JSONDecoder().decode([PracticePlan].self, from: data)
        }
        let interviews: [[String: Any]] = (0..<4).map { index in
            ["id": "list-interview-\(index)", "revision": 1, "title": "示例科技 · 第\(index + 1)轮面试复盘", "jobId": "sample-job-1",
             "date": "2026-11-0\(6 - index)", "durationSeconds": 2400, "status": "practice", "exchangeCount": 20, "practiceCount": 3]
        }
        if let data = try? JSONSerialization.data(withJSONObject: interviews) {
            result.interviews = try? JSONDecoder().decode([InterviewSummary].self, from: data)
        }
        return result
    }()

    static let pending = [
        PendingAttempt(id: "sample-pending", questionSetId: "sample-pack",
                       questionId: "project", answer: "项目经历的离线草稿",
                       language: "中文构思", durationSeconds: 75,
                       requestReview: false, createdAt: Date())
    ]

    static let personalizedResumes: [CareerPersonalizedResume] = {
        let json = #"""
        [{"id":"sample-draft","title":"示例科技 · iOS 工程师简历","targetRole":"iOS 工程师","targetCompany":"示例科技株式会社","language":"ja","archived":false,"content":{"name":"示例候选人","headline":"iOS 工程师","summary":"以下为虚构设计预览，不代表真实履历。","location":"东京","links":[],"sections":[{"heading":"工作经历","items":[{"title":"移动应用开发","subtitle":"示例科技","period":"2023–2026","bullets":["负责 SwiftUI 页面与离线练习体验。"]}]}]}}]
        """#
        return (try? JSONDecoder().decode([CareerPersonalizedResume].self, from: Data(json.utf8))) ?? []
    }()
}
#endif
