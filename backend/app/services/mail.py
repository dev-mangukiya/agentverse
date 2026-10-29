"""Optional SMTP delivery. Never logs recovery tokens or credentials."""

import smtplib
import ssl
from email.message import EmailMessage
from app.core.config import get_settings


def send_recovery(email, token):
    settings = get_settings()
    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = email
    message["Subject"] = "Reset your AgentVerse password"
    message.set_content(
        "Use this one-time link within 30 minutes:\n"
        + settings.public_frontend_url.rstrip("/")
        + "/reset-password#token="
        + token
        + "\n\nIf you did not request this, ignore this email."
    )
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password or "")
        smtp.send_message(message)
