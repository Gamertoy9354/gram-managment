const Fuse = require('fuse.js');

/**
 * Calculate Levenshtein distance between two strings.
 */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i-1][j-1];
      else dp[i][j] = 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

/**
 * Check if two names are a fuzzy match.
 * - Normalizes whitespace and case
 * - Accepts if Levenshtein distance ≤ 20% of the longer name length
 * - Also accepts if all significant tokens match partially
 *
 * @param {string} input    - Name entered by user
 * @param {string} stored   - Name stored in DB
 * @returns {{ match: boolean, score: number }}
 */
function fuzzyMatchName(input, stored) {
  const normalize = s => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const a = normalize(input);
  const b = normalize(stored);

  if (a === b) return { match: true, score: 1.0 };

  const dist = levenshtein(a, b);
  const maxLen = Math.max(a.length, b.length);
  const similarity = 1 - dist / maxLen;

  // Accept if similarity is ≥ 75%
  if (similarity >= 0.75) return { match: true, score: similarity };

  // Token-based check: every token in input appears in stored
  const tokensA = a.split(' ').filter(t => t.length > 1);
  const tokensB = b.split(' ').filter(t => t.length > 1);
  const allFound = tokensA.every(ta => tokensB.some(tb => levenshtein(ta, tb) <= 1));
  if (allFound && tokensA.length >= 2) return { match: true, score: 0.80 };

  return { match: false, score: similarity };
}

/**
 * Use Fuse.js to search a list of citizen names.
 * @param {string} query      - Input name
 * @param {Array}  items      - Array of { id, full_name, ... }
 * @returns {Array}           - Sorted matches with score
 */
function searchNames(query, items) {
  const fuse = new Fuse(items, {
    keys: ['full_name'],
    threshold: 0.4,
    includeScore: true,
  });
  return fuse.search(query);
}

module.exports = { fuzzyMatchName, searchNames, levenshtein };
