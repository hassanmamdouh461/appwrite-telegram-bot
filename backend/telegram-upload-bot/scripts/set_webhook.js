import axios from 'axios';
import 'dotenv/config';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APPWRITE_FUNCTION_URL = process.argv[2]; // Pass URL as argument

if (!TELEGRAM_BOT_TOKEN) {
  console.error('Error: TELEGRAM_BOT_TOKEN is not set in .env file');
  process.exit(1);
}

if (!APPWRITE_FUNCTION_URL) {
  console.error('Usage: node scripts/set_webhook.js <YOUR_APPWRITE_FUNCTION_URL>');
  process.exit(1);
}

async function setWebhook() {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook?url=${APPWRITE_FUNCTION_URL}`;
    const response = await axios.get(url);
    
    if (response.data.ok) {
        console.log('✅ Webhook set successfully!');
        console.log('Response:', response.data);
    } else {
        console.error('❌ Failed to set webhook:', response.data.description);
    }
  } catch (error) {
    console.error('❌ Error setting webhook:', error.message);
  }
}

setWebhook();
