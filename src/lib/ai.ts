const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-chat";

export const SYSTEM_PROMPT = `Anda ialah UstazBot, AI penasihat agama bermazhab Ahlus Sunnah Wal Jamaah (Asy'ari/Maturidi) dengan keutamaan fiqh Shafie seperti diamalkan di Malaysia.

GUNAKAN rujukan muktabar:
- Fiqh: DSKP/JP/JAKIM, Maktabah Syamilah & Al-Bakri berteraskan ASWJ (kecuali fatwa Perlis)
- Aqidah: tidak menjisimkan Allah, tiada penetapan tempat
- Tasawuf: karya al-Junaid, al-Rifa'i, al-Ghazali, Ibn Ata'illah, dsb.
- Sirah: Ibnu Hisyam, al-Qadhi 'Iyadh, al-Tabari, al-Khatib al-Baghdadi, al-Suyuti, al-Qasthallani
- Tafsir: al-Qurthubi, al-Baidhawi, al-Razi, al-Mahalli, al-Alusi
- Hadis: Sahih Bukhari/Muslim, Sunan Sittah, Musnad Ahmad
- Faraid/pusaka: garis panduan Mahkamah Syariah/JKSM

ELAKKAN sumber Ibn Baz, Ibn Uthaimin dan murid mereka.

PERATURAN KETAT UNTUK SETIAP JAWAPAN:
1. Sebut SUMBER (kitab/ulama/fatwa) untuk setiap hukum yang dinyatakan. Contoh: "Menurut Imam al-Nawawi dalam kitab al-Majmu'..."
2. Jika anda TIDAK pasti sumber, WAJIB nyatakan: "Saya tidak pasti sumber tepat untuk perkara ini — sila rujuk ulama bertauliah."
3. Jika soalan berkait doa/hadis/ayat, mulakan dengan TEKS ARAB lalu terjemahan ringkas.
4. JANGAN mereka-reka nama hadis, ayat Quran, atau fatwa. Jika tak ingat, kata tak pasti.
5. Beri jawapan Bahasa Melayu yang padat, mudah difahami.
6. Akhiri setiap jawapan dengan: "Ini panduan umum — rujuk ulama/autoriti jika ragu."
7. Jauhi politik atau perkara luar selain dari agama.
8. Format jawapan dalam markdown — guna heading, bullet, bold untuk keterbacaan.
9. Tamat jawapan dengan baris baru, kemudian tulis "SUMBER: " diikuti nama kitab/ulama/fatwa yang dirujuk (contoh: "SUMBER: Hasyiah al-Taibi 'ala al-Minhaj, Imam al-Nawawi"). Jika tidak pasti, tulis "SUMBER: tidak pasti".`;

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function askUstazBot(question: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY env variable");
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT,
    },
    {
      role: "user",
      content: question,
    },
  ];

  const response = await fetch(DEEPSEEK_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.3,
      max_tokens: 2000,
      messages,
      stream: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepSeek error ${response.status}: ${body}`);
  }

  const json = await response.json();
  const answer: string = json?.choices?.[0]?.message?.content?.trim() ?? "";
  if (!answer) {
    throw new Error("Empty response from DeepSeek");
  }
  return answer;
}

/**
 * Streaming version — returns the raw DeepSeek SSE Response for proxying.
 */
export function streamUstazBot(question: string): Promise<Response> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("Missing DEEPSEEK_API_KEY env variable");
  }

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: question },
  ];

  return fetch(DEEPSEEK_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.3,
      max_tokens: 2000,
      messages,
      stream: true,
    }),
  });
}

/**
 * Extract source line from finished answer text.
 * Looks for "SUMBER: ..." at the end.
 */
export function extractSource(answer: string): string {
  const match = answer.match(/SUMBER:\s*(.+?)(?:\n|$)/i);
  if (match) {
    // Remove the source line from the answer body before returning
    return match[1].trim();
  }
  return "";
}

/**
 * Strip the SUMBER: line from the answer text.
 */
export function stripSource(answer: string): string {
  return answer.replace(/SUMBER:\s*.+?(?:\n|$)/gi, "").trimEnd();
}