import prisma from "../../config/prisma.js";

// Fetch notification history for the company
export const getNotifications = async (req, res) => {
  try {
    const { companyId } = req;

    const notifications = await prisma.notification.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Mark notification as read
export const markNotificationRead = async (req, res) => {
  try {
    const { companyId } = req;
    const { id } = req.params;

    const notification = await prisma.notification.findFirst({
      where: { id, companyId }
    });

    if (!notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    await prisma.notification.update({
      where: { id },
      data: { status: "read" }
    });

    res.json({ success: true, message: "Notification marked as read" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Dispatch a notification (triggers Email SMTP / SMS / WhatsApp log)
// Helper utility to send notification and save in DB
export const dispatchNotification = async ({ companyId, userId, channel, title, message }) => {
  try {
    // 1. Create In-App Notification record
    const notification = await prisma.notification.create({
      data: {
        companyId,
        userId,
        channel,
        title,
        message,
        status: "sent"
      }
    });

    // 2. Trigger Mock External Channels
    if (channel === "whatsapp") {
      console.log(`[WHATSAPP API Broadcast] To: Candidate/User, Msg: ${message}`);
    } else if (channel === "sms") {
      console.log(`[SMS Gateway API] Msg: ${message}`);
    } else if (channel === "email") {
      console.log(`[Email SMTP Dispatch] Subject: ${title}, Body: ${message}`);
    }

    return notification;
  } catch (error) {
    console.error("Failed to dispatch notification:", error.message);
  }
};
