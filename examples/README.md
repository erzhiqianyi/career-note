# 架空データで試す

すべてデモ。実際の企業・求人・個人経歴ではない。実データとは別の、空の保存先を `.env` で指定して `npm run dev` を起動する。

```sh
node scripts/career-data.mjs preview examples/demo-jobs.json
node scripts/career-data.mjs import examples/demo-jobs.json
node scripts/career-data.mjs preview examples/demo-materials.json
node scripts/career-data.mjs import examples/demo-materials.json
```

画面で「サンプル株式会社（架空）」と資料を確認する。二度目の材料 import は同じ版 ID として拒否される。テストをやり直すなら別の空保存先を使う。求人と関連資料は順に分けて取り込む。

Google 認証を有効にした環境では CLI の `CAREER_API_TOKEN` が必要。`CAREER_API_URL` でカスタム API ポートを指定できる。実際のデータを削除してデモ環境を作らない。
