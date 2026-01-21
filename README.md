# CanvasFlow - AI-Assisted Collaborative Whiteboard

A full-stack real-time collaborative whiteboard application with AI-powered suggestions built using React, FastAPI, MongoDB, and Socket.IO.

## Features

- **Real-time Collaboration**: Multiple users can work on the same board simultaneously with live cursor tracking and instant updates
- **Drawing Tools**: Freehand pen, shapes (rectangle, circle, arrow, line), and text annotations
- **Object Manipulation**: Select, move, resize, and delete objects on the canvas
- **Undo/Redo**: Complete version history for easy corrections
- **AI Suggestions**: Get intelligent recommendations to improve your diagrams using Google Gemini
- **Board Sharing**: Share boards via unique links with collaborators
- **User Authentication**: Secure JWT-based authentication
- **Modern UI**: Clean, minimal interface with glassmorphism effects

## Tech Stack

### Frontend
- React 19
- Konva.js for canvas rendering
- Socket.IO client for real-time communication
- Tailwind CSS + Shadcn UI for styling
- React Router for navigation

### Backend
- FastAPI (Python)
- Python-SocketIO for real-time WebSocket communication
- Motor (async MongoDB driver)
- JWT authentication
- Google Gemini AI via Emergent LLM integration

### Database
- MongoDB for storing users, boards, and version history

## Prerequisites

- Docker and Docker Compose (for containerized setup)
- OR Node.js 18+, Python 3.11+, and MongoDB (for local development)

## Quick Start with Docker

1. Clone the repository:
```bash
git clone <repository-url>
cd canvasflow
```

2. Build and run with Docker Compose:
```bash
docker-compose up --build
```

3. Access the application:
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8001
   - MongoDB: localhost:27017

## Local Development Setup

### Backend Setup

1. Navigate to backend directory:
```bash
cd backend
```

2. Create a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
```

4. Set up environment variables in `.env`:
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=canvasflow
CORS_ORIGINS=*
JWT_SECRET=your_super_secret_jwt_key
JWT_ALGORITHM=HS256
EMERGENT_LLM_KEY=your_emergent_llm_key
```

5. Run the backend:
```bash
uvicorn server:socket_app --host 0.0.0.0 --port 8001 --reload
```

### Frontend Setup

1. Navigate to frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
yarn install
```

3. Set up environment variables in `.env`:
```
REACT_APP_BACKEND_URL=http://localhost:8001
```

4. Run the development server:
```bash
yarn start
```

5. Open http://localhost:3000 in your browser

## Architecture Overview

### Real-time Collaboration Flow
1. Users connect to the board via Socket.IO WebSocket
2. Each drawing action is broadcast to all connected users
3. Cursor movements are tracked and displayed in real-time
4. Board state is maintained on the server and synced across clients

### AI Integration
- Uses Emergent LLM Universal Key to access Google Gemini
- Analyzes board objects to provide contextual suggestions
- Suggestions include shape cleaning, annotations, and layout improvements

### Data Models
- **User**: Authentication and user profile data
- **Board**: Canvas data, ownership, and collaboration settings
- **BoardVersion**: Historical snapshots for undo/redo
- **BoardObject**: Individual shapes, drawings, and text on canvas

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Boards
- `GET /api/boards` - List user's boards
- `POST /api/boards` - Create new board
- `GET /api/boards/{board_id}` - Get board details
- `PUT /api/boards/{board_id}` - Update board
- `DELETE /api/boards/{board_id}` - Delete board
- `GET /api/boards/share/{share_token}` - Access board via share link

### AI
- `POST /api/ai/suggestions` - Get AI suggestions for board

### WebSocket Events
- `join_board` - Join a board room
- `cursor_move` - Update cursor position
- `board_update` - Broadcast board changes
- `user_joined` - Notify when user joins
- `user_left` - Notify when user leaves

## Keyboard Shortcuts

- `Cmd/Ctrl + Z` - Undo
- `Cmd/Ctrl + Shift + Z` - Redo
- `Delete` - Delete selected object
- `V` - Select tool
- `P` - Pen tool
- `R` - Rectangle tool
- `C` - Circle tool
- `A` - Arrow tool
- `T` - Text tool

## Deployment

### Using Docker Compose (Recommended)

The included `docker-compose.yml` sets up all services:
```bash
docker-compose up -d
```

### Manual Deployment

1. Set up MongoDB instance
2. Deploy backend with environment variables configured
3. Build frontend: `yarn build`
4. Serve frontend static files with nginx or similar
5. Configure nginx to proxy `/api` and `/socket.io` to backend

## Environment Variables

### Backend
- `MONGO_URL` - MongoDB connection string
- `DB_NAME` - Database name
- `CORS_ORIGINS` - Allowed CORS origins
- `JWT_SECRET` - Secret key for JWT tokens
- `JWT_ALGORITHM` - JWT algorithm (default: HS256)
- `EMERGENT_LLM_KEY` - Emergent LLM API key for AI features

### Frontend
- `REACT_APP_BACKEND_URL` - Backend API URL

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License - see LICENSE file for details

## Troubleshooting

### WebSocket Connection Issues
- Ensure backend is running and accessible
- Check CORS settings in backend
- Verify `REACT_APP_BACKEND_URL` points to correct backend URL

### AI Suggestions Not Working
- Verify `EMERGENT_LLM_KEY` is set correctly
- Check backend logs for AI API errors
- Ensure emergentintegrations package is installed

### Database Connection Errors
- Verify MongoDB is running
- Check `MONGO_URL` environment variable
- Ensure MongoDB allows connections from your IP

## Support

For issues and questions, please open an issue on GitHub or contact the development team.

---

Built By ♥️ Shubham Shrivastava
