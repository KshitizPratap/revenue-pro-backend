import fs from 'fs';
import path from 'path';
export class ExecutionLogger {
    constructor() {
        // Create logs directory in project root
        this.logsDir = path.join(process.cwd(), 'execution-logs');
        this.ensureLogsDirectory();
    }
    /**
     * Ensure logs directory exists
     */
    ensureLogsDirectory() {
        if (!fs.existsSync(this.logsDir)) {
            fs.mkdirSync(this.logsDir, { recursive: true });
            console.log(`📁 Created execution logs directory: ${this.logsDir}`);
        }
    }
    /**
     * Log weekly cron execution result
     */
    logWeeklyCronExecution(result) {
        try {
            // Generate filename with timestamp
            const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
            const filename = `weekly-cron-${timestamp}.json`;
            const filepath = path.join(this.logsDir, filename);
            // Write result to file
            fs.writeFileSync(filepath, JSON.stringify(result, null, 2), 'utf-8');
            console.log(`📊 Weekly cron execution result logged to: ${filename}`);
            // Also create/update latest.json for easy access
            const latestPath = path.join(this.logsDir, 'latest.json');
            fs.writeFileSync(latestPath, JSON.stringify(result, null, 2), 'utf-8');
            // Clean up old logs (keep only last 30 executions)
            this.cleanupOldLogs();
        }
        catch (error) {
            console.error('❌ Failed to log weekly cron execution result:', error.message);
        }
    }
    /**
     * Clean up old log files (keep only last 30)
     */
    cleanupOldLogs() {
        try {
            const files = fs.readdirSync(this.logsDir)
                .filter(file => file.startsWith('weekly-cron-') && file.endsWith('.json'))
                .sort()
                .reverse(); // Most recent first
            if (files.length > 30) {
                const filesToDelete = files.slice(30); // Keep first 30, delete rest
                filesToDelete.forEach(file => {
                    const filepath = path.join(this.logsDir, file);
                    fs.unlinkSync(filepath);
                });
                console.log(`🧹 Cleaned up ${filesToDelete.length} old log files`);
            }
        }
        catch (error) {
            console.error('⚠️  Failed to cleanup old logs:', error.message);
        }
    }
    /**
     * Get latest execution result
     */
    getLatestResult() {
        try {
            const latestPath = path.join(this.logsDir, 'latest.json');
            if (fs.existsSync(latestPath)) {
                const content = fs.readFileSync(latestPath, 'utf-8');
                return JSON.parse(content);
            }
            return null;
        }
        catch (error) {
            console.error('❌ Failed to read latest execution result:', error.message);
            return null;
        }
    }
    /**
     * Get all execution results (last 30)
     */
    getAllResults() {
        try {
            const files = fs.readdirSync(this.logsDir)
                .filter(file => file.startsWith('weekly-cron-') && file.endsWith('.json'))
                .sort()
                .reverse(); // Most recent first
            const results = [];
            files.forEach(file => {
                try {
                    const filepath = path.join(this.logsDir, file);
                    const content = fs.readFileSync(filepath, 'utf-8');
                    results.push(JSON.parse(content));
                }
                catch (error) {
                    // Skip corrupted files
                }
            });
            return results;
        }
        catch (error) {
            console.error('❌ Failed to read execution results:', error.message);
            return [];
        }
    }
    /**
     * Generate execution summary for console
     */
    static generateSummary(result) {
        const status = result.status === 'SUCCESS' ? '✅' : result.status === 'PARTIAL_SUCCESS' ? '⚠️' : '❌';
        return `
${status} Weekly Cron Execution Summary (${result.executionDate})
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Processing Results:
   • Processed Clients: ${result.processedClients}
   • Success Rate: ${result.successRate}
   • Successful: ${result.successfulClients} | Failed: ${result.failedClients}

📈 Data Updates:
   • Conversion Rates Processed: ${result.totalUpdatedConversionRates.toLocaleString()}
   • Leads Updated: ${result.totalUpdatedLeads.toLocaleString()}
   • Duration: ${Math.round(result.duration / 1000)}s

🔄 Conversion Rate Database Insights:
   • Total CR Records: ${result.conversionRateInsights.totalProcessed.toLocaleString()}
   • New Insertions: ${result.conversionRateInsights.newInserts.toLocaleString()} (${result.conversionRateInsights.insertRate})
   • Updated Records: ${result.conversionRateInsights.updated.toLocaleString()}

${result.errors.length > 0 ? `❌ Errors (${result.errors.length}):
   ${result.errors.slice(0, 3).map(err => `• ${err}`).join('\n   ')}
   ${result.errors.length > 3 ? `   • ... and ${result.errors.length - 3} more errors` : ''}` : '✅ No errors encountered'}

📁 Result saved to: execution-logs/weekly-cron-${result.executionId}.json
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `.trim();
    }
}
// Singleton instance
export default new ExecutionLogger();
