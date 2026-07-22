# MyManager

日々のタスクと「いつかやりたいこと」を一か所で管理する、個人向けWebアプリです。

## 技術構成

- React + TypeScript + Vite
- Cloudflare Workers（API・静的サイト配信）
- Cloudflare D1（SQLite互換データベース）
- Hono（Worker API）
- GitHub Actions（main ブランチから自動デプロイ）

D1はWorkerと同じCloudflare上で利用でき、小規模な個人用データをリレーショナルに扱いやすいため採用しています。

## ローカル開発

Node.js 22以上を用意してください。

```bash
npm install
npm run db:migrate:local
npm run dev
```

開発サーバーのURLは起動時に表示されます。ローカルのD1データは `.wrangler/` 以下に保存されます。

## Cloudflareへの初回デプロイ

1. Cloudflareにログインします。

   ```bash
   npx wrangler login
   ```

2. D1データベースを作成します。

   ```bash
   npx wrangler d1 create mymanager-db
   ```

3. コマンド出力の `database_id` とD1バインディングが `wrangler.jsonc` の設定と一致していることを確認します（このプロジェクトのバインディング名は `mymanager_db` です）。

4. マイグレーションとデプロイを実行します。

   ```bash
   npm run db:migrate:remote
   npm run deploy
   ```

## GitHub Actionsの設定

GitHubリポジトリの **Settings → Secrets and variables → Actions** に、次のRepository secretsを登録します。

- `CLOUDFLARE_API_TOKEN`: Workers Scriptsの編集とD1の編集権限を持つAPIトークン
- `CLOUDFLARE_ACCOUNT_ID`: CloudflareのアカウントID

以後は `main` ブランチへのpushで、型チェック、D1マイグレーション、デプロイが自動実行されます。

## 公開時の注意

現在の初期版は「一人で使うアプリ」を想定しており、アプリ内ログイン機能はありません。そのまま公開するとURLを知っている人がデータを操作できるため、Cloudflare Zero TrustのAccessポリシーで自分のメールアドレスだけを許可してください。複数ユーザーで利用する場合は、ユーザー認証と各テーブルの所有者IDを追加する必要があります。

## コマンド

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | ローカル開発サーバー |
| `npm run check` | TypeScriptの型チェック |
| `npm run build` | 本番ビルド |
| `npm run db:migrate:local` | ローカルD1へマイグレーション |
| `npm run db:migrate:remote` | 本番D1へマイグレーション |
| `npm run deploy` | Cloudflareへデプロイ |
