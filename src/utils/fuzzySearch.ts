export interface TextRange {
  start: number;
  end: number;
}

export interface FieldMatch {
  matched: boolean;
  score: number;
  exact: boolean;
  ranges: TextRange[];
}

export interface ProductFuzzyResult<T> {
  item: T;
  score: number;
  isFuzzyMatch: boolean;
  highlights: {
    name: TextRange[];
    sku: TextRange[];
    barcode: TextRange[];
    description: TextRange[];
    category: TextRange[];
    location: TextRange[];
  };
}

function isWordBoundary(text: string, index: number): boolean {
  if (index <= 0) return true;
  const prev = text[index - 1];
  return /[\s\-_./,()]/.test(prev);
}

/**
 * Optimal String Alignment (restricted Damerau-Levenshtein) distance.
 * Treats adjacent character transpositions as a single edit so typos like
 * "espersso" -> "espresso" count as distance 1.
 */
export function damerauLevenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;
  if (a === b) return 0;

  const dp: number[][] = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
      if (
        i > 1 &&
        j > 1 &&
        a[i - 1] === b[j - 2] &&
        a[i - 2] === b[j - 1]
      ) {
        val = Math.min(val, dp[i - 2][j - 2] + 1); // transposition
      }
      dp[i][j] = val;
    }
  }
  return dp[la][lb];
}

export function mergeRanges(ranges: TextRange[]): TextRange[] {
  if (ranges.length <= 1) return ranges;
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: TextRange[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const curr = sorted[i];
    const last = merged[merged.length - 1];
    if (curr.start <= last.end) {
      last.end = Math.max(last.end, curr.end);
    } else {
      merged.push({ ...curr });
    }
  }
  return merged;
}

interface TokenSegment {
  text: string;
  start: number;
}

function extractSegments(text: string): TokenSegment[] {
  const segments: TokenSegment[] = [];
  const seen = new Set<string>();

  // Whitespace-delimited chunks (preserves things like "SKU-1024")
  const chunkRe = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = chunkRe.exec(text)) !== null) {
    const key = `${m.index}:${m[0].length}`;
    if (!seen.has(key)) {
      seen.add(key);
      segments.push({ text: m[0].toLowerCase(), start: m.index });
    }
  }

  // Alphanumeric sub-tokens (splits "SKU-1024" into "sku" and "1024")
  const wordRe = /[a-z0-9]+/gi;
  while ((m = wordRe.exec(text)) !== null) {
    const key = `${m.index}:${m[0].length}`;
    if (!seen.has(key)) {
      seen.add(key);
      segments.push({ text: m[0].toLowerCase(), start: m.index });
    }
  }

  return segments;
}

function findCompactSubsequenceRanges(lowerText: string, token: string): {
  ranges: TextRange[];
  span: number;
} | null {
  if (token.length < 3) return null;
  const maxSpan = token.length * 2 + 2;
  let bestSpan = Number.POSITIVE_INFINITY;
  let bestIndices: number[] | null = null;

  for (let start = 0; start < lowerText.length; start++) {
    if (lowerText[start] !== token[0]) continue;
    const indices = [start];
    let ti = 1;
    for (let pos = start + 1; pos < lowerText.length && ti < token.length; pos++) {
      if (pos - start + 1 > maxSpan) break;
      if (lowerText[pos] === token[ti]) {
        indices.push(pos);
        ti++;
      }
    }
    if (ti === token.length) {
      const span = indices[indices.length - 1] - indices[0] + 1;
      if (span <= maxSpan && span < bestSpan) {
        bestSpan = span;
        bestIndices = indices;
      }
    }
  }

  if (!bestIndices) return null;
  return {
    ranges: mergeRanges(bestIndices.map((idx) => ({ start: idx, end: idx + 1 }))),
    span: bestSpan,
  };
}

function matchSingleToken(
  text: string,
  lowerText: string,
  segments: TokenSegment[],
  token: string
): { score: number; exact: boolean; ranges: TextRange[] } | null {
  // 1. Direct substring match (all occurrences)
  const exactRanges: TextRange[] = [];
  let searchFrom = 0;
  let firstIdx = -1;
  while (searchFrom < lowerText.length) {
    const idx = lowerText.indexOf(token, searchFrom);
    if (idx === -1) break;
    if (firstIdx === -1) firstIdx = idx;
    exactRanges.push({ start: idx, end: idx + token.length });
    searchFrom = idx + token.length;
  }

  if (exactRanges.length > 0) {
    let score = firstIdx === 0 ? 120 : isWordBoundary(lowerText, firstIdx) ? 105 : 88;
    if (lowerText === token) score = 150;
    return { score, exact: true, ranges: exactRanges };
  }

  // 2. Fuzzy word / word-prefix Damerau-Levenshtein match (for queries >= 3 chars)
  if (token.length >= 3) {
    const maxEdits = token.length <= 5 ? 1 : 2;
    let bestDist = Number.POSITIVE_INFINITY;
    let bestRange: TextRange | null = null;
    let bestStart = Number.POSITIVE_INFINITY;
    let bestLenDiff = Number.POSITIVE_INFINITY;

    for (const seg of segments) {
      if (seg.text.length < Math.max(2, token.length - maxEdits)) continue;

      const minPrefix = Math.max(2, token.length - maxEdits);
      const maxPrefix = Math.min(seg.text.length, token.length + maxEdits);

      // Test both full segment and predictive prefixes of the segment
      const candidateLengths = new Set<number>([seg.text.length]);
      for (let len = minPrefix; len <= maxPrefix; len++) {
        candidateLengths.add(len);
      }

      for (const len of candidateLengths) {
        if (Math.abs(len - token.length) > maxEdits) continue;
        const candidate = seg.text.slice(0, len);
        // Require at least first OR second character match for short 3-char tokens to limit noise
        if (
          token.length === 3 &&
          candidate[0] !== token[0] &&
          candidate[1] !== token[1]
        ) {
          continue;
        }
        const dist = damerauLevenshtein(token, candidate);
        if (dist <= maxEdits) {
          const lenDiff = Math.abs(len - token.length);
          const isBetter =
            dist < bestDist ||
            (dist === bestDist && lenDiff < bestLenDiff) ||
            (dist === bestDist && lenDiff === bestLenDiff && seg.start < bestStart);
          if (isBetter) {
            bestDist = dist;
            bestLenDiff = lenDiff;
            bestStart = seg.start;
            bestRange = { start: seg.start, end: seg.start + candidate.length };
          }
        }
      }
    }

    if (bestRange) {
      const score = Math.max(30, 80 - bestDist * 22 - (bestStart === 0 ? 0 : 4));
      return { score, exact: false, ranges: [bestRange] };
    }

    // 3. Compact ordered subsequence fallback (e.g. "sku102" -> "SKU-1024")
    const compact = findCompactSubsequenceRanges(lowerText, token);
    if (compact) {
      const extra = compact.span - token.length;
      return {
        score: Math.max(24, 52 - extra * 3),
        exact: false,
        ranges: compact.ranges,
      };
    }
  }

  return null;
}

