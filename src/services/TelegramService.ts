import axios from 'axios';

const STRIP_TAGS = /<[^>]*>/g;

export async function sendTelegramMessage(
  text: string, 
  reply_markup?: any, 
  botToken?: string, 
  chatId?: string
) {
  const token = botToken || process.env.TELEGRAM_BOT_TOKEN?.trim();
  const id = chatId || process.env.TELEGRAM_CHAT_ID?.trim();
  
  if (!token || !id) return;
  
  // Telegram limits messages to 4096 characters. We split at 4000 to be safe.
  const MAX_LENGTH = 4000;
  const messages = [];
  
  if (text.length <= MAX_LENGTH) {
    messages.push(text);
  } else {
    // Split by double newline to keep paragraphs intact if possible
    const paragraphs = text.split('\n\n');
    let currentMessage = '';
    
    for (const paragraph of paragraphs) {
      if ((currentMessage + paragraph + '\n\n').length <= MAX_LENGTH) {
        currentMessage += paragraph + '\n\n';
      } else {
        if (currentMessage) messages.push(currentMessage.trim());
        // If a single paragraph is still too long, split it by chunks
        if (paragraph.length > MAX_LENGTH) {
          let remaining = paragraph;
          while (remaining.length > 0) {
            messages.push(remaining.substring(0, MAX_LENGTH));
            remaining = remaining.substring(MAX_LENGTH);
          }
          currentMessage = '';
        } else {
          currentMessage = paragraph + '\n\n';
        }
      }
    }
    if (currentMessage) messages.push(currentMessage.trim());
  }

  try {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      // Only attach reply_markup to the last message part
      const options: any = {
        chat_id: id,
        text: msg,
        parse_mode: 'HTML' // Enable HTML parsing for better formatting
      };
      
      if (i === messages.length - 1 && reply_markup) {
        options.reply_markup = reply_markup;
      }

      try {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, options);
      } catch (htmlError: any) {
        console.warn('Failed to send HTML message, retrying as plain text:', htmlError.response?.data || htmlError.message);
        // Fallback to plain text
        delete options.parse_mode;
        // Strip HTML tags for plain text readability (basic strip)
        options.text = msg.replace(STRIP_TAGS, ''); 
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, options);
      }
      
      // Add a small delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    console.log(`Successfully sent ${messages.length} Telegram message(s).`);
  } catch (error: any) {
    console.error('Failed to send Telegram message (Final):', error.response?.data || error.message);
  }
}

export async function sendInteractiveMenu(botToken?: string, chatId?: string) {
    const menu = {
        inline_keyboard: [
            [
                { text: "📊 Status", callback_data: "menu_status" },
                { text: "🛡️ Mode", callback_data: "menu_mode" }
            ],
            [
                { text: "🎮 Demo", callback_data: "menu_demo" },
                { text: "📈 Trading", callback_data: "menu_trading" }
            ],
            [
                { text: "🔒 Hedge/Lock", callback_data: "menu_hedge" },
                { text: "❓ Help", callback_data: "menu_help" }
            ]
        ]
    };
    await sendTelegramMessage("🤖 <b>Main Menu</b>\n\nWhat would you like to do?", menu, botToken, chatId);
}

export async function sendTradingMenu(botToken?: string, chatId?: string) {
    const menu = {
        inline_keyboard: [
            [
                { text: "💰 Take Profit", callback_data: "menu_tp" },
                { text: "📉 Reduce Long", callback_data: "menu_rl" }
            ],
            [
                { text: "📈 Reduce Short", callback_data: "menu_rs" },
                { text: "➕ Add Long", callback_data: "menu_al" }
            ],
            [
                { text: "➖ Add Short", callback_data: "menu_as" },
                { text: "« Back", callback_data: "menu_main" }
            ]
        ]
    };
    await sendTelegramMessage("📈 <b>Trading Actions</b>\n\nSelect an action. Note: These buttons will guide you to provide a symbol.", menu, botToken, chatId);
}

export async function sendHedgeMenu(botToken?: string, chatId?: string) {
    const menu = {
        inline_keyboard: [
            [
                { text: "🔒 Hedge On", callback_data: "menu_ho" },
                { text: "⚖️ Lock Neutral", callback_data: "menu_ln" }
            ],
            [
                { text: "🔓 Unlock", callback_data: "menu_ul" },
                { text: "🔄 Role", callback_data: "menu_rr" }
            ],
            [
                { text: "« Back", callback_data: "menu_main" }
            ]
        ]
    };
    await sendTelegramMessage("🔒 <b>Hedge & Lock Actions</b>\n\nSelect an action.", menu, botToken, chatId);
}
