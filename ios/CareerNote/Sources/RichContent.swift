import SwiftUI
import WebKit

/// Career Note's saved study text uses Markdown and inline {漢字|かな} readings.
/// Plain text uses SwiftUI; formatted text uses escaped HTML in a local WebView.
struct RichContent: View {
    let text: String
    var markdown = true
    var fontSize: CGFloat = 17
    @AppStorage("showJapaneseReadings") private var showReadings = true
    @ScaledMetric(relativeTo: .body) private var textScale: CGFloat = 1
    @State private var height: CGFloat = 40

    // Most short fields are plain prose. Avoid starting WebKit for each of them.
    private var canUseNativeText: Bool {
        if text.contains("{") || text.contains("http://") || text.contains("https://") ||
            text.contains("mailto:") { return false }
        if !markdown { return true }
        let trimmed = text.trimmingCharacters(in: .whitespaces)
        if trimmed.hasPrefix("- ") || trimmed.hasPrefix("+ ") ||
            trimmed.range(of: #"^\d+\. "#, options: .regularExpression) != nil { return false }
        return !text.contains("\n") && !text.contains(where: { "#*_`[]>".contains($0) })
    }

    var body: some View {
        Group {
            if canUseNativeText {
                Text(text)
                    .font(Font(UIFont.systemFont(ofSize: fontSize * textScale)))
                    .lineSpacing(4)
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                RichWebView(
                    html: CareerRichText.html(text, markdown: markdown, showReadings: showReadings,
                                              fontSize: fontSize * textScale),
                    height: $height
                )
                .frame(height: height)
            }
        }
    }
}

struct ReadingToggleButton: View {
    @AppStorage("showJapaneseReadings") private var showReadings = true

    var body: some View {
        Button {
            showReadings.toggle()
        } label: {
            Label(showReadings ? "隐藏假名" : "显示假名", systemImage: "character.book.closed")
        }
        .accessibilityLabel(showReadings ? "隐藏假名标注" : "显示假名标注")
    }
}

private struct RichWebView: UIViewRepresentable {
    let html: String
    @Binding var height: CGFloat

    func makeCoordinator() -> Coordinator { Coordinator(height: $height) }

    func makeUIView(context: Context) -> WKWebView {
        let controller = WKUserContentController()
        controller.add(context.coordinator, name: "height")
        let configuration = WKWebViewConfiguration()
        configuration.userContentController = controller
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.scrollView.isScrollEnabled = false
        view.scrollView.contentInsetAdjustmentBehavior = .never
        view.isOpaque = false
        view.backgroundColor = .clear
        view.scrollView.backgroundColor = .clear
        view.loadHTMLString(html, baseURL: nil)
        context.coordinator.loadedHTML = html
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.height = $height
        if context.coordinator.loadedHTML != html {
            context.coordinator.loadedHTML = html
            view.loadHTMLString(html, baseURL: nil)
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        var height: Binding<CGFloat>
        var loadedHTML = ""

        init(height: Binding<CGFloat>) { self.height = height }

        func userContentController(_ userContentController: WKUserContentController,
                                   didReceive message: WKScriptMessage) {
            guard message.name == "height", let number = message.body as? NSNumber else { return }
            let measured = CGFloat(truncating: number)
            if measured.isFinite && measured > 0 && abs(height.wrappedValue - measured) > 1 {
                height.wrappedValue = measured
            }
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard action.navigationType == .linkActivated, let url = action.request.url else {
                decisionHandler(.allow)
                return
            }
            if ["https", "http", "mailto"].contains(url.scheme?.lowercased() ?? "") {
                UIApplication.shared.open(url)
            }
            decisionHandler(.cancel)
        }
    }
}
