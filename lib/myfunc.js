const axios = require('axios');
const fs = require('fs');
const path = require('path');

module.exports = {
    // Check if string is URL
    isUrl: (string) => {
        try {
            new URL(string);
            return true;
        } catch (_) {
            return false;
        }
    },

    // Get buffer from URL
    getBuffer: async (url, options) => {
        try {
            const response = await axios({
                url,
                method: 'GET',
                responseType: 'arraybuffer',
                ...options
            });
            return response.data;
        } catch (error) {
            throw new Error(`Failed to get buffer: ${error.message}`);
        }
    },

    // Delay function
    delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

    // Generate random ID
    generateMessageID: () => {
        return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    },

    // Format bytes to human readable
    formatBytes: (bytes, decimals = 2) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    },

    // Check if file exists
    fileExists: (path) => {
        return fs.existsSync(path);
    },

    // Create directory if not exists
    ensureDir: (dir) => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }
};
