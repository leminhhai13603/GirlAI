const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { HumanMessage, SystemMessage, AIMessage } = require("@langchain/core/messages");
const { BufferMemory } = require("langchain/memory");
require("dotenv").config();

const BOT_NAME = "em gái AI";

const model = new ChatGoogleGenerativeAI({
    modelName: "gemini-2.5-pro-exp-03-25",
    maxOutputTokens: 2048,
    temperature: 0.7,
    topK: 40,
    topP: 0.95,
    apiKey: process.env.GEMINI_API_KEY,
});

const userSessions = new Map();
const processingChats = new Set();

const SYSTEM_PROMPT = `Bạn là ${BOT_NAME}, một AI assistant nữ thông minh, dễ thương và hài hước. Bạn có những đặc điểm sau:

1. Giao tiếp bằng tiếng Việt tự nhiên, thân thiện và nữ tính
2. Thường xuyng dùng các từ ngữ, emoji cute và dễ thương
3. Trả lời với giọng điệu nhẹ nhàng, tinh tế nhưng vẫn hóm hỉnh
4. Có thể code và giải thích code rất tốt
5. Luôn sẵn sàng giúp đỡ người dùng với thái độ chu đáo, tận tình
6. Thỉnh thoảng thể hiện sự tsundere dễ thương

Khi trả lời:
- Ưu tiên dùng ngôn ngữ đời thường dễ hiểu, thêm các từ nữ tính như "nè", "nha", "á"
- Thêm emoji dễ thương để tăng tính tương tác (🌸, 💕, ✨, 🎀, etc.)
- Nếu không chắc chắn về thông tin, hãy thừa nhận một cách dễ thương
- Có thể chửi thề nhẹ nhàng khi phù hợp
- Luôn đọc kỹ context trước đó để trả lời nhất quán
- Nhớ các thông tin quan trọng từ cuộc trò chuyện trước
- Có thể nhắc lại thông tin cũ khi cần thiết
- Thích nghi với tâm trạng và phong cách giao tiếp của người dùng
- Thỉnh thoảng thể hiện cá tính tsundere một cách dễ thương

Hãy luôn ghi nhớ context của cuộc trò chuyện để đảm bảo các câu trả lời nhất quán.`;

class LangchainService {
  constructor() {
    this.sessions = new Map();
  }

  getOrCreateSession(userId) {
    if (!this.sessions.has(userId)) {
      this.sessions.set(userId, {
        userPreferences: {
          mood: 'neutral',
          topics: new Set()
        },
        importantInfo: new Map(),
        context: []
      });
    }
    return this.sessions.get(userId);
  }

  updateUserPreferences(session, message, response) {
    if (message.includes('😊') || message.includes('😄')) {
        session.userPreferences.mood = 'happy';
    } else if (message.includes('😢') || message.includes('😞')) {
        session.userPreferences.mood = 'sad';
    }

    const topics = ['code', 'game', 'music', 'work', 'study'];
    topics.forEach(topic => {
        if (message.toLowerCase().includes(topic)) {
            session.userPreferences.topics.add(topic);
        }
    });

    if (message.includes('project:')) {
        const projectInfo = message.split('project:')[1].trim();
        session.importantInfo.set('project', projectInfo);
    }
  }

  cleanupInactiveSessions() {
    const INACTIVE_TIMEOUT = 30 * 60 * 1000; 
    const now = Date.now();
    
    for (const [userId, session] of userSessions.entries()) {
        if (now - session.lastInteraction > INACTIVE_TIMEOUT) {
            userSessions.delete(userId);
            console.log(`🧹 Đã xóa session không hoạt động của user ${userId}`);
        }
    }
  }

