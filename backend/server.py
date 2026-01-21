from fastapi import FastAPI, APIRouter, Depends, HTTPException, status
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from typing import List
import socketio
from datetime import datetime, timezone

from models import (
    UserCreate, UserLogin, TokenResponse, User, UserResponse,
    BoardCreate, BoardUpdate, Board, BoardResponse,
    AISuggestionRequest, AISuggestion
)
from auth import (
    get_password_hash, verify_password, create_access_token, get_current_user
)

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Socket.IO setup
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins='*',
    logger=False,
    engineio_logger=False
)

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Active board connections: {board_id: {sid: user_data}}
active_connections = {}

# ============= Authentication Endpoints =============

@api_router.post("/auth/register", response_model=TokenResponse)
async def register(user_data: UserCreate):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Create user
    user = User(
        email=user_data.email,
        name=user_data.name,
        hashed_password=get_password_hash(user_data.password)
    )
    
    user_dict = user.model_dump()
    user_dict['created_at'] = user_dict['created_at'].isoformat()
    
    await db.users.insert_one(user_dict)
    
    # Create token
    access_token = create_access_token(data={"sub": user.id, "email": user.email})
    
    user_response = UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        created_at=user.created_at
    )
    
    return TokenResponse(access_token=access_token, user=user_response)

@api_router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user_dict = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user_dict:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    if not verify_password(credentials.password, user_dict['hashed_password']):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials"
        )
    
    access_token = create_access_token(
        data={"sub": user_dict['id'], "email": user_dict['email']}
    )
    
    user_response = UserResponse(
        id=user_dict['id'],
        email=user_dict['email'],
        name=user_dict['name'],
        created_at=datetime.fromisoformat(user_dict['created_at'])
    )
    
    return TokenResponse(access_token=access_token, user=user_response)

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    user_dict = await db.users.find_one({"id": current_user['user_id']}, {"_id": 0})
    if not user_dict:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse(
        id=user_dict['id'],
        email=user_dict['email'],
        name=user_dict['name'],
        created_at=datetime.fromisoformat(user_dict['created_at'])
    )

# ============= Board Endpoints =============

@api_router.post("/boards", response_model=BoardResponse)
async def create_board(board_data: BoardCreate, current_user: dict = Depends(get_current_user)):
    board = Board(
        title=board_data.title,
        description=board_data.description,
        owner_id=current_user['user_id']
    )
    
    board_dict = board.model_dump()
    board_dict['created_at'] = board_dict['created_at'].isoformat()
    board_dict['updated_at'] = board_dict['updated_at'].isoformat()
    
    await db.boards.insert_one(board_dict)
    
    return BoardResponse(**board.model_dump())

@api_router.get("/boards", response_model=List[BoardResponse])
async def get_boards(current_user: dict = Depends(get_current_user)):
    boards = await db.boards.find(
        {"$or": [
            {"owner_id": current_user['user_id']},
            {"collaborators": current_user['user_id']}
        ]},
        {"_id": 0}
    ).to_list(1000)
    
    for board in boards:
        board['created_at'] = datetime.fromisoformat(board['created_at'])
        board['updated_at'] = datetime.fromisoformat(board['updated_at'])
    
    return [BoardResponse(**board) for board in boards]

@api_router.get("/boards/{board_id}", response_model=BoardResponse)
async def get_board(board_id: str, current_user: dict = Depends(get_current_user)):
    board = await db.boards.find_one({"id": board_id}, {"_id": 0})
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    
    # Check access
    if board['owner_id'] != current_user['user_id'] and current_user['user_id'] not in board['collaborators']:
        raise HTTPException(status_code=403, detail="Access denied")
    
    board['created_at'] = datetime.fromisoformat(board['created_at'])
    board['updated_at'] = datetime.fromisoformat(board['updated_at'])
    
    return BoardResponse(**board)

