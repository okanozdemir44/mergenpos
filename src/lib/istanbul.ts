/** Europe/Istanbul date helpers for reports. */

const TZ = "Europe/Istanbul";

export type IstanbulParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export function istanbulParts(input: Date | string): IstanbulParts {
  const date = typeof input === "string" ? new Date(input) : input;
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const map = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  };
}

export function istanbulNowParts(): IstanbulParts {
  return istanbulParts(new Date());
}

export function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

/** Inclusive Istanbul calendar day range → UTC ISO bounds. */
export function istanbulDateRangeIso(
  startDay: number,
  startMonth: number,
  startYear: number,
  endDay: number,
  endMonth: number,
  endYear: number,
) {
  const from = new Date(
    `${startYear}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}T00:00:00+03:00`,
  );
  const to = new Date(
    `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}T23:59:59+03:00`,
  );
  return { from, to, fromIso: from.toISOString(), toIso: to.toISOString() };
}

export function istanbulDayKey(iso: string) {
  const p = istanbulParts(iso);
  return `${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")}`;
}
