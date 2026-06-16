import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const { error } = await resend.emails.send({
      from: "JobMela <noreply@jobmela.co.in>",
      to,
      subject,
      text,
      html,
    });

    if (error) {
      console.error("Resend error:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Error sending email:", err.message);
    return false;
  }
};