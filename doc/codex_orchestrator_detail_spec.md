# オーケストレータ詳細仕様書（Codex実装向け）

## 1. 目的

本仕様書は、Stampoアプリ開発において、事前に定義されたGitHub IssueをCodex CLIへ順番に実行させるための
「Codex Orchestrator」初期MVPの実装仕様を定義する。

本MVPでは、汎用的なジョブ管理基盤や高度な自動判定機構は実装せず、以下を実現することを目的とする。

- GitHub IssueをTask本体として扱う
- Task Listに定義されたIssueを上から順番に直列実行する
- Task種別に対応したPrompt Templateを用いてCodex CLIを実行する
- CodexがIssue確認、作業、テスト、Commit、Push、Issue結果投稿まで実施する
- OrchestratorはTask終了後に最低限の正常終了確認を行う
- Taskが正常終了している場合のみ次Taskへ進む
- Taskが正常終了していない場合は、その時点で全体処理を中断する
- 実行結果はログとして保存する

---

## 2. 対象Repository

初期版では開発対象をStampoアプリに限定する。

Orchestrator RepositoryとStampo Repositoryは兄弟フォルダとして配置する。

例：

```text
C:\work\codex-orchestrator
C:\work\stampo
```

Orchestrator自身はStampo Repository内には配置しない。

Orchestrator Repository：

```text
https://github.com/gilgame-tencho/kelolin_orch.git
```

Stampo Repositoryのパス、想定Branch、Remote URL等はTarget設定ファイルで管理する。

---

## 3. 前提条件

### 3.1 実行環境

以下がローカル環境で利用可能であることを前提とする。

- Node.js
- npm
- git
- GitHub CLI (`gh`)
- Codex CLI (`codex`)

### 3.2 認証

以下の認証が事前に完了していることを前提とする。

- Codex CLIが利用可能な状態である
- `gh` CLIがGitHubへログイン済みである
- 対象Repositoryの参照、Commit、Pushが可能である
- GitHub Issueの参照およびコメント投稿が可能である

### 3.3 Codex exec

Stampo Repositoryにおいて、`codex exec` による非対話実行が可能であることは事前確認済みとする。

Orchestratorでは、新たなCodex利用方式を構築せず、確認済みの `codex exec` 実行方式をNode.jsから起動する。

---

## 4. 基本方針

初期MVPでは以下を基本方針とする。

- Taskの詳細内容はGitHub Issueで管理する
- Task ListにはIssue番号とTask種別のみを記載する
- Task Listの配列順を実行順とする
- Taskは必ず1件ずつ直列実行する
- Task依存関係の自動解決は行わない
- Task優先度の自動判定は行わない
- Task内容の意味的レビューはOrchestratorでは行わない
- CodexがTask詳細を判断する
- Orchestratorは最低限の機械的な完了確認のみ行う
- Taskが正常終了していない場合は、以降のTaskを実行せず全体処理を中断する
- 自動Retryは行わない
- Runtime Stateは保持しない
- 再開時は人間がTask Listを修正してから再実行する

---

## 5. 想定ディレクトリ構成

```text
codex-orchestrator/
├─ targets/
│  └─ stampo.json
│
├─ tasks/
│  └─ stampo/
│     └─ sprint-xx.json
│
├─ prompts/
│  ├─ development.txt
│  └─ design.txt
│
├─ logs/
│
├─ src/
│  ├─ index.js
│  ├─ config.js
│  ├─ git.js
│  ├─ github.js
│  ├─ codex.js
│  └─ logger.js
│
├─ package.json
└─ README.md
```

ファイル分割は厳密な必須要件ではないが、責務分離を意識した構成とする。

### 各ディレクトリの役割

#### `targets/`

対象Repositoryに関する設定を管理する。

#### `tasks/`

実行するIssue番号とTask種別を順序付きで管理する。

#### `prompts/`

Task種別ごとのCodex Prompt Templateを管理する。

#### `logs/`

Orchestratorの実行ログを保存する。

#### `src/`

Orchestrator本体のNode.jsソースコードを配置する。

---

## 6. Target設定

Target設定はJSONファイルとして管理する。

例：

```json
{
  "targetId": "stampo",
  "repositoryPath": "../stampo",
  "branch": "dev",
  "remote": "origin"
}
```

### 6.1 必須項目

