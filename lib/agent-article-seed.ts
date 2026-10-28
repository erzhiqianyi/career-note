// The original six articles. They seed D1 once; afterwards D1 is authoritative and edits happen in the app.
// Chinese is the source text; `translations` carries the Japanese and English versions.
export const articleLocales = ['ja', 'en'] as const;
export type ArticleLocale = (typeof articleLocales)[number];
export type ArticleText = { title: string; summary: string; steps: string[]; body: string; prompt: string };

export const experiencePrompt = `请根据我提供的工作邮件和现有履历，整理可核实的工作经历。先逐封提取日期、项目背景、发件人与我的角色、我亲自做的行动、可观察到的结果，并标注邮件主题或消息 ID 作为来源。不要把别人完成的工作、团队成果或客户要求写成我的个人贡献；邮件没有证明的职责、技术、数字和任职时间一律标为待确认。先给我事实对照表和需要补问的问题，等我核对后，再生成简洁的工作经历与项目经历草稿。若已连接 Career Note MCP，先读取 career_get_experience_generation_guide，再按需读取履历；只有我明确要求保存时才调用 career_save_resume_entry，并读回核对。不要发送邮件或修改投递状态。`;

type SeedArticle = ArticleText & { slug: string; category: 'start' | 'prepare' | 'connect'; translations: Record<ArticleLocale, ArticleText> };

