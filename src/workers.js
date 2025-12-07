const queueManager = require('./queues/queueManager');
const publishPostJob = require('./jobs/publishPostJob');
const scheduleChecker = require('./jobs/checkDueSchedules'); 
const logger = require('./utils/logger'); 

class WorkerManager {
  constructor() {
    this.isRunning = false;
    this.processors = [];
  }

  start() {
    if (this.isRunning) {
      logger.warn('Workers already running');
      return;
    }

    logger.info('🔧 Starting workers...');

    // ✅ CRITICAL FIX: Register processor with concurrency
    const processor = queueManager.publishQueue.process(5, async (job) => {
      logger.info('🔄 Worker picked up job', {
        jobId: job.id,
        postId: job.data.postId,
        scheduleId: job.data.scheduleId
      });

      try {
        const result = await publishPostJob.process(job);
        logger.info('✅ Worker completed job', {
          jobId: job.id,
          result
        });
        return result;
      } catch (error) {
        logger.error('❌ Worker job failed', {
          jobId: job.id,
          error: error.message,
          stack: error.stack
        });
        throw error;
      }
    });

    this.processors.push(processor);

    // Start schedule checker cron
    scheduleChecker.start();

    // Clean old jobs daily
    this.cleanupInterval = setInterval(() => {
      queueManager.cleanJobs();
    }, 24 * 60 * 60 * 1000);

    // ✅ ADD: Log queue stats every minute
    this.statsInterval = setInterval(async () => {
      try {
        const stats = await queueManager.getStats();
        if (stats.active > 0 || stats.waiting > 0 || stats.failed > 0) {
          logger.info('📊 Queue stats', stats);
        }

        // Log failed jobs if any
        if (stats.failed > 0) {
          const failedJobs = await queueManager.getFailedJobs(5);
          logger.error('❌ Failed jobs in queue', {
            count: stats.failed,
            recentFailures: failedJobs
          });
        }
      } catch (error) {
        logger.error('Failed to get queue stats', { error: error.message });
      }
    }, 60000); // Every minute

    this.isRunning = true;
    logger.info('🔧 Workers started successfully');
    logger.info('   ✓ Publish queue processor (concurrency: 5)');
    logger.info('   ✓ Schedule checker (every 1 minute)');
    logger.info('   ✓ Queue cleanup (every 24 hours)');
  }

  async stop() {
    if (!this.isRunning) {
      return;
    }

    logger.info('🛑 Stopping workers...');

    // Stop intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }

    // Stop schedule checker
    scheduleChecker.stop();

    // Wait for active jobs to complete (with timeout)
    try {
      const stats = await queueManager.getStats();
      if (stats.active > 0) {
        logger.info(`⏳ Waiting for ${stats.active} active jobs to complete...`);
        await queueManager.publishQueue.whenCurrentJobsFinished();
      }
    } catch (error) {
      logger.warn('Error waiting for jobs to finish', { error: error.message });
    }

    // Close queues
    await queueManager.publishQueue.close();
    await queueManager.retryQueue.close();

    this.isRunning = false;
    logger.info('🛑 Workers stopped');
  }

  /**
   * ✅ ADD: Check if workers are healthy
   */
  async healthCheck() {
    try {
      const stats = await queueManager.getStats();
      const isPaused = await queueManager.publishQueue.isPaused();
      
      return {
        isRunning: this.isRunning,
        isPaused,
        stats,
        healthy: this.isRunning && !isPaused
      };
    } catch (error) {
      return {
        isRunning: this.isRunning,
        error: error.message,
        healthy: false
      };
    }
  }
}

module.exports = new WorkerManager();