<div align="center">
  <h1>🎨 CanvasFlow AI</h1>
  <p><strong>A Next-Generation Real-Time Collaborative Whiteboard powered by AI</strong></p>

  [![React](https://img.shields.io/badge/React-19.0-blue.svg?style=flat-square&logo=react)](https://reactjs.org/)
  [![FastAPI](https://img.shields.io/badge/FastAPI-0.109-009688.svg?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com/)
  [![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248.svg?style=flat-square&logo=mongodb)](https://www.mongodb.com/)
  [![Socket.io](https://img.shields.io/badge/Socket.io-Realtime-010101.svg?style=flat-square&logo=socket.io)](https://socket.io/)
  [![Gemini](https://img.shields.io/badge/AI-Google_Gemini-8E75B2.svg?style=flat-square)](https://deepmind.google/technologies/gemini/)
</div>

<br />

CanvasFlow AI is a full-stack, real-time collaborative whiteboard application that seamlessly blends traditional diagramming tools with intelligent AI assistance. Built with modern web technologies, it allows teams to brainstorm, design, and plan with the power of Google's Gemini AI.

---

## ✨ Features

- 🤝 **Real-time Collaboration**: Live multiplayer cursors and instant syncing using Socket.IO.
- 🛠️ **Comprehensive Drawing Tools**: Freehand pen, geometric shapes (rectangle, circle, arrow, line), and text annotations.
- 🤖 **AI-Powered Diagramming**: Generate diagrams from natural language prompts using Google Gemini 2.0 Flash.
- ⏪ **Undo/Redo History**: Complete version history to easily correct mistakes.
- 🔗 **Board Sharing**: Generate secure, unique links to invite collaborators.
- 🔐 **Authentication**: Secure JWT-based email login & **Google OAuth 2.0** integration.
- 🎨 **Glassmorphism UI**: Beautiful, modern, and responsive interface featuring light/dark modes.

---

## 🛠️ Tech Stack

### Frontend
- **Framework**: React 19 (Create React App + Craco)
- **Canvas Engine**: Konva.js / React-Konva
- **Styling**: Tailwind CSS + Shadcn UI
- **Real-time**: Socket.IO Client
- **Hosting**: Vercel

### Backend
- **Framework**: FastAPI (Python)
- **Real-time**: Python-SocketIO (ASGI)
- **Database**: MongoDB (Motor async driver)
- **AI Integration**: Google Generative AI (Gemini)
- **Hosting**: Render

---

## 🚀 Live Deployment Guide

CanvasFlow AI is optimized for cloud deployment using **Vercel** (Frontend) and **Render** (Backend).

### 1. Backend (Render)
1. Create a new **Web Service** on Render connected to this repository.
2. Set the Root Directory to `backend`.
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `uvicorn server:socket_app --host 0.0.0.0 --port $PORT`
5. Configure the Environment Variables (see below).

### 2. Frontend (Vercel)
1. Create a new **Project** on Vercel connected to this repository.
2. Set the Root Directory to `frontend`.
3. Vercel will auto-detect React (Craco).
4. **Important**: Set the Install Command to `npm install --legacy-peer-deps` to avoid ESLint peer dependency issues.
5. Set `REACT_APP_BACKEND_URL` to your Render backend URL.

### 3. Google OAuth Setup
To enable Google Login in production:
1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Under **Authorized JavaScript origins**, add your Vercel URL (e.g., `https://your-app.vercel.app`).
3. Under **Authorized redirect URIs**, add `https://your-app.vercel.app/auth/google/callback`.

---

## 💻 Local Development Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- MongoDB instance (Local or Atlas)

### Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn server:socket_app --host 0.0.0.0 --port 8001 --reload
```

### Frontend Setup
```bash
cd frontend
npm install --legacy-peer-deps
npm start
```
*Frontend will be available at `http://localhost:3000`*

---

## 🔑 Environment Variables

### Backend (`backend/.env`)
| Variable | Description |
|----------|-------------|
| `MONGO_URL` | MongoDB connection string (URL-encode special characters like `@` to `%40`) |
| `DB_NAME` | Database name (e.g., `canvasflow`) |
| `CORS_ORIGINS` | Allowed frontend URLs (e.g., `https://your-app.vercel.app,http://localhost:3000`) |
| `JWT_SECRET` | Secret key for JWT token generation |
| `GEMINI_API_KEY` | Google Gemini API Key |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET`| Google OAuth Client Secret |
| `GOOGLE_CALLBACK_URL` | Your frontend Google callback URL |

### Frontend (`frontend/.env`)
| Variable | Description |
|----------|-------------|
| `REACT_APP_BACKEND_URL`| URL of the FastAPI backend (e.g., `http://localhost:8001`) |

---

## ⌨️ Keyboard Shortcuts

- `Cmd/Ctrl + Z` : Undo
- `Cmd/Ctrl + Shift + Z` : Redo
- `Delete` : Delete selected object
- `V` : Select tool
- `P` : Pen tool
- `R` : Rectangle tool
- `C` : Circle tool
- `A` : Arrow tool
- `T` : Text tool

---

## 📄 License
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
<div align="center">
  <b>Built By ♥️ Shubham Shrivastava</b>
</div>
