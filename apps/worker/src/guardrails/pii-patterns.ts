/**
 * PII detection regex patterns.
 */
export const PII_PATTERNS: Record<string, RegExp> = {
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  credit_card: /\b(?:\d{4}[- ]?){3}\d{4}\b/g,
  email: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
  phone: /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/g,
};

export type PiiCategory = keyof typeof PII_PATTERNS;

/**
 * Scan text for PII patterns.
 * Returns list of detected categories.
 */
export function detectPii(
  text: string,
  categories?: PiiCategory[],
): { detected: boolean; categories: string[] } {
  const categoriesToCheck = categories ?? (Object.keys(PII_PATTERNS) as PiiCategory[]);
  const found: string[] = [];

  for (const category of categoriesToCheck) {
    const pattern = PII_PATTERNS[category];
    if (pattern && pattern.test(text)) {
      found.push(category);
    }
    // Reset regex lastIndex for global patterns
    if (pattern) pattern.lastIndex = 0;
  }

  return { detected: found.length > 0, categories: found };
}
