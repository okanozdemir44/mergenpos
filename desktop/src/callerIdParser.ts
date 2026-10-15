/**
 * Caller ID Seri Port Veri Çözücü (Parser)
 * 
 * Desteklenen Formatlar:
 * (a) Düz numara: "05321234567" veya "5321234567"
 * (b) NMBR formatı: "NMBR = 05321234567" veya "NMBR=05321234567"
 * (c) Modem CLIP formatı: "+CLIP: \"05321234567\",128"
 * (d) Çok satırlı Bell202 formatı: "DATE = 1015 \r\n TIME = 0715 \r\n NMBR = 05321234567"
 * (e) CALLER ID formatı: "CALLER ID: 05321234567" veya "CID: 05321234567"
 */

/**
 * Ham numarayı temizleyip standart 10 veya 11 haneli telefon formatına dönüştürür.
 * Örn: "+905321234567" -> "05321234567"
 *      "5321234567"    -> "05321234567"
 *      "02121234567"   -> "02121234567"
 */
export function normalizeParsedPhone(raw: string): string | null {
  if (!raw) return null;

  // Sadece rakamları ve baştaki + işaretini al
  let cleaned = raw.trim().replace(/[^\d+]/g, "");

  // +90 veya 0090 ile başlıyorsa temizle ve 0 ekle
  if (cleaned.startsWith("+90")) {
    cleaned = "0" + cleaned.substring(3);
  } else if (cleaned.startsWith("0090")) {
    cleaned = "0" + cleaned.substring(4);
  } else if (cleaned.startsWith("90") && cleaned.length === 12) {
    cleaned = "0" + cleaned.substring(2);
  }

  // 10 haneli (örn. 5321234567 veya 2121234567) ise başına 0 koy
  if (/^[1-9][0-9]{9}$/.test(cleaned)) {
    cleaned = "0" + cleaned;
  }

  // 11 haneli Türkiye formatı (05xx veya 02xx/03xx/04xx)
  if (/^0[1-9][0-9]{9}$/.test(cleaned)) {
    return cleaned;
  }

  // 7 haneli yerel santral veya özel numaralar (en az 7 hane)
  if (/^[0-9]{7,15}$/.test(cleaned)) {
    return cleaned;
  }

  return null;
}

/**
 * Verilen bir metin satırından veya bloğundan telefon numarasını ayıklar (Saf Fonksiyon).
 * Eşleşme bulamazsa null döner.
 */
export function parseCallerIdLine(text: string): string | null {
  if (!text || typeof text !== "string") return null;

  const trimmed = text.trim();
  if (!trimmed) return null;

  // (c) Modem +CLIP formatı: +CLIP: "05321234567",128 veya +CLIP: 05321234567
  const clipMatch = trimmed.match(/\+CLIP:\s*"?([+0-9\s]{7,20})"?/i);
  if (clipMatch && clipMatch[1]) {
    const norm = normalizeParsedPhone(clipMatch[1]);
    if (norm) return norm;
  }

  // (b) & (d) NMBR formatı: NMBR = 05321234567 veya NMBR=05321234567 (büyük/küçük harf duyarsız)
  const nmbrMatch = trimmed.match(/\bNMBR\s*=\s*([+0-9\s]{7,20})\b/i);
  if (nmbrMatch && nmbrMatch[1]) {
    const norm = normalizeParsedPhone(nmbrMatch[1]);
    if (norm) return norm;
  }

  // (e) CALLER ID / CID formatı: CALLER ID: 05321234567 veya CID: 05321234567
  const cidMatch = trimmed.match(/\b(?:CALLER\s*ID|CID)\s*[:=]\s*([+0-9\s]{7,20})\b/i);
  if (cidMatch && cidMatch[1]) {
    const norm = normalizeParsedPhone(cidMatch[1]);
    if (norm) return norm;
  }

  // (a) Düz numara satırı: Sadece telefon numarası içeren satır
  // (Örn: "05321234567", "0532 123 45 67", "+905321234567")
  if (/^[+0-9\s-]{7,20}$/.test(trimmed)) {
    const norm = normalizeParsedPhone(trimmed);
    if (norm) return norm;
  }

  return null;
}