@api_router.get("/boards/share/{share_token}", response_model=BoardResponse)
async def get_board_by_share_token(share_token: str, current_user: dict = Depends(get_current_user)):
    board = await db.boards.find_one({"share_token": share_token}, {"_id": 0})
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    
    # Add user as collaborator if not already
    if current_user['user_id'] not in board['collaborators'] and board['owner_id'] != current_user['user_id']:
        await db.boards.update_one(
            {"id": board['id']},
            {"$addToSet": {"collaborators": current_user['user_id']}}
        )
        board['collaborators'].append(current_user['user_id'])
    
    board['created_at'] = datetime.fromisoformat(board['created_at'])
    board['updated_at'] = datetime.fromisoformat(board['updated_at'])
    
    return BoardResponse(**board)

@api_router.put("/boards/{board_id}", response_model=BoardResponse)
async def update_board(board_id: str, board_data: BoardUpdate, current_user: dict = Depends(get_current_user)):
    board = await db.boards.find_one({"id": board_id}, {"_id": 0})
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    
    if board['owner_id'] != current_user['user_id']:
        raise HTTPException(status_code=403, detail="Only owner can update board")
    
    update_data = {k: v for k, v in board_data.model_dump().items() if v is not None}
    if update_data:
        update_data['updated_at'] = datetime.now(timezone.utc).isoformat()
        await db.boards.update_one({"id": board_id}, {"$set": update_data})
    
    updated_board = await db.boards.find_one({"id": board_id}, {"_id": 0})
    updated_board['created_at'] = datetime.fromisoformat(updated_board['created_at'])
    updated_board['updated_at'] = datetime.fromisoformat(updated_board['updated_at'])
    
    return BoardResponse(**updated_board)

@api_router.delete("/boards/{board_id}")
async def delete_board(board_id: str, current_user: dict = Depends(get_current_user)):
    board = await db.boards.find_one({"id": board_id}, {"_id": 0})
    if not board:
        raise HTTPException(status_code=404, detail="Board not found")
    
    if board['owner_id'] != current_user['user_id']:
        raise HTTPException(status_code=403, detail="Only owner can delete board")
    
    await db.boards.delete_one({"id": board_id})
    await db.board_versions.delete_many({"board_id": board_id})
    
    return {"message": "Board deleted successfully"}

# ============= AI Suggestions Endpoint =============

@api_router.post("/ai/suggestions", response_model=List[AISuggestion])
async def get_ai_suggestions(request: AISuggestionRequest, current_user: dict = Depends(get_current_user)):
    import google.genai as genai
    import json

    # Configure Gemini API (new client)
    client = genai.Client(api_key=os.environ.get('GEMINI_API_KEY'))
    
    # Prepare context for AI
    objects_summary = f"Board contains {len(request.objects)} objects:\n"
    for obj in request.objects[:10]:  # Limit to first 10 for context
        objects_summary += f"- {obj.type}: {obj.data}\n"

    user_prompt = ""
    if request.context:
        user_prompt = f"\nUser prompt:\n{request.context}\n"
    
        prompt = f"""You are an AI assistant for a collaborative whiteboard. Analyze the following drawing objects and user request.

{objects_summary}
{user_prompt}

TASK:
If the user requests to CREATE shapes (e.g., "make a triangle", "draw 3 circles below", "add square"), return a JSON array of shape creation commands.
Otherwise, provide 2-3 actionable suggestions to improve the diagram.

For shape creation, return format:
[
  {{
    "action": "create_shape",
    "shape_type": "triangle|circle|rectangle|arrow|text",
    "quantity": 1,
    "position": "center|below|above|left|right",
    "reference": "triangle|circle|rectangle|last" (optional),
    "text_content": "..." (only for text shapes)
  }}
]

For suggestions, return format:
[
  {{
    "type": "shape_clean|annotation|diagram_improvement",
    "title": "short title (max 40 chars)",
    "description": "detailed explanation (max 150 chars)"
  }}
]

CRITICAL:
- Detect CREATE requests vs IMPROVEMENT suggestions
- For "make X", "draw X", "add X", "create X" → use action: create_shape
- Support quantities: "three circles" → quantity: 3
- Support positions: "below the triangle", "to the right" → position: below, reference: triangle
- Return ONLY valid JSON (no markdown fences)
"""
    
    try:
        # Call Gemini API
        result = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=prompt,
            generation_config={
                'temperature': 0.6,
                'response_mime_type': 'application/json'
            }
        )

        response_text = result.text.strip()

        suggestions_data = json.loads(response_text)
        
        suggestions = []
        for sugg in suggestions_data:
            suggestions.append(AISuggestion(
                type=sugg['type'],
                title=sugg['title'],
                description=sugg['description'],
                action={}  # In a real app, this would contain specific actions
            ))
        
        return suggestions
    except Exception as e:
        logging.error(f"AI suggestion error: {e}")
        # Return fallback suggestions
        return [
            AISuggestion(
                type="shape_clean",
                title="Clean up shapes",
                description="Use the shape tools to create perfect geometric forms",
                action={}
            ),
            AISuggestion(
                type="annotation",
                title="Add labels",
                description="Label important elements for better understanding",
                action={}
            )
        ]

