const nodemailer = require("nodemailer");
const { PUBLIC_API_URL, APP_SCHEME, BRAND } = require("../config/settings");

const user = process.env.SMTP_USER;
const transporter = user
  ? nodemailer.createTransport({ service: "gmail", auth: { user, pass: process.env.SMTP_PASS } })
  : null;

const GREEN = "#0E7C6B";

// https link that bounces into the app (Gmail & co. don't make custom-scheme links clickable)
const openLink = (kind, token) => `${PUBLIC_API_URL}/open/${kind}/${token}`;
const appLink = (kind, token) => `${APP_SCHEME}://${kind}/${token}`;

const layout = (title, body, button, kind, token) => `<!doctype html><html><body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:20px 10px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:100%;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:${GREEN};padding:22px;text-align:center;color:#fff"><h1 style="margin:0;font-size:24px">🐾 ${BRAND}</h1><p style="margin:6px 0 0">Premium pet care</p></td></tr>
<tr><td style="padding:30px;color:#333;line-height:1.55"><h2 style="margin-top:0">${title}</h2>${body}
<p style="text-align:center;margin:30px 0"><a href="${openLink(kind, token)}" style="background:${GREEN};color:#fff;padding:14px 26px;text-decoration:none;border-radius:999px;font-weight:700;display:inline-block">${button}</a></p>
<p style="font-size:13px;color:#666">Button not working? Open the ${BRAND} app and use “I have the link”, then paste this link:</p>
<p style="word-break:break-all;font-size:13px;color:${GREEN}">${appLink(kind, token)}</p>
<p>Thanks,<br>The ${BRAND} Team</p></td></tr>
<tr><td style="background:#f4f6f8;padding:18px;text-align:center;font-size:12px;color:#888">© ${new Date().getFullYear()} ${BRAND}. All rights reserved.</td></tr>
</table></td></tr></table></body></html>`;

const send = async (to, subject, html, fallbackLog) => {
  if (!transporter) {
    console.log(`[mail not configured] ${subject} -> ${to}\n  ${fallbackLog}`);
    return;
  }
  try {
    const info = await transporter.sendMail({ from: `"${BRAND}" <${user}>`, to, subject, html });
    console.log("Message sent:", info.messageId);
  } catch (err) {
    console.error("Error while sending mail:", err.message);
  }
};

const mailVerification = (token, email) =>
  send(
    email,
    `Please verify your ${BRAND} email`,
    layout(
      "Verify your email address",
      `<p>Hello,</p><p>Thanks for joining ${BRAND}! Confirm your email to activate your account. This link expires in 24 hours. If you didn’t create an account, you can ignore this email.</p>`,
      "Verify email",
      "verifyemail",
      token,
    ),
    appLink("verifyemail", token),
  );

const resetPasswordMail = (token, email) =>
  send(
    email,
    `Reset your ${BRAND} password`,
    layout(
      "Reset your password",
      `<p>Hello,</p><p>We received a request to reset your ${BRAND} password. This link expires in <strong>30 minutes</strong>. If you didn’t ask for this, you can ignore this email — your password won’t change.</p>`,
      "Reset password",
      "resetpassword",
      token,
    ),
    appLink("resetpassword", token),
  );

module.exports = { mailVerification, resetPasswordMail };
