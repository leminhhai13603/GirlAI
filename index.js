const { Client, GatewayIntentBits } = require('discord.js');
const langchainService = require('./services/ai/langchainService');
require('dotenv').config();

class ChatBot {
    constructor() {
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildPresences,
                GatewayIntentBits.DirectMessages,
                GatewayIntentBits.GuildMessageReactions
            ]
        });
        
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Cache để theo dõi tin nhắn đã xử lý
        const processedMessages = new Set();

        this.client.once('ready', () => {
            console.log('🤖 Chat Bot is ready!');
        });

        this.client.on('messageCreate', async (message) => {
            try {
                // Bỏ qua tin nhắn từ bot
                if (message.author.bot) return;
                
                // Chỉ xử lý khi bot được mention
                if (!message.mentions.has(this.client.user.id)) return;
                
                // Kiểm tra xem tin nhắn đã được xử lý chưa
                if (processedMessages.has(message.id)) return;
                processedMessages.add(message.id);

                const userId = message.author.id;
                const userName = message.author.username;
                
                // Loại bỏ mention khỏi nội dung tin nhắn
                const content = message.content.replace(/<@!?[0-9]+>/g, '').trim();
                
                console.log(`\n📝 Nhận tin nhắn mới từ Discord`);
                console.log(`👤 User: ${userName} (${userId})`);
                console.log(`💬 Nội dung đã xử lý: ${content}`);

                await message.channel.sendTyping();
                console.log(`⌨️ Hiển thị typing indicator`);
                
                // Gọi AI để xử lý
                const responses = await langchainService.chat(
                    content,
                    userId,
                    userName
                );

                // Check responses hợp lệ
                if (!responses || !Array.isArray(responses) || responses.length === 0) {
                    await message.channel.send({
                        content: "Em xin lỗi, em không thể xử lý yêu cầu này. Bạn có thể thử lại được không? 🥺",
                        reply: { messageReference: message.id }
                    });
                    return;
                }

                for (const response of responses) {
                    if (!response || typeof response !== 'string' || !response.trim()) {
                        continue;
                    }

                    try {
                        await message.channel.send({
                            content: response.trim(),
                            reply: { messageReference: message.id }
                        });
                    } catch (sendError) {
                        console.error('❌ Lỗi khi gửi tin nhắn:', sendError);
                        
                        // Thử gửi thông báo lỗi
                        try {
                            await message.channel.send({
                                content: "Em xin lỗi, có lỗi khi gửi tin nhắn. Bạn có thể thử lại được không? 🙏",
                                reply: { messageReference: message.id }
                            });
                        } catch (notifyError) {
                            console.error('❌ Không thể gửi thông báo lỗi:', notifyError);
                        }
                    }
                }

            } catch (error) {
                console.error('❌ Lỗi chính:', error);
                
                try {
                    await message.channel.send({
                        content: "Xảy ra lỗi rồi... Em xin lỗi nha! 😢 Bạn có thể thử lại sau được không?",
                        reply: { messageReference: message.id }
                    });
                } catch (notifyError) {
                    console.error('❌ Không thể gửi thông báo lỗi:', notifyError);
                }
            } finally {
                // Xóa tin nhắn khỏi cache sau 1 phút
                setTimeout(() => {
                    processedMessages.delete(message.id);
                }, 60000);
            }
        });

        // Xử lý lỗi để bot không bị crash
        this.client.on('error', error => {
            console.error('❌ Lỗi Discord client:', error);
        });

        process.on('unhandledRejection', error => {
            console.error('❌ Unhandled promise rejection:', error);
        });
    }

    async start() {
        try {
            await this.client.login(process.env.CHAT_BOT_TOKEN);
            console.log('🔑 Chat Bot đã đăng nhập thành công');
        } catch (error) {
            console.error('❌ Chat Bot lỗi đăng nhập:', error);
            throw error;
        }
    }
}

// Tạo một instance của ChatBot
const chatBot = new ChatBot();

// Khởi động bot khi file được chạy trực tiếp
if (require.main === module) {
    console.log('🚀 Đang khởi động ChatBot...');
    
    // Kiểm tra token
    if (!process.env.CHAT_BOT_TOKEN) {
        console.error('❌ Thiếu CHAT_BOT_TOKEN trong file .env');
        process.exit(1);
    }
    
    if (!process.env.GEMINI_API_KEY) {
        console.error('❌ Thiếu GEMINI_API_KEY trong file .env');
        process.exit(1);
    }
    
    // Khởi động bot
    chatBot.start()
        .then(() => console.log('✅ ChatBot đã khởi động thành công'))
        .catch(error => {
            console.error('❌ ChatBot khởi động thất bại:', error);
            process.exit(1);
        });
        
    // Xử lý tín hiệu thoát
    process.on('SIGINT', () => {
        console.log('👋 Nhận tín hiệu thoát, đang tắt ChatBot...');
        process.exit(0);
    });
}

// Xuất instance để có thể import từ các file khác
module.exports = chatBot;``