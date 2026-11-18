import SwiftUI
import WebKit
import CoreText

/// Career Note's saved study text uses Markdown and inline {漢字|かな} readings.
/// Paragraph text — including readings, bold, italic and inline code — is drawn natively;
/// only links and Markdown blocks (headings, lists, quotes, code blocks) use a local WebView,
/// because each WebView takes seconds to start and practice screens hold many short fields.
struct RichContent: View {
    let text: String
    var markdown = true
    var fontSize: CGFloat = 17
    @AppStorage("showJapaneseReadings") private var showReadings = true
    @ScaledMetric(relativeTo: .body) private var textScale: CGFloat = 1
    @State private var height: CGFloat = 40

    var body: some View {
        Group {
            if let paragraphs = CareerRichText.nativeParagraphs(text, markdown: markdown) {
                if paragraphs.joined().allSatisfy({ $0.reading == nil && !$0.bold && !$0.italic && !$0.code }) {
                    Text(paragraphs.map { $0.map(\.text).joined() }.joined(separator: "\n\n"))
                        .font(Font(UIFont.systemFont(ofSize: fontSize * textScale)))
                        .lineSpacing(4)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    NativeRichText(paragraphs: paragraphs, showReadings: showReadings,
                                   fontSize: fontSize * textScale)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
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

/// Inline runs drawn by a UILabel; readings use Core Text ruby annotations above the base text.
private struct NativeRichText: UIViewRepresentable {
    let paragraphs: [[CareerRichText.InlineRun]]
    let showReadings: Bool
    let fontSize: CGFloat

    private var hasRuby: Bool { showReadings && paragraphs.joined().contains { $0.reading != nil } }

    /// Draws the text below a top inset so first-line ruby, drawn above the glyphs, stays visible.
    final class RubyLabel: UILabel {
        var topInset: CGFloat = 0
        override func drawText(in rect: CGRect) {
            super.drawText(in: rect.inset(by: UIEdgeInsets(top: topInset, left: 0, bottom: 0, right: 0)))
        }
    }

    private var rubyTop: CGFloat { hasRuby ? ceil(fontSize * 0.6) : 0 }

    func makeUIView(context: Context) -> RubyLabel {
        let label = RubyLabel()
        label.numberOfLines = 0
        label.lineBreakMode = .byWordWrapping
        label.adjustsFontForContentSizeCategory = false // fontSize already follows the text scale
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        label.setContentHuggingPriority(.defaultLow, for: .horizontal)
        return label
    }

    func updateUIView(_ label: RubyLabel, context: Context) {
        label.topInset = rubyTop
        label.attributedText = attributedText
        label.setNeedsDisplay()
        label.accessibilityLabel = paragraphs.map { $0.map(\.text).joined() }.joined(separator: "\n")
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: RubyLabel, context: Context) -> CGSize? {
        let limit = proposal.width ?? .greatestFiniteMagnitude
        let size = uiView.sizeThatFits(CGSize(width: limit, height: .greatestFiniteMagnitude))
        // Ruby on the first line is drawn above the label's measured box; reserve that room.
        return CGSize(width: proposal.width ?? ceil(size.width), height: ceil(size.height) + rubyTop)
    }

    private var attributedText: NSAttributedString {
        let style = NSMutableParagraphStyle()
        style.lineSpacing = hasRuby ? ceil(fontSize * 0.55) : 4
        style.paragraphSpacing = ceil(fontSize * 0.7)
        style.lineBreakStrategy = .standard
        let base = UIFont.systemFont(ofSize: fontSize)
        let result = NSMutableAttributedString()
        for (index, paragraph) in paragraphs.enumerated() {
            if index > 0 { result.append(NSAttributedString(string: "\n")) }
            for run in paragraph {
                var font = run.code ? UIFont.monospacedSystemFont(ofSize: fontSize * 0.9, weight: .regular) : base
                var traits: UIFontDescriptor.SymbolicTraits = []
                if run.bold { traits.insert(.traitBold) }
                if run.italic { traits.insert(.traitItalic) }
                if !traits.isEmpty, let descriptor = font.fontDescriptor.withSymbolicTraits(traits) {
                    font = UIFont(descriptor: descriptor, size: font.pointSize)
                }
                var attributes: [NSAttributedString.Key: Any] = [
                    .font: font, .foregroundColor: UIColor.label, .paragraphStyle: style,
                ]
                if run.code { attributes[.backgroundColor] = UIColor.tertiarySystemFill }
                if showReadings, let reading = run.reading {
                    let ruby = CTRubyAnnotationCreateWithAttributes(
                        .center, .auto, .before, reading as CFString,
                        [kCTRubyAnnotationSizeFactorAttributeName: 0.56] as CFDictionary)
                    attributes[NSAttributedString.Key(kCTRubyAnnotationAttributeName as String)] = ruby
                }
                // A line break inside a paragraph stays in the same paragraph (no paragraph spacing).
                let text = run.text == "\n" ? "\u{2028}" : run.text
                result.append(NSAttributedString(string: text, attributes: attributes))
            }
        }
        return result
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
