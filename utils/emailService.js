import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

export const sendTempPasswordEmail = async (toEmail, tempPassword) => {
  try {
    const host = process.env.SMTP_HOST;
    const port = process.env.SMTP_PORT || 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
      throw new Error("SMTP configuration is missing. Please define SMTP_HOST, SMTP_USER, and SMTP_PASS in the backend .env file.");
    }

    const transporter = nodemailer.createTransport({
      host,
      port: parseInt(port),
      secure: parseInt(port) === 465, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
    });

    const info = await transporter.sendMail({
      from: `"Job Mela Support" <${user}>`,
      to: toEmail,
      subject: "Job Mela - Your Temporary Password",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
          <h2 style="color: #333;">Job Mela - Password Reset</h2>
          <p>Hello,</p>
          <p>You have requested to reset your password. Your temporary password is:</p>
          <div style="background-color: #f4f4f4; padding: 15px; margin: 20px 0; border-radius: 4px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 2px;">
            ${tempPassword}
          </div>
          <p><strong>Important:</strong> For security reasons, you will be required to change this password immediately upon your next login.</p>
          <p>If you did not request a password reset, please ignore this email or contact support.</p>
          <p>Best regards,<br/>Job Mela Support Team</p>
        </div>
      `,
    });
    console.log("Message sent: %s", info.messageId);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};
