/**
 * Logic for predicting and normalizing warehouse locations based on user input.
 * Helps convert rapid short-hand inputs (like "9") into standardized formats ("Row 09").
 */

/**
 * Normalizes input and finds best matches from existing locations.
 *
 * @param {string} input - The raw user input (e.g., "9", "row 9")
 * @param {Array<string>} existingLocations - List of all valid location names in the current warehouse
 * @returns {Object} result
 * @returns {Array} result.matches - Valid existing locations that match the intent
 * @returns {boolean} result.exactMatch - True if the input exactly matches an existing location
 * @returns {Object|null} result.bestGuess - The single best predicted location, if confidence is high
 */
export const predictLocation = (input, existingLocations = []) => {
  if (!input || typeof input !== 'string')
    return { matches: [], exactMatch: false, bestGuess: null };

  const cleanInput = input.trim();
  // Check for exact match first
  const exactMatch = existingLocations.find(
    (loc) => loc.toLowerCase() === cleanInput.toLowerCase()
  );
  if (exactMatch) {
    return {
      matches: [exactMatch],
      exactMatch: true,
      bestGuess: exactMatch,
    };
  }

  const isNumeric = /^\d+$/.test(cleanInput);
  const numVal = parseInt(cleanInput, 10);

  let potentialMatches = [];

  if (isNumeric) {
    // Generate common warehouse patterns for numbers
    const patterns = [
      `Row ${cleanInput}`, // "Row 9"
      `Row ${cleanInput.padStart(2, '0')}`, // "Row 09"
      `Row ${cleanInput.padStart(3, '0')}`, // "Row 009"
      `R${cleanInput}`, // "R9"
      `Aisle ${cleanInput}`, // "Aisle 9"
      `Bin ${cleanInput}`, // "Bin 9"
    ];

    // Find which generated patterns actually exist in the DB
    potentialMatches = existingLocations.filter((loc) => {
      // Check against patterns
      const isPatternMatch = patterns.some((p) => p.toLowerCase() === loc.toLowerCase());
      // Also allow if the location ends with the number (e.g. "A-09" matches "9")
      // but be careful of false positives like "19" matching "9".
      // So we check strict ending boundary or standard specific formats.
      return isPatternMatch;
    });
  } else {
    // Standard text search
    potentialMatches = existingLocations.filter((loc) =>
      loc.toLowerCase().includes(cleanInput.toLowerCase())
    );
  }

  // Sort matches by quality
  // 1. "Row XX" is preferred (Business Rule: DEFAULT_PREFIX = "Row")
  // 2. Shorter length (usually implies simpler/more direct match)
  potentialMatches.sort((a, b) => {
    const aIsRow = a.toLowerCase().startsWith('row');
    const bIsRow = b.toLowerCase().startsWith('row');

    if (aIsRow && !bIsRow) return -1;
    if (!aIsRow && bIsRow) return 1;

    return a.length - b.length;
  });

  // Determine Best Guess for Auto-Selection
  // We only guess if we have results and the input was numeric (high confidence of "shortcode" usage)
  let bestGuess = null;
  if (isNumeric && potentialMatches.length === 1) {
    bestGuess = potentialMatches[0];
  } else if (isNumeric && potentialMatches.length > 1) {
    // If multiple matches, checking if one is significantly "standard".
    // e.g. "Row 09" vs "Row 9" -> prefer "Row 09" if standard, or just take the first one sorted above.
    // For now, if we have "Row 9" and "Row 09", the sort above puts them close.
    // We might not want to auto-guess if ambiguous, unless we enforce "Row" preference strongly.

    // Strict Mode: Only auto-select if it's the ONLY "Row" match.
    const rowMatches = potentialMatches.filter((m) => m.toLowerCase().startsWith('row'));
    if (rowMatches.length === 1) {
      bestGuess = rowMatches[0];
    }
  }

  return {
    matches: potentialMatches,
    exactMatch: false,
    bestGuess,
  };
};
