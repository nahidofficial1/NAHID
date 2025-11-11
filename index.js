const TelegramBot = require('node-telegram-bot-api');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const https = require('https');
const http = require('http');

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('❌ Error: TELEGRAM_BOT_TOKEN environment variable is not set!');
  console.error('Please set your Telegram Bot Token in the environment variables.');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

const userSessions = new Map();
const loginInProgress = new Map();

async function handleStart(msg) {
  const chatId = msg.chat.id;
  
  const keyboard = {
    keyboard: [
      [
        { text: '🔐 WhatsApp লগইন' },
        { text: '📊 স্ট্যাটাস দেখুন' }
      ],
      [
        { text: '🔍 নম্বর চেক করুন' },
        { text: '🚪 লগআউট' }
      ],
      [
        { text: 'ℹ️ সাহায্য' }
      ]
    ],
    resize_keyboard: true,
    one_time_keyboard: false
  };
  
  bot.sendMessage(chatId, 
    '🎉 <b>WhatsApp চেকার বট এ স্বাগতম!</b>\n\n' +
    '✨ এই বট দিয়ে আপনি:\n' +
    '• WhatsApp এ QR কোড দিয়ে লগইন করতে পারবেন\n' +
    '• যেকোনো নম্বরে WhatsApp আছে কিনা চেক করতে পারবেন\n' +
    '• একাধিক নম্বর একসাথে চেক করতে পারবেন\n' +
    '• ফাইল আপলোড করে নম্বর চেক করতে পারবেন\n\n' +
    '👇 নিচের বাটন থেকে আপনার প্রয়োজনীয় অপশন বেছে নিন:',
    { 
      parse_mode: 'HTML',
      reply_markup: keyboard 
    }
  );
}

