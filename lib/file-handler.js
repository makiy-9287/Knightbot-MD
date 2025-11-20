const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { writeFile } = require('fs/promises');
const chalk = require('chalk');

class FileHandler {
    constructor() {
        this.tempDir = './assets/temp';
        this.ensureTempDirectory();
        console.log(chalk.blue('📁 File Handler Activated'));
    }

    ensureTempDirectory() {
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    // Generate unique filename
    generateFilename(extension = '') {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 15);
        return `file_${timestamp}_${random}${extension}`;
    }

    // Download media from URL
    async downloadMedia(url, filename = '') {
        try {
            const response = await axios({
                method: 'GET',
                url: url,
                responseType: 'arraybuffer',
                timeout: 30000
            });

            const extension = path.extname(url) || '.bin';
            const finalFilename = filename || this.generateFilename(extension);
            const filePath = path.join(this.tempDir, finalFilename);

            await writeFile(filePath, response.data);
            
            return {
                success: true,
                filePath: filePath,
                filename: finalFilename,
                size: response.data.length,
                mimeType: response.headers['content-type']
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Save buffer to file
    async saveBufferToFile(buffer, extension = '.bin', filename = '') {
        try {
            const finalFilename = filename || this.generateFilename(extension);
            const filePath = path.join(this.tempDir, finalFilename);

            await writeFile(filePath, buffer);
            
            return {
                success: true,
                filePath: filePath,
                filename: finalFilename,
                size: buffer.length
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Process image message
    async processImageMessage(message, bot) {
        try {
            const imageMessage = message.message.imageMessage;
            if (!imageMessage) {
                return { success: false, error: 'No image data found' };
            }

            // Download the image
            const stream = await bot.downloadAndSaveMediaMessage(message, this.tempDir);
            const buffer = fs.readFileSync(stream.filename);

            return {
                success: true,
                buffer: buffer,
                filePath: stream.filename,
                mimeType: imageMessage.mimetype || 'image/jpeg',
                caption: imageMessage.caption || ''
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Process sticker message
    async processStickerMessage(message, bot) {
        try {
            const stickerMessage = message.message.stickerMessage;
            if (!stickerMessage) {
                return { success: false, error: 'No sticker data found' };
            }

            // Download the sticker
            const stream = await bot.downloadAndSaveMediaMessage(message, this.tempDir);
            const buffer = fs.readFileSync(stream.filename);

            return {
                success: true,
                buffer: buffer,
                filePath: stream.filename,
                mimeType: stickerMessage.mimetype || 'image/webp',
                isAnimated: stickerMessage.isAnimated || false
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Process document message
    async processDocumentMessage(message, bot) {
        try {
            const documentMessage = message.message.documentMessage;
            if (!documentMessage) {
                return { success: false, error: 'No document data found' };
            }

            const stream = await bot.downloadAndSaveMediaMessage(message, this.tempDir);
            const buffer = fs.readFileSync(stream.filename);

            return {
                success: true,
                buffer: buffer,
                filePath: stream.filename,
                mimeType: documentMessage.mimetype || 'application/octet-stream',
                fileName: documentMessage.fileName || 'document',
                fileSize: documentMessage.fileLength || 0
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    // Clean up temporary files
    async cleanupTempFiles(maxAgeMinutes = 60) {
        try {
            const files = fs.readdirSync(this.tempDir);
            const now = Date.now();
            const maxAgeMs = maxAgeMinutes * 60 * 1000;

            let cleanedCount = 0;

            for (const file of files) {
                const filePath = path.join(this.tempDir, file);
                const stats = fs.statSync(filePath);
                
                if (now - stats.mtimeMs > maxAgeMs) {
                    fs.unlinkSync(filePath);
                    cleanedCount++;
                }
            }

            if (cleanedCount > 0) {
                console.log(chalk.yellow(`🧹 Cleaned up ${cleanedCount} temporary files`));
            }

            return { cleanedCount };
        } catch (error) {
            console.error('Temp file cleanup error:', error);
            return { cleanedCount: 0, error: error.message };
        }
    }

    // Get file info
    getFileInfo(filePath) {
        try {
            const stats = fs.statSync(filePath);
            return {
                exists: true,
                size: stats.size,
                created: stats.birthtime,
                modified: stats.mtime,
                extension: path.extname(filePath).toLowerCase()
            };
        } catch (error) {
            return {
                exists: false,
                error: error.message
            };
        }
    }

    // Supported file types
    getSupportedImageTypes() {
        return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    }

    getSupportedDocumentTypes() {
        return ['.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx'];
    }

    // Check if file type is supported
    isSupportedImage(filename) {
        const ext = path.extname(filename).toLowerCase();
        return this.getSupportedImageTypes().includes(ext);
    }

    isSupportedDocument(filename) {
        const ext = path.extname(filename).toLowerCase();
        return this.getSupportedDocumentTypes().includes(ext);
    }

    // Get readable file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = FileHandler;
