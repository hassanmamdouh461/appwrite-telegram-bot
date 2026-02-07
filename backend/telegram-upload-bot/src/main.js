import { Client, Storage, Databases, ID, InputFile } from 'node-appwrite';
import axios from 'axios';

// Environment Variables
const APPWRITE_API_KEY = process.env.APPWRITE_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const APPWRITE_PROJECT_ID = process.env.APPWRITE_PROJECT_ID;
const APPWRITE_DATABASE_ID = process.env.APPWRITE_DATABASE_ID;
const APPWRITE_COLLECTION_ID = process.env.APPWRITE_COLLECTION_ID;
const APPWRITE_BUCKET_ID = process.env.APPWRITE_BUCKET_ID;

// Initialize Appwrite SDK
const client = new Client()
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject(APPWRITE_PROJECT_ID)
  .setKey(APPWRITE_API_KEY);

const storage = new Storage(client);
const databases = new Databases(client);

export default async ({ req, res, log, error }) => {
  try {
    // Handle GET requests (Browser verification)
    if (req.method === 'GET') {
      return res.send('🤖 Telegram Bot Function is Active!');
    }

    // Only process POST requests (Webhooks) from this point check
    if (req.method !== 'POST') {
      return res.send('Method not allowed', 405);
    }

    // Parse the update from Telegram
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    if (!body || !body.message) {
      return res.json({ ok: true, message: 'No message found in update' });
    }

    const message = body.message;
    const chatId = message.chat.id;

    log(`Received message from chat ID: ${chatId}`);

    let fileId = null;
    let fileName = 'unknown_file';

    // Check for Document
    if (message.document) {
      fileId = message.document.file_id;
      fileName = message.document.file_name || 'document';
      log(`Detected document: ${fileName}`);
    } 
    // Check for Photo (get the highest resolution)
    else if (message.photo && message.photo.length > 0) {
      const bestPhoto = message.photo[message.photo.length - 1];
      fileId = bestPhoto.file_id;
      fileName = `photo_${fileId}.jpg`;
      log(`Detected photo`);
    } else {
      log('No file or photo found in message');
      return res.json({ ok: true, message: 'No file to process' });
    }

    // 1. Get File Path from Telegram API
    // https://api.telegram.org/bot<token>/getFile?file_id=<file_id>
    const getFileUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
    const fileResponse = await axios.get(getFileUrl);
    
    if (!fileResponse.data.ok) {
      throw new Error(`Failed to get file path: ${fileResponse.data.description}`);
    }

    const filePath = fileResponse.data.result.file_path;
    log(`File path retrieved: ${filePath}`);

    // 2. Download File Content
    // https://api.telegram.org/file/bot<token>/<file_path>
    const downloadUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
    const fileContentResponse = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
    const fileBuffer = Buffer.from(fileContentResponse.data);
    log(`File downloaded, size: ${fileBuffer.length} bytes`);

    // 3. Upload to Appwrite Storage
    const uploadedFile = await storage.createFile(
      APPWRITE_BUCKET_ID,
      ID.unique(),
      InputFile.fromBuffer(fileBuffer, fileName)
    );
    log(`File uploaded to Appwrite Storage: ${uploadedFile.$id}`);

    // 4. Create Document in Appwrite Database
    // View URL: https://cloud.appwrite.io/v1/storage/buckets/:bucketId/files/:fileId/view?project=:projectId
    const fileViewUrl = `https://cloud.appwrite.io/v1/storage/buckets/${APPWRITE_BUCKET_ID}/files/${uploadedFile.$id}/view?project=${APPWRITE_PROJECT_ID}`;

    const documentData = {
      originalName: fileName,
      fileId: uploadedFile.$id,
      url: fileViewUrl,
      // Add other fields if your collection requires them, e.g. chatId, specific timestamps, etc.
      // chatId: String(chatId) 
    };

    const document = await databases.createDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_COLLECTION_ID,
      ID.unique(),
      documentData
    );
    log(`Document created in Database: ${document.$id}`);

    // 5. Send Success Message to Telegram
    // https://api.telegram.org/bot<token>/sendMessage
    const sendMessageUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    await axios.post(sendMessageUrl, {
      chat_id: chatId,
      text: 'تم الرفع بنجاح ✅'
    });
    log(`Success message sent to Telegram`);

    return res.json({ 
      success: true, 
      fileId: uploadedFile.$id, 
      documentId: document.$id 
    });

  } catch (err) {
    error(`Error processing request: ${err.message}`);
    
    // Attempt to send error message to user if chatId is available (from logic above if scope allows)
    // For now, just return 200 so Telegram retries stop, but log the error.
    return res.json({ ok: false, error: err.message });
  }
};
