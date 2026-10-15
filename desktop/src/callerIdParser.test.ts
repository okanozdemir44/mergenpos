import assert from "node:assert";
import test from "node:test";
import {
  parseCallerIdLine,
  normalizeParsedPhone,
  CallerIdStreamBuffer,
} from "./callerIdParser";

test("normalizeParsedPhone tests", () => {
  assert.strictEqual(normalizeParsedPhone("05321234567"), "05321234567");
  assert.strictEqual(normalizeParsedPhone("5321234567"), "05321234567");
  assert.strictEqual(normalizeParsedPhone("+905321234567"), "05321234567");
  assert.strictEqual(normalizeParsedPhone("00905321234567"), "05321234567");
  assert.strictEqual(normalizeParsedPhone("02121234567"), "02121234567");
  assert.strictEqual(normalizeParsedPhone("invalid"), null);
  assert.strictEqual(normalizeParsedPhone("123"), null);
});

test("parseCallerIdLine: Format (a) Düz numara satırı", () => {
  assert.strictEqual(parseCallerIdLine("05321234567"), "05321234567");
  assert.strictEqual(parseCallerIdLine("5321234567"), "05321234567");
  assert.strictEqual(parseCallerIdLine("+905321234567"), "05321234567");
  assert.strictEqual(parseCallerIdLine("  05559876543  "), "05559876543");
});

test("parseCallerIdLine: Format (b) NMBR formatları", () => {
  assert.strictEqual(parseCallerIdLine("NMBR = 05321234567"), "05321234567");
  assert.strictEqual(parseCallerIdLine("NMBR=05321234567"), "05321234567");
  assert.strictEqual(parseCallerIdLine("nmbr = 5321234567"), "05321234567");
  assert.strictEqual(parseCallerIdLine("NMBR = +905321234567"), "05321234567");
});

test("parseCallerIdLine: Format (c) Modem +CLIP formatı", () => {
  assert.strictEqual(
    parseCallerIdLine('+CLIP: "05321234567",128'),
    "05321234567"
  );
  assert.strictEqual(
    parseCallerIdLine('+CLIP: "5321234567",128'),
    "05321234567"
  );
  assert.strictEqual(
    parseCallerIdLine('+clip: "+905321234567",145'),
    "05321234567"
  );
});

test("parseCallerIdLine: Format (e) CALLER ID / CID formatı", () => {
  assert.strictEqual(
    parseCallerIdLine("CALLER ID: 05321234567"),
    "05321234567"
  );
  assert.strictEqual(parseCallerIdLine("CID: 05321234567"), "05321234567");
  assert.strictEqual(parseCallerIdLine("caller id = 5321234567"), "05321234567");
});

test("parseCallerIdLine: Tanınmayan veriler null dönmeli", () => {
  assert.strictEqual(parseCallerIdLine("RING"), null);
  assert.strictEqual(parseCallerIdLine("OK"), null);
  assert.strictEqual(parseCallerIdLine("ERROR"), null);
  assert.strictEqual(parseCallerIdLine("DATE = 1015"), null);
  assert.strictEqual(parseCallerIdLine("TIME = 0715"), null);
});

test("CallerIdStreamBuffer: Parça parça (chunked) ve farklı satır sonları (CR, LF, CRLF)", () => {
  const calls: string[] = [];
  const lines: string[] = [];

  const buffer = new CallerIdStreamBuffer({
    onCall: (phone) => calls.push(phone),
    onLine: (_line, escaped) => lines.push(escaped),
  });

  // Parçalanmış veri: "NM" + "BR = 053" + "21234567\r\n"
  buffer.feed("NM");
  assert.strictEqual(calls.length, 0);

  buffer.feed("BR = 053");
  assert.strictEqual(calls.length, 0);

  buffer.feed("21234567\r\n");
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0], "05321234567");
});

test("CallerIdStreamBuffer: Format (d) Çok satırlı Bell202 (DATE, TIME, NMBR ayrı satırlar)", () => {
  const calls: string[] = [];
  const buffer = new CallerIdStreamBuffer({
    onCall: (phone) => calls.push(phone),
  });

  // Satır 1: DATE = 1015
  buffer.feed("DATE = 1015\r\n");
  assert.strictEqual(calls.length, 0);

  // Satır 2: TIME = 0715
  buffer.feed("TIME = 0715\r\n");
  assert.strictEqual(calls.length, 0);

  // Satır 3: NMBR = 05441234567
  buffer.feed("NMBR = 05441234567\r\n");
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0], "05441234567");
});

test("CallerIdStreamBuffer: Modem RING ve +CLIP akışı", () => {
  const calls: string[] = [];
  const buffer = new CallerIdStreamBuffer({
    onCall: (phone) => calls.push(phone),
  });

  buffer.feed("RING\r\n");
  assert.strictEqual(calls.length, 0);

  buffer.feed('+CLIP: "05551112233",128\r\n');
  assert.strictEqual(calls.length, 1);
  assert.strictEqual(calls[0], "05551112233");
});
