# S:\SPOTMIES TASK\CanvasFlow-AI\backend\server.py (Partial Fix)
import os
import json
import logging
from datetime import datetime
from fastapi import FastAPI, HTTPException, Depends, APIRouter, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
import motor.motor_asyncio
import socketio
import bcrypt
import jwt
from pydantic import BaseModel
from models import (
    UserCreate, UserLogin, UserResponse,
    BoardCreate, BoardUpdate, BoardResponse,
    BoardObject, AISuggestion, AISuggestionRequest
)

# ... (rest of imports and setup)

# [NOTE: I will rewrite the get_ai_suggestions function specifically]

@api_router.post("/ai/suggestions", response_model=List[AISuggestion])
async def get_ai_suggestions(request: AISuggestionRequest, current_user: dict = Depends(get_current_user)):
    import google.genai as genai
    from google.genai import types

    # Configure Gemini API
    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        logging.error("GEMINI_API_KEY not found in environment")
        return get_fallback_suggestions()

    client = genai.Client(api_key=api_key)
    
    # Prepare context for AI
    objects_summary = f"Board contains {len(request.objects)} objects.\n"
    for i, obj in enumerate(request.objects[-30:]): # Last 30 objects for context
        objects_summary += f"{i+1}. {obj.type} at ({obj.data.get('x',0)}, {obj.data.get('y',0)}) - data: {json.dumps(obj.data)}\n"

    if request.context:
        # DIAGRAM GENERATOR PROMPT
        prompt = f"""You are a professional Whiteboard Architect and Diagram Generator.
Board State:
{objects_summary}

User Command: "{request.context}"

TASK: Convert this command into a set of shape creation actions.
IF the user says "add car", draw a rectangle for the body and circles for wheels.
IF the user says "login flow", draw labeled rectangles for 'Login Page', 'Check DB', and 'Success', connected by arrows.
IF the user says "make it a mindmap", reorganize or add nodes.

Return a JSON list of Suggestions. Each MUST have a 'create_shape' action.
Action JSON schema:
{{
  "action": "create_shape",
  "shape_type": "rectangle|circle|triangle|arrow|text|sticky",
  "data": {{ 
    "x": number, "y": number, "width": number, "height": number,
     "fill": "color", "stroke": "hex_color", "text": "Label text",
     "points": [x1, y1, x2, y2, ...] // FOR ARROWS/TRIANGLES: specify 4-8 coordinate points
  }}
}}

Return exactly this JSON format:
[
  {{
    "type": "shape_create",
    "title": "Clear action title",
    "description": "Short explanation",
    "action": {{ ...the creation command... }}
  }}
]
"""
    else:
        # GENERAL SUGGESTION PROMPT
        prompt = f"""You are an AI assistant for a collaborative whiteboard.
Board State:
{objects_summary}

TASK: Provide 2-3 suggestions to improve the current board (alignment, color grouping, or adding labels).
Return ONLY a JSON list:
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
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type='application/json',
                temperature=0.3
            )
        )
        
        text = response.text.strip()
        # Remove potential backticks
        if text.startswith('```'):
            text = text[text.find('['):text.rfind(']')+1]
        
        raw_results = json.loads(text)
        
        # Ensure it's a list
        if not isinstance(raw_results, list):
            raw_results = [raw_results]
            
        suggestions = []
        for item in raw_results:
            action = item.get('action', {})
            # Detect if it's a creation action
            is_create = item.get('type') == 'shape_create' or action.get('action') == 'create_shape'
            
            suggestions.append(AISuggestion(
                type='shape_create' if is_create else item.get('type', 'suggestion'),
                title=item.get('title', 'AI Action'),
                description=item.get('description', ''),
                action=action
            ))
            
        return suggestions

    except Exception as e:
        logging.error(f"Gemini API Error: {str(e)}")
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