| 項目 | 内容 |
|---|---|
| `targetId` | 対象識別子。初期版では `stampo` |
| `repositoryPath` | Codexを実行するRepositoryのパス |
| `branch` | Task List実行時に使用する想定Branch |
| `remote` | Push確認対象のGit remote名。通常 `origin` |

### 6.2 初期版では不要な設定

以下はTarget設定に持たせない。

- Task別Timeout
- Task別Retry
- Task別Codex設定
- Task依存関係
- Branch自動作成設定
- Pull Request設定

---

## 7. Task List

Task ListはJSONファイルとして管理する。

例：

```json
{
  "targetId": "stampo",
  "tasks": [
    {
      "issue": 404,
      "type": "design"
    },
    {
      "issue": 414,
      "type": "development"
    },
    {
      "issue": 415,
      "type": "development"
    }
  ]
}
```

### 7.1 Task項目

初期版では以下のみを定義する。

| 項目 | 内容 |
|---|---|
| `issue` | GitHub Issue番号 |
| `type` | Task種別 |

### 7.2 Task ID

独自Task IDは定義しない。

GitHub Issue番号をTask識別子として扱う。

### 7.3 実行順

`tasks` 配列の上から順番に実行する。

Orchestratorによる並び替えは行わない。

### 7.4 再開時

Orchestratorは過去の実行状態を管理しない。

途中失敗後に再開する場合は、人間がTask Listから完了済みTaskを削除するなど、Task Listを適切に修正してから再度実行する。

例：

実行前：

```json
{
  "tasks": [
    { "issue": 414, "type": "development" },
    { "issue": 415, "type": "development" },
    { "issue": 416, "type": "design" }
  ]
}
```

`#414` 完了後、`#415` で失敗した場合、再開時は人間が以下のように修正する。

```json
{
  "tasks": [
    { "issue": 415, "type": "development" },
    { "issue": 416, "type": "design" }
  ]
}
```

---

## 8. Task種別

初期MVPでは以下の2種類のみを扱う。

```text
development
design
```

### 8.1 development

GitHub Issueに定義された内容に基づき、Codexが実装、テスト、Commit、Push、Issue結果投稿まで実施する。

### 8.2 design

GitHub Issueに定義された内容に基づき、Codexが設計作業、必要なファイル更新、確認、Commit、Push、Issue結果投稿まで実施する。

### 8.3 未知のTask種別

`development` / `design` 以外のTask種別がTask Listに定義されていた場合は、Codexを起動せずOrchestratorを異常終了させる。

---

## 9. Prompt Template

PromptはTask Listへ直接記載せず、Task種別ごとのTemplateファイルとして管理する。

Issue番号をTemplateへ埋め込んでCodexへ渡す。

### 9.1 development Template

`prompts/development.txt`

```text
#{issue} の実装Taskを実施してください。

対象Issueの内容を確認し、必要な調査、実装、テスト、確認を実施してください。

作業完了後は以下まで実施してください。
- Commit
- Remote RepositoryへのPush
- 対象Issueへの実施結果コメント投稿

Commit MessageにはIssue番号を含めてください。

Issueへの完了コメントには、Orchestratorが機械的に完了確認できるよう、
必ず以下の2行を含めてください。

Status: COMPLETED
Commit: <最終的にPushしたCommit ID>

上記すべてを完了できた場合のみ `Status: COMPLETED` としてください。
Commit、Push、Issueコメント投稿のいずれかを完了できない場合は、
完了コメントとして `Status: COMPLETED` を投稿しないでください。
```

### 9.2 design Template

`prompts/design.txt`

```text
#{issue} の設計Taskを実施してください。

対象Issueの内容を確認し、必要な調査、設計、ファイル更新、確認を実施してください。

作業完了後は以下まで実施してください。
- Commit
- Remote RepositoryへのPush
- 対象Issueへの実施結果コメント投稿

Commit MessageにはIssue番号を含めてください。

Issueへの完了コメントには、Orchestratorが機械的に完了確認できるよう、
必ず以下の2行を含めてください。

Status: COMPLETED
Commit: <最終的にPushしたCommit ID>

上記すべてを完了できた場合のみ `Status: COMPLETED` としてください。
Commit、Push、Issueコメント投稿のいずれかを完了できない場合は、
完了コメントとして `Status: COMPLETED` を投稿しないでください。
```

### 9.3 完了コメント

Issueコメント本文全体のフォーマットは自由とする。

