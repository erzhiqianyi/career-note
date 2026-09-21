# Profile library design QA

final result: passed

## Visual truth and evidence

Selected target: first displayed design from the current ideation set (compact horizontal categories and full-width records).
Source image: `external generated-image artifact (path intentionally omitted)`.
Evidence directory: `external evidence directory (path intentionally omitted; contains personal data)`.
Implementation: `profile-after.png`. Combined comparison: `profile-comparison.png`. Responsive evidence: `profile-mobile.png`.
Source and implementation: 1487 × 1058 pixels; browser viewport 1487 × 1058 CSS pixels, 1× density, no normalization. State: Japanese profile library, employment selected, auxiliary menus closed.
Mobile: 390 × 844 CSS pixels; vertical scrollbar uses 15 pixels, document width and scroll width are both 375; no horizontal overflow.

## Findings and accepted constraints

No remaining actionable P0/P1/P2 findings in the scoped profile-list redesign.

- Typography: retained the established system font and Japanese fallback. Identity, category, company, role and dates have distinct weights and sizes. Long real titles wrap instead of truncating. The production type scale is slightly smaller than the generated mock to stay consistent with the existing application.
- Layout: removed the large bordered identity card, permanent status strip, secondary vertical navigation and table heading. Horizontal category navigation and wide records follow the selected structure. Native application sidebar width and global header remain consistent with other pages, instead of copying the mock's enlarged app chrome.
- Tokens: reused application foreground/accent tokens on a white surface, with hairline separators and visible focus outlines. Existing accent hue is preserved rather than introducing the image's brighter blue.
- Assets: reused the existing brand mark, initial avatar and installed outline icon system; no new decorative raster assets were needed.
- Copy: actual stored names, roles and dates remain intact; generated mock abbreviations were not written into user data. All newly introduced controls have Chinese, Japanese and English strings. Source and verification data remain available in details and on-demand tools.

Full-view comparison checks region proportions, whitespace and information density. Text and interactive controls were separately inspected at native screenshot size in desktop and mobile captures; no additional crop was needed because these regions were readable.

## Iteration history

1. Initial implementation exposed an omitted shared category constant during hot reload. Restored it; typecheck and detail/editor navigation pass.
2. Global `details` margin offset the category dropdown and overflow menu. Scoped the margin to zero and aligned summaries with horizontal tabs; verified the expanded dropdown and category selection.
3. Narrow viewport inherited desktop sidebar margin; scoped the profile main margin to zero below 700px. Identity actions could squeeze text; moved them to the following row. Final mobile screenshot confirms full-width content, readable identity and no horizontal overflow. Viewport transitions were allowed to settle before accepting captures.
4. Removed date and local runtime status from the scoped profile header while keeping language and refresh controls.

## Interaction and verification checklist

- Primary category switch and secondary language category selection: passed.
- Existing record edit opens original fields; return restores selected category: passed.
- Status tools expand from overflow, pending filter gives correct empty state: passed.
- Closing tools retains a visible active filter; clear filter restores records: passed.
- Desktop and phone layout: passed.
- Existing unit/integration suite: 35 passed.
- TypeScript: passed. Documentation checks: passed. Production build: passed.
- Console: earlier hot-reload reference error fixed; no new errors observed after reload.
- Real records were not saved, changed, archived or deleted during UI verification. Save/persistence paths are unchanged; coverage comes from the existing tests rather than test writes into personal records.

## Follow-up polish

P3: the existing shared record-back button still uses its original label. This predates and is outside the profile-list layout change.
