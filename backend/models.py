from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List


# ---------- Super Admin ----------
class LoginRequest(BaseModel):
    username: str
    password: str


class TenantCreate(BaseModel):
    business_name: str
    email: EmailStr
    password: str
    plan: str = "starter"


class PlanUpdate(BaseModel):
    plan: Optional[str] = None
    storage_limit_bytes: Optional[int] = None


# ---------- Tenant Auth ----------
class RegisterRequest(BaseModel):
    business_name: str
    email: EmailStr
    password: str
    plan: str = "starter"


class AdminLogin(BaseModel):
    email: EmailStr
    password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


class OnboardingData(BaseModel):
    business_name: str
    contact_email: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None
    accent_color: Optional[str] = "#D4AF37"
    secondary_color: Optional[str] = "#0A0A0B"


# ---------- Galleries ----------
DEFAULT_SUBFOLDERS = ["Wedding Images", "Video", "SelfieBooth", "Album Favourites", "Guest Uploads"]


class GalleryCreate(BaseModel):
    folder_name: str
    subfolders: Optional[List[str]] = None
    client_email: Optional[str] = None
    template_id: Optional[str] = None


class GalleryUpdate(BaseModel):
    folder_name: Optional[str] = None
    client_email: Optional[str] = None


class TemplateCreate(BaseModel):
    name: str
    subfolders: List[str]


# ---------- Shares ----------
class ShareCreate(BaseModel):
    subfolder: Optional[str] = None
    password: Optional[str] = None
    access_level: str = "download"  # view | download | full
    expires_at: Optional[str] = None
    label: Optional[str] = None
    custom_slug: Optional[str] = None
    guest_upload_mode: bool = False
    allow_delete: bool = False


class ShareAccess(BaseModel):
    password: Optional[str] = None


class FavouriteRequest(BaseModel):
    file_id: str
