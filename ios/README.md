# Career Note for iOS

SwiftUI app with three main tabs: **企业**, **练习**, and **简历**. It uses the existing Career Note Worker. The company tab reads the saved company and posting fields, application history, related materials, company practice sets, reviews, and reports. The practice tab opens on today's focus: due company practice, follow-up questions from reviews, unpracticed company questions, then general questions. The resume tab reads the saved profile, structured resume entries, personalized resume drafts, and generated resume documents. Resume text remains read-only on iOS; signed-in users can upload or remove an original PDF for each application document and a shared profile photo. Answers can be written offline.

The app stores the last synced state, personalized resume drafts, question packs, and confirmed answers in an on-device SQLite database under iOS Application Support, with one database per Firebase UID and iOS file protection. Company, material, practice, review, and resume records have separate tables and indexed relationship fields; their full API payloads remain in JSON columns so new server fields can be cached without a destructive local schema migration. Existing per-user JSON snapshots are migrated on first load. Answers entered offline stay in a pending-attempt table and are sent on the next sync or app foreground. Each upload includes a client request ID so a lost response can be retried without creating another answer.

Saved preparation materials, reports, practice questions, reviews, and resume details render Markdown with headings, lists, emphasis, links, and inline `{漢字|かな}` readings. The **显示日语假名** setting and the reader toolbar switch only the display; saved source text is unchanged. Readings are shown only when already present in the content. 履歴書 and 職務経歴書 use an A4 layout based on the web print styles. The print and preview copy excludes `内部確認` sections. A saved original PDF can be previewed and printed directly; the shared profile photo appears in the generated 履歴書 layout. The PDF and photo require the signed-in Worker's private file API and are fetched online rather than included in the offline snapshot. Rendering uses local HTML and does not fetch remote scripts or images.

## Set up

1. Open `CareerNote.xcodeproj` in Xcode 26 or newer. The app targets iOS 17 or newer.
2. Copy `Local.xcconfig.example` to `Local.xcconfig`. Set a unique bundle ID, Apple development team, the reversed iOS client ID, and `CAREER_API_HOST` to the owner's deployed Worker hostname. This local file is ignored by Git. The installed app uses that HTTPS Worker directly; there is no address field to fill in after login.
3. In the **same Firebase project as the Worker**, register an iOS app with that bundle ID, enable Google and Apple providers, and put its `GoogleService-Info.plist` at `ios/CareerNote/GoogleService-Info.plist`. This file is ignored by Git. Enable the Sign in with Apple capability for the bundle ID in the Apple Developer account. Apple provider configuration in Firebase also requires the owner's Apple Service ID, Team ID, key ID and private key.
4. Build and run the CareerNote scheme. The first Google sign in and first data sync need a network connection. After that, the bundled general question bank and cached company packs, jobs, reports, and resumes remain available offline.

Google login requires a Firebase Apple app registered with the exact `PRODUCT_BUNDLE_IDENTIFIER`, the Google provider enabled in that Firebase project, and the matching `GoogleService-Info.plist` and `REVERSED_CLIENT_ID`. The Google button stays disabled when the local plist is absent.

The Worker must use `CAREER_AUTH_MODE=strict` and the same `FIREBASE_PROJECT_ID` as the app. Google and Apple sign-in produce separate Firebase users unless those providers are linked to the same Firebase account. The app does not silently merge accounts or personal data.

Review requests are queued with their answers. A successful sync creates the normal Worker review task; the Agent workflow then processes that task. The app does not generate a review locally.

The bundled question bank is copied from `lib/data/interview-bank.json`; update that resource when the source bank changes. To regenerate the Xcode project after changing Swift source names, run `ruby ios/generate-project.rb` (requires the `xcodeproj` gem).

Run `sh ios/test-local-store.sh` on macOS to check SQLite round trips, rollback after a failed write, and migration from a disposable legacy JSON cache.
Run `sh ios/test-rich-content.sh` to check Markdown headings and lists, ruby on/off rendering, application A4 tables, internal-note exclusion, photo embedding, links, and HTML escaping.

## Design preview

Debug builds accept `-careerDesignPreview` to show fictional offline data without Firebase. Add `-careerDesignCompany`, `-careerDesignCompanyDetail`, `-careerDesignResume`, `-careerDesignRichMaterial`, or `-careerDesignApplication` to open those views; the default is today's practice. `-careerDesignAnswer` opens a question, and `-careerDesignLogin` shows the login layout. These arguments are only for screenshots and do not authenticate or sync. Simulator screenshots are in `outputs/design-preview/` (ignored by Git).
