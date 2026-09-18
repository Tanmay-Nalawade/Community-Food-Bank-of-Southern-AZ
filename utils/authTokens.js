const crypto = require("crypto");

// Only the hash is ever persisted (see models/user.js) — the raw token
// exists just long enough to build the emailed link. A 256-bit random value
// has no practical timing-attack surface, so a plain indexed-field match is
// enough at lookup time; no need for a constant-time comparison here.
function issueToken(ttlMs) {
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(token);
  return { token, tokenHash, expiresAt: new Date(Date.now() + ttlMs) };
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

module.exports = { issueToken, hashToken };
