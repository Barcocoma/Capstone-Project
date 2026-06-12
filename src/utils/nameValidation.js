/**
 * Sanitizes a name by removing special characters
 * Only allows: letters, spaces, hyphens, apostrophes, and periods
 * @param {string} value - The input value to sanitize
 * @returns {string} - The sanitized value
 */
export const sanitizeName = (value) => {
  if (!value) return '';
  // Only allow letters (including accented characters), spaces, hyphens, apostrophes, and periods
  return value.replace(/[^a-zA-Z\s\-'\.À-ÿ]/g, '');
};

/**
 * Validates if a name contains only allowed characters
 * @param {string} value - The input value to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export const isValidName = (value) => {
  if (!value) return true; // Empty is valid (will be checked separately for required fields)
  // Check if the value contains any disallowed characters
  return /^[a-zA-Z\s\-'\.À-ÿ]*$/.test(value);
};




