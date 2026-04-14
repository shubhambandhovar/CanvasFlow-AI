from fastapi import FastAPI, APIRouter, Depends, HTTPException, status, Body
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
    UserCreate, UserLogin, UserUpdate, TokenResponse, User, UserResponse,
    BoardCreate, BoardUpdate, Board, BoardResponse, BoardObject,
    AISuggestionRequest, AISuggestion
)
from auth import (
    get_password_hash, verify_password, create_access_token, get_current_user
)
import requests as http_requests
import httpx
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

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

# Root endpoint
@app.get("/")
async def root():
    return {
        "status": "CanvasFlow Backend Running Successfully 🚀",
        "version": "1.0.0",
        "endpoints": {
            "auth": "/api/auth",
            "boards": "/api/boards",
            "ai": "/api/ai"
        }
    }

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
        hashed_password=get_password_hash(user_data.password),
        theme="system",
        avatar_url=None,
        tier="Free",
        starred_boards=[]
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
        theme=user.theme,
        avatar_url=user.avatar_url,
        tier=user.tier,
        starred_boards=user.starred_boards,
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
        theme=user_dict.get('theme', 'system'),
        avatar_url=user_dict.get('avatar_url'),
        tier=user_dict.get('tier', 'Free'),
        starred_boards=user_dict.get('starred_boards', []),
        created_at=datetime.fromisoformat(user_dict['created_at'])
    )
    
    return TokenResponse(access_token=access_token, user=user_response)

@api_router.post("/auth/google", response_model=TokenResponse)
async def google_login(payload: dict = Body(...)):
    """
    Google OAuth login endpoint using auth code flow.
    Expected request body: {"code": "<authorization_code>"}
    """
    
    code = payload.get('code')
    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing authorization code"
        )
    
    try:
        # Exchange code for token with Google
        token_url = "https://oauth2.googleapis.com/token"
        token_data = {
            "code": code,
            "client_id": os.environ.get('GOOGLE_CLIENT_ID'),
            "client_secret": os.environ.get('GOOGLE_CLIENT_SECRET'),
            "redirect_uri": os.environ.get('GOOGLE_CALLBACK_URL', 'http://localhost:3000/auth/google/callback'),
            "grant_type": "authorization_code"
        }
        
        # Log for debugging
        logging.info(f"[OAuth] Exchanging code with redirect_uri: {token_data['redirect_uri']}")
        
        async with httpx.AsyncClient(timeout=10.0) as client:
            token_response = await client.post(token_url, data=token_data)
        
        if token_response.status_code != 200:
            try:
                error_json = token_response.json()
                error_detail = error_json.get('error_description') or error_json.get('error') or 'Unknown error'
                logging.error(f"[OAuth Error Response] {error_json}")
            except Exception:
                error_detail = token_response.text or "Unknown error"
                logging.error(f"[OAuth Error response text] {token_response.text}")
            
            logging.error(f"[OAuth Error] {error_detail}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to exchange code: {error_detail}"
            )
        
        try:
            tokens = token_response.json()
        except ValueError:
             logging.error(f"[OAuth Error] Invalid JSON from Google: {token_response.text}")
             raise HTTPException(
                 status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                 detail="Invalid response from Google"
             )

        id_token_str = tokens.get('id_token')
        
        if not id_token_str:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No ID token received"
            )
        
        # Verify and decode the ID token
        idinfo = id_token.verify_oauth2_token(
            id_token_str,
            google_requests.Request(),
            os.environ.get('GOOGLE_CLIENT_ID')
        )
        
        # Extract user info
        email = idinfo.get('email')
        name = idinfo.get('name', email.split('@')[0])
        picture = idinfo.get('picture')
        google_id = idinfo.get('sub')
        
        if not email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid Google token"
            )
        
        # Check if user exists
        user_dict = await db.users.find_one({"email": email}, {"_id": 0})
        
        if not user_dict:
            # Create new user
            user = User(
                email=email,
                name=name,
                hashed_password=get_password_hash(google_id),
                theme="system",
                avatar_url=None,
                tier="Free",
                starred_boards=[]
            )
            user_dict = user.model_dump()
            user_dict['created_at'] = user_dict['created_at'].isoformat()
            await db.users.insert_one(user_dict)
        
        # Create JWT token
        access_token = create_access_token(
            data={"sub": user_dict['id'], "email": user_dict['email']}
        )
        
        user_response = UserResponse(
            id=user_dict['id'],
            email=user_dict['email'],
            name=user_dict['name'],
            theme=user_dict.get('theme', 'system'),
            avatar_url=user_dict.get('avatar_url'),
            tier=user_dict.get('tier', 'Free'),
            starred_boards=user_dict.get('starred_boards', []),
            created_at=datetime.fromisoformat(user_dict['created_at'])
        )
        
        return TokenResponse(access_token=access_token, user=user_response)
        
    except ValueError as e:
        logging.error(f"Google token verification failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Google token"
        )
    except Exception as e:
        logging.error(f"Google login error: {e}")
        with open("backend_error.log", "a") as f:
            f.write(f"[{datetime.now()}] Google login error: {str(e)}\n")
            import traceback
            f.write(traceback.format_exc() + "\n")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Google login failed: {str(e)}"
        )

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    user_dict = await db.users.find_one({"id": current_user['user_id']}, {"_id": 0})
    if not user_dict:
        raise HTTPException(status_code=404, detail="User not found")
    
    return UserResponse(
        id=user_dict['id'],
        email=user_dict['email'],
        name=user_dict['name'],
        theme=user_dict.get('theme', 'system'),
        avatar_url=user_dict.get('avatar_url'),
        tier=user_dict.get('tier', 'Free'),
        starred_boards=user_dict.get('starred_boards', []),
        created_at=datetime.fromisoformat(user_dict['created_at'])
    )

