require("dotenv").config();
const keycafe = require("../services/keycafe");

async function main() {
  const url = process.argv[2];

  if (!url) {
    console.error("Usage: node scripts/register-keycafe-webhook.js <webhook-url>");
    console.error("Example: node scripts/register-keycafe-webhook.js https://motorpool.cfbsaz.org/webhooks/keycafe");
    process.exit(1);
  }

  if (!/^https:\/\//.test(url)) {
    console.error("Webhook URL must be a public https:// address KeyCafe's servers can reach.");
    process.exit(1);
  }

  const username = process.env.KEYCAFE_WEBHOOK_USERNAME;
  const password = process.env.KEYCAFE_WEBHOOK_PASSWORD;

  if (!username || !password) {
    console.error("Set KEYCAFE_WEBHOOK_USERNAME and KEYCAFE_WEBHOOK_PASSWORD in .env before running this script.");
    console.error("Pick any values you like — you're inventing these credentials, not retrieving them from KeyCafe.");
    process.exit(1);
  }

  if (!keycafe.isConfigured()) {
    console.error("Set KEYCAFE_EMAIL and KEYCAFE_TOKEN in .env before running this script.");
    process.exit(1);
  }

  const webhook = await keycafe.createWebhook(url, username, password);

  console.log("Webhook registered with KeyCafe:");
  console.log(`  id:       ${webhook.id}`);
  console.log(`  url:      ${webhook.url}`);
  console.log(`  username: ${webhook.username}`);
  console.log("");
  console.log("KeyCafe will now POST PICKUP/DROPOFF events to this URL, authenticated with");
  console.log("the KEYCAFE_WEBHOOK_USERNAME/KEYCAFE_WEBHOOK_PASSWORD already in your .env.");
}

main().catch((err) => {
  console.error("Failed to register webhook:", err.message);
  process.exit(1);
});
