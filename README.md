# kelolin_orch

Codex CLI を使って、GitHub Issue ベースのタスクを Task List の順番どおりに直列実行する Node.js オーケストレータです。

## 前提

- Node.js
- git
- GitHub CLI (`gh`)
- Codex CLI (`codex`)
- `gh` と `codex` は事前に認証済み
- 対象リポジトリは指定ブランチ上で clean な working tree

## 構成

```text
targets/                 対象リポジトリ設定
tasks/                   実行する Issue と Task 種別
prompts/                 Task 種別ごとの Codex prompt template
logs/                    実行ログ出力先
src/                     Orchestrator 本体
```

## 設定

Target 設定例:

```json
{
  "targetId": "stampo",
  "repositoryPath": "../stampo",
  "branch": "dev",
  "remote": "origin"
}
```

`repositoryPath` の相対パスは、Orchestrator を実行するカレントディレクトリから解決されます。

Task List 例:

```json
{
  "targetId": "stampo",
  "tasks": [
    { "issue": 404, "type": "design" },
    { "issue": 414, "type": "development" }
  ]
}
```

`type` は `development` または `design` のみ対応します。

## 実行

```bash
node src/index.js --target targets/stampo.json --tasks tasks/stampo/tasks.json
```

または:

```bash
npm start -- --target targets/stampo.json --tasks tasks/stampo/tasks.json
```

## 動作概要

1. Target 設定と Task List を読み込み、最低限の validation を行う
2. 対象リポジトリが Git repository、指定ブランチ、clean working tree であることを確認する
3. Task List の上から順に `codex exec` を実行する
4. Codex の exit code が 0 であることを確認する
5. `gh issue view` で対象 Issue のコメントを取得し、最新の完了コメントを探す
6. 完了コメントから `Commit: <commit-id>` を抽出する
7. `git fetch <remote>` 後、remote branch に commit が存在することを確認する
8. すべて成功した場合のみ次 Task へ進む

完了コメントには以下が必要です。

```text
Status: COMPLETED
Commit: <最終的にPushしたCommit ID>
```

失敗時はその時点で中断し、非 0 の終了コードを返します。自動 retry や runtime state の保存は行いません。

## 確認

```bash
npm run check
```