ただし、正常終了時は必ず以下を含める。

```text
Status: COMPLETED
Commit: <commit-id>
```

例：

```text
対応完了しました。

主な対応内容:
- xxxを実装
- xxxを修正
- xxxのテストを追加

確認結果:
- npm test 成功

Status: COMPLETED
Commit: 1234567890abcdef1234567890abcdef12345678
```

---

## 10. Codex実行

### 10.1 Working Directory

Codexは必ずTarget設定の `repositoryPath` をWorking Directoryとして起動する。

### 10.2 Node.jsからの実行

Node.jsの子プロセスとして `codex exec` を起動する。

実装例の考え方：

```javascript
spawn("codex", ["exec", ...args], {
  cwd: repositoryPath
});
```

実際の引数、Prompt受け渡し方式については、Stampo Repositoryで動作確認済みの `codex exec` 実行方法に合わせること。

### 10.3 stdout / stderr

Codexのstdout / stderrはOrchestrator側で取得し、実行ログへ記録する。

CLI上にも可能な範囲でリアルタイム表示してよい。

### 10.4 Exit Code

Codexプロセス終了時のExit Codeを取得する。

Exit Codeが `0` 以外の場合、そのTaskは失敗とする。

Exit Codeが `0` であっても、それだけではTask成功とは扱わない。

---

## 11. Repository事前確認

Task List実行開始前に、Orchestratorは最低限以下を確認する。

1. `repositoryPath` が存在する
2. 対象パスがGit Repositoryである
3. 現在BranchがTarget設定の `branch` と一致する
4. Working TreeがCleanである

### 11.1 Repository Path

対象Pathが存在しない場合は処理中断する。

### 11.2 Git Repository確認

以下相当の確認を行う。

```bash
git rev-parse --is-inside-work-tree
```

Git Repositoryでない場合は処理中断する。

### 11.3 Branch確認

以下相当のコマンドで現在Branchを取得する。

```bash
git branch --show-current
```

Target設定の `branch` と一致しない場合は処理中断する。

### 11.4 Working Tree確認

以下相当のコマンドでWorking Treeを確認する。

```bash
git status --porcelain
```

出力が空でない場合は処理中断する。

### 11.5 Repositoryの厳密なRemote URL照合

初回MVPでは必須としない。

必要に応じて将来追加可能とする。

---

## 12. 1 Taskの基本サイクル

1 Taskは以下の流れで処理する。

```text
1. Task Listから次Taskを取得
      ↓
2. Issue番号とTask種別を取得
      ↓
3. Task種別に対応するPrompt Templateを読み込む
      ↓
4. Prompt内の {issue} をIssue番号へ置換
      ↓
5. Stampo RepositoryをWorking Directoryとして codex exec を起動
      ↓
6. CodexがIssue内容を取得
      ↓
7. Codexが設計 / 実装を実施
      ↓
8. Codexが必要なテスト・確認を実施
      ↓
9. CodexがCommit
      ↓
10. CodexがPush
      ↓
11. CodexがIssueへ完了コメントを投稿
      ↓
12. Codex終了
      ↓
13. OrchestratorがExit Codeを確認
      ↓
14. Issue完了コメントを確認
      ↓
15. コメントからCommit IDを取得
      ↓
16. Commit IDがRemote RepositoryへPush済みか確認
      ↓
17. すべてOKならTask成功
      ↓
18. 次Taskへ進む
```

いずれかの正常終了条件を満たさない場合、その時点で全体処理を中断する。

---

## 13. Task正常終了判定

Task成功条件は以下の3条件をすべて満たすこととする。

### 条件1：Codex Exit Code

```text
codex exec exit code == 0
```

Exit Codeが0以外の場合、即時Task失敗とする。

### 条件2：GitHub Issue完了コメント

対象Issueに、以下を含む完了コメントが存在すること。

```text
Status: COMPLETED
Commit: <commit-id>
```

OrchestratorはCodex終了後にGitHub Issueコメントを取得し、
正常終了を示すコメントを検索する。

### 条件3：CommitがRemoteへPush済み

完了コメントから取得したCommit IDが、対象RepositoryのRemote側に存在することを確認する。

確認対象RemoteはTarget設定の `remote` とする。

---

## 14. Issue完了コメントの取得

GitHub操作には `gh` CLIを利用する。

