import { streamUstazBot } from "@/lib/ai";
import { logQuestion } from "@/lib/logger";

/* ── Rate limiting (in-memory, per-process) ── */
const WINDOW_MS = 60_000; // 1 minute window
const MAX_PER_WINDOW = 8; // 8 questions per minute
const ipHits = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hit = ipHits.get(ip);
  if (!hit || now > hit.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  hit.count++;
  return hit.count > MAX_PER_WINDOW;
}

/* ── SSE parsing helpers ── */
function extractSSEData(line: string): {
  content: string | null;
  confidence?: string;
  source?: string;
} {
  // DeepSeek sends:  data: {"choices":[{"delta":{"content":"..."}}]}
  if (!line.startsWith("data: ")) return { content: null };
  const raw = line.slice(6).trim();
  if (raw === "[DONE]") return { content: null };
  try {
    const json = JSON.parse(raw);
    const content = json?.choices?.[0]?.delta?.content ?? null;
    // Pass through any extra metadata fields we emit
    return { content };
  } catch {
    return { content: null };
  }
}

/* ── POST /api/ask ── */
export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  if (rateLimited(ip)) {
    return new Response(
      JSON.stringify({ error: "Terlalu banyak soalan. Cuba lagi dalam 1 minit." }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = await request.json().catch(() => null);
  const question =
    typeof body?.question === "string" ? body.question.trim() : "";

  if (!question) {
    return new Response(
      JSON.stringify({ error: "Soalan diperlukan" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (question.length > 1000) {
    return new Response(
      JSON.stringify({ error: "Soalan terlalu panjang (maks 1000 aksara)" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const upstream = await streamUstazBot(question);

    if (!upstream.ok) {
      const errText = await upstream.text();
      throw new Error(`DeepSeek error ${upstream.status}: ${errText}`);
    }

    if (!upstream.body) {
      throw new Error("No body in upstream response");
    }

    // Collect full answer + extract metadata for logging
    let fullAnswer = "";

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            logQuestion({ question, answer: fullAnswer }).catch(() => {});
            controller.close();
            return;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            const { content } = extractSSEData(line);
            if (content !== null) {
              fullAnswer += content;
              // Forward as SSE to client
              const sse = `data: ${JSON.stringify({ content })}\n\n`;
              controller.enqueue(new TextEncoder().encode(sse));
            }
          }
        } catch (err) {
          logQuestion({
            question,
            error: err instanceof Error ? err.message : String(err),
          }).catch(() => {});
          const sse = `data: ${JSON.stringify({ error: "Ralat semasa menjana jawapan." })}\n\n`;
          controller.enqueue(new TextEncoder().encode(sse));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logQuestion({ question, error: errMsg }).catch(() => {});

    return new Response(
      JSON.stringify({
        error: "Maaf, AI menghadapi isu buat masa ini. Sila cuba lagi atau rujuk ustaz bertauliah.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}