/**
 * UltraMsg WhatsApp Notification Service
 *
 * Sends notifications via WhatsApp using the UltraMsg API.
 * Requires ULTRAMSG_INSTANCE_ID and ULTRAMSG_TOKEN environment variables.
 */

import type { NotificationService, ShiftInfo } from './index';

const ULTRAMSG_BASE_URL = 'https://api.ultramsg.com';

export class UltraMsgNotificationService implements NotificationService {
  private instanceId = process.env.ULTRAMSG_INSTANCE_ID || '';
  private token = process.env.ULTRAMSG_TOKEN || '';

  private async sendMessage(phone: string, body: string): Promise<void> {
    if (!this.instanceId || !this.token) {
      console.warn('[UltraMsg] Not configured — skipping WhatsApp notification');
      return;
    }

    try {
      const response = await fetch(
        `${ULTRAMSG_BASE_URL}/${this.instanceId}/messages/chat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: this.token,
            to: phone,
            body,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        console.error('[UltraMsg] Failed to send:', error);
      }
    } catch (error) {
      console.error('[UltraMsg] Error:', error);
    }
  }

  private async getPhoneForUser(userId: string): Promise<string | null> {
    // In production, fetch from users/personnel table
    // For now, return null (skip sending)
    console.log(`[UltraMsg] Would look up phone for user ${userId}`);
    return null;
  }

  async sendShiftPublished(userId: string, shift: ShiftInfo): Promise<void> {
    const phone = await this.getPhoneForUser(userId);
    if (!phone) return;

    await this.sendMessage(
      phone,
      `📋 *New Shift Assigned*\n\n` +
      `Shift: ${shift.shift_name}\n` +
      `Date: ${shift.date}\n` +
      `Time: ${shift.start_time} - ${shift.end_time}\n` +
      `Area: ${shift.area}\n` +
      `Position: ${shift.position}`
    );
  }

  async sendShiftChanged(userId: string, oldShift: ShiftInfo, newShift: ShiftInfo): Promise<void> {
    const phone = await this.getPhoneForUser(userId);
    if (!phone) return;

    await this.sendMessage(
      phone,
      `🔄 *Shift Changed*\n\n` +
      `Date: ${oldShift.date}\n` +
      `Old: ${oldShift.shift_name} (${oldShift.start_time} - ${oldShift.end_time})\n` +
      `New: ${newShift.shift_name} (${newShift.start_time} - ${newShift.end_time})\n` +
      `Area: ${newShift.area}`
    );
  }

  async sendDocumentAlert(userId: string, docType: string, daysUntilExpiry: number): Promise<void> {
    const phone = await this.getPhoneForUser(userId);
    if (!phone) return;

    const emoji = daysUntilExpiry <= 0 ? '🔴' : '⚠️';
    const status = daysUntilExpiry <= 0 ? 'EXPIRED' : `expires in ${daysUntilExpiry} days`;

    await this.sendMessage(
      phone,
      `${emoji} *Document Alert*\n\n` +
      `Your ${docType} ${status}.\n` +
      `Please update immediately.`
    );
  }

  async sendLeaveApproved(userId: string, leaveType: string, startDate: string, endDate: string): Promise<void> {
    const phone = await this.getPhoneForUser(userId);
    if (!phone) return;

    await this.sendMessage(
      phone,
      `✅ *Leave Approved*\n\n` +
      `Type: ${leaveType}\n` +
      `From: ${startDate}\n` +
      `To: ${endDate}`
    );
  }

  async sendLeaveRejected(userId: string, leaveType: string): Promise<void> {
    const phone = await this.getPhoneForUser(userId);
    if (!phone) return;

    await this.sendMessage(
      phone,
      `❌ *Leave Rejected*\n\n` +
      `Your ${leaveType} leave request has been rejected.`
    );
  }

  async sendGeneral(userId: string, title: string, message: string): Promise<void> {
    const phone = await this.getPhoneForUser(userId);
    if (!phone) return;

    await this.sendMessage(phone, `📢 *${title}*\n\n${message}`);
  }
}
