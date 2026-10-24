import Foundation
@main struct Smoke {
  static func main() {
    let source = "# {自己紹介|じこしょうかい}\n\n- **{開発|かいはつ}** <script>\n\nhttps://example.com/page"
    let on = CareerRichText.html(source, markdown: true, showReadings: true)
    let off = CareerRichText.html(source, markdown: true, showReadings: false)
    precondition(on.contains("<h1><ruby>自己紹介<rt>じこしょうかい</rt></ruby></h1>"))
    precondition(on.contains("<li><strong><ruby>開発<rt>かいはつ</rt></ruby></strong> &lt;script&gt;</li>"))
    precondition(on.contains("<a href=\"https://example.com/page\">"))
    precondition(!off.contains("<ruby>"))
    precondition(off.contains("<h1>自己紹介</h1>"))
    precondition(CareerRichText.plain("{自己紹介|じこしょうかい}") == "自己紹介")
    let application = "# 履歴書\n\n| 氏名 | 山田 太郎 |\n| --- | --- |\n| 住所 | 東京 |\n\n## 内部確認\n\n- フェアで職種を確認する。\n\n## 志望動機\n\nアプリを開発したい。"
    let printable = CareerRichText.applicationContent(application)
    precondition(!printable.contains("内部確認"))
    precondition(!printable.contains("フェアで"))
    precondition(printable.contains("志望動機"))
    let layout = CareerRichText.applicationHTML(application, kind: "履歴書", photo: Data([0x89, 0x50, 0x4e, 0x47]))
    precondition(layout.contains("@page{size:A4"))
    precondition(layout.contains("<table>"))
    precondition(layout.contains("data:image/png;base64,"))
    precondition(!layout.contains("フェアで"))
    print("Rich text, ruby toggle, links, and escaping passed")
  }
}
