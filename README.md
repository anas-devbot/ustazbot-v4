# UstazBot Web

Landing + Q&A interface untuk UstazBot. Dibina dengan Next.js 16, React 19, Tailwind CSS v4 dan API routes.

## Ciri Utama

- **AI Streaming** — jawapan streaming real-time dari DeepSeek
- **Mobile-first** — design single column, max-w-[480px], sesuai telefon
- **Structured Source** — auto-extract sumber/kitab dari jawapan AI
- **Confidence Badge** — visual signal (Tinggi/Sederhana/Rendah)
- **Copy Answer** — salin jawapan ke clipboard
- **Contoh Soalan Chips** — quick-start dengan soalan contoh
- **Explore Section** — link ChatGPT GPT
- **Connect** — Facebook, TikTok, WhatsApp
- **Rate Limiting** — 8 soalan/minute/IP
- **SEO** — metadata lengkap, sitemap, robots.txt
- **Logging** — Google Sheets + Telegram notification (RSA JWT, no google-auth-library)

## Struktur

```
repo/
├─ public/images/           # Logo UstazBot
├─ src/app/
│  ├─ page.tsx              # UI utama (header, input, answer card, explore)
│  ├─ layout.tsx            # Root layout, fonts, metadata
│  ├─ globals.css           # Design tokens, scrollbar
│  ├─ sitemap.ts            # Auto-generated sitemap
│  ├─ robots.ts             # Auto-generated robots.txt
│  └─ api/ask/route.ts      # Streaming endpoint DeepSeek + logging
├─ src/lib/
│  ├─ ai.ts                 # DeepSeek helper + source extraction
│  └─ logger.ts             # Google Sheets + Telegram logging
└─ .env.example             # Template env vars
```

## Menjalankan secara lokal

```bash
cp .env.example .env.local   # isikan key sebenar
npm install
npm run dev
```

Kepilkan nilai berikut dalam `.env.local`:

```
DEEPSEEK_API_KEY=sk-...
LOG_GOOGLE_SHEET_ID=...       # Sheet ID (cth: 1M2wrPpORObF8...)
LOG_GOOGLE_SHEET_TAB=Log      # Tab name (default: Log)
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./hermes-scrap-sekolah-e3f42f364efe.json
# Atau guna individual env vars:
GOOGLE_SERVICE_ACCOUNT_EMAIL=...@....iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
LOG_TELEGRAM_BOT_TOKEN=...
LOG_TELEGRAM_CHAT_ID=...
```

## Google Sheets Setup

1. Buka Google Cloud Console → Service Accounts → create new
2. Download JSON key file
3. Kongsi Google Sheet dengan service account email (edit access)
4. Masukkan Sheet ID dari URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/edit`

## Telegram Setup

1. DM @BotFather untuk create bot, dapat bot token
2. Add bot ke group/channel, get chat ID
3. Masukkan dalam `.env.local`

## Deploy

1. Push ke GitHub
2. Import repo di Vercel
3. Set env vars di Vercel dashboard (Settings → Environment Variables)
4. Deploy

## Design Upgrade Notes (v1)

Versi ini membawa design overhaul berdasarkan ustazbot-v3 (anas-devbot):

- Mobile-first single-column layout (max-w-[480px])
- Streamlined header dengan logo + Arabic greeting
- Confidence badge (Tinggi/Sederhana/Rendah)
- Source extraction dari jawapan AI
- Copy button
- Contoh soalan chips
- Explore section (ChatGPT link)
- Connect section (Facebook, TikTok, WhatsApp)
- Lucide React icons (replace react-icons)
- Tailwind CSS v4 + Inter font