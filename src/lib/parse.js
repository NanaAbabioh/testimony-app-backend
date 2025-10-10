/**
 * Parse time string or number to seconds
 * @param {string|number} input - Time in format: seconds (123), mm:ss (12:34), or hh:mm:ss (1:23:45)
 * @returns {number} Total seconds
 * @throws {Error} If input is invalid
 */
function parseTimeToSeconds(input) {
  if (typeof input === 'number') {
    if (!Number.isInteger(input) || input < 0) {
      throw new Error('Numeric input must be a non-negative integer');
    }
    return Math.floor(input);
  }

  const trimmed = (input || '').trim();
  if (!trimmed) {
    throw new Error('Time input cannot be empty');
  }

  // Check if it's just a number (seconds)
  if (/^\d+$/.test(trimmed)) {
    const seconds = parseInt(trimmed, 10);
    if (seconds < 0) {
      throw new Error('Time cannot be negative');
    }
    return seconds;
  }

  // Must have colon for mm:ss or hh:mm:ss format
  if (!trimmed.includes(':')) {
    throw new Error('Use format: seconds (123), mm:ss (12:34), or hh:mm:ss (1:23:45)');
  }

  const parts = trimmed.split(':');
  if (parts.length < 2 || parts.length > 3) {
    throw new Error('Use format: mm:ss or hh:mm:ss');
  }

  const numericParts = parts.map((part, index) => {
    const num = parseInt(part, 10);
    if (Number.isNaN(num) || num < 0) {
      throw new Error(`Invalid time component: "${part}"`);
    }

    // Minutes and seconds must be less than 60
    if (index > 0 && num >= 60) {
      throw new Error(`Minutes and seconds must be less than 60, got: ${num}`);
    }

    // Minutes in mm:ss format can't exceed 1440 (24 hours)
    if (index === 0 && parts.length === 2 && num > 1440) {
      throw new Error(`Minutes cannot exceed 1440 (24 hours), got: ${num}`);
    }

    return num;
  });

  let totalSeconds = 0;
  if (numericParts.length === 3) {
    // hh:mm:ss
    totalSeconds = numericParts[0] * 3600 + numericParts[1] * 60 + numericParts[2];
  } else if (numericParts.length === 2) {
    // mm:ss
    totalSeconds = numericParts[0] * 60 + numericParts[1];
  }

  if (totalSeconds > 86400) {
    throw new Error('Time cannot exceed 24 hours');
  }

  return totalSeconds;
}

module.exports = { parseTimeToSeconds };