対象Issueのコメントを取得し、以下の2つを含むコメントを検索する。

```text
Status: COMPLETED
Commit: <commit-id>
```

### 14.1 検索対象

Codex実行後に存在するコメントのうち、完了形式に一致するコメントを対象とする。

初回MVPでは、投稿ユーザーの厳密な照合までは必須としない。

### 14.2 Commit ID抽出

以下に相当する形式でCommit IDを抽出する。

```regex
Commit:\s*([0-9a-fA-F]{7,40})
```

Commit IDが取得できない場合はTask失敗とする。

### 14.3 完了コメントが複数存在する場合

複数存在する場合は、最新の `Status: COMPLETED` コメントを使用する。

---

## 15. Push済みCommit確認

Issue完了コメントから取得したCommit IDがRemote Repositoryに存在することを確認する。

実装方法は、Gitコマンドで確実に判定できる方式を選択する。

例：

```bash
git fetch <remote>
```

後、Remote側の参照にCommitが含まれていることを確認する。

確認方法の一例：

```bash
git branch -r --contains <commit-id>
```

Target設定で指定したRemoteに属するRemote Branchが1件以上返れば、
Push済みと判定してよい。

または同等の判定方法を採用してよい。

### 15.1 注意

ローカルRepositoryにCommitが存在するだけでは正常終了としない。

必ずRemote側に存在することを確認する。

---

## 16. 1 Task = 1 Commitルール

運用上は原則として以下とする。

```text
1 Task = 1 Commit
```

Commit Messageには対象Issue番号を含める。

例：

```text
#414 implement xxx feature
```

ただし初回MVPでは、OrchestratorはCommit数を検証しない。

以下のようなケースでも、正常終了条件を満たしていればTask成功とする。

- Codexが複数Commitを作成した
- Issue完了コメントに最終Commit IDが記載されている
- そのCommit IDがRemoteへPush済みである

Commit数の検証は将来拡張候補とする。

---

## 17. Task失敗条件

以下のいずれかに該当する場合、Task失敗とする。

- Codex CLIを起動できない
- `codex exec` がExit Code 0以外で終了した
- Issue完了コメントを取得できない
- `Status: COMPLETED` コメントが存在しない
- 完了コメントからCommit IDを取得できない
- Commit IDがRemote Repositoryに存在しない
- GitHub CLIによるIssue確認に失敗した
- Remote確認処理に失敗した
- その他、正常終了判定を完了できない

Task失敗時は次Taskへ進まない。

---

## 18. Task失敗時のOrchestrator動作

Task失敗時は以下を行う。

1. 失敗TaskのIssue番号をログへ出力する
2. 失敗理由をログへ出力する
3. Codex stdout / stderrをログへ残す
4. Orchestrator全体を中断する
5. Orchestratorプロセスを非0の終了コードで終了する

自動Retryは行わない。

人間が原因を確認・修正したうえで、Task Listをメンテナンスし再実行する。

---

## 19. Runtime State

初回MVPではRuntime Stateファイルを持たない。

以下のような状態管理は実装しない。

```text
running
completed
failed
retrying
blocked
human_review
```

OrchestratorはTask Listをその都度先頭から処理する。

完了済みTaskを再実行したくない場合は、人間がTask Listを修正する。

---

## 20. ログ

### 20.1 目的

ログは以下を確認できることを目的とする。

- Orchestrator全体が正常完了したか
- どのTaskまで完了したか
- どのTaskで失敗したか
- なぜ処理が中断したか
- Codexがどのようなstdout / stderrを返したか

### 20.2 保存先

```text
logs/
```

### 20.3 ファイル名例

```text
20260913_010203_stampo_dev.log
```

日時を含め、実行単位で一意になるファイル名とする。

### 20.4 最低限のログ項目

- Orchestrator開始日時
- Target ID
- Task Listファイル
- Repository Path
- Branch
- Task総数
- 各TaskのIssue番号
- 各TaskのTask種別
- Task開始日時
- Task終了日時
- Codex Exit Code
- Codex stdout
- Codex stderr
- Issue完了コメント確認結果
- 抽出したCommit ID
- Remote Commit確認結果
- Task最終結果
- 全体完了 / 中断
- 中断理由

### 20.5 正常完了ログ例

