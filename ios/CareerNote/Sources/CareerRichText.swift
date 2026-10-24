import Foundation

enum CareerRichText {
    private static let reading = try! NSRegularExpression(
        pattern: #"\{([^{}|\n]+)\|([ぁ-ゖァ-ヺー・]+)\}"#
    )
    private static let inline = try! NSRegularExpression(
        pattern: #"\{([^{}|\n]+)\|([ぁ-ゖァ-ヺー・]+)\}|\[([^\]\n]+)\]\((https?://[^\s)]+|mailto:[^\s)]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*|\x60([^\x60\n]+)\x60|(https?://[^\s<>]+)"#
    )

    static func plain(_ text: String) -> String {
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        var result = text
        for match in reading.matches(in: text, range: range).reversed() {
            guard let total = Range(match.range, in: result),
                  let base = Range(match.range(at: 1), in: text) else { continue }
            guard text[base].unicodeScalars.contains(where: isKanji) else { continue }
            result.replaceSubrange(total, with: String(text[base]))
        }
        return result
    }

    /// The saved source remains intact; application copies omit internal review sections.
    static func applicationContent(_ source: String) -> String {
        let normalized = source.replacingOccurrences(of: "\r\n", with: "\n")
            .replacingOccurrences(of: "\r", with: "\n")
            .replacingOccurrences(of: #"\n[ \t]*\n(?:[ \t]*\n)*"#, with: "\n\n", options: .regularExpression)
        let blocks = normalized.components(separatedBy: "\n\n")
        var output: [String] = []
        var internalLevel = 0
        for block in blocks {
            let trimmed = block.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { continue }
            let first = trimmed.components(separatedBy: "\n")[0]
            let hashes = first.prefix { $0 == "#" }.count
            let isHeading = (1...6).contains(hashes) && first.dropFirst(hashes).hasPrefix(" ")
            if internalLevel > 0 && isHeading && hashes <= internalLevel { internalLevel = 0 }
            let label = isHeading ? String(first.dropFirst(hashes + 1)) : first
            let clean = label.trimmingCharacters(in: CharacterSet(charactersIn: " >-*　"))
            let internalNote = clean.range(
                of: #"^(?:内部核对|内部確認|内部审阅|内部備考|internal (?:review|note))(?=[\s，,:：、（(]|$)"#,
                options: [.regularExpression, .caseInsensitive]
            ) != nil
            if internalNote && isHeading { internalLevel = hashes }
            if !internalNote && internalLevel == 0 { output.append(block) }
        }
        return output.joined(separator: "\n\n").trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func applicationHTML(_ source: String, kind: String, photo: Data? = nil) -> String {
        let isResume = kind == "履歴書"
        let lines = applicationContent(source).components(separatedBy: "\n")
        var sections: [String] = []
        var plainLines: [String] = []
        func flushPlain() {
            guard !plainLines.isEmpty else { return }
            sections.append(blocks(plainLines.joined(separator: "\n"), showReadings: false))
            plainLines.removeAll()
        }
        var index = 0
        while index < lines.count {
            let line = lines[index].trimmingCharacters(in: .whitespaces)
            let next = index + 1 < lines.count ? lines[index + 1].trimmingCharacters(in: .whitespaces) : ""
            if line.hasPrefix("|"), line.hasSuffix("|"), next.range(of: #"^\|?[\s:|-]+\|?$"#, options: .regularExpression) != nil {
                flushPlain()
                func cells(_ row: String, tag: String) -> String {
                    row.dropFirst().dropLast().split(separator: "|", omittingEmptySubsequences: false)
                        .map { "<\(tag)>" + renderInline(String($0).trimmingCharacters(in: .whitespaces), showReadings: false) + "</\(tag)>" }
                        .joined()
                }
                var table = "<table><thead><tr>" + cells(line, tag: "th") + "</tr></thead><tbody>"
                index += 2
                while index < lines.count {
                    let row = lines[index].trimmingCharacters(in: .whitespaces)
                    guard row.hasPrefix("|"), row.hasSuffix("|") else { break }
                    table += "<tr>" + cells(row, tag: "td") + "</tr>"
                    index += 1
                }
                sections.append(table + "</tbody></table>")
                continue
            }
            plainLines.append(lines[index])
            index += 1
        }
        flushPlain()
        var body = sections.joined(separator: "\n")
        if isResume {
            let pattern = #"(<h2>(?:志望動機[^<]*|本人希望記入欄)</h2>)([\s\S]*?)(?=<h2>|$)"#
            if let expression = try? NSRegularExpression(pattern: pattern) {
                let range = NSRange(body.startIndex..<body.endIndex, in: body)
                body = expression.stringByReplacingMatches(in: body, range: range,
                    withTemplate: #"<section class="application-box">$1<div class="application-box-content">$2</div></section>"#)
            }
        }
        let photoType: String? = photo.flatMap { bytes in
            if bytes.starts(with: [0x89, 0x50, 0x4e, 0x47]) { return "image/png" }
            if bytes.starts(with: [0xff, 0xd8, 0xff]) { return "image/jpeg" }
            if bytes.count >= 12 && String(data: bytes.prefix(4), encoding: .ascii) == "RIFF"
                && String(data: bytes.dropFirst(8).prefix(4), encoding: .ascii) == "WEBP" { return "image/webp" }
            return nil
        }
        let photoHTML = isResume && photoType != nil
            ? "<img class=\"passport-photo\" alt=\"証明写真\" src=\"data:\(photoType!);base64,\(photo!.base64EncodedString())\">"
            : ""
        let layout = isResume ? "rirekisho" : "shokumu"
        return """
        <!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:">
        <style>
        @page{size:A4;margin:14mm 16mm}*{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
        body{margin:0;background:#e9edf1;color:#111}main{position:relative;width:210mm;max-width:100%;min-height:297mm;margin:10mm auto;padding:14mm 16mm;background:#fff;overflow-wrap:anywhere}
        p{white-space:pre-wrap;orphans:3;widows:3}h1,h2,h3{break-after:avoid}table{width:100%;border-collapse:collapse;table-layout:fixed}
        th,td{vertical-align:top;overflow-wrap:anywhere}thead{display:table-header-group}tr,li{break-inside:avoid}a{color:#204d85;text-decoration:none}
        .rirekisho{font:9pt/1.5 "Hiragino Mincho ProN","Yu Mincho",serif}.rirekisho h1{font-size:20pt;letter-spacing:.28em;line-height:1.2;margin:0 0 3mm}
        .rirekisho h1+p{text-align:right;font-size:8pt;margin:-5mm 0 3mm}.rirekisho h2{font-size:9pt;font-weight:400;margin:5mm 0 0;padding:1.5mm 2mm;background:#f2f2f2;border:1px solid #333}
        .rirekisho h2+table{margin-top:-1px}.rirekisho table{margin:0 0 4mm;border:1px solid #333}.rirekisho th,.rirekisho td{border:1px solid #333;padding:1.15mm 1.7mm;line-height:1.35}
        .rirekisho th{font-weight:400;background:#f3f3f3}.rirekisho>table:first-of-type thead{display:none}.rirekisho>table:first-of-type th:first-child{width:23mm}
        .rirekisho>table:first-of-type tbody tr:first-child td{font-size:16pt;letter-spacing:.1em}.rirekisho>table:not(:first-of-type) th:nth-child(1),.rirekisho>table:not(:first-of-type) td:nth-child(1){width:14mm;text-align:center}
        .rirekisho>table:not(:first-of-type) th:nth-child(2),.rirekisho>table:not(:first-of-type) td:nth-child(2){width:9mm;text-align:center}.rirekisho>h2:nth-of-type(2){break-before:page;margin-top:0}
        .rirekisho.has-photo>table:first-of-type{width:calc(100% - 34mm)}.passport-photo{position:absolute;top:28mm;right:16mm;width:30mm;height:40mm;border:1px solid #333;object-fit:cover}
        .application-box{margin:4mm 0;break-inside:avoid}.application-box h2{margin:0}.application-box-content{min-height:24mm;padding:2mm;border:1px solid #333;border-top:0}.application-box-content p{margin:0 0 1mm;text-align:left}
        .shokumu{font:9pt/1.55 "Hiragino Sans","Yu Gothic",sans-serif}.shokumu h1{text-align:center;font-size:16pt;letter-spacing:.32em;margin:0 0 3mm}
        .shokumu h1+p{text-align:right;margin:0 0 3mm;font-size:8pt;line-height:1.45}.shokumu h2{font-size:10pt;margin:4mm 0 2mm;padding:1.3mm 2mm;border-left:2.5px solid #294c79;background:#ebeff4}
        .shokumu h3{font-size:9.3pt;margin:3mm 0 1mm;padding-bottom:.7mm;border-bottom:1px solid #999}.shokumu p{margin:0 0 1.8mm}
        .shokumu table{margin:1mm 0 3mm;font-size:8.5pt}.shokumu th,.shokumu td{padding:1mm 1.3mm;border:1px solid #929292;line-height:1.4;text-align:left}.shokumu th{background:#f1f1f1}
        .shokumu table th:first-child{width:25%}.shokumu ul,.shokumu ol{margin:0 0 2mm;padding-left:4mm}.shokumu li{margin:0 0 1mm}.shokumu li::marker{color:#294c79}
        @media screen and (max-width:800px){main{width:100%;min-height:0;margin:0;padding:18px}.passport-photo{top:40px;right:18px}}
        @media print{body{background:#fff}main{width:auto;max-width:none;min-height:0;margin:0;padding:0}.passport-photo{top:10mm;right:0}}
        </style></head><body><main class="\(layout)\(photoHTML.isEmpty ? "" : " has-photo")">\(body)\(photoHTML)</main></body></html>
        """
    }

    static func html(_ source: String, markdown: Bool, showReadings: Bool,
                     fontSize: CGFloat = 17) -> String {
        let body = markdown ? blocks(source, showReadings: showReadings)
            : "<p>" + source.components(separatedBy: "\n")
                .map { renderInline($0, showReadings: showReadings) }
                .joined(separator: "<br>") + "</p>"
        let size = max(14, min(34, fontSize))
        return """
        <!doctype html><html lang="ja"><head><meta name="viewport" content="width=device-width,initial-scale=1">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
        <style>
        :root{color-scheme:light dark}*{box-sizing:border-box}
        html,body{margin:0;padding:0;background:transparent}
        body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:\(size)px;line-height:1.65;color:#222;overflow-wrap:anywhere}
        h1,h2,h3,h4,h5,h6{line-height:1.35;margin:1em 0 .45em;font-weight:700}
        h1{font-size:1.35em}h2{font-size:1.23em}h3{font-size:1.12em}
        p,ul,ol,blockquote,pre{margin:.7em 0}body>:first-child{margin-top:0}body>:last-child{margin-bottom:0}
        ul,ol{padding-left:1.4em}li{margin:.25em 0}
        blockquote{border-left:3px solid #9aa8c5;padding-left:.8em;color:#596171}
        a{color:#315a9e;text-decoration:underline}
        code{font-family:ui-monospace,Menlo,monospace;font-size:.9em;background:#e8eaf0;padding:.08em .22em;border-radius:4px}
        pre{white-space:pre-wrap;background:#e8eaf0;padding:.75em;border-radius:8px}pre code{padding:0}
        hr{border:0;border-top:1px solid #d4d8e0;margin:1em 0}
        ruby{ruby-position:over;white-space:nowrap}rt{font-size:.56em;color:#657087}
        @media(prefers-color-scheme:dark){body{color:#f3f4f7}blockquote{color:#b7bfca}code,pre{background:#323540}hr{border-color:#515560}rt{color:#b8c3d9}a{color:#9bbcf5}}
        </style></head><body>\(body)
        <script>
        const report=()=>window.webkit.messageHandlers.height.postMessage(Math.ceil(document.documentElement.scrollHeight)+2);
        new ResizeObserver(report).observe(document.body);window.addEventListener('load',report);report();
        </script></body></html>
        """
    }

    private static func blocks(_ source: String, showReadings: Bool) -> String {
        let lines = source.replacingOccurrences(of: "\r\n", with: "\n")
            .components(separatedBy: "\n")
        var output: [String] = []
        var paragraph: [String] = []
        var list: String?
        var code: [String]?

        func flushParagraph() {
            guard !paragraph.isEmpty else { return }
            output.append("<p>" + paragraph.map {
                renderInline($0, showReadings: showReadings)
            }.joined(separator: "<br>") + "</p>")
            paragraph.removeAll()
        }
        func closeList() {
            if let list { output.append("</\(list)>") }
            list = nil
        }
        for line in lines {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("```") {
                flushParagraph(); closeList()
                if let saved = code {
                    output.append("<pre><code>" + escape(saved.joined(separator: "\n")) + "</code></pre>")
                    code = nil
                } else { code = [] }
                continue
            }
            if code != nil { code!.append(line); continue }
            if trimmed.isEmpty { flushParagraph(); closeList(); continue }
            if let heading = heading(line) {
                flushParagraph(); closeList()
                output.append("<h\(heading.0)>" + renderInline(heading.1, showReadings: showReadings) + "</h\(heading.0)>")
                continue
            }
            if ["---", "***", "___"].contains(trimmed) {
                flushParagraph(); closeList(); output.append("<hr>"); continue
            }
            if trimmed.hasPrefix("> ") {
                flushParagraph(); closeList()
                output.append("<blockquote>" + renderInline(String(trimmed.dropFirst(2)),
                                                             showReadings: showReadings) + "</blockquote>")
                continue
            }
            let bullet = trimmed.hasPrefix("- ") || trimmed.hasPrefix("* ") || trimmed.hasPrefix("+ ")
            let ordered = trimmed.range(of: #"^\d+\. "#, options: .regularExpression)
            if bullet || ordered != nil {
                flushParagraph()
                let kind = bullet ? "ul" : "ol"
                if list != kind { closeList(); output.append("<\(kind)>"); list = kind }
                let content = bullet ? String(trimmed.dropFirst(2))
                    : String(trimmed[ordered!.upperBound...])
                output.append("<li>" + renderInline(content, showReadings: showReadings) + "</li>")
                continue
            }
            closeList()
            paragraph.append(line)
        }
        flushParagraph(); closeList()
        if let code { output.append("<pre><code>" + escape(code.joined(separator: "\n")) + "</code></pre>") }
        return output.joined(separator: "\n")
    }

    private static func heading(_ line: String) -> (Int, String)? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        let hashes = trimmed.prefix { $0 == "#" }.count
        guard (1...6).contains(hashes), trimmed.dropFirst(hashes).hasPrefix(" ") else { return nil }
        return (hashes, String(trimmed.dropFirst(hashes + 1)))
    }

    private static func renderInline(_ source: String, showReadings: Bool) -> String {
        let range = NSRange(source.startIndex..<source.endIndex, in: source)
        var result = ""
        var offset = source.startIndex
        for match in inline.matches(in: source, range: range) {
            guard let full = Range(match.range, in: source) else { continue }
            result += escape(String(source[offset..<full.lowerBound]))
            func group(_ number: Int) -> String? {
                guard let range = Range(match.range(at: number), in: source) else { return nil }
                return String(source[range])
            }
            if let base = group(1), let kana = group(2), base.unicodeScalars.contains(where: isKanji) {
                result += showReadings
                    ? "<ruby>\(escape(base))<rt>\(escape(kana))</rt></ruby>"
                    : escape(base)
            } else if let label = group(3), let rawURL = group(4),
                      let url = URL(string: rawURL),
                      ["https", "http", "mailto"].contains(url.scheme?.lowercased() ?? "") {
                result += "<a href=\"\(escape(rawURL))\">\(escape(label))</a>"
            } else if let strong = group(5) {
                result += "<strong>" + renderInline(strong, showReadings: showReadings) + "</strong>"
            } else if let emphasis = group(6) {
                result += "<em>" + renderInline(emphasis, showReadings: showReadings) + "</em>"
            } else if let code = group(7) {
                result += "<code>" + escape(code) + "</code>"
            } else if let rawURL = group(8) {
                let clean = rawURL.trimmingCharacters(in: CharacterSet(charactersIn: ".,;:!?)。）、，；：！？」"))
                if let url = URL(string: clean), ["https", "http"].contains(url.scheme?.lowercased() ?? "") {
                    result += "<a href=\"\(escape(clean))\">\(escape(clean))</a>"
                    result += escape(String(rawURL.dropFirst(clean.count)))
                } else {
                    result += escape(rawURL)
                }
            } else {
                result += escape(String(source[full]))
            }
            offset = full.upperBound
        }
        result += escape(String(source[offset...]))
        return result
    }

    private static func isKanji(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.value {
        case 0x3400...0x9FFF, 0xF900...0xFAFF, 0x3005, 0x3006, 0x30F6: return true
        default: return false
        }
    }

    private static func escape(_ text: String) -> String {
        text.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
            .replacingOccurrences(of: "'", with: "&#39;")
    }
}
