/** A timestamp interval inferred from one point-cloud filename. */
export interface FilenameTimestampBounds {
  minTimestamp: string;
  maxTimestamp: string;
}

// The two scan naming conventions used by the imported datasets are a local
// calendar clock and Unix epoch milliseconds. Only the basename is examined.
const CALENDAR_CLOCK =
  /^(\d{4})_(\d{2})_(\d{2})=(\d{2})_(\d{2})_(\d{2})_(\d{3}|\d{6})$/;
const EPOCH_MILLISECONDS = /^\d{13}$/;

function calendarTimestamp(stem: string): string | null {
  const match = CALENDAR_CLOCK.exec(stem);
  if (match == null) return null;

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    fraction,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(fraction.slice(0, 3));
  const date = new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null;
  }

  const iso = date.toISOString();
  return fraction.length === 6
    ? iso.replace(/\.\d{3}Z$/, `.${fraction}Z`)
    : iso;
}

/**
 * With no pattern, recognizes YYYY_MM_DD=HH_MM_SS_mmm[uuu] or a 13-digit
 * epoch-ms stem. A supplied pattern replaces these defaults.
 */
export function deriveTimestampBoundsFromFilename(
  path: string,
  pattern = "",
): FilenameTimestampBounds | null {
  const filename = path.replace(/\\/g, "/").split("/").at(-1) ?? "";
  const stem = filename.replace(/\.[^.]+$/, "");
  const timestamp = pattern.trim()
    ? patternedTimestamp(stem, pattern.trim())
    : EPOCH_MILLISECONDS.test(stem)
      ? new Date(Number(stem)).toISOString()
      : calendarTimestamp(stem);

  return timestamp == null
    ? null
    : { minTimestamp: timestamp, maxTimestamp: timestamp };
}

/** Parse the numeric calendar directives commonly used in Python strptime patterns. */
function patternedTimestamp(stem: string, pattern: string): string | null {
  const widths: Record<string, string> = {
    Y: "\\d{4}",
    m: "\\d{1,2}",
    d: "\\d{1,2}",
    H: "\\d{1,2}",
    M: "\\d{1,2}",
    S: "\\d{1,2}",
    f: "\\d{1,6}",
  };
  const fields: string[] = [];
  let expression = "^";
  for (let index = 0; index < pattern.length; index++) {
    const character = pattern[index];
    if (character === "%") {
      const directive = pattern[++index];
      if (directive === "%") expression += "%";
      else if (directive && widths[directive]) {
        fields.push(directive);
        expression += `(${widths[directive]})`;
      } else return null;
    } else {
      expression += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  const match = new RegExp(`${expression}$`).exec(stem);
  if (!match) return null;
  const parts: Record<string, number> = {};
  fields.forEach((field, index) => {
    parts[field] = Number(match[index + 1]);
  });
  const year = parts.Y ?? 1900;
  const month = parts.m ?? 1;
  const day = parts.d ?? 1;
  const hour = parts.H ?? 0;
  const minute = parts.M ?? 0;
  const second = parts.S ?? 0;
  const fraction = fields.includes("f")
    ? match[fields.indexOf("f") + 1].padEnd(6, "0")
    : "000000";
  const date = new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    Number(fraction.slice(0, 3)),
  );
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  )
    return null;
  return date.toISOString().replace(/\.\d{3}Z$/, `.${fraction}Z`);
}
