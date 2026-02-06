/**
 * Get Bangkok time (UTC+7)
 */
function getBangkokTime() {
  const now = new Date();
  const bangkokOffset = 7 * 60; // Bangkok is UTC+7 in minutes
  const localOffset = now.getTimezoneOffset(); // Get local timezone offset
  return new Date(now.getTime() + (bangkokOffset + localOffset) * 60000);
}

module.exports = {
  getBangkokTime
};
