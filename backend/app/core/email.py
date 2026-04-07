"""
Optionales E-Mail-Modul für 3D-Drucker-Portal.
Konfiguration wird aus portal_config.json geladen.
Wenn nicht konfiguriert/aktiviert, werden E-Mails still ignoriert.
"""
import json
import os
import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

_CONFIG_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "portal_config.json")
)

_config: dict = {}


def reload_email_config() -> None:
    global _config
    try:
        with open(_CONFIG_PATH, "r") as f:
            data = json.load(f)
        _config = data.get("email", {})
    except FileNotFoundError:
        _config = {}
    except Exception:
        _config = {}


def save_email_config(cfg: dict) -> None:
    existing = {}
    try:
        with open(_CONFIG_PATH, "r") as f:
            existing = json.load(f)
    except Exception:
        pass
    existing["email"] = cfg
    with open(_CONFIG_PATH, "w") as f:
        json.dump(existing, f, indent=2)
    reload_email_config()


def get_email_config() -> dict:
    return dict(_config)


def send_email(to: str, subject: str, body: str) -> bool:
    """Sendet eine E-Mail. Gibt True bei Erfolg zurück, False wenn nicht konfiguriert oder Fehler."""
    if not _config.get("enabled") or not _config.get("smtp_host"):
        return False

    host = _config["smtp_host"]
    port = int(_config.get("smtp_port", 587))
    user = _config.get("smtp_user", "")
    password = _config.get("smtp_password", "")
    from_addr = _config.get("from_address", user)
    use_tls = _config.get("use_tls", True)
    use_ssl = _config.get("use_ssl", False)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        if use_ssl:
            context = ssl.create_default_context()
            with smtplib.SMTP_SSL(host, port, context=context) as server:
                if user:
                    server.login(user, password)
                server.sendmail(from_addr, [to], msg.as_string())
        else:
            with smtplib.SMTP(host, port, timeout=10) as server:
                if use_tls:
                    server.starttls(context=ssl.create_default_context())
                if user:
                    server.login(user, password)
                server.sendmail(from_addr, [to], msg.as_string())
        return True
    except Exception:
        return False


# Beim Modulstart laden
reload_email_config()
