import axios from "axios";
import { prisma } from "../config/db.config";
import { NotificationType } from "@prisma/client";
import { transporter } from "../utils/email";

// Twilio configuration
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;

/**
 * Send notification to a user through multiple channels based on their preferences
 */
export async function sendNotification({
  userId,
  title,
  message,
  type,
  entityId,
  entityType,
  forceAll = false,
}: {
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  entityId?: string;
  entityType?: string;
  forceAll?: boolean; // Force send to all channels regardless of preferences
}) {
  try {
    // Create notification record in database
    const notification = await prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        relatedEntityId: entityId,
        relatedEntityType: entityType,
      },
    });

    // Get user with their notification preferences
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        notificationPreferences: true,
      },
    });

    if (!user) {
      console.error(`User not found: ${userId}`);
      return notification;
    }

    // Check if user has notification preferences
    const preferences = user.notificationPreferences;

    // If no preferences exist, create default preferences
    if (!preferences && !forceAll) {
      // Create default notification preferences
      await prisma.notificationPreferences.create({
        data: {
          userId,
          emailNotifications: true,
          smsNotifications: true,
          pushNotifications: false,
          disabledTypes: [],
        },
      });
    }

    // Check if this notification type is disabled
    const isTypeDisabled = preferences?.disabledTypes?.includes(type);
    if (isTypeDisabled && !forceAll) {
      console.log(`User ${userId} has disabled ${type} notifications`);
      return notification;
    }

    // Send email notification if user has email and email notifications are enabled
    if ((preferences?.emailNotifications || forceAll) && user.email) {
      await sendEmail({
        to: user.email,
        subject: title,
        body: message,
      });
    }

    // Send SMS notification if user has phone number and SMS notifications are enabled
    if ((preferences?.smsNotifications || forceAll) && user.phoneNumber) {
      await sendSMS({
        to: user.phoneNumber,
        body: message,
      });
    }

    return notification;
  } catch (error) {
    console.error("Error sending notification:", error);
    // Don't throw error to prevent transaction failures
    return null;
  }
}

/**
 * Send SMS using Twilio
 */
export async function sendSMS({ to, body }: { to: string; body: string }) {
  try {
    if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber) {
      console.warn("Twilio credentials not configured. SMS not sent.");
      return;
    }

    // Format phone number to international format if needed
    const formattedPhone = formatPhoneNumber(to);

    // Using axios to call Twilio API
    const response = await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Messages.json`,
      new URLSearchParams({
        To: formattedPhone,
        From: twilioPhoneNumber,
        Body: body,
      }),
      {
        auth: {
          username: twilioAccountSid,
          password: twilioAuthToken,
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    return response.data;
  } catch (error) {
    console.error("Error sending SMS:", error);
    // Don't throw error to prevent notification process from failing
  }
}

/**
 * Send email using configured email service
 */
export async function sendEmail({
  to,
  subject,
  body,
  html,
}: {
  to: string;
  subject: string;
  body: string;
  html?: string;
}): Promise<void> {
  try {
    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn("Email credentials are not configured. Email not sent.");
      return;
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      text: body,
      html: html || body,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Email sent to ${to}`);
  } catch (error) {
    console.error("Error sending email:", error);
    // Do not throw to avoid crashing the calling process
  }
}
/**
 * Format phone number to international format
 */
function formatPhoneNumber(phoneNumber: string): string {
  // Remove any non-digit characters
  let cleaned = phoneNumber.replace(/\D/g, "");

  // If the number doesn't start with +, add Nigeria's country code
  if (!phoneNumber.startsWith("+")) {
    // Nigerian numbers
    if (cleaned.startsWith("0")) {
      cleaned = cleaned.substring(1); // Remove leading 0
      return `+234${cleaned}`;
    } else if (!cleaned.startsWith("234")) {
      return `+234${cleaned}`;
    } else {
      return `+${cleaned}`;
    }
  }

  return phoneNumber;
}

/**
 * Update a user's notification preferences
 */
export async function updateNotificationPreferences({
  userId,
  emailNotifications,
  smsNotifications,
  pushNotifications,
  disabledTypes,
}: {
  userId: string;
  emailNotifications?: boolean;
  smsNotifications?: boolean;
  pushNotifications?: boolean;
  disabledTypes?: NotificationType[];
}) {
  try {
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { notificationPreferences: true },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // If preferences exist, update them
    if (user.notificationPreferences) {
      return prisma.notificationPreferences.update({
        where: { userId },
        data: {
          emailNotifications:
            emailNotifications !== undefined ? emailNotifications : undefined,
          smsNotifications:
            smsNotifications !== undefined ? smsNotifications : undefined,
          pushNotifications:
            pushNotifications !== undefined ? pushNotifications : undefined,
          disabledTypes:
            disabledTypes !== undefined ? disabledTypes : undefined,
        },
      });
    }

    // If preferences don't exist, create them
    return prisma.notificationPreferences.create({
      data: {
        userId,
        emailNotifications:
          emailNotifications !== undefined ? emailNotifications : true,
        smsNotifications:
          smsNotifications !== undefined ? smsNotifications : true,
        pushNotifications:
          pushNotifications !== undefined ? pushNotifications : false,
        disabledTypes: disabledTypes || [],
      },
    });
  } catch (error) {
    console.error("Error updating notification preferences:", error);
    throw error;
  }
}

/**
 * Subscribe a user to specific notification types
 */
export async function subscribeToNotifications({
  userId,
  types,
}: {
  userId: string;
  types: NotificationType[];
}) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { notificationPreferences: true },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Get current preferences or create default
    const preferences = user.notificationPreferences;

    if (preferences) {
      // Remove the specified types from disabledTypes
      const updatedDisabledTypes = preferences.disabledTypes.filter(
        (type: NotificationType) => !types.includes(type)
      );

      return prisma.notificationPreferences.update({
        where: { userId },
        data: { disabledTypes: updatedDisabledTypes },
      });
    }

    // Create new preferences if they don't exist
    return prisma.notificationPreferences.create({
      data: {
        userId,
        emailNotifications: true,
        smsNotifications: true,
        pushNotifications: false,
        disabledTypes: [],
      },
    });
  } catch (error) {
    console.error("Error subscribing to notifications:", error);
    throw error;
  }
}

/**
 * Unsubscribe a user from specific notification types
 */
export async function unsubscribeFromNotifications({
  userId,
  types,
}: {
  userId: string;
  types: NotificationType[];
}) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { notificationPreferences: true },
    });

    if (!user) {
      throw new Error(`User not found: ${userId}`);
    }

    // Get current preferences
    const preferences = user.notificationPreferences;

    if (preferences) {
      // Add the specified types to disabledTypes (if not already there)
      const currentDisabled = preferences.disabledTypes || [];
      const newDisabled = [...new Set([...currentDisabled, ...types])];

      return prisma.notificationPreferences.update({
        where: { userId },
        data: { disabledTypes: newDisabled },
      });
    }

    // Create new preferences with disabled types
    return prisma.notificationPreferences.create({
      data: {
        userId,
        emailNotifications: true,
        smsNotifications: true,
        pushNotifications: false,
        disabledTypes: types,
      },
    });
  } catch (error) {
    console.error("Error unsubscribing from notifications:", error);
    throw error;
  }
}
