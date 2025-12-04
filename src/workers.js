const queueManager = require('./queues/queueManager');
const publishPostJob = require('./jobs/publishPostJob');
const scheduleChecker = require('./jobs/checkDueSchedules'); 
const logger = require('./utils/logger'); 

class WorkerManager {
  start() {
    // Register publish queue processor
    queueManager.publishQueue.process(async (job) => {
      return await publishPostJob.process(job);
    });

    // Start schedule checker cron
    scheduleChecker.start();

    // Clean old jobs daily
    setInterval(() => {
      queueManager.cleanJobs();
    }, 24 * 60 * 60 * 1000);

    logger.info('🔧 Workers started');
  }

  async stop() {
    scheduleChecker.stop();
    await queueManager.publishQueue.close();
    await queueManager.retryQueue.close();
    logger.info('🛑 Workers stopped');
  }
}

module.exports = new WorkerManager();