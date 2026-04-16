/**
 * Notification Service Interface
 *
 * Abstraction layer for sending notifications via multiple channels:
 * - In-app (database)
 * - WhatsApp (UltraMsg)
 */

export interface ShiftInfo {
  shift_name: string;
  date: string;
  start_time: string;
  end_time: string;
  area: string;
  position: string;
}

export interface NotificationService {
  sendShiftPublished(userId: string, shiftDetails: ShiftInfo): Promise<void>;
  sendShiftChanged(userId: string, oldShift: ShiftInfo, newShift: ShiftInfo): Promise<void>;
  sendDocumentAlert(userId: string, docType: string, daysUntilExpiry: number): Promise<void>;
  sendLeaveApproved(userId: string, leaveType: string, startDate: string, endDate: string): Promise<void>;
  sendLeaveRejected(userId: string, leaveType: string): Promise<void>;
  sendGeneral(userId: string, title: string, message: string): Promise<void>;
}

import { InAppNotificationService } from './in-app';
import { UltraMsgNotificationService } from './ultramsg';

/**
 * Create a composite notification service that sends via all configured channels
 */
export function createNotificationService(): NotificationService {
  const services: NotificationService[] = [
    new InAppNotificationService(),
  ];

  // Add WhatsApp if configured
  if (process.env.ULTRAMSG_INSTANCE_ID && process.env.ULTRAMSG_TOKEN) {
    services.push(new UltraMsgNotificationService());
  }

  return {
    async sendShiftPublished(userId, shiftDetails) {
      await Promise.allSettled(services.map(s => s.sendShiftPublished(userId, shiftDetails)));
    },
    async sendShiftChanged(userId, oldShift, newShift) {
      await Promise.allSettled(services.map(s => s.sendShiftChanged(userId, oldShift, newShift)));
    },
    async sendDocumentAlert(userId, docType, daysUntilExpiry) {
      await Promise.allSettled(services.map(s => s.sendDocumentAlert(userId, docType, daysUntilExpiry)));
    },
    async sendLeaveApproved(userId, leaveType, startDate, endDate) {
      await Promise.allSettled(services.map(s => s.sendLeaveApproved(userId, leaveType, startDate, endDate)));
    },
    async sendLeaveRejected(userId, leaveType) {
      await Promise.allSettled(services.map(s => s.sendLeaveRejected(userId, leaveType)));
    },
    async sendGeneral(userId, title, message) {
      await Promise.allSettled(services.map(s => s.sendGeneral(userId, title, message)));
    },
  };
}
