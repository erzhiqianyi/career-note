/** A4 application-copy styles shared by the saved-material print preview. */
export function materialPrintBody(kind: '履歴書' | '職務経歴書', body: string) {
  if (kind !== '履歴書') return body;
  return body.replace(
    /(<h2>(?:志望動機[^<]*|本人希望記入欄)<\/h2>)([\s\S]*?)(?=<h2>|$)/g,
    (_match, heading: string, content: string) => `<section class="application-box">${heading}<div class="application-box-content">${content}</div></section>`,
  );
}

export function materialPrintStyle(kind: '履歴書' | '職務経歴書') {
  const common = `
    @page{size:A4;margin:0}
    *{box-sizing:border-box}
    html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    body{margin:0;background:#e9edf1;color:#111}
    main{position:relative;width:210mm;max-width:100%;min-height:297mm;margin:10mm auto;padding:14mm 16mm;background:#fff;overflow-wrap:anywhere}
    p{white-space:pre-wrap;orphans:3;widows:3}
    h1,h2,h3{break-after:avoid}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    th,td{vertical-align:top;overflow-wrap:anywhere}
    thead{display:table-header-group}
    tr,li{break-inside:avoid}
    img{max-width:100%}
    a{color:#204d85;text-decoration:none}
    @media print{body{background:#fff}main{width:auto;max-width:none;min-height:0;margin:0;padding:14mm 16mm;box-decoration-break:clone;-webkit-box-decoration-break:clone}}
  `;
  const rirekisho = `
    body{font:9pt/1.5 "Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif}
    h1{font-size:20pt;letter-spacing:.28em;line-height:1.2;margin:0 0 3mm;font-weight:600}
    h1+p{text-align:right;font-size:8pt;margin:-5mm 0 3mm}
    h2{font-size:9pt;font-weight:400;margin:5mm 0 0;padding:1.5mm 2mm;background:#f2f2f2;border:1px solid #333}
    h2+table{margin-top:-1px}
    table{margin:0 0 4mm;border:1px solid #333}
    th,td{border:1px solid #333;padding:1.15mm 1.7mm;line-height:1.35}
    th{font-weight:400;background:#f3f3f3}
    main>table:first-of-type th:first-child{width:23mm}
    main.has-photo>table:first-of-type{width:calc(100% - 34mm)}
    .passport-photo{position:absolute;top:28mm;right:16mm;width:30mm;height:40mm;border:1px solid #333;object-fit:cover}
    main>table:first-of-type thead{display:none}
    main>table:first-of-type td{min-height:5mm}
    main>table:first-of-type tbody tr:first-child td{font-size:16pt;letter-spacing:.1em}
    main>table:not(:first-of-type) th:nth-child(1),main>table:not(:first-of-type) td:nth-child(1){width:16mm;text-align:center;white-space:nowrap;overflow-wrap:normal;word-break:normal}
    main>table:not(:first-of-type) th:nth-child(2),main>table:not(:first-of-type) td:nth-child(2){width:10mm;text-align:center;white-space:nowrap;overflow-wrap:normal;word-break:normal}
    main>table:not(:first-of-type) td:last-child{padding-left:2mm}
    h2:nth-of-type(2){break-before:page;margin-top:0}
    .application-box{margin:4mm 0;break-inside:avoid}
    .application-box h2{margin:0}
    .application-box-content{min-height:24mm;padding:2mm;border:1px solid #333;border-top:0}
    .application-box-content p{margin:0 0 1mm;text-align:left}
    main>p:last-child{text-align:right}
    @media print{.passport-photo{top:28mm;right:16mm}}
  `;
  const shokumu = `
    body{font:9pt/1.55 "Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif}
    h1{text-align:center;font-size:16pt;letter-spacing:.32em;margin:0 0 3mm;font-weight:700}
    h1+p{text-align:right;margin:0 0 3mm;font-size:8pt;line-height:1.45}
    h2{font-size:10pt;line-height:1.35;margin:4mm 0 2mm;padding:1.3mm 2mm;border-left:2.5px solid #294c79;background:#ebeff4;font-weight:700}
    h3{font-size:9.3pt;line-height:1.4;margin:3mm 0 1mm;padding-bottom:.7mm;border-bottom:1px solid #999;font-weight:700}
    p{margin:0 0 1.8mm}
    table{margin:1mm 0 3mm;font-size:8.5pt}
    th,td{padding:1mm 1.3mm;border:1px solid #929292;line-height:1.4;text-align:left}
    th{background:#f1f1f1;font-weight:700}
    table th:first-child{width:25%}
    ul,ol{margin:0 0 2mm;padding-left:4mm}
    li{padding-left:.3mm;margin:0 0 1mm}
    li::marker{color:#294c79}
    strong{font-weight:700}
    main>p:last-child{text-align:right}
  `;
  return common + (kind === '履歴書' ? rirekisho : shokumu);
}