```text
Orchestrator started
Target: stampo
Tasks: 3

[Task 1/3]
Issue: #414
Type: development
Codex exit code: 0
Issue completed comment: found
Commit: abc1234
Remote commit: found
Result: SUCCESS

[Task 2/3]
Issue: #415
Type: development
Codex exit code: 0
Issue completed comment: found
Commit: def5678
Remote commit: found
Result: SUCCESS

[Task 3/3]
Issue: #416
Type: design
Codex exit code: 0
Issue completed comment: found
Commit: 987abcd
Remote commit: found
Result: SUCCESS

Orchestrator completed successfully.
3 / 3 tasks completed.
```

### 20.6 異常終了ログ例

```text
Orchestrator started
Target: stampo
Tasks: 3

[Task 1/3]
Issue: #414
Type: development
Codex exit code: 0
Issue completed comment: found
Commit: abc1234
Remote commit: found
Result: SUCCESS

[Task 2/3]
Issue: #415
Type: development
Codex exit code: 0
Issue completed comment: found
Commit: def5678
Remote commit: NOT FOUND
Result: FAILED

Orchestrator aborted.
Completed: 1 / 3
Failed task: #415
Reason: commit def5678 was not found on remote.
```

---

## 21. Orchestrator全体の終了コード

Orchestrator自身もOSプロセスとして終了コードを返す。

### 正常終了

すべてのTaskが成功した場合：

```text
exit code = 0
```

### 異常終了

以下の場合：

```text
exit code != 0
```

対象例：

- 設定ファイル不正
- Repository事前確認失敗
- Task実行失敗
- Codex異常終了
- Issue完了コメント確認失敗
- Remote Commit確認失敗
- その他処理続行不能

具体的なエラーコード体系の細分化は初回MVPでは不要。

---

## 22. CLIインターフェース

OrchestratorはNode.js CLIとして実行できるようにする。

最低限、Target設定ファイルとTask Listファイルを指定できること。

実行例：

```bash
node src/index.js \
  --target targets/stampo.json \
  --tasks tasks/stampo/tasks.json
```

Windows環境では1行で実行可能であればよい。

例：

```bash
node src/index.js --target targets/stampo.json --tasks tasks/stampo/tasks.json
```

### 22.1 必須引数

```text
--target
--tasks
```

### 22.2 引数不足

必須引数が不足している場合は使用方法を表示し、Codexを起動せず異常終了する。

---

## 23. 設定Validation

Orchestrator開始時に最低限以下を検証する。

### Target設定

- ファイルが存在する
- JSONとして読み込める
- `targetId` が存在する
- `repositoryPath` が存在する
- `branch` が存在する
- `remote` が存在する

### Task List

- ファイルが存在する
- JSONとして読み込める
- `targetId` が存在する
- `tasks` が配列である
- `tasks` が0件でない
- 各Taskに `issue` が存在する
- 各Taskに `type` が存在する
- `type` が `development` または `design`

### Target整合性

Target設定とTask Listの `targetId` が一致しない場合は異常終了する。

---

## 24. エラー処理

エラー発生時は、可能な限り以下の情報をログと標準エラー出力へ出す。

```text
Error Type
Issue Number
Task Type
Reason
Command
Exit Code
stderr
```

ただし、認証情報、Token、Secret等をログへ出力しないこと。

---

## 25. CodexとOrchestratorの責務分界

### 25.1 Codexの責務

Codexは各Taskについて以下を担当する。

- GitHub Issueの取得
- Issue内容の理解
- Repository内調査
- 設計または実装
- 必要なテスト
- 必要な確認
- 修正
- Commit
- Push
- GitHub Issueへの結果投稿
- 完了コメントへの `Status: COMPLETED` 記載
- 完了コメントへのCommit ID記載

### 25.2 Orchestratorの責務

Orchestratorは以下を担当する。

- Target設定読み込み
- Task List読み込み
- Task順序管理
- Prompt Template選択
- Issue番号埋め込み
- Codex CLI起動
- Exit Code確認
- Issue完了コメント確認
- Commit ID抽出
- Remote Push確認
- Task成功 / 失敗判定
- 成功時の次Task起動
- 失敗時の全体停止
- 実行ログ保存

### 25.3 Orchestratorが行わないこと

- Issue内容の意味的理解
- 設計レビュー
- 実装レビュー
- テスト内容の妥当性レビュー
- Task優先度判断
- Task依存関係解決
- Codexへの追加指示
- 自動Retry
- Commit数検証
- Runtime State管理
- 完了済みTaskの自動Skip
- Pull Request作成
- Branch自動作成
- Supervisor AIによる再評価

