/**
 * UstazBot Logger — logs Q&A to Google Sheet + Telegram.
 * Replaces the old Make.com webhook dependency.
 * 
 * Google Sheet: uses Service Account for API access.
 * Telegram: uses Bot API for real-time notifications.
 * 
 * Both are fire-and-forget (non-blocking). Failures are console-only.
 */

interface LogPayload {
  question: string;
  answer?: string;
  error?: string;
}

/* ── Google Sheets logging ── */
const SHEET_ID = process.env.LOG_GOOGLE_SHEET_ID;
const SHEET_TAB = process.env.LOG_GOOGLE_SHEET_TAB ?? "Log";

// Service account credentials path (reuse existing one or new one)
const SA_KEY_PATH = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_PATH;
const SA_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const SA_PRIVATE_KEY = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

async function getGoogleAccessToken(): Promise<string | null> {
  // If full JSON key file path provided, read from it
  if (SA_KEY_PATH) {
    try {
      const { readFileSync } = await import("fs");
      const keyFile = JSON.parse(readFileSync(SA_KEY_PATH, "utf-8"));
      return createJWT(keyFile.client_email, keyFile.private_key);
    } catch (err) {
      console.error("Failed to read SA key file:", err);
      return null;
    }
  }

  // If individual env vars provided
  if (SA_EMAIL && SA_PRIVATE_KEY) {
    return createJWT(SA_EMAIL, SA_PRIVATE_KEY.replace(/\\n/g, "\n"));
  }

  return null;
}

async function createJWT(email: string, privateKey: string): Promise<string> {
  const crypto = await import("crypto");
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");

  const signInput = `${header}.${payload}`;
  const signature = crypto.createSign("RSA-SHA256")
    .update(signInput)
    .sign(privateKey);

  const jwt = `${signInput}.${signature.toString("base64url")}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const tokenData = await tokenRes.json();
  return tokenData.access_token;
}

async function appendToSheet(accessToken: string, values: string[]) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(SHEET_TAB)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      values: [values],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Google Sheet append failed:", res.status, err);
  }
}

/* ── Telegram logging ── */
const TG_BOT_TOKEN = process.env.LOG_TELEGRAM_BOT_TOKEN;
const TG_CHAT_ID = process.env.LOG_TELEGRAM_CHAT_ID;

async function sendToTelegram(payload: LogPayload) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
    console.warn("Telegram logging env vars not configured");
    return;
  }

  const { question, answer, error } = payload;
  const status = error ? "❌ GAGAL" : "✅ BERJAYA";
  const truncatedQ = question.length > 200 ? question.slice(0, 200) + "…" : question;
  const truncatedA = answer
    ? answer.length > 500
      ? answer.slice(0, 500) + "…"
      : answer
    : "";

  const text = [
    `🤖 UstazBot Log ${status}`,
    `📅 ${new Date().toLocaleString("ms-MY", { timeZone: "Asia/Kuala_Lumpur" })}`,
    `❓ ${truncatedQ}`,
    answer ? `📝 ${truncatedA}` : "",
    error ? `⚠️ ${error.slice(0, 300)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TG_CHAT_ID,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  }).catch((err) => console.error("Telegram send failed:", err));
}

/* ── Main logger — both Sheet + Telegram (fire-and-forget) ── */
export async function logQuestion(payload: LogPayload): Promise<void> {
  const timestamp = new Date().toISOString();
  const status = payload.error ? "FAILED" : "SUCCESS";

  // Fire Telegram immediately (no dependency on Sheet)
  sendToTelegram(payload).catch(() => {});

  // Sheet logging
  if (SHEET_ID) {
    getGoogleAccessToken()
      .then((token) => {
        if (!token) return;
        const values = [
          timestamp,
          status,
          (payload.question ?? "").slice(0, 1000),
          payload.error
            ? (payload.error ?? "").slice(0, 500)
            : (payload.answer ?? "").slice(0, 5000),
          payload.error ? "" : "✅",
          payload.error ? payload.error.slice(0, 500) : "",
        ];
        return appendToSheet(token, values);
      })
      .catch((err) => console.error("Sheet logging error:", err));
  } else {
    console.warn("Google Sheet logging not configured (LOG_GOOGLE_SHEET_ID missing)");
  }
}