# ============= Socket.IO Events =============

@sio.event
async def connect(sid, environ):
    logging.info(f"Client {sid} connected")

@sio.event
async def disconnect(sid):
    logging.info(f"Client {sid} disconnected")
    # Remove from all boards
    for board_id in list(active_connections.keys()):
        if sid in active_connections[board_id]:
            user_data = active_connections[board_id][sid]
            del active_connections[board_id][sid]
            # Notify others
            await sio.emit('user_left', {
                'user_id': user_data['user_id'],
                'name': user_data['name']
            }, room=board_id, skip_sid=sid)

            # Clean up empty rooms safely
            if not active_connections.get(board_id):
                active_connections.pop(board_id, None)

@sio.event
async def join_board(sid, data):
    board_id = data['board_id']
    user_id = data['user_id']
    name = data['name']
    
    # Initialize board connections if not exists
    if board_id not in active_connections:
        active_connections[board_id] = {}
    
    # Add user to board
    active_connections[board_id][sid] = {
        'user_id': user_id,
        'name': name,
        'cursor': {'x': 0, 'y': 0}
    }
    
    # Join Socket.IO room
    await sio.enter_room(sid, board_id)
    
    # Send current users to new user
    users = [
        {'user_id': u['user_id'], 'name': u['name'], 'cursor': u['cursor']}
        for u in active_connections[board_id].values()
        if u['user_id'] != user_id
    ]
    await sio.emit('users_list', {'users': users}, to=sid)
    
    # Notify others
    await sio.emit('user_joined', {
        'user_id': user_id,
        'name': name
    }, room=board_id, skip_sid=sid)

@sio.event
async def cursor_move(sid, data):
    board_id = data['board_id']
    cursor = data['cursor']
    
    if board_id in active_connections and sid in active_connections[board_id]:
        active_connections[board_id][sid]['cursor'] = cursor
        
        await sio.emit('cursor_moved', {
            'user_id': active_connections[board_id][sid]['user_id'],
            'cursor': cursor
        }, room=board_id, skip_sid=sid)

@sio.event
async def board_update(sid, data):
    board_id = data['board_id']
    objects = data['objects']
    version = data['version']
    
    # Update board in database
    await db.boards.update_one(
        {"id": board_id},
        {
            "$set": {
                "objects": objects,
                "version": version,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        }
    )
    
    # Broadcast to other users
    await sio.emit('board_updated', {
        'objects': objects,
        'version': version
    }, room=board_id, skip_sid=sid)

# Add CORS middleware BEFORE including router
cors_origins = os.environ.get("CORS_ORIGINS", "http://localhost:3000,http://localhost:3001").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=[origin.strip() for origin in cors_origins if origin.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include the router in the main app
app.include_router(api_router)

# Mount Socket.IO
socket_app = socketio.ASGIApp(sio, app)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