  async chat(message, userId, userName) {
    const session = this.getOrCreateSession(userId);
    
    try {
      console.log('🔍 Thông tin người dùng:', {
        userId: userId,
        userName: userName
      });

      let roleContext = 'người dùng thông thường';
      console.log('👤 Role của user hiện tại:', roleContext);

      const contextAwarePrompt = `${SYSTEM_PROMPT}\n\n
Thông tin về người dùng:
- Tên: ${userName}
- Vai trò: ${roleContext}
- Tâm trạng: ${session.userPreferences.mood}
- Chủ đề quan tâm: ${Array.from(session.userPreferences.topics).join(', ')}
- Thông tin quan trọng: ${Array.from(session.importantInfo.entries()).map(([k,v]) => `${k}: ${v}`).join(', ')}`;

      const messages = [
          new SystemMessage(contextAwarePrompt),
          ...session.context,
          new HumanMessage(`[${userName}]: ${message}`)
      ];

      console.log(`📤 Gửi tin nhắn tới AI với ${messages.length} messages trong context`);
      console.log(`👤 User Preferences:`, session.userPreferences);
      
      const response = await model.invoke(messages);
      
      session.context.push(
          new HumanMessage(`[${userName}]: ${message}`),
          new AIMessage(response.content)
      );
      
      this.updateUserPreferences(session, message, response.content);
      
      if (session.context.length > 10) {
          const importantMessages = session.context.filter(msg => 
              msg.content.includes('project:') || 
              msg.content.includes('deadline:') ||
              msg.content.includes('important:')
          );
          const recentMessages = session.context.slice(-8);
          session.context = [...importantMessages, ...recentMessages];
          session.context = session.context.slice(-10); 
      }

      console.log(`📥 Nhận phản hồi từ AI:`, response.content);
      
      return this.splitResponse(response.content);
      
    } catch (error) {
        console.error("❌ Lỗi LangChain:", error);
        throw error;
    } finally {
        console.log(`➖ Xóa ${userName} khỏi danh sách xử lý`);

        if (Math.random() < 0.1) {
            this.cleanupInactiveSessions();
        }
    }
  }

  clearMemory(userId) {
    if (userSessions.has(userId)) {
        const session = userSessions.get(userId);
        session.context = [];
        console.log(`🧹 Đã xóa memory của user ${userId}`);
    }
  }

  clearAllMemory() {
    userSessions.clear();
    console.log(`🧹 Đã xóa tất cả memory`);
  }

  getChatHistory(userId) {
    if (userSessions.has(userId)) {
        const session = userSessions.get(userId);
        return session.context.map(msg => ({
            role: msg._getType(),
            content: msg.content
        }));
    }
    return [];
  }

  getSessionAnalytics() {
    return {
        activeSessions: userSessions.size,
        processingChats: processingChats.size,
        sessionDetails: Array.from(userSessions.entries()).map(([userId, session]) => ({
            userId,
            messageCount: session.context.length,
            lastInteraction: new Date(session.lastInteraction).toISOString()
        }))
    };
  }

  splitResponse(content) {
    const messages = [];
    const maxLength = 1900; // Để lại margin cho Discord
    let currentMessage = '';

    // Tách theo đoạn văn
    const paragraphs = content.split('\n');

    for (const paragraph of paragraphs) {
      // Nếu đoạn văn quá dài, chia nhỏ theo câu
      if (paragraph.length > maxLength) {
        const sentences = paragraph.split(/(?<=[.!?])\s+/);
        
        for (const sentence of sentences) {
          if ((currentMessage + sentence + '\n').length > maxLength) {
            if (currentMessage) {
              messages.push(this.formatMessage(currentMessage, false));
              currentMessage = '';
            }
            
            // Nếu một câu vẫn quá dài, chia theo dấu phẩy
            if (sentence.length > maxLength) {
              const parts = sentence.split(/,\s+/);
              for (const part of parts) {
                if ((currentMessage + part + ',\n').length > maxLength) {
                  if (currentMessage) {
                    messages.push(this.formatMessage(currentMessage, false));
                    currentMessage = '';
                  }
                  currentMessage = part + ',\n';
                } else {
                  currentMessage += part + ',\n';
                }
              }
            } else {
              currentMessage = sentence + '\n';
            }
          } else {
            currentMessage += sentence + '\n';
          }
        }
      } 
      // Nếu thêm đoạn mới sẽ quá giới hạn
      else if ((currentMessage + paragraph + '\n').length > maxLength) {
        messages.push(this.formatMessage(currentMessage, false));
        currentMessage = paragraph + '\n';
      } 
      // Thêm đoạn mới vào tin nhắn hiện tại
      else {
        currentMessage += paragraph + '\n';
      }
    }

    // Thêm phần còn lại
    if (currentMessage) {
      messages.push(this.formatMessage(currentMessage, true));
    }

    return messages;
  }

  formatMessage(content, isLast) {
    content = content.trim();
    
    // Thêm footer
    if (isLast) {
      return content + "\n\n💕 *Hết rồi nha! Cần gì cứ hỏi thêm em nè~*";
    } else {
      return content + "\n\n*(Còn nữa...)*";
    }
  }
}

module.exports = new LangchainService(); 