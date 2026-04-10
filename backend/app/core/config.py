import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
if SECRET_KEY == "change-me-in-production":
    import warnings
    warnings.warn("⚠️  SECRET_KEY ist noch der Default! Setze SECRET_KEY in .env!")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./drucker_portal.db")

MAX_FAILED_LOGINS = 5
DEFAULT_STORAGE_LIMIT_BYTES = 4 * 1024 * 1024 * 1024  # 4 GB
