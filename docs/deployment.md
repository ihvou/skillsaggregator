# Deployment

The MVP uses only managed free-tier services and static hosting.

```mermaid
flowchart LR
  Collector["Local collection scripts"] --> EdgeSubmit["submit-suggestion Edge Function"]
  Mobile["Expo app (iOS/Android)"] --> Supabase["Supabase managed project"]
  Web["Next.js web on Vercel Hobby"] --> Supabase
  Admin["Next.js admin route"] --> EdgeApply["apply-suggestion Edge Function"]
  EdgeSubmit --> DB["Supabase Postgres"]
  EdgeApply --> DB
  EdgeApply --> Storage["Supabase Storage link-thumbnails"]
  DB --> Realtime["Supabase Realtime moderation_queue"]
  Realtime --> Admin
  DB --> Cleanup["pg_cron cleanup_failed_runs"]
  DB --> Webhook["Direct Vercel revalidation webhook"]
  Webhook --> Web
```

| Piece | Runtime | Paid server? |
|---|---|---|
| Database, Auth, Realtime, Storage | Supabase managed free tier | No |
| Local article/video collection | Developer machine with `yt-dlp` and Ollama | No |
| Moderation intake/apply functions | Supabase Edge Functions | No self-managed server |
| Cron cleanup | `pg_cron` inside Supabase | No |
| Public web and admin | Vercel Hobby Next.js | No self-managed server |
| Mobile app | Expo / EAS free tier | No |

The cloud collection functions remain dormant in the repo for a later deployed-agent mode. Revalidation is a single direct path: the database trigger calls the Vercel `/api/revalidate` endpoint from Vault-configured secrets.

If Vercel is excluded, the public app can be exported as static pages and hosted on Cloudflare Pages or GitHub Pages; on-demand revalidation would become rebuild-on-approval.