export const agentArticles: readonly SeedArticle[] = [
  {
    slug: 'first-ai-job-search', category: 'start', title: '第一次用 AI 求职，从这里开始', summary: '不用安装工具。先让 AI 问你几个问题，再把模糊的求职想法整理成下一步。',
    steps: ['只告诉 AI 与求职有关的经历、目标岗位和希望工作的地区。', '让它先提问，补齐职位方向、语言能力、工作条件等关键空白。', '请它给出本周最值得做的三件事，并指出哪些建议仍需要核实。'],
    body: '',
    prompt: '我准备在日本找工作，但还不确定从哪里开始。请先问我最多 5 个关键问题，了解我的经历、目标岗位、日语水平和工作条件。等我回答后，再给出本周可以完成的 3 个具体步骤；不要猜测我没有提供的事实。',
    translations: {
      ja: {
        title: '初めて AI を使うなら、ここから', summary: 'ツールの導入は不要。まず AI に質問してもらい、漠然とした希望を次の行動に整理します。',
        steps: ['就職に関係する経験、希望職種、希望勤務地だけを AI に伝えます。', '職種の方向性、語学力、希望条件など、足りない情報を先に質問してもらいます。', '今週取り組むべき三つの行動と、まだ確認が必要な提案を挙げてもらいます。'],
        body: '',
        prompt: '日本で仕事を探したいのですが、何から始めるか迷っています。まず経験、希望職種、日本語力、勤務条件について重要な質問を五つ以内でしてください。回答後、今週できる具体的な行動を三つ提案してください。伝えていない事実は推測しないでください。',
      },
      en: {
        title: 'New to AI? Start here', summary: 'No setup needed. Let AI ask a few questions and turn vague plans into a next step.',
        steps: ['Share only job-related experience, target roles, and where you want to work.', 'Ask it to question you first to fill gaps such as role direction, language level, and work conditions.', 'Ask for the three most useful things to do this week, and which suggestions still need checking.'],
        body: '',
        prompt: 'I want to find work in Japan but am unsure where to begin. Ask me up to five key questions about my experience, target roles, Japanese level, and work conditions. After I answer, suggest three concrete steps for this week. Do not assume facts I have not provided.',
      },
    },
  },
  {
    slug: 'read-job-posting', category: 'prepare', title: '读懂一条招聘信息', summary: '让 AI 帮你区分硬性要求、加分条件和没有写清楚的地方。',
    steps: ['提供招聘原始链接或正文，并说明最在意的条件。', '请 AI 分开列出明示要求、推测和需要向公司确认的问题。', '回到招聘原文检查日期、工作地点、薪资、语言与在留资格信息。'],
    body: '',
    prompt: '请阅读这条招聘信息：[粘贴链接或正文]。分三栏列出明确写出的要求、可能的加分条件、尚不清楚的问题。对日语、地点、薪资和在留资格不要自行补全；引用对应原文，并告诉我信息的确认日期。',
    translations: {
      ja: {
        title: '求人票を読み解く', summary: '必須条件、歓迎条件、書かれていない点を AI と一緒に整理します。',
        steps: ['求人の原文リンクか本文を渡し、最も重視する条件を伝えます。', '明示された要件、推測、企業に確認すべき質問を分けて挙げてもらいます。', '原文に戻り、掲載日、勤務地、給与、言語、在留資格の情報を確認します。'],
        body: '',
        prompt: 'この求人を読んでください：[リンクまたは本文]。明示された要件、歓迎条件と思われる項目、不明点の三つに分けてください。日本語、勤務地、給与、在留資格は補完せず、該当する原文と確認日を示してください。',
      },
      en: {
        title: 'Understand a job posting', summary: 'Let AI separate hard requirements, nice-to-haves, and what the posting leaves unclear.',
        steps: ['Give the original posting link or text and say which conditions matter most to you.', 'Ask AI to list stated requirements, inferences, and questions for the employer separately.', 'Go back to the source to check the date, location, pay, language, and visa information.'],
        body: '',
        prompt: 'Read this job posting: [link or text]. Separate stated requirements, possible nice-to-haves, and open questions. Do not fill in missing facts about Japanese, location, salary, or visa support. Quote the relevant source and give the verification date.',
      },
    },
  },
  {
    slug: 'evidence-based-resume', category: 'prepare', title: '把经历改写成有依据的履历', summary: '让 AI 帮你找出经历与岗位的连接点，同时守住真实事实。',
    steps: ['提供现有履历和目标职位，先标记匹配点与信息缺口。', '逐条核对公司、项目、职责、成果和数字是否确实属于你。', '核对后再写草稿；无法确认的内容留作待填写。'],
    body: '',
    prompt: '这是我的现有履历：[粘贴相关经历]。这是目标职位：[粘贴职位要求]。请先做事实对照表，再给出一版针对该岗位的履历表述。不得编造业绩数字、学历或职责；不确定的地方请标为“待确认”。',
    translations: {
      ja: {
        title: '経験を根拠ある応募書類に', summary: '経験と求人の接点を AI と探しながら、事実を守ります。',
        steps: ['現在の経歴と求人を渡し、合致点と不足情報を先に示してもらいます。', '企業、プロジェクト、担当、成果、数字が本当に自分のものか一つずつ確認します。', '確認後に下書きを作り、確認できない内容は空欄のままにします。'],
        body: '',
        prompt: 'これが現在の経歴です：[関連する経験]。対象求人はこちらです：[要件]。まず事実の対応表を作り、その後で求人向けの表現案を出してください。成果の数字、学歴、担当業務を創作せず、不明点は「要確認」としてください。',
      },
      en: {
        title: 'Turn experience into an evidence-based résumé', summary: 'Let AI find links between your experience and the role while keeping every fact true.',
        steps: ['Provide your current résumé and the target role; mark matches and missing facts first.', 'Verify that each employer, project, duty, result, and number is really yours.', 'Draft only after checking; leave anything unverified to fill in later.'],
        body: '',
        prompt: 'Here is my current experience: [paste relevant details]. Here is the target role: [paste requirements]. First make a fact-matching table, then draft role-specific résumé wording. Do not invent metrics, education, or responsibilities; mark uncertainties for confirmation.',
      },
    },
  },
  {
    slug: 'work-email-to-experience', category: 'prepare', title: '从工作邮件整理有证据的经历', summary: '把邮件里的工作线索整理成可核对的职责、行动和成果。',
    steps: ['选择与本人工作有关的邮件，保留日期、主题和消息 ID；先隐去无关个人信息。', '区分邮件中的任务要求、本人实际行动和后来可观察到的结果。', '让 AI 列出证据与缺口，核对后再写工作经历或项目经历。'],
    body: '一封邮件能证明的是邮件里实际写出的内容。收到任务说明，只能证明任务被提出；本人回复了处理方案，可以支持“提出方案”；完成时间、效果和数字还需要后续记录佐证。\n\n记录邮件日期、主题或消息 ID，并核对项目、本人行动和后续结果。区分雇主、客户、团队与本人工作。输入前可以去除无关的姓名、地址、电话和账号信息。',
    prompt: experiencePrompt,
    translations: {
      ja: {
        title: '業務メールから根拠のある職務経験を整理する', summary: 'メールの手掛かりを、確認できる担当業務・行動・成果に整理します。',
        steps: ['自分の仕事に関係するメールを選び、日付、件名、メッセージ ID を残します。無関係な個人情報は先に伏せます。', 'メール内の依頼内容、自分が実際に行ったこと、後で確認できた結果を区別します。', 'AI に根拠と不足を挙げてもらい、確認してから職務経歴やプロジェクト経験を書きます。'],
        body: '一通のメールが証明できるのは、そこに実際に書かれた内容だけです。依頼を受け取ったメールは、依頼があったことしか示しません。自分が対応方針を返信していれば「方針を提案した」根拠になりますが、完了日、効果、数字は後の記録で裏付ける必要があります。\n\nメールの日付、件名またはメッセージ ID を記録し、プロジェクト、自分の行動、その後の結果を照合します。雇用主、顧客、チーム、自分の仕事を区別してください。入力前に、無関係な氏名、住所、電話番号、アカウント情報は削除できます。',
        prompt: '提供する業務メールと現在の経歴をもとに、確認できる職務経験を整理してください。まずメールごとに日付、プロジェクトの背景、送信者と私の役割、私自身が行ったこと、確認できる結果を抜き出し、出典として件名またはメッセージ ID を付けてください。他の人の作業、チームの成果、顧客の要望を私個人の貢献として書かないでください。メールで証明できない担当、技術、数字、在籍期間はすべて「要確認」としてください。最初に事実の対応表と追加で確認すべき質問を示し、私が確認した後で、簡潔な職務経歴とプロジェクト経験の下書きを作ってください。Career Note MCP に接続済みなら、先に career_get_experience_generation_guide を読み、必要に応じて経歴を読んでください。私が保存を明示した場合のみ career_save_resume_entry を呼び出し、読み戻して確認してください。メールの送信や応募ステータスの変更はしないでください。',
      },
      en: {
        title: 'Build evidence-based experience from work emails', summary: 'Turn email clues into verifiable responsibilities, actions, and outcomes.',
        steps: ['Pick emails about your own work and keep the date, subject, and message ID; hide unrelated personal details first.', 'Separate what was requested, what you actually did, and the results that could be observed later.', 'Have AI list the evidence and gaps, then write work or project experience only after checking.'],
        body: 'An email proves only what it actually says. Receiving a task brief shows that the task was requested; your reply with a plan supports “proposed a plan”; completion dates, impact, and numbers still need later records to back them up.\n\nRecord the email date and subject or message ID, and check the project, your own actions, and the later results. Keep the employer, the client, the team, and your own work apart. Before pasting, you can remove unrelated names, addresses, phone numbers, and account details.',
        prompt: 'Using the work emails and current résumé I provide, organize verifiable work experience. For each email, first extract the date, project background, the sender’s and my roles, what I personally did, and any observable result, citing the subject or message ID as the source. Do not present other people’s work, team results, or client requests as my personal contribution; mark any responsibility, technology, number, or employment period the emails do not prove as “to confirm”. Show me the fact table and follow-up questions first; after I check them, draft concise work and project experience. If Career Note MCP is connected, read career_get_experience_generation_guide first and read my résumé as needed; call career_save_resume_entry only when I explicitly ask to save, then read it back to check. Do not send emails or change application status.',
      },
    },
  },
  {
    slug: 'interview-practice-review', category: 'prepare', title: '把面试练习变成有效复盘', summary: '先自己回答，再请 AI 从内容、结构和日语表达三个角度给建议。',
    steps: ['根据岗位生成少量练习题，并标明只是模拟题。', '先用自己的话回答，保留原回答。', '请 AI 指出事实、结构和日语表达问题，然后再练一次。'],
    body: '',
    prompt: '请根据这个岗位：[粘贴职位信息]，给我 5 道日语模拟面试题。一次只问一题，等我回答后再点评。点评请分为内容依据、结构、日语表达，并给一个可练习的修改方向。不要把模拟题称作公司真题。',
    translations: {
      ja: {
        title: '面接練習を振り返りにつなげる', summary: 'まず自分で答え、内容、構成、日本語表現の三点から AI に助言をもらいます。',
        steps: ['求人に沿った少数の練習問題を作り、模擬問題だと明示します。', 'まず自分の言葉で答え、元の回答を残します。', '事実、構成、日本語表現の問題点を AI に指摘してもらい、もう一度練習します。'],
        body: '',
        prompt: 'この求人に基づき：[求人情報]、日本語の模擬面接質問を五つ作ってください。一問ずつ質問し、私の回答後に根拠、構成、日本語表現の面から講評し、練習できる改善点を一つ示してください。企業の実際の質問とは呼ばないでください。',
      },
      en: {
        title: 'Turn interview practice into useful feedback', summary: 'Answer first, then ask AI for feedback on content, structure, and Japanese expression.',
        steps: ['Generate a few role-based practice questions and label them as mock questions.', 'Answer in your own words first and keep the original answer.', 'Ask AI to point out issues with facts, structure, and Japanese expression, then practice again.'],
        body: '',
        prompt: 'Based on this role: [job details], give me five Japanese mock interview questions, one at a time. After each answer, review evidence, structure, and Japanese expression, then give one improvement to practice. Do not call them real company questions.',
      },
    },
  },
  {
    slug: 'connect-career-note-mcp', category: 'connect', title: '让 AI 读取 Career Note 的资料', summary: '如果你已经在手帖保存履历和职位，可以连接 MCP，减少反复复制资料。',
    steps: ['先核对手帖里的履历和求职条件。', '按照连接向导添加 MCP 地址并完成授权。', '让助手读取协议与资料；写入前预览，写入后核对。'],
    body: '',
    prompt: '请调用 Career Note 的 career_get_contract，先告诉我这个工作区的使用约定。然后读取我的履历概况，列出可用于求职准备的资料和明显缺口；这一步先不要写入任何内容。',
    translations: {
      ja: {
        title: 'AI に Career Note の資料を読ませる', summary: '手帖に経歴と求人を保存しているなら、MCP 接続で何度もコピーする手間を減らせます。',
        steps: ['まず手帖の経歴と希望条件を確認します。', '接続手順に沿って MCP アドレスを追加し、許可を完了します。', '規約と資料を読ませ、書き込み前にプレビューし、保存後に確認します。'],
        body: '',
        prompt: 'Career Note の career_get_contract を呼び出し、まずこのワークスペースの規約を説明してください。次に経歴の概要を読み、準備に使える資料と明らかな不足を挙げてください。この段階では何も書き込まないでください。',
      },
      en: {
        title: 'Let AI read your Career Note records', summary: 'If your résumé and roles are already saved here, connect MCP to stop copying them over and over.',
        steps: ['Check your saved résumé and job preferences first.', 'Add the MCP address using the connection guide and finish authorization.', 'Have the assistant read the rules and records; preview before writing and check afterward.'],
        body: '',
        prompt: 'Call Career Note career_get_contract and explain the workspace rules first. Then read my résumé overview and list useful records and obvious gaps. Do not write anything yet.',
      },
    },
  },
];
