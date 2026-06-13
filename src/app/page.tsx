"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import Image from "next/image";
import { Send, Sparkles, Copy, Check, Share2, Video } from "lucide-react";
import { stripSource, extractSource } from "@/lib/ai";

/* ── Example questions ── */
const EXAMPLE_QUESTIONS = [
  "Hukum pakai inai untuk lelaki?",
  "Cara mandi wajib yang betul?",
  "Zakat simpanan bank?",
  "Hukum solat jumaat semasa musafir?",
];

/* ── Confidence badge config ── */
const CONFIDENCE_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  high: { label: "Tinggi", className: "bg-emerald-100 text-emerald-700" },
  medium: { label: "Sederhana", className: "bg-amber-100 text-amber-700" },
  low: { label: "Rendah", className: "bg-red-100 text-red-700" },
};

/* ── Markdown renderer (lightweight) ── */
function MarkdownRenderer({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let listItems: React.ReactNode[] = [];
  let listType = "";

  const flushList = () => {
    if (listItems.length === 0) return;
    const Tag = listType === "ol" ? "ol" : "ul";
    const cls =
      listType === "ol"
        ? "my-2 ml-5 list-decimal space-y-1 text-slate-700"
        : "my-2 ml-5 list-disc space-y-1 text-slate-700";
    elements.push(
      <Tag key={`${listType}-${elements.length}`} className={cls}>
        {listItems}
      </Tag>
    );
    listItems = [];
    listType = "";
  };

  const renderInline = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    const boldRegex = /\*\*(.+?)\*\*/g;
    let lastIndex = 0;
    let match;
    let key = 0;

    while ((match = boldRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
      }
      parts.push(
        <strong key={key++} className="font-semibold text-slate-800">
          {match[1]}
        </strong>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
      parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
    }
    return parts.length > 0 ? <>{parts}</> : text;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Heading
    if (line.startsWith("### ")) {
      flushList();
      elements.push(
        <h3
          key={i}
          className="mt-4 mb-1.5 text-sm font-semibold text-slate-800"
        >
          {renderInline(line.slice(4))}
        </h3>
      );
      continue;
    }
    if (line.startsWith("## ")) {
      flushList();
      elements.push(
        <h2 key={i} className="mt-4 mb-1.5 text-base font-bold text-slate-800">
          {renderInline(line.slice(3))}
        </h2>
      );
      continue;
    }
    if (line.startsWith("# ")) {
      flushList();
      elements.push(
        <h1 key={i} className="mt-4 mb-1.5 text-lg font-bold text-slate-800">
          {renderInline(line.slice(2))}
        </h1>
      );
      continue;
    }

    // List
    if (line.match(/^[-*] /)) {
      listType = "ul";
      listItems.push(
        <li key={`li-${i}`}>{renderInline(line.replace(/^[-*] /, ""))}</li>
      );
      continue;
    }
    if (line.match(/^\d+\.\s/)) {
      listType = "ol";
      listItems.push(
        <li key={`li-${i}`}>{renderInline(line.replace(/^\d+\.\s/, ""))}</li>
      );
      continue;
    }

    // Empty
    if (line.trim() === "") {
      flushList();
      elements.push(<div key={`br-${i}`} className="h-2" />);
      continue;
    }

    // Paragraph
    flushList();
    elements.push(
      <p key={i} className="text-sm leading-relaxed text-slate-700">
        {renderInline(line)}
      </p>
    );
  }
  flushList();

  return <>{elements}</>;
}

/* ── Skeleton loader ── */
function AnswerSkeleton() {
  return (
    <div className="mt-5 animate-pulse space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="h-3 w-24 rounded bg-slate-200" />
      <div className="space-y-2">
        <div className="h-4 w-full rounded bg-slate-200" />
        <div className="h-4 w-5/6 rounded bg-slate-200" />
        <div className="h-4 w-3/4 rounded bg-slate-200" />
        <div className="h-4 w-4/5 rounded bg-slate-200" />
      </div>
    </div>
  );
}

/* ── Main Page ── */
export default function Home() {
  // Input textarea
  const [question, setQuestion] = useState("");
  // Q&A history — max 3 entries, newest first
  const [qaList, setQaList] = useState<Array<{
    question: string;
    answer: string | null;
    source: string;
    confidence: "high" | "medium" | "low";
    error: string | null;
    loading: boolean;
  }>>([]);
  const [copiedState, setCopiedState] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const listEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when latest answer streams in
  useEffect(() => {
    if (listEndRef.current && qaList.length) {
      listEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [qaList]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || trimmed.length < 5) {
      setError("Sila masukkan soalan terlebih dahulu (minimum 5 aksara).");
      return;
    }
    if (trimmed.length > 1000) {
      setError("Soalan terlalu panjang (maks 1000 aksara).");
      return;
    }

    // Clear input after submit
    setQuestion("");
    setError(null);

    // Start new Q&A entry — push to front, shift if > 3
    const newEntry = {
      question: trimmed,
      answer: null,
      source: "",
      confidence: "high" as const,
      error: null,
      loading: true,
    };
    setQaList(prev => {
      const next = [newEntry, ...prev];
      while (next.length > 3) next.pop();
      return next;
    });

    setCopiedState({}); // reset copy state

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });

      if (!response.ok) {
        if (response.headers.get("content-type")?.includes("application/json")) {
          const data = await response.json();
          throw new Error("Maaf, tidak dapat jawab. Sila cuba lagi.");
        }
        throw new Error("Ralat pelayan. Sila cuba lagi.");
      }

      if (!response.body) {
        throw new Error("Tiada respons dari pelayan.");
      }

      // Parse SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          // Finalize — extract source and clean answer
          const cleanAnswer = stripSource(accumulated);
          const extractedSource = extractSource(accumulated);
          setQaList(prev => {
            const updated = [...prev];
            updated[0] = {
              ...updated[0],
              answer: cleanAnswer,
              source: extractedSource,
              confidence: "high" as const, // default — can be updated in future
              loading: false,
            };
            return updated;
          });
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          try {
            const data = JSON.parse(raw);
            if (data.error) {
              setQaList(prev => {
                const updated = [...prev];
                updated[0] = { ...updated[0], error: data.error, loading: false };
                return updated;
              });
              break;
            }
            if (data.content) {
              accumulated += data.content;
              setQaList(prev => {
                const updated = [...prev];
                updated[0] = { ...updated[0], answer: accumulated };
                return updated;
              });
            }
          } catch {
            // Skip malformed lines
          }
        }
      }
    } catch (err) {
      setQaList(prev => {
        const updated = [...prev];
        updated[0] = {
          ...updated[0],
          error: "Maaf, tidak dapat jawab. Sila cuba lagi.",
          loading: false,
        };
        return updated;
      });
    }
    // finally: handleSubmit doesn't need loading state anymore
  };

  const handleCopy = async (index: number) => {
    const entry = qaList[index];
    if (!entry?.answer) return;
    const text = [
      `Soalan: ${entry.question}`,
      "",
      entry.answer,
      entry.source ? `Sumber: ${entry.source}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    try {
      await navigator.clipboard.writeText(text);
      setCopiedState(prev => ({ ...prev, [index]: true }));
      setTimeout(() => setCopiedState(prev => ({ ...prev, [index]: false })), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  // Reuse confidence config
  type ConfidenceLevel = "high" | "medium" | "low";
  const ENTRY_CONFIG: Record<ConfidenceLevel, { label: string; className: string }> = {
    high: CONFIDENCE_CONFIG.high,
    medium: CONFIDENCE_CONFIG.medium,
    low: CONFIDENCE_CONFIG.low,
  };

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center px-4 py-8">
      <div className="w-full max-w-[480px] flex flex-col gap-8">

        {/* ── Header ── */}
        <div className="text-center pt-4">
          <div className="flex justify-center mb-4">
            <Image
              src="/ustazbot-logo.png"
              alt="UstazBot"
              width={100}
              height={100}
              className="object-contain"
              priority
            />
          </div>
          <p className="text-sm text-emerald-700 font-medium">
            السَّلاَمُ عَلَيْكُمْ وَرَحْمَةُ ٱللَّٰهِ وَبَرَكَاتُهُ
          </p>
          <p className="text-gray-600 mt-3 text-sm leading-relaxed">
            Jawapan ringkas untuk persoalan agama. Tidak menyimpan sejarah soalan.
            <span className="text-red-600 font-medium"> Setiap soalan adalah baharu.</span>
          </p>
        </div>

        {/* ── Input Card ── */}
        <div className="flex flex-col gap-3">
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-3">
              <textarea
                value={question}
                onChange={(e) => {
                  setQuestion(e.target.value);
                  setError(null);
                }}
                placeholder="Tulis soalan anda di sini..."
                className="w-full rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 placeholder-gray-400 shadow-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                rows={4}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    handleSubmit(e as unknown as FormEvent<HTMLFormElement>);
                  }
                }}
                // Removed disabled={isLoading} because new state handles it per entry
              />
              {error && (
                <p className="text-red-500 text-sm px-1">{error}</p>
              )}
              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-semibold py-3.5 px-6 rounded-full flex items-center justify-center gap-2 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <>
                  <Send size={16} />
                  Hantar Soalan
                </>
              </button>
            </div>
          </form>
        </div>

        {/* ── Q&A List ── */}
        <div className="flex flex-col gap-6" ref={listEndRef}>
          {qaList.length === 0 && (
            <div className="text-center pt-12">
              <p className="text-sm text-gray-500 italic">Tiada soalan telah ditanya</p>
            </div>
          )}

          {qaList.map((entry, index) => {
            const conf = ENTRY_CONFIG[entry.confidence] ?? CONFIDENCE_CONFIG.high;
            return (
              <div
                key={index}
                className={`animate-in fade-in slide-in-from-bottom-4 duration-300 ${entry.loading && !entry.answer ? 'opacity-80 blur-xs pointer-events-none' : ''}`}
              >
                {/* Header */}
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden p-1">
                  <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                    <span className="text-xs font-medium text-slate-600">
                      Soalan #{qaList.length - index}
                    </span>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${conf.className}`}
                    >
                      Keyakinan: {entry.loading ? "Dalam proses..." : conf.label}
                    </span>
                  </div>
                </div>

                {/* Body */}
                <div className="px-4 py-4 bg-white -mt-px border-x border-slate-200">
                  <div className="text-sm font-medium text-gray-900">
                    {entry.question}
                  </div>

                  {!!entry.error && (
                    <div className="mt-3">
                      <p className="text-red-500 text-sm">{entry.error}</p>
                    </div>
                  )}

                  {!!entry.answer && !entry.loading && (
                    <div className="mt-3 text-sm leading-relaxed text-slate-700">
                      <MarkdownRenderer content={entry.answer} />
                    </div>
                  )}

                  {entry.loading && !entry.answer && (
                    <div className="mt-3">
                      <AnswerSkeleton />
                    </div>
                  )}

                  {/* Source */}
                  {!!entry.source && !entry.loading && (!entry.error) && (
                    <div className="mt-4 pt-3 border-t border-slate-100">
                      <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                        Sumber
                      </span>
                      <p className="mt-1 text-xs text-slate-500">{entry.source}</p>
                    </div>
                  )}
                </div>

                {/* Copy button */}
                {!!entry.answer && !entry.loading && (!entry.error) && (
                  <div className="bg-white -mt-px px-4 pb-4 rounded-b-2xl border-x border-t-0 border border-slate-200">
                    <button
                      onClick={() => handleCopy(index)}
                      className="flex-1 flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-700 font-medium py-2.5 px-4 rounded-xl transition-colors text-sm border border-gray-200 w-full"
                    >
                      {copiedState[index] ? (
                        <>
                          <Check size={14} />
                          Disalin!
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          Salin Jawapan
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Disclaimer */}
                {!!entry.answer && !entry.loading && !entry.error ? (
                  <p className="mt-3 px-4 pb-3 text-xs text-amber-600 leading-relaxed">
                    Ini panduan umum — rujuk ulama/autoriti jika ragu.
                  </p>
                ) : (
                  <p className="mt-3 px-4 pb-3 h-5"></p> // spacing
                )}
              </div>
            );
          })}
        </div>

        {/* ── Contoh Soalan ── */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Contoh Soalan
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => {
                  setQuestion(q);
                  setError(null);
                }}
                className="text-sm bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-full hover:border-emerald-400 hover:text-emerald-700 transition-colors shadow-sm"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* ── Explore ── */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Explore
          </p>
          <a
            href="https://chatgpt.com/g/g-69d7857d6c6c8191b8f7c99f0a28f159-ustazbot"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-4 bg-white rounded-2xl p-4 shadow-sm border border-gray-100 hover:border-emerald-300 transition-colors"
          >
            <div className="bg-emerald-50 p-2.5 rounded-xl shrink-0">
              <Sparkles size={20} className="text-emerald-600" />
            </div>
            <div>
              <div className="font-semibold text-gray-900 text-sm">
                UstazBot on ChatGPT
              </div>
              <div className="text-xs text-gray-500">
                Tanya terus di ChatGPT
              </div>
            </div>
          </a>
        </div>

        {/* ── Connect ── */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Connect
          </p>
          <div className="flex gap-3">
            <a
              href="https://www.facebook.com/syahnas/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2.5 bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100 hover:border-blue-300 transition-colors"
            >
              <Share2 size={16} className="text-blue-600 shrink-0" />
              <span className="text-sm font-medium text-gray-700">Facebook</span>
            </a>
            <a
              href="https://www.tiktok.com/@pakcikbuku.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2.5 bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100 hover:border-gray-400 transition-colors"
            >
              <Video size={16} className="text-gray-800 shrink-0" />
              <span className="text-sm font-medium text-gray-700">TikTok</span>
            </a>
            <a
              href="https://wa.me/60192323043"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2.5 bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100 hover:border-emerald-300 transition-colors"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-4 h-4 shrink-0 text-emerald-600"
                fill="currentColor"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">WhatsApp</span>
            </a>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white/70 p-5 text-xs text-slate-500">
          <h3 className="text-sm font-semibold text-slate-700">Penafian</h3>
          <p className="leading-relaxed">
            Jawapan dijana berdasarkan skop dan arahan yang ditetapkan. Untuk isu kritikal, sila rujuk ulama atau pihak berkuasa agama.
          </p>
        </div>

        <p className="text-center text-xs text-gray-400 pb-8 leading-relaxed">
          © {new Date().getFullYear()} UstazBot
        </p>

      </div>
    </main>
  );
}