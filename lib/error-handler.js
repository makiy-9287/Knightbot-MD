const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

class ComprehensiveErrorHandler {
    constructor() {
        this.errorLogPath = './data/error-logs';
        this.ensureErrorDirectory();
        this.startupTime = new Date();
        console.log(chalk.blue('🛡️ Comprehensive Error Handler Activated'));
    }

    ensureErrorDirectory() {
        if (!fs.existsSync(this.errorLogPath)) {
            fs.mkdirSync(this.errorLogPath, { recursive: true });
        }
    }

    // Main error handling method
    handleError(error, context = {}) {
        const errorId = this.generateErrorId();
        const timestamp = new Date().toISOString();
        
        const errorInfo = {
            errorId,
            timestamp,
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack
            },
            context,
            system: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                platform: process.platform,
                nodeVersion: process.version
            }
        };

        // Log to console with colors
        this.consoleLogError(errorInfo);

        // Save to file
        this.saveErrorToFile(errorInfo);

        // Take appropriate action based on error type
        return this.determineAction(errorInfo);
    }

    generateErrorId() {
        return `ERR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    consoleLogError(errorInfo) {
        console.log(chalk.red('\n🚨 ========== ERROR DETECTED =========='));
        console.log(chalk.yellow(`🆔 Error ID: ${errorInfo.errorId}`));
        console.log(chalk.yellow(`⏰ Time: ${errorInfo.timestamp}`));
        console.log(chalk.red(`📛 Name: ${errorInfo.error.name}`));
        console.log(chalk.red(`📝 Message: ${errorInfo.error.message}`));
        
        if (errorInfo.context.userJid) {
            console.log(chalk.blue(`👤 User: ${errorInfo.context.userJid}`));
        }
        if (errorInfo.context.messageType) {
            console.log(chalk.blue(`💬 Type: ${errorInfo.context.messageType}`));
        }
        
        console.log(chalk.red('🔍 Stack Trace:'));
        console.log(chalk.gray(errorInfo.error.stack));
        console.log(chalk.red('========== END ERROR ==========\n'));
    }

    saveErrorToFile(errorInfo) {
        try {
            const date = new Date().toISOString().split('T')[0];
            const logFile = path.join(this.errorLogPath, `errors-${date}.json`);
            
            let existingLogs = [];
            if (fs.existsSync(logFile)) {
                const data = fs.readFileSync(logFile, 'utf8');
                existingLogs = JSON.parse(data);
            }

            existingLogs.push(errorInfo);
            
            // Keep only last 100 errors per file
            if (existingLogs.length > 100) {
                existingLogs = existingLogs.slice(-100);
            }

            fs.writeFileSync(logFile, JSON.stringify(existingLogs, null, 2));
        } catch (fileError) {
            console.error('Failed to save error log:', fileError);
        }
    }

    determineAction(errorInfo) {
        const error = errorInfo.error;
        const context = errorInfo.context;

        // Critical errors that require bot restart
        const criticalErrors = [
            'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 
            'UNAUTHORIZED', 'FORBIDDEN', 'CREDENTIALS'
        ];

        const errorMessage = error.message || '';
        
        if (criticalErrors.some(critical => errorMessage.includes(critical))) {
            return {
                action: 'restart',
                delay: 10000,
                message: 'Critical connection error. Restarting...',
                level: 'CRITICAL'
            };
        }

        // Authentication errors
        if (errorMessage.includes('authentication') || errorMessage.includes('credentials')) {
            return {
                action: 'reauthenticate',
                delay: 5000,
                message: 'Authentication error. Please re-scan QR code.',
                level: 'HIGH'
            };
        }

        // Rate limiting
        if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
            return {
                action: 'slowdown',
                delay: 30000,
                message: 'Rate limit exceeded. Slowing down requests.',
                level: 'MEDIUM'
            };
        }

        // Message sending errors
        if (errorMessage.includes('message') && errorMessage.includes('send')) {
            return {
                action: 'retry',
                delay: 2000,
                message: 'Message sending failed. Will retry.',
                level: 'LOW',
                maxRetries: 3
            };
        }

        // File system errors
        if (errorMessage.includes('ENOENT') || errorMessage.includes('file not found')) {
            return {
                action: 'recover',
                delay: 1000,
                message: 'File system error. Attempting recovery.',
                level: 'LOW'
            };
        }

        // Default action for unknown errors
        return {
            action: 'continue',
            delay: 0,
            message: 'Non-critical error. Continuing operation.',
            level: 'LOW'
        };
    }

    // Network error specific handler
    handleNetworkError(error, operation) {
        return this.handleError(error, {
            type: 'NETWORK',
            operation: operation,
            severity: 'HIGH'
        });
    }

    // Message processing error handler
    handleMessageError(error, messageContext) {
        return this.handleError(error, {
            type: 'MESSAGE_PROCESSING',
            userJid: messageContext.userJid,
            messageType: messageContext.messageType,
            messageText: messageContext.messageText?.substring(0, 100), // Limit length
            severity: 'MEDIUM'
        });
    }

    // AI API error handler
    handleAIError(error, promptContext) {
        return this.handleError(error, {
            type: 'AI_SERVICE',
            promptLength: promptContext.promptLength,
            model: promptContext.model,
            severity: 'HIGH'
        });
    }

    // File operation error handler
    handleFileError(error, fileContext) {
        return this.handleError(error, {
            type: 'FILE_OPERATION',
            filePath: fileContext.filePath,
            operation: fileContext.operation,
            severity: 'MEDIUM'
        });
    }

    // Security error handler
    handleSecurityError(error, securityContext) {
        return this.handleError(error, {
            type: 'SECURITY',
            userJid: securityContext.userJid,
            action: securityContext.action,
            severity: 'HIGH'
        });
    }

    // Get error statistics
    getErrorStats() {
        try {
            const date = new Date().toISOString().split('T')[0];
            const logFile = path.join(this.errorLogPath, `errors-${date}.json`);
            
            if (fs.existsSync(logFile)) {
                const data = fs.readFileSync(logFile, 'utf8');
                const errors = JSON.parse(data);
                
                const stats = {
                    totalErrors: errors.length,
                    errorsToday: errors.filter(e => e.timestamp.includes(date)).length,
                    errorLevels: {},
                    commonErrors: {}
                };

                errors.forEach(error => {
                    // Count by level
                    const level = error.context?.severity || 'UNKNOWN';
                    stats.errorLevels[level] = (stats.errorLevels[level] || 0) + 1;

                    // Count by error type
                    const errorType = error.context?.type || 'UNKNOWN';
                    stats.commonErrors[errorType] = (stats.commonErrors[errorType] || 0) + 1;
                });

                return stats;
            }
        } catch (error) {
            console.error('Error getting error stats:', error);
        }

        return { totalErrors: 0, errorsToday: 0, errorLevels: {}, commonErrors: {} };
    }

    // Clean up old error logs (keep only 7 days)
    cleanupOldLogs() {
        try {
            const files = fs.readdirSync(this.errorLogPath);
            const now = Date.now();
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

            files.forEach(file => {
                if (file.startsWith('errors-') && file.endsWith('.json')) {
                    const filePath = path.join(this.errorLogPath, file);
                    const stats = fs.statSync(filePath);
                    
                    if (now - stats.mtimeMs > sevenDaysMs) {
                        fs.unlinkSync(filePath);
                        console.log(chalk.yellow(`🗑️ Cleaned up old log: ${file}`));
                    }
                }
            });
        } catch (error) {
            console.error('Error cleaning up logs:', error);
        }
    }
}

module.exports = ComprehensiveErrorHandler;
