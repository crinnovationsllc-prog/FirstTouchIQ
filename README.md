# FirstTouchIQ v0.2.1

Rebuilt Next.js + Supabase source for FirstTouchIQ.

## Included
- Next.js 16.3.3 / React 19.2.0
- TypeScript 5.9.3 and React/Node type packages (fixes the Vercel build failure)
- Supabase email/password authentication
- Coach/player role-aware dashboards
- Team creation
- Assignment creation with coach video URL, questions, training task, due date
- Player Watch → Think → Train → Submit workflow
- Submission/completion tracking
- Responsive royal blue/navy/white FirstTouchIQ UI

## Vercel environment variables
Set these in the existing Vercel project:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The app also accepts `NEXT_PUBLIC_SUPABASE_ANON_KEY` as a legacy fallback.

## Build
```bash
npm install
npm run build
```
