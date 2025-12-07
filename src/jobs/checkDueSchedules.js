const cron = require('node-cron');
const Post = require('../models/Post');
const queueManager = require('../queues/queueManager');
const logger = require('../utils/logger');

class ScheduleChecker {
  constructor() {
    this.cronJob = null;
  }

  /**
   * Start cron job (runs every minute)
   */
  start() {
    // Run every minute
    this.cronJob = cron.schedule('* * * * *', async () => {
      logger.info('⏰ Schedule checker running...');
      await this.checkDueSchedules();
    });

    logger.info('⏰ Schedule checker cron job started (every 1 minute)');
  }

  /**
   * Stop cron job
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop();
      logger.info('⏰ Schedule checker cron job stopped');
    }
  }

  /**
   * Check for due schedules and queue them
   */
  async checkDueSchedules() {
    try {
      // USE UTC TIME EXPLICITLY
      const now = new Date();
      const nowUTC = new Date(now.toISOString());

      // LOG CURRENT TIME IN MULTIPLE FORMATS
      logger.info('🕐 Current time check', {
        serverLocalTime: now.toLocaleString('en-US'),
        utcTime: nowUTC.toISOString(),
        timestamp: nowUTC.getTime(),
        // Show in different timezones for debugging
        asiaDhaka: now.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }),
        asiaColombo: now.toLocaleString('en-US', { timeZone: 'Asia/Colombo' }),
        asiaKolkata: now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }),
      });

      // Find posts with pending schedules that are due
      const posts = await Post.find({
        status: { $in: ['scheduled', 'draft'] },
        'schedules.status': 'pending',
        'schedules.scheduledFor': { $lte: nowUTC }, // ✅ USE UTC TIME
      }).populate('brand');

      if (posts.length === 0) {
        logger.info('📭 No due schedules found');
        return;
      }

      logger.info(`📅 Found ${posts.length} posts with due schedules`);

      for (const post of posts) {
        const dueSchedules = post.schedules.filter(s => {
          const isStatusPending = s.status === 'pending';
          const isDue = new Date(s.scheduledFor) <= nowUTC;
          
          // ✅ DETAILED LOGGING WITH TIMEZONE INFO
          const brandTimezone = post.brand?.settings?.timezone || 'UTC';
          const scheduledLocal = s.scheduledFor.toLocaleString('en-US', {
            timeZone: brandTimezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
          });
          
          logger.info('🔍 Checking schedule', {
            scheduleId: s._id,
            scheduledForUTC: s.scheduledFor.toISOString(),
            scheduledForLocal: scheduledLocal,
            currentTimeUTC: nowUTC.toISOString(),
            brandTimezone,
            isPending: isStatusPending,
            isDue: isDue,
            differenceMinutes: Math.round((nowUTC - new Date(s.scheduledFor)) / 1000 / 60),
            willQueue: isStatusPending && isDue,
          });
          
          return isStatusPending && isDue;
        });

        for (const schedule of dueSchedules) {
          try {
            // Queue the publish job
            const jobId = await queueManager.addPublishJob(
              post._id.toString(),
              schedule._id.toString(),
              schedule.scheduledFor,
              'high' // High priority for due posts
            );

            // Update schedule status to queued
            schedule.status = 'queued';
            schedule.jobId = jobId;
            post.status = 'publishing';

            logger.info('✅ Queued due schedule', {
              postId: post._id,
              scheduleId: schedule._id,
              jobId,
              scheduledFor: schedule.scheduledFor.toISOString(),
              queuedAt: nowUTC.toISOString(),
            });
          } catch (error) {
            logger.error('❌ Failed to queue schedule', {
              postId: post._id,
              scheduleId: schedule._id,
              error: error.message,
            });

            schedule.status = 'failed';
            schedule.error = error.message;
          }
        }

        await post.save();
      }
    } catch (error) {
      logger.error('❌ Schedule checker error:', {
        message: error.message,
        stack: error.stack,
      });
    }
  }
}

module.exports = new ScheduleChecker();