@api_router.put("/auth/profile", response_model=UserResponse)
async def update_profile(profile_data: UserUpdate, current_user: dict = Depends(get_current_user)):
    user_dict = await db.users.find_one({"id": current_user['user_id']}, {"_id": 0})
    if not user_dict:
        raise HTTPException(status_code=404, detail="User not found")
        
    update_data = {k: v for k, v in profile_data.model_dump().items() if v is not None}
    
    if 'password' in update_data:
        update_data['hashed_password'] = get_password_hash(update_data.pop('password'))
        
    if update_data:
        await db.users.update_one({"id": current_user['user_id']}, {"$set": update_data})
        
    updated_user = await db.users.find_one({"id": current_user['user_id']}, {"_id": 0})
    
    return UserResponse(
        id=updated_user['id'],
        email=updated_user['email'],
        name=updated_user['name'],
        theme=updated_user.get('theme', 'system'),
        avatar_url=updated_user.get('avatar_url'),
        tier=updated_user.get('tier', 'Free'),
        starred_boards=updated_user.get('starred_boards', []),
        created_at=datetime.fromisoformat(updated_user['created_at'])
    )

@api_router.delete("/auth/profile")
async def delete_profile(current_user: dict = Depends(get_current_user)):
    user_dict = await db.users.find_one({"id": current_user['user_id']}, {"_id": 0})
    if not user_dict:
        raise HTTPException(status_code=404, detail="User not found")
        
    # Delete the user
    await db.users.delete_one({"id": current_user['user_id']})
    
    # Optionally, delete the boards owned by the user
    await db.boards.delete_many({"owner_id": current_user['user_id']})
    
    return {"message": "Account successfully deleted"}


# ============= Board Endpoints =============