/**
 * Gelen ham bayt / karakter akışını tamponlayarak parçalanmış satırları birleştiren
 * ve arayan numarayı yakalayan tamponlayıcı sınıf.
 */
export class CallerIdStreamBuffer {
  private buffer: string = "";
  private multiLineBuffer: string = "";
  private multiLineTimer: NodeJS.Timeout | null = null;

  private onLineCallback?: (line: string, escapedRaw: string) => void;
  private onCallCallback?: (phone: string) => void;

  constructor(options?: {
    onLine?: (line: string, escapedRaw: string) => void;
    onCall?: (phone: string) => void;
  }) {
    this.onLineCallback = options?.onLine;
    this.onCallCallback = options?.onCall;
  }

  public setCallbacks(options: {
    onLine?: (line: string, escapedRaw: string) => void;
    onCall?: (phone: string) => void;
  }) {
    this.onLineCallback = options.onLine;
    this.onCallCallback = options.onCall;
  }

  /**
   * Ham verideki özel karakterleri okunabilir formata dönüştürür (\r, \n).
   */
  public static escapeRaw(raw: string): string {
    return raw
      .replace(/\\/g, "\\\\")
      .replace(/\r/g, "\\r")
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t");
  }

  /**
   * Seri porttan gelen parça (chunk) veriyi işler.
   */
  public feed(chunk: string) {
    if (!chunk) return;
    this.buffer += chunk;

    // Satır sonlarına göre (CR, LF veya CRLF) böl
    // Buffer içinde en az bir satır sonu varsa satırları ayıkla
    let newlineIndex = this.findNewlineIndex(this.buffer);

    while (newlineIndex !== -1) {
      let line = this.buffer.substring(0, newlineIndex);
      let delimiterLength = 1;

      // CRLF kontrolü
      if (
        this.buffer[newlineIndex] === "\r" &&
        this.buffer[newlineIndex + 1] === "\n"
      ) {
        delimiterLength = 2;
      }

      this.buffer = this.buffer.substring(newlineIndex + delimiterLength);

      this.processCompletedLine(line);
      newlineIndex = this.findNewlineIndex(this.buffer);
    }
  }

  private findNewlineIndex(str: string): number {
    for (let i = 0; i < str.length; i++) {
      if (str[i] === "\r" || str[i] === "\n") {
        return i;
      }
    }
    return -1;
  }

  private processCompletedLine(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;

    const escaped = CallerIdStreamBuffer.escapeRaw(line);
    if (this.onLineCallback) {
      this.onLineCallback(line, escaped);
    }

    // Tek satırda numara var mı?
    const singlePhone = parseCallerIdLine(line);
    if (singlePhone) {
      this.multiLineBuffer = "";
      if (this.multiLineTimer) {
        clearTimeout(this.multiLineTimer);
        this.multiLineTimer = null;
      }
      if (this.onCallCallback) {
        this.onCallCallback(singlePhone);
      }
      return;
    }

    // Çok satırlı (Bell202: DATE = ... TIME = ... NMBR = ...) tamponlama
    this.multiLineBuffer += " " + trimmed;

    if (this.multiLineTimer) {
      clearTimeout(this.multiLineTimer);
    }

    // 1.5 saniye boyunca yeni satır gelmezse çok satırlı tamponu sıfırla
    this.multiLineTimer = setTimeout(() => {
      this.multiLineBuffer = "";
    }, 1500);

    const multiPhone = parseCallerIdLine(this.multiLineBuffer);
    if (multiPhone) {
      this.multiLineBuffer = "";
      if (this.multiLineTimer) {
        clearTimeout(this.multiLineTimer);
        this.multiLineTimer = null;
      }
      if (this.onCallCallback) {
        this.onCallCallback(multiPhone);
      }
    }
  }

  public reset() {
    this.buffer = "";
    this.multiLineBuffer = "";
    if (this.multiLineTimer) {
      clearTimeout(this.multiLineTimer);
      this.multiLineTimer = null;
    }
  }
}
