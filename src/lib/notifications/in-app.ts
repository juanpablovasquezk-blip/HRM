/**
 * In-App Notification Service
 *
 * Stores notifications in the database for in-app display.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import type { NotificationService, ShiftInfo } from './index';

export class InAppNotificationService implements NotificationService {
  private supabase = createAdminClient();

  private async createNotification(
    userId: string,
    type: string,
    title: string,
    message: string,
    data?: Record<string, unknown>
  ) {
    await this.supabase.from('notifications').insert({
      user_id: userId,
      type,
      title,
      message,
      data: data || null,
    });
  }

  async sendShiftPublished(userId: string, shift: ShiftInfo): Promise<void> {
    await this.createNotification(
      userId,
      'shift_published',
      'New Shift Assigned',
      `You have been assigned to ${shift.shift_name} on ${shift.date} (${shift.start_time} - ${shift.end_time}) at ${shift.area}`,
      { shift }
    );
  }

  async sendShiftChanged(userId: string, oldShift: ShiftInfo, newShift: ShiftInfo): Promise<void> {
    await this.createNotification(
      userId,
      'shift_changed',
      'Shift Changed',
      `Your shift on ${oldShift.date} has been changed from ${oldShift.shift_name} to ${newShift.shift_name} (${newShift.start_time} - ${newShift.end_time})`,
      { oldShift, newShift }
    );
  }

  async sendDocumentAlert(userId: string, docType: string, daysUntilExpiry: number): Promise<void> {
    const type = daysUntilExpiry <= 0 ? 'document_expired' : 'document_expiring';
    const title = daysUntilExpiry <= 0 ? 'Document Expired' : 'Document Expiring Soon';
    const message = daysUntilExpiry <= 0
      ? `Your ${docType} has expired. Please update it immediately.`
      : `Your ${docType} will expire in ${daysUntilExpiry} days. Please renew it.`;

    await this.createNotification(userId, type, title, message, { docType, daysUntilExpiry });
  }

  async sendLeaveApproved(userId: string, leaveType: string, startDate: string, endDate: string): Promise<void> {
    await this.createNotification(
      userId,
      'leave_approved',
      'Leave Approved',
      `Your ${leaveType} leave from ${startDate} to ${endDate} has been approved.`,
      { leaveType, startDate, endDate }
    );
  }

  async sendLeaveRejected(userId: string, leaveType: string): Promise<void> {
    await this.createNotification(
      userId,
      'leave_rejected',
      'Leave Rejected',
      `Your ${leaveType} leave request has been rejected.`,
      { leaveType }
    );
  }

  async sendGeneral(userId: string, title: string, message: string): Promise<void> {
    await this.createNotification(userId, 'general', title, message);
  }
}