@api_router.post("/boards", response_model=BoardResponse)
async def create_board(board_data: BoardCreate, current_user: dict = Depends(get_current_user)):
    try:
        board = Board(
            title=board_data.title,
            description=board_data.description,
            owner_id=current_user['user_id']
        )
        
        import uuid
        template = getattr(board_data, 'template', 'blank') or 'blank'
        if template == 'flowchart':
            board.objects = [
                BoardObject(id=str(uuid.uuid4()), type="rectangle", data={"x": 300, "y": 100, "width": 160, "height": 80, "text": "Start Task", "fill": "#E5E7EB", "stroke": "#374151"}),
                BoardObject(id=str(uuid.uuid4()), type="rectangle", data={"x": 300, "y": 300, "width": 160, "height": 80, "text": "Process", "fill": "#FFFFFF", "stroke": "#374151"}),
                BoardObject(id=str(uuid.uuid4()), type="arrow", data={"points": [380, 180, 380, 300], "stroke": "#374151", "strokeWidth": 2})
            ]
        elif template == 'mindmap':
            board.objects = [
                BoardObject(id=str(uuid.uuid4()), type="circle", data={"x": 400, "y": 300, "radius": 70, "text": "Central Idea", "fill": "#DBEAFE", "stroke": "#1E3A8A"}),
                BoardObject(id=str(uuid.uuid4()), type="circle", data={"x": 200, "y": 150, "radius": 50, "text": "Branch 1", "fill": "#FFFFFF", "stroke": "#1E3A8A"}),
                BoardObject(id=str(uuid.uuid4()), type="circle", data={"x": 600, "y": 150, "radius": 50, "text": "Branch 2", "fill": "#FFFFFF", "stroke": "#1E3A8A"}),
                BoardObject(id=str(uuid.uuid4()), type="line", data={"points": [345, 255, 235, 185], "stroke": "#1E3A8A", "strokeWidth": 2}),
                BoardObject(id=str(uuid.uuid4()), type="line", data={"points": [455, 255, 565, 185], "stroke": "#1E3A8A", "strokeWidth": 2})
            ]
            
        board_dict = board.model_dump()
        board_dict['created_at'] = board_dict['created_at'].isoformat() if isinstance(board_dict['created_at'], datetime) else board_dict['created_at']
        board_dict['updated_at'] = board_dict['updated_at'].isoformat() if isinstance(board_dict['updated_at'], datetime) else board_dict['updated_at']
        
        await db.boards.insert_one(board_dict)
        
        return board
    except Exception as e:
        logging.error(f"Board creation error: {e}")
        with open("backend_error.log", "a") as f:
            f.write(f"[{datetime.now()}] Board creation error: {str(e)}\n")
            import traceback
            f.write(traceback.format_exc() + "\n")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create board: {str(e)}"
        )

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
    import google.generativeai as genai
    import json

    # Configure Gemini API
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        logging.error("GEMINI_API_KEY not found in environment")
        return get_fallback_suggestions()

    genai.configure(api_key=api_key)
    
    # Prepare context for AI
    objects_summary = f"Board contains {len(request.objects)} objects.\n"
    # Show last few objects to save context window
    context_objects = request.objects[-20:] if len(request.objects) > 20 else request.objects
    for i, obj in enumerate(context_objects):
        objects_summary += f"{i+1}. {obj.type} at ({obj.data.get('x',0)}, {obj.data.get('y',0)}) - data: {json.dumps(obj.data)}\n"

    if request.context:
        # DIAGRAM GENERATOR PROMPT
        prompt = f"""You are a professional Whiteboard Architect and Diagram Generator. 
TASK: Convert the user's command into a set of shape creation actions.

Board Status:
{objects_summary}

User Command: "{request.context}"

TASK: Generate a diagram that satisfies the request.
EXAMPLES:
- "add a car": Use rectangles for body and circles for wheels.
- "login flow": Use rectangles for 'Login Page', 'Check DB', 'Success' and connect them with arrows.

RETURN JSON LIST:
Each item MUST have "type": "shape_create" and an "action" field.
"action" schema: 
{{
  "action": "create_shape",
  "shape_type": "rectangle|circle|triangle|arrow|text|sticky",
  "data": {{ 
    "x": number, "y": number, "width": number, "height": number,
     "fill": "color (eg #9D00FF)", "stroke": "#18181B", "text": "optional label",
     "points": [x1, y1, x2, y2, ...] // FOR ARROWS/TRIANGLES: Required.
  }}
}}

FORMAT:
[
  {{
    "type": "shape_create",
    "title": "Drawing [Name]",
    "description": "Short explanation",
    "action": {{ ... }}
  }}
]

Return ONLY VALID JSON. No extra text.
"""
    else:
        # GENERAL SUGGESTION PROMPT
        prompt = f"""You are an AI assistant for a collaborative whiteboard.
Board Status:
{objects_summary}

TASK: Provide 2-3 suggestions to improve the board.
RETURN JSON:
[
  {{
    "type": "suggestion",
    "title": "Title",
    "description": "Advice",
    "action": {{}}
  }}
]
"""

    try:
        # Try 2.0-flash as it is definitely in the list
        try:
            model = genai.GenerativeModel('models/gemini-2.0-flash')
            response = model.generate_content(prompt)
        except Exception:
            # Fallback to gemini-pro-latest
            model = genai.GenerativeModel('models/gemini-pro-latest')
            response = model.generate_content(prompt)
        
        text = response.text.strip()
        
        # Clean up text from potential markdown formatting
        if '```' in text:
            # Find the first '[' and last ']' to extract JSON array
            start = text.find('[')
            end = text.rfind(']') + 1
            if start != -1 and end != -1:
                text = text[start:end]
            else:
                # If no brackets, try stripping just code blocks
                if text.startswith('```json'): text = text[7:]
                elif text.startswith('```'): text = text[3:]
                if text.endswith('```'): text = text[:-3]
        
        text = text.strip()
        raw_results = json.loads(text)
        
        if not isinstance(raw_results, list):
            raw_results = [raw_results]
            
        suggestions = []
        for item in raw_results:
            action = item.get('action', {})
            # Detect if it's a creation action
            is_create = item.get('type') == 'shape_create' or \
                       (isinstance(action, dict) and action.get('action') == 'create_shape')
            
            suggestions.append(AISuggestion(
                type='shape_create' if is_create else item.get('type', 'suggestion'),
                title=item.get('title', 'AI Command'),
                description=item.get('description', ''),
                action=action if isinstance(action, dict) else {}
            ))
            
        return suggestions

    except Exception as e:
        import traceback
        logging.error(f"Gemini API Error: {str(e)}\n{traceback.format_exc()}")
        return get_fallback_suggestions()

