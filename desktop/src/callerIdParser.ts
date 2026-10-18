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

  // (f) Yedek numara ayıklama: Bilinen etiketler eşleşmezse serbest metindeki rakam dizilerini süz
  const backup = extractBackupPhone(trimmed);
  if (backup) {
    return backup;
  }

  return null;
}

/**
 * CidShow C812A ve Genel Paket Regex Numara Ayıklayıcı
 * Metin veya HEX dizisi içindeki:
 * 1) 05XXXXXXXXX (11 hane cep)
 * 2) 5XXXXXXXXX (10 hane cep - başında 0 yoksa 0 eklenir)
 * 3) +90 / 0090 / 90 ön ekli numaralar
 * 4) 0[2-4]XXXXXXXXX (11 hane sabit hat)
 * 5) [2-4]XXXXXXXXX (10 hane sabit hat - başında 0 yoksa 0 eklenir)
 * 
 * Öncesinde veya sonrasında rakam olmayan geçerli numaraları döndürür.
 * CidShow C812A seri no (652EB1525) vb. yanlış eşleşmez.
 */
export function extractCidShowPhone(textOrHex: string): string | null {
  if (!textOrHex || typeof textOrHex !== "string") return null;

  // 1) 05XXXXXXXXX (11 hane Türkiye cep)
  const m05 = textOrHex.match(/(?<!\d)(05\d{2})[\s-]?(\d{3})[\s-]?(\d{2})[\s-]?(\d{2})(?!\d)/);
  if (m05) {
    const raw = (m05[1] + m05[2] + m05[3] + m05[4]).replace(/\D/g, "");
    if (/^05\d{9}$/.test(raw)) return raw;
  }

  // 2) 5XXXXXXXXX (10 hane cep - başında 0 olmayan)
  const m5 = textOrHex.match(/(?<!\d)(5\d{2})[\s-]?(\d{3})[\s-]?(\d{2})[\s-]?(\d{2})(?!\d)/);
  if (m5) {
    const raw = (m5[1] + m5[2] + m5[3] + m5[4]).replace(/\D/g, "");
    if (/^5\d{9}$/.test(raw)) return "0" + raw;
  }

  // 3) +90 / 0090 / 90 ön ekli
  const mIntl = textOrHex.match(/(?<![\d+])(?:\+90|0090|90)[\s-]?([1-9]\d{2})[\s-]?(\d{3})[\s-]?(\d{2})[\s-]?(\d{2})(?!\d)/);
  if (mIntl) {
    const raw = (mIntl[1] + mIntl[2] + mIntl[3] + mIntl[4]).replace(/\D/g, "");
    if (/^(?:5\d{9}|[2-4]\d{9})$/.test(raw)) return "0" + raw;
  }

  // 4) 0[2-4]XXXXXXXXX (11 hane sabit hat)
  const mLandline0 = textOrHex.match(/(?<!\d)(0[2-4]\d{2})[\s-]?(\d{3})[\s-]?(\d{2})[\s-]?(\d{2})(?!\d)/);
  if (mLandline0) {
    const raw = (mLandline0[1] + mLandline0[2] + mLandline0[3] + mLandline0[4]).replace(/\D/g, "");
    if (/^0[2-4]\d{9}$/.test(raw)) return raw;
  }

  // 5) [2-4]XXXXXXXXX (10 hane sabit hat - başında 0 olmayan)
  const mLandline = textOrHex.match(/(?<!\d)([2-4]\d{2})[\s-]?(\d{3})[\s-]?(\d{2})[\s-]?(\d{2})(?!\d)/);
  if (mLandline) {
    const raw = (mLandline[1] + mLandline[2] + mLandline[3] + mLandline[4]).replace(/\D/g, "");
    if (/^[2-4]\d{9}$/.test(raw)) return "0" + raw;
  }

  return null;
}

/**
 * Yedek Numara Ayıklayıcı (Fallback Regex Extractor)
 */
export function extractBackupPhone(text: string): string | null {
  return extractCidShowPhone(text);
}

/**
 * Gelen ham bayt / karakter akışını tamponlayarak parçalanmış satırları birleştiren
 * ve arayan numarayı yakalayan tamponlayıcı sınıf.
 */
export class CallerIdStreamBuffer {
  private buffer: string = "";
  private multiLineBuffer: string = "";
  private multiLineTimer: NodeJS.Timeout | null = null;
  private flushTimer: NodeJS.Timeout | null = null;
  private readonly flushTimeoutMs: number = 80;

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
   * Satır sonu gelmese bile son bayttan 80 ms sonra tamponu otomatik flush eder.
   */
  public feed(chunk: string) {
    if (!chunk) return;

    // Yeni bayt geldiği için önceki flush sayacını iptal et
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

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

    // Satır sonu gelmediyse ve tamponda veri varsa son bayttan 80 ms sonra flush et
    if (this.buffer.length > 0) {
      this.flushTimer = setTimeout(() => {
        this.flush();
      }, this.flushTimeoutMs);
    }
  }

  /**
   * Satır sonu beklemeden tamponu hemen işleme gönderir.
   */
  public flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.buffer.length > 0) {
      const line = this.buffer;
      this.buffer = "";
      this.processCompletedLine(line);
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
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.buffer = "";
    this.multiLineBuffer = "";
    if (this.multiLineTimer) {
      clearTimeout(this.multiLineTimer);
      this.multiLineTimer = null;
    }
  }
}
