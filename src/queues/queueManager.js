const Bull = require('bull');
const logger = require('../utils/logger');

class QueueManager {
  constructor() {
    // ✅ CORRECT: Bull-compatible Redis configuration
    const redisConfig = {
      redis: {
        host: process.env.REDIS_HOST || '127.0.0.1',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        db: parseInt(process.env.REDIS_DB_QUEUE) || 2,
        password: process.env.REDIS_PASSWORD || undefined,
        // ✅ TLS for Azure Redis (port 6380)
        tls: parseInt(process.env.REDIS_PORT) === 6380 ? {
          rejectUnauthorized: false
        } : undefined,
        // ✅ Keep-alive settings (Bull-compatible)
        keepAlive: 10000,
        connectTimeout: 20000,
        // ✅ Retry strategy
        retryStrategy: (times) => {
          if (times > 10) {
            logger.error('Bull Redis max retries reached');
            return null;
          }
          const delay = Math.min(times * 100, 3000);
          logger.warn(`Bull Redis reconnecting... attempt ${times}, delay: ${delay}ms`);
          return delay;
        },
        // ❌ REMOVE these - Bull doesn't allow them for bclient/subscriber
        // enableReadyCheck: true,
        // maxRetriesPerRequest: 3,
      },
    };

    // Create queues
    this.publishQueue = new Bull('post-publishing', redisConfig);
    this.retryQueue = new Bull('post-retry', redisConfig);
    this.analyticsQueue = new Bull('analytics-sync', redisConfig);

    this.setupEventListeners();
  }

  setupEventListeners() {
    // ✅ ADD MORE DETAILED LOGGING
    this.publishQueue.on('ready', () => {
      logger.info('✅ Publish queue ready');
    });

    this.publishQueue.on('error', (error) => {
      logger.error('❌ Publish queue error:', {
        message: error.message,
        code: error.code,
        stack: error.stack
      });
    });

    this.publishQueue.on('waiting', (jobId) => {
      logger.info('⏳ Job waiting in queue', { jobId });
    });

    this.publishQueue.on('active', (job) => {
      logger.info('🔄 Job started processing', {
        jobId: job.id,
        postId: job.data.postId,
        scheduleId: job.data.scheduleId
      });
    });

    this.publishQueue.on('completed', (job, result) => {
      logger.info('✅ Publish job completed', {
        jobId: job.id,
        postId: job.data.postId,
        scheduleId: job.data.scheduleId,
        result,
      });
    });

    this.publishQueue.on('failed', (job, err) => {
      logger.error('❌ Publish job failed', {
        jobId: job.id,
        postId: job.data.postId,
        error: err.message,
        stack: err.stack
      });
    });

    this.publishQueue.on('stalled', (job) => {
      logger.warn('⚠️ Job stalled (taking too long)', {
        jobId: job.id,
        postId: job.data.postId
      });
    });
  }

  /**
   * Add publish job to queue
   */
  async addPublishJob(postId, scheduleId, scheduledFor, priority = 'normal') {
    try {
      const scheduledDate = new Date(scheduledFor);
      const now = new Date();
      let delay = scheduledDate.getTime() - now.getTime();

      // FIX: If delay is negative or very small, publish immediately
      if (delay < 5000) {
        delay = 0;
        logger.info('📤 Publishing immediately (no delay)', { postId, scheduleId });
      }

      const jobPriority = delay === 0 ? 1 : (priority === 'high' ? 2 : 3);

      const job = await this.publishQueue.add(
        {
          postId,
          scheduleId,
          scheduledFor,
        },
        {
          delay,
          priority: jobPriority,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: false, // ✅ Keep completed jobs for debugging
          removeOnFail: false,
          timeout: 60000, // ✅ 60 second timeout per job
        }
      );

      logger.info('📋 Publish job added to queue', {
        jobId: job.id,
        postId,
        scheduleId,
        delay,
        priority: jobPriority,
        willRunAt: delay === 0 ? 'immediately' : new Date(now.getTime() + delay).toISOString(),
        queueLength: await this.publishQueue.count()
      });

      return job;
    } catch (error) {
      logger.error('❌ Failed to add publish job', { 
        error: error.message, 
        stack: error.stack,
        postId 
      });
      throw error;
    }
  }

  /**
   * Cancel scheduled job
   */
  async cancelJob(jobId) {
    try {
      const job = await this.publishQueue.getJob(jobId);
      if (job) {
        await job.remove();
        logger.info('🗑️ Job cancelled', { jobId });
        return true;
      }
      return false;
    } catch (error) {
      logger.error('Failed to cancel job', { error: error.message, jobId });
      throw error;
    }
  }

  /**
   * Retry failed job
   */
  async retryJob(postId, scheduleId) {
    try {
      await this.publishQueue.add(
        { postId, scheduleId },
        {
          delay: 0,
          priority: 1,
          attempts: 3,
        }
      );
      logger.info('🔄 Job retried', { postId, scheduleId });
    } catch (error) {
      logger.error('Failed to retry job', { error: error.message, postId });
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getStats() {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        this.publishQueue.getWaitingCount(),
        this.publishQueue.getActiveCount(),
        this.publishQueue.getCompletedCount(),
        this.publishQueue.getFailedCount(),
        this.publishQueue.getDelayedCount(),
      ]);

      return {
        waiting,
        active,
        completed,
        failed,
        delayed,
        total: waiting + active + completed + failed + delayed,
      };
    } catch (error) {
      logger.error('Failed to get queue stats', { error: error.message });
      throw error;
    }
  }

  /**
   * Clean old jobs
   */
  async cleanJobs() {
    const gracePeriod = 24 * 60 * 60 * 1000; // 24 hours
    await this.publishQueue.clean(gracePeriod, 'completed');
    await this.publishQueue.clean(gracePeriod * 7, 'failed'); // Keep failed jobs for 7 days
    logger.info('🧹 Queue cleanup completed');
  }

  /**
   * ✅ ADD: Get failed jobs for debugging
   */
  async getFailedJobs(limit = 10) {
    try {
      const failed = await this.publishQueue.getFailed(0, limit - 1);
      return failed.map(job => ({
        id: job.id,
        data: job.data,
        failedReason: job.failedReason,
        stacktrace: job.stacktrace,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp
      }));
    } catch (error) {
      logger.error('Failed to get failed jobs', { error: error.message });
      return [];
    }
  }
}

module.exports = new QueueManager();