export function matchFuzzyField(text: string, query: string): FieldMatch {
  const cleanQuery = query.trim().toLowerCase();
  if (!cleanQuery || !text) {
    return { matched: false, score: 0, exact: false, ranges: [] };
  }

  const lowerText = text.toLowerCase();
  const segments = extractSegments(text);

  // Fast path: full trimmed query matches directly
  const direct = matchSingleToken(text, lowerText, segments, cleanQuery);
  const tokens = cleanQuery.split(/\s+/).filter(Boolean);

  if (tokens.length <= 1) {
    if (!direct) {
      return { matched: false, score: 0, exact: false, ranges: [] };
    }
    return {
      matched: true,
      score: direct.score,
      exact: direct.exact,
      ranges: mergeRanges(direct.ranges),
    };
  }

  // Multi-token: if full phrase matched exactly, prefer it, otherwise require all tokens to match
  if (direct && direct.exact) {
    return {
      matched: true,
      score: direct.score + 20,
      exact: true,
      ranges: mergeRanges(direct.ranges),
    };
  }

  let totalScore = 0;
  let allExact = true;
  const combinedRanges: TextRange[] = [];

  for (const tok of tokens) {
    const res = matchSingleToken(text, lowerText, segments, tok);
    if (!res) {
      // Fall back to direct fuzzy match of full query if it matched
      if (direct) {
        return {
          matched: true,
          score: direct.score,
          exact: direct.exact,
          ranges: mergeRanges(direct.ranges),
        };
      }
      return { matched: false, score: 0, exact: false, ranges: [] };
    }
    totalScore += res.score;
    if (!res.exact) allExact = false;
    combinedRanges.push(...res.ranges);
  }

  return {
    matched: true,
    score: Math.round(totalScore / tokens.length) + 8,
    exact: allExact,
    ranges: mergeRanges(combinedRanges),
  };
}

export interface ProductSearchableFields {
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  categoryName?: string;
  locationName?: string;
}

export function scoreProductFuzzyMatch<T>(
  item: T,
  fields: ProductSearchableFields,
  query: string
): ProductFuzzyResult<T> | null {
  const clean = query.trim();
  if (!clean) return null;

  const nameRes = matchFuzzyField(fields.name, clean);
  const skuRes = matchFuzzyField(fields.sku, clean);
  const barcodeRes = fields.barcode ? matchFuzzyField(fields.barcode, clean) : null;
  const catRes = fields.categoryName ? matchFuzzyField(fields.categoryName, clean) : null;
  const locRes = fields.locationName ? matchFuzzyField(fields.locationName, clean) : null;
  const descRes = fields.description ? matchFuzzyField(fields.description, clean) : null;

  const matchedAny =
    nameRes.matched ||
    skuRes.matched ||
    Boolean(barcodeRes?.matched) ||
    Boolean(catRes?.matched) ||
    Boolean(locRes?.matched) ||
    Boolean(descRes?.matched);

  if (!matchedAny) return null;

  // Weighted composite score across fields
  const weightedScore =
    (nameRes.matched ? nameRes.score * 4 : 0) +
    (skuRes.matched ? skuRes.score * 3.5 : 0) +
    (barcodeRes?.matched ? barcodeRes.score * 3.5 : 0) +
    (catRes?.matched ? catRes.score * 2 : 0) +
    (locRes?.matched ? locRes.score * 2 : 0) +
    (descRes?.matched ? descRes.score * 1.4 : 0);

  const exactMatchHit =
    (nameRes.matched && nameRes.exact) ||
    (skuRes.matched && skuRes.exact) ||
    Boolean(barcodeRes?.matched && barcodeRes.exact) ||
    Boolean(catRes?.matched && catRes.exact) ||
    Boolean(locRes?.matched && locRes.exact) ||
    Boolean(descRes?.matched && descRes.exact);

  return {
    item,
    score: Math.round(weightedScore),
    isFuzzyMatch: !exactMatchHit,
    highlights: {
      name: nameRes.ranges,
      sku: skuRes.ranges,
      barcode: barcodeRes?.ranges ?? [],
      description: descRes?.ranges ?? [],
      category: catRes?.ranges ?? [],
      location: locRes?.ranges ?? [],
    },
  };
}
