// Standards-compliant Code 128B barcode encoder for crisp, scanner-readable SVG labels.

const CODE128_PATTERNS: readonly string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', // 0..7
  '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', // 8..15
  '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', // 16..23
  '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', // 24..31
  '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 32..39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', // 40..47
  '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', // 48..55
  '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', // 56..63
  '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', // 64..71
  '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 72..79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', // 80..87
  '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', // 88..95
  '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', // 96..103
  '211214', '211232', '2331112', // 104 (Start B), 105 (Start C), 106 (Stop)
];

export interface BarcodeBar {
  x: number;
  width: number;
}

export interface EncodedBarcode {
  value: string;
  bars: BarcodeBar[];
  totalModules: number;
  quietZoneModules: number;
}

/**
 * Normalizes a SKU or barcode string to printable ASCII (32..126) for Code 128B.
 */
export function sanitizeCode128BValue(raw: string): string {
  const trimmed = raw.trim();
  let out = '';
  for (let i = 0; i < trimmed.length; i++) {
    const code = trimmed.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      out += trimmed[i];
    }
  }
  return out || 'SKU-0000';
}

/**
 * Encodes an arbitrary printable ASCII string using Code 128 Set B
 * (Start B + data symbols + mod-103 checksum + Stop).
 */
export function encodeCode128B(rawValue: string): EncodedBarcode {
  const value = sanitizeCode128BValue(rawValue);
  const START_B = 104;
  const STOP = 106;

  const codes: number[] = [START_B];
  let checksum = START_B;

  for (let i = 0; i < value.length; i++) {
    const symbolValue = value.charCodeAt(i) - 32;
    codes.push(symbolValue);
    checksum += symbolValue * (i + 1);
  }

  const checkDigit = checksum % 103;
  codes.push(checkDigit);
  codes.push(STOP);

  const quietZoneModules = 10;
  const bars: BarcodeBar[] = [];
  let cursor = quietZoneModules;

  for (const symbol of codes) {
    const pattern = CODE128_PATTERNS[symbol];
    for (let j = 0; j < pattern.length; j++) {
      const width = Number(pattern[j]);
      // Even indices (0, 2, 4, 6) are bars; odd indices are spaces
      if (j % 2 === 0) {
        bars.push({ x: cursor, width });
      }
      cursor += width;
    }
  }

  return {
    value,
    bars,
    totalModules: cursor + quietZoneModules,
    quietZoneModules,
  };
}
