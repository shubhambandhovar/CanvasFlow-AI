from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid

# User Models
class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: EmailStr
    name: str
    hashed_password: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    created_at: datetime

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# Board Models
class BoardObject(BaseModel):
    id: str
    type: str  # pen, rectangle, circle, arrow, line, text
    data: Dict[str, Any]

class BoardCreate(BaseModel):
    title: str
    description: Optional[str] = None

class BoardUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None

class Board(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: Optional[str] = None
    owner_id: str
    share_token: str = Field(default_factory=lambda: str(uuid.uuid4()))
    objects: List[BoardObject] = []
    version: int = 0
    collaborators: List[str] = []  # List of user IDs
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class BoardResponse(BaseModel):
    id: str
    title: str
    description: Optional[str]
    owner_id: str
    share_token: str
    objects: List[BoardObject]
    version: int
    collaborators: List[str]
    created_at: datetime
    updated_at: datetime

# Board Version History
class BoardVersion(BaseModel):
    model_config = ConfigDict(extra="ignore")
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    board_id: str
    version: int
    objects: List[BoardObject]
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# WebSocket Messages
class WSMessage(BaseModel):
    type: str
    data: Dict[str, Any]

# AI Suggestion Models
class AISuggestionRequest(BaseModel):
    board_id: str
    objects: List[BoardObject]
    context: Optional[str] = None

class AISuggestion(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: str  # shape_clean, annotation, diagram_improvement
    title: str
    description: str
    action: Dict[str, Any]  # Action to apply the suggestion
