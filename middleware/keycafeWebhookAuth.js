const crypto = require("crypto");

function timingSafeEqualStrings(a, b) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");

  if (bufA.length !== bufB.length) {
    return false;
  }

  return crypto.timingSafeEqual(bufA, bufB);
}

function verifyKeyCafeWebhook(req, res, next) {
  const expectedUser = process.env.KEYCAFE_WEBHOOK_USERNAME;
  const expectedPass = process.env.KEYCAFE_WEBHOOK_PASSWORD;

  if (!expectedUser || !expectedPass) {
    console.error("KeyCafe webhook received but KEYCAFE_WEBHOOK_USERNAME/PASSWORD are not configured.");
    return res.status(503).send("Webhook not configured.");
  }

  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");

  if (scheme !== "Basic" || !encoded) {
    res.set("WWW-Authenticate", "Basic");
    return res.status(401).send("Unauthorized");
  }

  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex === -1) {
    return res.status(401).send("Unauthorized");
  }

  const user = decoded.slice(0, separatorIndex);
  const pass = decoded.slice(separatorIndex + 1);

  if (
    !timingSafeEqualStrings(user, expectedUser) ||
    !timingSafeEqualStrings(pass, expectedPass)
  ) {
    return res.status(401).send("Unauthorized");
  }

  next();
}

module.exports = { verifyKeyCafeWebhook };