---

## 26. 実装対象

初回MVPでは以下を実装する。

- Node.js CLI
- Target設定読み込み
- Task List読み込み
- 設定Validation
- Repository事前確認
- Task List直列実行
- `development` Task
- `design` Task
- Prompt Template読み込み
- Issue番号置換
- `codex exec` 起動
- stdout / stderr取得
- Exit Code取得
- `gh` CLIによるIssueコメント確認
- `Status: COMPLETED` 判定
- Commit ID抽出
- Remote Commit存在確認
- Task成功 / 失敗判定
- Task失敗時の全体停止
- 実行ログ保存
- Orchestrator終了コード返却

---

## 27. 初回MVPでは実装しないもの

以下は対象外とする。

- Runtime Stateファイル
- completed / failed等の状態永続化
- 完了済みTaskの自動Skip
- 自動再開
- 自動Retry
- Timeout
- Cooldown
- Task依存関係
- Task優先度
- Task並列実行
- TaskごとのBranch作成
- Pull Request自動作成
- Orchestrator自身によるCommit
- Orchestrator自身によるPush
- Supervisor AI
- Codex実行結果の意味的レビュー
- Human in the Loop制御
- Task別Prompt Override
- Task別Codex設定Override
- Commit数検証
- 複数Repository同時実行
- 実行ダッシュボード

---

## 28. 全体処理フロー

```text
Orchestrator Start
      ↓
Target設定読込
      ↓
Task List読込
      ↓
設定Validation
      ↓
Repository確認
  - Path
  - Git Repository
  - Branch
  - Working Tree Clean
      ↓
Task #1
      ↓
Prompt生成
      ↓
codex exec
      ↓
Exit Code確認
      ↓
GitHub Issueコメント確認
      ↓
Status: COMPLETED 確認
      ↓
Commit ID取得
      ↓
Remote Commit確認
      ↓
成功？
 ┌────┴────┐
Yes        No
 ↓          ↓
次Task     ログ出力
 ↓          ↓
...        全体中断
 ↓
全Task完了
 ↓
完了ログ
 ↓
exit 0
```

---

## 29. Task成功判定まとめ

以下がすべて成立した場合のみTask成功とする。

```text
1. codex exec Exit Code == 0

AND

2. 対象Issueに
   Status: COMPLETED
   が記載された完了コメントが存在する

AND

3. 完了コメントに
   Commit: <commit-id>
   が存在する

AND

4. <commit-id> が対象Remote RepositoryへPush済みである
```

それ以外はすべてTask失敗とし、処理を中断する。

---

## 30. 実装時の優先事項

本MVPでは、機能を広げることより以下を優先する。

1. Taskを確実に直列実行できること
2. Codex実行失敗時に止まること
3. Codexが成功終了しても、Issue投稿またはPushが完了していなければ止まること
4. 人間がログを見て、どこで何が失敗したか分かること
5. 実装を過度に複雑化しないこと

将来拡張を想定した過剰な抽象化は不要とする。

まずStampoで安定して動作する最小構成を完成させることを優先する。

---

## 31. 完了条件

CodexによるOrchestrator実装の完了条件は以下とする。

- 本仕様に沿ったNode.js実装が存在する
- Target設定サンプルが存在する
- Task Listサンプルが存在する
- development / design Prompt Templateが存在する
- READMEにセットアップ方法と実行方法が記載されている
- 複数Taskを直列実行できる
- 正常Task完了後に次Taskへ進める
- Codex Exit Code異常時に中断できる
- Issue完了コメントがない場合に中断できる
- Commit IDがRemoteに存在しない場合に中断できる
- 全Task成功時に正常終了ログが残る
- Task失敗時に失敗Taskと理由がログに残る
- Orchestrator自身が成功時0、失敗時非0の終了コードを返す

---

## 32. 実装方針

初回実装では、必要以上のライブラリやフレームワークは導入しない。

Node.js標準機能および必要最小限のnpm packageを使用すること。

Git / GitHub / Codexに関する処理は、既存CLIを子プロセスとして利用する方式を基本とする。

```text
git
gh
codex
```

これらのCLIに既に存在する機能をNode.js側で再実装しない。

可読性、保守性、障害時の原因確認のしやすさを優先する。