def get_fallback_suggestions():
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
                'sid': sid,
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
        'sid': sid,
        'user_id': user_id,
        'name': name,
        'cursor': {'x': 0, 'y': 0}
    }
    
    # Join Socket.IO room
    await sio.enter_room(sid, board_id)
    
    # Send current users to new user
    users = [
        {'sid': conn_sid, 'user_id': u['user_id'], 'name': u['name'], 'cursor': u['cursor']}
        for conn_sid, u in active_connections[board_id].items()
        if conn_sid != sid
    ]
    await sio.emit('users_list', {'users': users}, to=sid)
    
    # Notify others
    await sio.emit('user_joined', {
        'sid': sid,
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
            'sid': sid,
            'user_id': active_connections[board_id][sid]['user_id'],
            'cursor': cursor
        }, room=board_id, skip_sid=sid)

@sio.event
async def board_update(sid, data):
    board_id = data['board_id']
    objects = data['objects']
    version = data['version']
    
    # Ensure objects is a list and properly serializable
    if not isinstance(objects, list):
        objects = []
    
    # Update board in database
    await db.boards.update_one(
        {"id": board_id},
        {
            "$set": {
                "objects": objects,
                "version": version,
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
        },
        upsert=False
    )
    
    # Broadcast to ALL users in the room (including sender for confirmation)
    await sio.emit('board_updated', {
        'objects': objects,
        'version': version,
        'updated_at': datetime.now(timezone.utc).isoformat()
    }, room=board_id)

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