async function handleLogin(msg) {
  const chatId = msg.chat.id;
  
  if (userSessions.has(chatId) && userSessions.get(chatId).isReady) {
    bot.sendMessage(chatId, '✅ আপনি ইতিমধ্যে WhatsApp এ লগইন করা আছেন!');
    return;
  }

  if (loginInProgress.get(chatId)) {
    bot.sendMessage(chatId, '⏳ লগইন প্রক্রিয়া চলছে... অনুগ্রহ করে অপেক্ষা করুন।');
    return;
  }

  loginInProgress.set(chatId, true);
  bot.sendMessage(chatId, '⏳ WhatsApp QR কোড জেনারেট হচ্ছে...\nঅনুগ্রহ করে অপেক্ষা করুন।');

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: `session-${chatId}`
    }),
    puppeteer: {
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || require('puppeteer').executablePath(),
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    },
    qrMaxRetries: 5
  });

  client.on('loading_screen', (percent, message) => {
    console.log(`Loading screen for chat ${chatId}: ${percent}% - ${message}`);
  });

  client.on('remote_session_saved', () => {
    console.log(`Remote session saved for chat ${chatId}`);
  });

  client.on('qr', async (qr) => {
    console.log(`QR code generated for chat ${chatId}`);
    
    const qrImagePath = `qr-${chatId}.png`;
    const QRCode = require('qrcode');
    
    try {
      await QRCode.toFile(qrImagePath, qr);
      
      await bot.sendPhoto(chatId, qrImagePath, {
        caption: '📱 আপনার WhatsApp দিয়ে এই QR কোড স্ক্যান করুন:\n\n' +
                 '1. WhatsApp খুলুন\n' +
                 '2. মেনু (⋮) বা Settings এ যান\n' +
                 '3. "Linked Devices" সিলেক্ট করুন\n' +
                 '4. "Link a Device" ট্যাপ করুন\n' +
                 '5. এই QR কোড স্ক্যান করুন'
      });
      
      if (fs.existsSync(qrImagePath)) {
        fs.unlinkSync(qrImagePath);
      }
    } catch (error) {
      console.error('QR generation error:', error);
      bot.sendMessage(chatId, '❌ QR কোড জেনারেট করতে সমস্যা হয়েছে। /login দিয়ে আবার চেষ্টা করুন।');
      loginInProgress.delete(chatId);
      userSessions.delete(chatId);
      try {
        await client.destroy();
      } catch (destroyError) {
        console.error(`Error destroying client after QR failure for chat ${chatId}:`, destroyError);
      }
    }
  });

  client.on('ready', () => {
    console.log(`WhatsApp client ready for chat ${chatId}`);
    loginInProgress.delete(chatId);
    userSessions.set(chatId, { client, isReady: true });
    
    const keyboard = {
      keyboard: [
        [
          { text: '🔍 নম্বর চেক করুন' },
          { text: '📊 স্ট্যাটাস দেখুন' }
        ],
        [
          { text: '🚪 লগআউট' },
          { text: 'ℹ️ সাহায্য' }
        ]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    };
    
    bot.sendMessage(chatId, 
      '🎉 <b>সফলভাবে WhatsApp এ লগইন হয়েছে!</b>\n\n' +
      '✅ আপনার WhatsApp অ্যাকাউন্ট সংযুক্ত হয়েছে\n\n' +
      '📝 <b>এখন কি করবেন?</b>\n' +
      '• সরাসরি ফোন নম্বর পাঠান চেক করতে\n' +
      '• একাধিক নম্বর পাঠান একসাথে চেক করতে\n' +
      '• ফাইল পাঠান (.txt) নম্বর সহ\n\n' +
      '💡 <b>উদাহরণ:</b>\n' +
      '+8801712345678\n' +
      '+14155238886',
      { 
        parse_mode: 'HTML',
        reply_markup: keyboard 
      }
    );
  });

  client.on('authenticated', () => {
    console.log(`WhatsApp authenticated for chat ${chatId}`);
    bot.sendMessage(chatId, '🔐 Authentication সফল! লগইন প্রক্রিয়া সম্পন্ন হচ্ছে...');
  });

  client.on('auth_failure', async (msg) => {
    console.log(`Auth failure for chat ${chatId}:`, msg);
    bot.sendMessage(chatId, '❌ Authentication ব্যর্থ হয়েছে। /login দিয়ে আবার চেষ্টা করুন।');
    loginInProgress.delete(chatId);
    userSessions.delete(chatId);
    try {
      await client.destroy();
    } catch (error) {
      console.error(`Error destroying client after auth failure for chat ${chatId}:`, error);
    }
  });

  client.on('disconnected', async (reason) => {
    console.log(`WhatsApp disconnected for chat ${chatId}:`, reason);
    bot.sendMessage(chatId, `⚠️ WhatsApp থেকে disconnect হয়েছে। কারণ: ${reason}\n\n/login দিয়ে আবার লগইন করুন।`);
    loginInProgress.delete(chatId);
    userSessions.delete(chatId);
    try {
      await client.destroy();
    } catch (error) {
      console.error(`Error destroying client after disconnect for chat ${chatId}:`, error);
    }
  });

  try {
    await client.initialize();
    userSessions.set(chatId, { client, isReady: false });
  } catch (error) {
    console.error('Client initialization error:', error);
    bot.sendMessage(chatId, '❌ WhatsApp client শুরু করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    loginInProgress.delete(chatId);
    userSessions.delete(chatId);
    try {
      await client.destroy();
    } catch (destroyError) {
      console.error(`Error destroying client after init failure for chat ${chatId}:`, destroyError);
    }
  }
}

async function handleStatus(msg) {
  const chatId = msg.chat.id;
  
  if (userSessions.has(chatId) && userSessions.get(chatId).isReady) {
    bot.sendMessage(chatId, 
      '✅ <b>WhatsApp স্ট্যাটাস</b>\n\n' +
      '🟢 <b>সংযুক্ত:</b> হ্যাঁ\n' +
      '📱 <b>অবস্থা:</b> সক্রিয়\n\n' +
      '💡 আপনি এখন যেকোনো ফোন নম্বর চেক করতে পারবেন!',
      { parse_mode: 'HTML' }
    );
  } else {
    const keyboard = {
      keyboard: [
        [{ text: '🔐 WhatsApp লগইন' }],
        [{ text: 'ℹ️ সাহায্য' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    };
    
    bot.sendMessage(chatId, 
      '❌ <b>WhatsApp স্ট্যাটাস</b>\n\n' +
      '🔴 <b>সংযুক্ত:</b> না\n' +
      '📱 <b>অবস্থা:</b> লগআউট\n\n' +
      '💡 লগইন করতে "🔐 WhatsApp লগইন" বাটন চাপুন',
      { 
        parse_mode: 'HTML',
        reply_markup: keyboard 
      }
    );
  }
}

async function handleLogout(msg) {
  const chatId = msg.chat.id;
  
  if (!userSessions.has(chatId)) {
    bot.sendMessage(chatId, '❌ আপনি লগইন করা নেই।');
    return;
  }

  try {
    const session = userSessions.get(chatId);
    if (session.client) {
      await session.client.logout();
      await session.client.destroy();
    }
    userSessions.delete(chatId);
    loginInProgress.delete(chatId);
    
    const keyboard = {
      keyboard: [
        [{ text: '🔐 WhatsApp লগইন' }],
        [{ text: 'ℹ️ সাহায্য' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    };
    
    bot.sendMessage(chatId, 
      '✅ <b>সফলভাবে লগআউট হয়েছে!</b>\n\n' +
      '👋 আপনার WhatsApp সংযোগ বিচ্ছিন্ন করা হয়েছে\n\n' +
      '💡 আবার লগইন করতে চাইলে "🔐 WhatsApp লগইন" বাটন চাপুন',
      { 
        parse_mode: 'HTML',
        reply_markup: keyboard 
      }
    );
  } catch (error) {
    console.error('Logout error:', error);
    bot.sendMessage(chatId, '⚠️ লগআউট করা হয়েছে।');
    userSessions.delete(chatId);
    loginInProgress.delete(chatId);
  }
}

async function handleCheck(msg) {
  const chatId = msg.chat.id;
  
  if (!userSessions.has(chatId) || !userSessions.get(chatId).isReady) {
    const keyboard = {
      keyboard: [
        [{ text: '🔐 WhatsApp লগইন' }],
        [{ text: 'ℹ️ সাহায্য' }]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    };
    
    bot.sendMessage(chatId, 
      '❌ <b>প্রথমে WhatsApp এ লগইন করুন</b>\n\n' +
      '💡 "🔐 WhatsApp লগইন" বাটন চাপুন এবং QR কোড স্ক্যান করুন',
      { 
        parse_mode: 'HTML',
        reply_markup: keyboard 
      }
    );
    return;
  }
  
  bot.sendMessage(chatId, 
    '📱 <b>নম্বর চেক করুন</b>\n\n' +
    '✍️ একটি বা একাধিক নম্বর পাঠান\n\n' +
    '💡 <b>একটি নম্বরের উদাহরণ:</b>\n' +
    '+8801712345678\n\n' +
    '💡 <b>একাধিক নম্বরের উদাহরণ:</b>\n' +
    '<code>+8801712345678\n' +
    '+8801812345679\n' +
    '+8801912345680</code>\n\n' +
    '📄 <b>অথবা</b> একটি .txt ফাইল পাঠান নম্বর সহ',
    { parse_mode: 'HTML' }
  );
}

function extractPhoneNumbers(text) {
  const numbers = [];
  const lines = text.split(/[\n\r]+/);
  
  for (const line of lines) {
    const cleaned = line.trim().replace(/[\s\-\(\)]/g, '');
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    
    if (phoneRegex.test(cleaned)) {
      numbers.push(cleaned.startsWith('+') ? cleaned : '+' + cleaned);
    } else {
      const matches = line.match(/\+?[1-9]\d{9,14}/g);
      if (matches) {
        matches.forEach(num => {
          const cleanNum = num.replace(/[\s\-\(\)]/g, '');
          if (phoneRegex.test(cleanNum)) {
            numbers.push(cleanNum.startsWith('+') ? cleanNum : '+' + cleanNum);
          }
        });
      }
    }
  }
  
  return [...new Set(numbers)];
}

async function downloadFile(fileId) {
  const fileUrl = await bot.getFileLink(fileId);
  
  return new Promise((resolve, reject) => {
    const protocol = fileUrl.startsWith('https') ? https : http;
    
    protocol.get(fileUrl, (response) => {
      let data = '';
      response.setEncoding('utf8');
      
      response.on('data', (chunk) => {
        data += chunk;
      });
      
      response.on('end', () => {
        resolve(data);
      });
      
      response.on('error', (error) => {
        reject(error);
      });
    }).on('error', (error) => {
      reject(error);
    });
  });
}

bot.onText(/\/start/, handleStart);
bot.onText(/\/login/, handleLogin);
bot.onText(/\/status/, handleStatus);
bot.onText(/\/logout/, handleLogout);
bot.onText(/\/check/, handleCheck);

bot.on('document', async (msg) => {
  const chatId = msg.chat.id;
  const document = msg.document;
  
  if (!userSessions.has(chatId) || !userSessions.get(chatId).isReady) {
    bot.sendMessage(chatId, '❌ প্রথমে WhatsApp এ লগইন করুন।');
    return;
  }
  
  if (!document.file_name.endsWith('.txt') && document.mime_type !== 'text/plain') {
    bot.sendMessage(chatId, '❌ শুধুমাত্র .txt ফাইল সাপোর্ট করে। অনুগ্রহ করে একটি টেক্সট ফাইল পাঠান।');
    return;
  }
  
  try {
    const statusMsg = await bot.sendMessage(chatId, '📂 ফাইল প্রসেস করা হচ্ছে...');
    
    const fileContent = await downloadFile(document.file_id);
    const numbers = extractPhoneNumbers(fileContent);
    
    if (numbers.length === 0) {
      bot.editMessageText('❌ ফাইলে কোন বৈধ ফোন নম্বর পাওয়া যায়নি।', {
        chat_id: chatId,
        message_id: statusMsg.message_id
      });
      return;
    }
    
    await bot.editMessageText(
      `📊 <b>Loaded ${numbers.length} numbers</b>\n⏳ যাচাই শুরু হচ্ছে...`,
      {
        chat_id: chatId,
        message_id: statusMsg.message_id,
        parse_mode: 'HTML'
      }
    );
    
    await bulkCheckNumbers(chatId, numbers, statusMsg.message_id);
    
  } catch (error) {
    console.error('Error processing document:', error);
    bot.sendMessage(chatId, '❌ ফাইল প্রসেস করতে সমস্যা হয়েছে।');
  }
});

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith('/')) {
    return;
  }
  
  if (text === '🔐 WhatsApp লগইন') {
    await handleLogin(msg);
    return;
  }
  
  if (text === '📊 স্ট্যাটাস দেখুন') {
    await handleStatus(msg);
    return;
  }
  
  if (text === '🔍 নম্বর চেক করুন') {
    await handleCheck(msg);
    return;
  }
  
  if (text === '🚪 লগআউট') {
    await handleLogout(msg);
    return;
  }
  
  if (text === 'ℹ️ সাহায্য') {
    await handleStart(msg);
    return;
  }
  
  if (!userSessions.has(chatId) || !userSessions.get(chatId).isReady) {
    return;
  }
  
  const numbers = extractPhoneNumbers(text);
  
  if (numbers.length > 1) {
    const statusMsg = await bot.sendMessage(chatId, 
      `📊 <b>Starting bulk verification...</b>\n📊 <b>Loaded ${numbers.length} numbers</b>`,
      { parse_mode: 'HTML' }
    );
    await bulkCheckNumbers(chatId, numbers, statusMsg.message_id);
  } else if (numbers.length === 1) {
    await checkWhatsAppNumber(chatId, numbers[0]);
  }
});

async function checkWhatsAppNumber(chatId, phoneNumber) {
  const session = userSessions.get(chatId);
  
  if (!session || !session.client) {
    bot.sendMessage(chatId, 
      '❌ <b>Session Expired</b>\n\n' +
      '💡 "🔐 WhatsApp লগইন" বাটন চাপুন এবং আবার লগইন করুন',
      { parse_mode: 'HTML' }
    );
    return;
  }

  bot.sendMessage(chatId, 
    `🔍 <b>চেক করা হচ্ছে...</b>\n\n` +
    `📱 নম্বর: <code>${phoneNumber}</code>\n` +
    `⏳ অনুগ্রহ করে অপেক্ষা করুন...`,
    { parse_mode: 'HTML' }
  );

  try {
    const numberId = phoneNumber.replace(/\+/g, '') + '@c.us';
    
    const isRegistered = await session.client.isRegisteredUser(numberId);
    
    if (isRegistered) {
      const contact = await session.client.getContactById(numberId);
      const name = contact.pushname || contact.name || 'নাম পাওয়া যায়নি';
      
      bot.sendMessage(chatId, 
        `✅ <b>WhatsApp পাওয়া গেছে!</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📱 <b>নম্বর:</b> <code>${phoneNumber}</code>\n` +
        `👤 <b>নাম:</b> ${name}\n` +
        `🆔 <b>ID:</b> <code>${numberId}</code>\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `💡 আরো নম্বর চেক করতে সরাসরি পাঠান!`,
        { parse_mode: 'HTML' }
      );
    } else {
      bot.sendMessage(chatId, 
        `❌ <b>WhatsApp পাওয়া যায়নি</b>\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📱 <b>নম্বর:</b> <code>${phoneNumber}</code>\n` +
        `🔴 <b>স্ট্যাটাস:</b> WhatsApp নেই\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        `💡 নম্বরটি সঠিক কিনা নিশ্চিত করুন`,
        { parse_mode: 'HTML' }
      );
    }
  } catch (error) {
    console.error('Error checking WhatsApp number:', error);
    bot.sendMessage(chatId, 
      `⚠️ <b>চেক করতে সমস্যা হয়েছে</b>\n\n` +
      `সম্ভাব্য কারণ:\n` +
      `• নম্বরটি সঠিক ফরম্যাটে নেই\n` +
      `• WhatsApp সার্ভার সমস্যা\n` +
      `• Connection সমস্যা\n\n` +
      `💡 আবার চেষ্টা করুন`,
      { parse_mode: 'HTML' }
    );
  }
}

async function bulkCheckNumbers(chatId, numbers, messageId) {
  const session = userSessions.get(chatId);
  
  if (!session || !session.client) {
    bot.editMessageText('❌ Session expired', {
      chat_id: chatId,
      message_id: messageId
    });
    return;
  }
  
  const results = {
    total: numbers.length,
    whatsappUsers: [],
    nonWhatsapp: [],
    errors: []
  };
  
  for (let i = 0; i < numbers.length; i++) {
    const phoneNumber = numbers[i];
    
    if (i % 10 === 0 || i === numbers.length - 1) {
      await bot.editMessageText(
        `📊 <b>Verification Progress...</b>\n\n` +
        `✅ Processed: ${i}/${numbers.length}\n` +
        `⏳ Checking: ${phoneNumber}`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'HTML'
        }
      ).catch(() => {});
    }
    
    try {
      const numberId = phoneNumber.replace(/\+/g, '') + '@c.us';
      const isRegistered = await session.client.isRegisteredUser(numberId);
      
      if (isRegistered) {
        results.whatsappUsers.push(phoneNumber);
      } else {
        results.nonWhatsapp.push(phoneNumber);
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.error(`Error checking ${phoneNumber}:`, error);
      results.errors.push(phoneNumber);
    }
  }
  
  const successRate = ((results.whatsappUsers.length / results.total) * 100).toFixed(1);
  
  let summaryMessage = 
    `📊 <b>**Verification Complete**</b>\n\n` +
    `✅ <b>Total Processed:</b> ${results.total}\n` +
    `📱 <b>WhatsApp Users:</b> ${results.whatsappUsers.length}\n` +
    `❌ <b>Non-WhatsApp:</b> ${results.nonWhatsapp.length}\n` +
    `⚠️ <b>Errors:</b> ${results.errors.length}\n\n` +
    `🎯 <b>Success Rate:</b> ${successRate}%\n`;
  
  await bot.editMessageText(summaryMessage, {
    chat_id: chatId,
    message_id: messageId,
    parse_mode: 'HTML'
  });
  
  if (results.whatsappUsers.length > 0) {
    let whatsappMessage = '📱 <b>**WhatsApp Numbers:**</b>\n\n';
    results.whatsappUsers.forEach(num => {
      whatsappMessage += `✅ <code>${num}</code>\n`;
    });
    
    const chunks = splitMessage(whatsappMessage);
    for (const chunk of chunks) {
      await bot.sendMessage(chatId, chunk, { parse_mode: 'HTML' });
    }
  }
  
  if (results.nonWhatsapp.length > 0) {
    let nonWhatsappMessage = '❌ <b>**Non-WhatsApp Numbers:**</b>\n\n';
    results.nonWhatsapp.forEach(num => {
      nonWhatsappMessage += `❌ <code>${num}</code>\n`;
    });
    
    const chunks = splitMessage(nonWhatsappMessage);
    for (const chunk of chunks) {
      await bot.sendMessage(chatId, chunk, { parse_mode: 'HTML' });
    }
  }
  
  if (results.errors.length > 0) {
    let errorMessage = '⚠️ <b>**Error Numbers:**</b>\n\n';
    results.errors.forEach(num => {
      errorMessage += `⚠️ <code>${num}</code>\n`;
    });
    
    await bot.sendMessage(chatId, errorMessage, { parse_mode: 'HTML' });
  }
  
  let fullReport = '📊 সম্পূর্ণ রিপোর্ট:\n\n';
  fullReport += `Total Processed: ${results.total}\n`;
  fullReport += `WhatsApp Users: ${results.whatsappUsers.length}\n`;
  fullReport += `Non-WhatsApp: ${results.nonWhatsapp.length}\n`;
  fullReport += `Errors: ${results.errors.length}\n`;
  fullReport += `Success Rate: ${successRate}%\n\n`;
  
  if (results.whatsappUsers.length > 0) {
    fullReport += '✅ WhatsApp Users:\n';
    results.whatsappUsers.forEach(num => {
      fullReport += `${num}\n`;
    });
    fullReport += '\n';
  }
  
  if (results.nonWhatsapp.length > 0) {
    fullReport += '❌ Non-WhatsApp:\n';
    results.nonWhatsapp.forEach(num => {
      fullReport += `${num}\n`;
    });
    fullReport += '\n';
  }
  
  if (results.errors.length > 0) {
    fullReport += '⚠️ Errors:\n';
    results.errors.forEach(num => {
      fullReport += `${num}\n`;
    });
  }
  
  const reportFile = `report-${chatId}-${Date.now()}.txt`;
  fs.writeFileSync(reportFile, fullReport);
  
  await bot.sendDocument(chatId, reportFile, {
    caption: '📄 সম্পূর্ণ রিপোর্ট ফাইল'
  });
  
  if (fs.existsSync(reportFile)) {
    fs.unlinkSync(reportFile);
  }
}

function splitMessage(message, maxLength = 4096) {
  const chunks = [];
  const lines = message.split('\n');
  let currentChunk = '';
  
  for (const line of lines) {
    if ((currentChunk + line + '\n').length > maxLength) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
    }
    currentChunk += line + '\n';
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks.length > 0 ? chunks : [message];
}

console.log('🤖 Telegram বট চালু হয়েছে...');
console.log('✅ WhatsApp লগইন সিস্টেম সক্রিয়');
console.log('✅ Bulk verification সক্রিয়');

process.on('SIGINT', async () => {
  console.log('Shutting down...');
  for (const [chatId, session] of userSessions.entries()) {
    if (session.client) {
      try {
        await session.client.destroy();
      } catch (error) {
        console.error(`Error destroying client for chat ${chatId}:`, error);
      }
    }
  }
  userSessions.clear();
  loginInProgress.clear();
  process.exit(0);
});
