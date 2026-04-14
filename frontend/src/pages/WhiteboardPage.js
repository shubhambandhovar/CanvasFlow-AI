import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Stage, Layer, Line, Rect, Circle, Arrow, Text, Transformer } from 'react-konva';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Pencil, Square, Circle as CircleIcon, ArrowRight, Type, Hand, Eraser,
  Undo, Redo, Users, Share2, Sparkles, Download, Menu, X, ChevronLeft,
  Wifi, WifiOff, StickyNote, Grid3X3, Triangle
} from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';
import { io } from 'socket.io-client';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const TOOLS = {
  PEN: 'pen',
  SELECT: 'select',
  RECTANGLE: 'rectangle',
  CIRCLE: 'circle',
  ARROW: 'arrow',
  TEXT: 'text',
  STICKY: 'sticky',
  TRIANGLE: 'triangle',
  ERASER: 'eraser'
};

const CURSOR_COLORS = ['#FF0055', '#00E5FF', '#00FF99', '#FFD500', '#9D00FF'];

export const WhiteboardPage = () => {
  const { boardId, shareToken } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  // Use shareToken if available, otherwise use boardId
  const currentBoardId = boardId || shareToken;
  const isSharedBoard = !!shareToken;

  const [board, setBoard] = useState(null);
  const [objects, setObjects] = useState([]);
  const [boardVersion, setBoardVersion] = useState(0);
  const [selectedTool, setSelectedTool] = useState(TOOLS.PEN);
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyStep, setHistoryStep] = useState(0);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentShape, setCurrentShape] = useState(null);

  // Collaboration
  const [socket, setSocket] = useState(null);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [cursors, setCursors] = useState({});

  // AI Panel
  const [showAI, setShowAI] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [loadingAI, setLoadingAI] = useState(false);

  // Custom AI Prompt Panel
  const [showCustomAI, setShowCustomAI] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [customSuggestions, setCustomSuggestions] = useState([]);
  const [loadingCustomAI, setLoadingCustomAI] = useState(false);

  const [saving, setSaving] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [bgType, setBgType] = useState('dots'); // none, dots, grid

  // Share dialog
  const [showShareDialog, setShowShareDialog] = useState(false);

  const stageRef = useRef(null);
  const transformerRef = useRef(null);
  const layerRef = useRef(null);
  const socketRef = useRef(null);
  const lastToastTimeRef = useRef(0);

  useEffect(() => {
    let mounted = true;
    let localSocket = null;

    const loadBoard = async () => {
      try {
        const endpoint = isSharedBoard
          ? `${API}/boards/share/${shareToken}`
          : `${API}/boards/${boardId}`;

        const response = await axios.get(endpoint);
        if (!mounted) return;
        
        console.log('Board loaded:', response.data);
        setBoard(response.data);
        setObjects(response.data.objects || []);
        setBoardVersion(response.data.version || 0);
        setHistory([response.data.objects || []]);
        setHistoryStep(0);
        
        // Initialize socket only after board is loaded so we have the real board.id
        localSocket = setupSocket(response.data.id);
      } catch (error) {
        console.error('Failed to load board:', error);
        toast.error('Failed to load board');
        navigate('/dashboard');
      }
    };

    const setupSocket = (resolvedBoardId) => {
      const newSocket = io(BACKEND_URL, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: 5
      });

      newSocket.on('connect', () => {
        const now = Date.now();
        if (now - lastToastTimeRef.current > 2000) {
          console.log('Socket connected:', newSocket.id);
          toast('Sync Connected', {
            icon: <Wifi className="w-4 h-4 text-green-500" />,
            className: "bg-white dark:bg-black border-none shadow-lg",
          });
          lastToastTimeRef.current = now;
        }
        
        newSocket.emit('join_board', {
          board_id: resolvedBoardId,
          user_id: user.id,
          name: user.name
        });
      });

      newSocket.on('connect_error', (error) => {
        console.error('Socket connection error:', error);
        toast.error('Connection error: ' + error.message);
      });

      newSocket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        if (reason !== 'io client disconnect') {
          toast('Sync Paused', {
            icon: <WifiOff className="w-4 h-4 text-muted-foreground" />,
            description: "Working offline until reconnected.",
            className: "bg-white dark:bg-black border-none shadow-lg",
          });
        }
      });

      newSocket.on('users_list', (data) => {
        setConnectedUsers(data.users);
      });

      newSocket.on('user_joined', (data) => {
        toast.success(`${data.name} joined the board`);
        setConnectedUsers(prev => {
          if (prev.find(u => u.sid === data.sid)) return prev;
          return [...prev, { sid: data.sid, user_id: data.user_id, name: data.name, cursor: { x: 0, y: 0 } }];
        });
      });

      newSocket.on('user_left', (data) => {
        toast.info(`${data.name} left the board`);
        setConnectedUsers(prev => prev.filter(u => u.sid !== data.sid));
        setCursors(prev => {
          const newCursors = { ...prev };
          delete newCursors[data.sid];
          return newCursors;
        });
      });

      newSocket.on('cursor_moved', (data) => {
        setCursors(prev => ({
          ...prev,
          [data.sid]: data.cursor
        }));
      });

      newSocket.on('board_updated', (data) => {
        setBoardVersion(currentVersion => {
          if (data.version > currentVersion) {
            setObjects(data.objects || []);
            return data.version;
          }
          return currentVersion;
        });
      });

      socketRef.current = newSocket;
      setSocket(newSocket);
      return newSocket;
    };

    loadBoard();

    return () => {
      mounted = false;
      if (localSocket) {
        localSocket.disconnect();
      }
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [boardId, shareToken, isSharedBoard, navigate]);

  useEffect(() => {
    if (selectedId && transformerRef.current) {
      const stage = stageRef.current;
      const selectedNode = stage.findOne(`#${selectedId}`);
      if (selectedNode) {
        transformerRef.current.nodes([selectedNode]);
        transformerRef.current.getLayer().batchDraw();
      }
    }
  }, [selectedId]);

  const saveToHistory = (newObjects) => {
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newObjects);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  const broadcastUpdate = (newObjects) => {
    if (socketRef.current) {
      setBoardVersion(prevVersion => {
        const nextVersion = prevVersion + 1;
        socketRef.current.emit('board_update', {
          board_id: board?.id || currentBoardId,
          objects: newObjects,
          version: nextVersion
        });
        return nextVersion;
      });
    }
  };

  const commitObjects = (newObjects) => {
    setObjects(newObjects);
    saveToHistory(newObjects);
    broadcastUpdate(newObjects);
  };

  const handleDownload = () => {
    // Get transparent PNG from stage first to preserve quality
    const uri = stageRef.current.toDataURL({ pixelRatio: 2 });
    
    // Draw onto a white canvas to prevent black background in JPG
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      
      const jpegUri = canvas.toDataURL('image/jpeg', 1.0);
      
      const link = document.createElement('a');
      link.download = `canvasflow-${board?.title || 'board'}.jpg`;
      link.href = jpegUri;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Board exported as JPG');
    };
    img.src = uri;
  };

  const handleManualSave = () => {
    if (!socket) {
      toast.error('Not connected. Try again in a moment.');
      return;
    }
    setSaving(true);
    try {
      broadcastUpdate(objects);
      toast.success('Board saved');
    } catch (err) {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const getBoundingBox = (obj) => {
    if (!obj) return null;
    const data = obj.data || {};

    if (obj.type === TOOLS.RECTANGLE) {
      const x1 = Math.min(data.x, data.x + data.width);
      const y1 = Math.min(data.y, data.y + data.height);
      const x2 = Math.max(data.x, data.x + data.width);
      const y2 = Math.max(data.y, data.y + data.height);
      return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
    }

    if (obj.type === TOOLS.CIRCLE) {
      const r = data.radius || 0;
      return { x: data.x - r, y: data.y - r, width: r * 2, height: r * 2 };
    }

    if (obj.type === TOOLS.PEN || obj.type === TOOLS.ARROW) {
      const pts = data.points || [];
      if (pts.length < 2) return null;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        minX = Math.min(minX, pts[i]);
        maxX = Math.max(maxX, pts[i]);
        minY = Math.min(minY, pts[i + 1]);
        maxY = Math.max(maxY, pts[i + 1]);
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }

    if (obj.type === TOOLS.TEXT) {
      return { x: data.x, y: data.y, width: data.width || 120, height: data.fontSize || 20 };
    }

    return null;
  };

  const getPrimaryObject = () => {
    // Always return the most recently created/modified shape (last in array)
    // This ensures AI suggestions apply to the latest drawing
    return objects.length ? objects[objects.length - 1] : null;
  };

  const applyShapeClean = (target) => {
    const box = getBoundingBox(target);
    if (!box) return false;

    let cleanShape = null;
    const { x: bx, y: by, width, height } = box;
    const centerX = bx + width / 2;
    const centerY = by + height / 2;

    if (target.type === TOOLS.PEN) {
      const pts = target.data.points || [];
      const totalPoints = pts.length / 2;
      
      // Radius Variation Analysis (Robust Circle Detection)
      let sumRadius = 0;
      const radii = [];
      for (let i = 0; i < pts.length; i += 2) {
        const r = Math.sqrt(Math.pow(pts[i] - centerX, 2) + Math.pow(pts[i+1] - centerY, 2));
        radii.push(r);
        sumRadius += r;
      }
      
      const meanRadius = sumRadius / totalPoints;
      let sumSqDiff = 0;
      for (const r of radii) {
        sumSqDiff += Math.pow(r - meanRadius, 2);
      }
      
      const stdDev = Math.sqrt(sumSqDiff / totalPoints);
      const variation = stdDev / meanRadius; // Coefficient of variation

      // Detection Thresholds:
      // Circle typically has < 12% variation
      // Square has ~11-15% variation
      // Triangle has > 20% variation
      
      if (variation < 0.12) {
        // High confidence Circle
        cleanShape = {
          id: `circle-${Date.now()}`,
          type: TOOLS.CIRCLE,
          data: { x: centerX, y: centerY, radius: meanRadius, stroke: '#18181B', strokeWidth: 2, fill: 'transparent' }
        };
      } else if (variation > 0.18) {
        // High confidence Triangle
        cleanShape = {
          id: `tri-${Date.now()}`,
          type: TOOLS.PEN,
          data: {
            points: [centerX, by, bx, by + height, bx + width, by + height, centerX, by],
            stroke: '#18181B',
            strokeWidth: 2,
            fill: 'transparent',
            closed: true
          }
        };
      } else {
        // Square/Rectangle
        cleanShape = {
          id: `rect-${Date.now()}`,
          type: TOOLS.RECTANGLE,
          data: { x: bx, y: by, width, height, stroke: '#18181B', strokeWidth: 2, fill: 'transparent' }
        };
      }
    }

    // Default fallback
    if (!cleanShape) {
      cleanShape = {
        id: `rect-${Date.now()}`,
        type: TOOLS.RECTANGLE,
        data: { x: bx, y: by, width, height, stroke: '#18181B', strokeWidth: 2, fill: 'transparent' }
      };
    }

    const newObjects = objects.filter(o => o.id !== target.id).concat(cleanShape);
    commitObjects(newObjects);
    setSelectedId(cleanShape.id);
    return true;
  };

  const applyAnnotation = (target, suggestion) => {
    const box = getBoundingBox(target);
    if (!box) return false;
    const label = suggestion?.title?.length ? suggestion.title : 'Label';
    const text = {
      id: `text-${Date.now()}`,
      type: TOOLS.TEXT,
      data: {
        x: box.x + box.width / 2 - 60,
        y: box.y + box.height / 2 - 10,
        text: label,
        fontSize: 18,
        width: 120,
        align: 'center',
        fill: '#18181B'
      }
    };
    commitObjects([...objects, text]);
    setSelectedId(text.id);
    return true;
  };

  const applyFlowExpansion = (target) => {
    const box = getBoundingBox(target);
    if (!box) return false;
    const baseWidth = box.width || 140;
    const baseHeight = box.height || 80;
    const newRect = {
      id: `rect-${Date.now()}`,
      type: TOOLS.RECTANGLE,
      data: {
        x: box.x + box.width + 80,
        y: box.y,
        width: baseWidth,
        height: baseHeight,
        stroke: '#18181B',
        strokeWidth: 2,
        fill: 'transparent'
      }
    };
    const sourceCenter = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const targetCenter = { x: newRect.data.x + baseWidth / 2, y: newRect.data.y + baseHeight / 2 };
    const newArrow = {
      id: `arrow-${Date.now()}`,
      type: TOOLS.ARROW,
      data: {
        points: [sourceCenter.x, sourceCenter.y, targetCenter.x, targetCenter.y],
        stroke: '#18181B',
        strokeWidth: 2,
        fill: '#18181B'
      }
    };
    commitObjects([...objects, newRect, newArrow]);
    setSelectedId(newRect.id);
    return true;
  };

  const applySuggestion = (suggestion) => {
    const target = getPrimaryObject();
    if (!target) {
      toast.error('Draw something first to apply suggestions');
      return false;
    }

    const title = (suggestion?.title || '').toLowerCase();

    switch (suggestion?.type) {
      case 'shape_clean':
        return applyShapeClean(target);
      case 'annotation':
        return applyAnnotation(target, suggestion);
      case 'diagram_improvement':
        return applyFlowExpansion(target);
      default:
        if (title.includes('rectangle')) return applyShapeClean(target);
        if (title.includes('label')) return applyAnnotation(target, suggestion);
        if (title.includes('flow')) return applyFlowExpansion(target);
        return false;
    }
  };

  const handleMouseDown = (e) => {
    if (selectedTool === TOOLS.SELECT || selectedTool === TOOLS.ERASER) return;

    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();
    setIsDrawing(true);

    const newShape = {
      id: `shape-${Date.now()}`,
      type: selectedTool,
      data: {}
    };

    if (selectedTool === TOOLS.PEN) {
      newShape.data = {
        points: [pointerPos.x, pointerPos.y],
        stroke: '#18181B',
        strokeWidth: 2
      };
    } else if (selectedTool === TOOLS.RECTANGLE) {
      newShape.data = {
        x: pointerPos.x,
        y: pointerPos.y,
        width: 0,
        height: 0,
        stroke: '#18181B',
        strokeWidth: 2,
        fill: 'transparent'
      };
    } else if (selectedTool === TOOLS.CIRCLE) {
      newShape.data = {
        x: pointerPos.x,
        y: pointerPos.y,
        radius: 0,
        stroke: '#18181B',
        strokeWidth: 2,
        fill: 'transparent'
      };
    } else if (selectedTool === TOOLS.ARROW) {
      newShape.data = {
        points: [pointerPos.x, pointerPos.y, pointerPos.x, pointerPos.y],
        stroke: '#18181B',
        strokeWidth: 2,
        fill: '#18181B'
      };
    } else if (selectedTool === TOOLS.TRIANGLE) {
        newShape.data = {
          points: [pointerPos.x, pointerPos.y, pointerPos.x, pointerPos.y, pointerPos.x, pointerPos.y, pointerPos.x, pointerPos.y],
          stroke: '#18181B',
          strokeWidth: 2,
          fill: 'transparent',
          closed: true
        };
      } else if (selectedTool === TOOLS.TEXT) {
      const text = prompt('Enter text:');
      if (text) {
        newShape.data = {
          x: pointerPos.x,
          y: pointerPos.y,
          text: text,
          fontSize: 20,
          fill: '#18181B'
        };
        const newObjects = [...objects, newShape];
        setObjects(newObjects);
        saveToHistory(newObjects);
        broadcastUpdate(newObjects);
      }
      setIsDrawing(false);
      return;
    } else if (selectedTool === TOOLS.STICKY) {
      const text = prompt('Enter note text:');
      if (text) {
        const colors = ['#FEF3C7', '#DBEAFE', '#FCE7F3', '#DCFCE7'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        newShape.data = {
          x: pointerPos.x - 75,
          y: pointerPos.y - 75,
          width: 150,
          height: 150,
          text: text,
          fill: randomColor,
          stroke: '#FCD34D',
          strokeWidth: 1,
          shadowBlur: 5,
          shadowOpacity: 0.1
        };
        const newObjects = [...objects, newShape];
        setObjects(newObjects);
        saveToHistory(newObjects);
        broadcastUpdate(newObjects);
      }
      setIsDrawing(false);
      return;
    }

    setCurrentShape(newShape);
  };

  const handleMouseMove = (e) => {
    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();

    // Send cursor position to other users
    if (socket) {
      socket.emit('cursor_move', {
        board_id: board?.id || currentBoardId,
        cursor: { x: pointerPos.x, y: pointerPos.y }
      });
    }

    // Handle drawing
    if (!isDrawing || !currentShape) return;

    const updatedShape = { ...currentShape };

    if (selectedTool === TOOLS.PEN) {
      updatedShape.data.points = [...updatedShape.data.points, pointerPos.x, pointerPos.y];
    } else if (selectedTool === TOOLS.RECTANGLE) {
      updatedShape.data.width = pointerPos.x - updatedShape.data.x;
      updatedShape.data.height = pointerPos.y - updatedShape.data.y;
    } else if (selectedTool === TOOLS.CIRCLE) {
      const dx = pointerPos.x - updatedShape.data.x;
      const dy = pointerPos.y - updatedShape.data.y;
      updatedShape.data.radius = Math.sqrt(dx * dx + dy * dy);
    } else if (selectedTool === TOOLS.TRIANGLE) {
      const startX = updatedShape.data.points[0];
      const startY = updatedShape.data.points[1];
      const currentX = pointerPos.x;
      const currentY = pointerPos.y;
      const width = currentX - startX;
      updatedShape.data.points = [
        startX + width / 2, startY,
        startX, currentY,
        currentX, currentY,
        startX + width / 2, startY
      ];
    } else if (selectedTool === TOOLS.ARROW) {
      updatedShape.data.points = [
        updatedShape.data.points[0],
        updatedShape.data.points[1],
        pointerPos.x,
        pointerPos.y
      ];
    }

    setCurrentShape(updatedShape);
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentShape) return;

    const newObjects = [...objects, currentShape];
    setObjects(newObjects);
    saveToHistory(newObjects);
    broadcastUpdate(newObjects);

    setIsDrawing(false);
    setCurrentShape(null);
  };

  const handleUndo = () => {
    if (historyStep === 0) return;
    const newStep = historyStep - 1;
    setHistoryStep(newStep);
    const newObjects = history[newStep];
    setObjects(newObjects);
    broadcastUpdate(newObjects);
  };

  const handleRedo = () => {
    if (historyStep >= history.length - 1) return;
    const newStep = historyStep + 1;
    setHistoryStep(newStep);
    const newObjects = history[newStep];
    setObjects(newObjects);
    broadcastUpdate(newObjects);
  };

  const deleteById = (targetId) => {
    if (!targetId) return false;
    const newObjects = objects.filter(obj => obj.id !== targetId);
    commitObjects(newObjects);
    setSelectedId(null);
    return true;
  };

  const handleDelete = () => {
    const targetId = selectedId || (objects.length ? objects[objects.length - 1].id : null);
    deleteById(targetId);
  };

  const handleClear = () => {
    if (window.confirm('Clear entire board?')) {
      const newObjects = [];
      setObjects(newObjects);
      saveToHistory(newObjects);
      broadcastUpdate(newObjects);
    }
  };

  const loadAISuggestions = async () => {
    setLoadingAI(true);
    try {
      const response = await axios.post(`${API}/ai/suggestions`, {
        board_id: board?.id || currentBoardId,
        objects
      });
      setAiSuggestions(response.data);
      setShowAI(true);
    } catch (error) {
      toast.error('Failed to get AI suggestions');
    } finally {
      setLoadingAI(false);
    }
  };

  const createShapeFromPrompt = (prompt) => {
    const lowerPrompt = prompt.toLowerCase();
    let centerX = window.innerWidth / 2;
    let centerY = (window.innerHeight - 120) / 2;
    const baseSize = 150;
    const spacing = 50;

    // Parse quantity
    const quantityMap = {
      'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
      'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10
    };

    let quantity = 1;
    const numberMatch = lowerPrompt.match(/(\d+|one|two|three|four|five|six|seven|eight|nine|ten)/);
    if (numberMatch) {
      const num = numberMatch[1];
      quantity = quantityMap[num] || parseInt(num) || 1;
    }

    // Parse spatial relationships
    let referenceObj = null;
    if (lowerPrompt.includes('below') || lowerPrompt.includes('under') || lowerPrompt.includes('beneath')) {
      // Find the last created object or search by type mentioned in prompt
      if (lowerPrompt.includes('triangle')) {
        referenceObj = [...objects].reverse().find(obj => obj.type === TOOLS.PEN && obj.data.closed);
      } else if (lowerPrompt.includes('circle')) {
        referenceObj = [...objects].reverse().find(obj => obj.type === TOOLS.CIRCLE);
      } else if (lowerPrompt.includes('rectangle') || lowerPrompt.includes('square')) {
        referenceObj = [...objects].reverse().find(obj => obj.type === TOOLS.RECTANGLE);
      }
      if (!referenceObj && objects.length > 0) {
        referenceObj = objects[objects.length - 1];
      }

      if (referenceObj) {
        if (referenceObj.type === TOOLS.CIRCLE) {
          centerX = referenceObj.data.x;
          centerY = referenceObj.data.y + referenceObj.data.radius + baseSize / 2 + spacing;
        } else if (referenceObj.type === TOOLS.RECTANGLE) {
          centerX = referenceObj.data.x + referenceObj.data.width / 2;
          centerY = referenceObj.data.y + referenceObj.data.height + baseSize / 2 + spacing;
        } else if (referenceObj.type === TOOLS.PEN && referenceObj.data.points) {
          const points = referenceObj.data.points;
          const maxY = Math.max(...points.filter((_, i) => i % 2 === 1));
          const avgX = points.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) / (points.length / 2);
          centerX = avgX;
          centerY = maxY + baseSize / 2 + spacing;
        }
      }
    } else if (lowerPrompt.includes('above') || lowerPrompt.includes('over')) {
      if (lowerPrompt.includes('triangle')) {
        referenceObj = [...objects].reverse().find(obj => obj.type === TOOLS.PEN && obj.data.closed);
      } else if (lowerPrompt.includes('circle')) {
        referenceObj = [...objects].reverse().find(obj => obj.type === TOOLS.CIRCLE);
      } else if (lowerPrompt.includes('rectangle') || lowerPrompt.includes('square')) {
        referenceObj = [...objects].reverse().find(obj => obj.type === TOOLS.RECTANGLE);
      }
      if (!referenceObj && objects.length > 0) {
        referenceObj = objects[objects.length - 1];
      }

      if (referenceObj) {
        if (referenceObj.type === TOOLS.CIRCLE) {
          centerX = referenceObj.data.x;
          centerY = referenceObj.data.y - referenceObj.data.radius - baseSize / 2 - spacing;
        } else if (referenceObj.type === TOOLS.RECTANGLE) {
          centerX = referenceObj.data.x + referenceObj.data.width / 2;
          centerY = referenceObj.data.y - baseSize / 2 - spacing;
        } else if (referenceObj.type === TOOLS.PEN && referenceObj.data.points) {
          const points = referenceObj.data.points;
          const minY = Math.min(...points.filter((_, i) => i % 2 === 1));
          const avgX = points.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0) / (points.length / 2);
          centerX = avgX;
          centerY = minY - baseSize / 2 - spacing;
        }
      }
    } else if (lowerPrompt.includes('right') || lowerPrompt.includes('beside')) {
      if (objects.length > 0) {
        referenceObj = objects[objects.length - 1];
        if (referenceObj.type === TOOLS.CIRCLE) {
          centerX = referenceObj.data.x + referenceObj.data.radius + baseSize / 2 + spacing;
          centerY = referenceObj.data.y;
        } else if (referenceObj.type === TOOLS.RECTANGLE) {
          centerX = referenceObj.data.x + referenceObj.data.width + baseSize / 2 + spacing;
          centerY = referenceObj.data.y + referenceObj.data.height / 2;
        }
      }
    } else if (lowerPrompt.includes('left')) {
      if (objects.length > 0) {
        referenceObj = objects[objects.length - 1];
        if (referenceObj.type === TOOLS.CIRCLE) {
          centerX = referenceObj.data.x - referenceObj.data.radius - baseSize / 2 - spacing;
          centerY = referenceObj.data.y;
        } else if (referenceObj.type === TOOLS.RECTANGLE) {
          centerX = referenceObj.data.x - baseSize / 2 - spacing;
          centerY = referenceObj.data.y + referenceObj.data.height / 2;
        }
      }
    }

    let newShape = null;

    // Detect what shape to create
    const shapeToCreate = lowerPrompt.match(/(?:make|create|draw|add)\s+(?:a\s+)?(\w+)/)?.[1];

    if (shapeToCreate === 'triangle' || (!shapeToCreate && lowerPrompt.includes('triangle'))) {
      const height = baseSize;
      const width = baseSize;
      newShape = {
        id: `shape-${Date.now()}`,
        type: TOOLS.PEN,
        data: {
          points: [
            centerX, centerY - height / 2,
            centerX - width / 2, centerY + height / 2,
            centerX + width / 2, centerY + height / 2,
            centerX, centerY - height / 2
          ],
          stroke: '#18181B',
          strokeWidth: 2,
          closed: true
        }
      };
    } else if (shapeToCreate === 'circle' || (!shapeToCreate && lowerPrompt.includes('circle'))) {
      newShape = {
        id: `shape-${Date.now()}`,
        type: TOOLS.CIRCLE,
        data: {
          x: centerX,
          y: centerY,
          radius: baseSize / 2,
          stroke: '#18181B',
          strokeWidth: 2
        }
      };
    } else if (shapeToCreate === 'rectangle' || shapeToCreate === 'square' ||
      (!shapeToCreate && (lowerPrompt.includes('rectangle') || lowerPrompt.includes('square')))) {
      newShape = {
        id: `shape-${Date.now()}`,
        type: TOOLS.RECTANGLE,
        data: {
          x: centerX - baseSize / 2,
          y: centerY - baseSize / 2,
          width: baseSize,
          height: baseSize,
          stroke: '#18181B',
          strokeWidth: 2
        }
      };
    } else if (shapeToCreate === 'arrow' || (!shapeToCreate && lowerPrompt.includes('arrow'))) {
      newShape = {
        id: `shape-${Date.now()}`,
        type: TOOLS.ARROW,
        data: {
          points: [centerX - 100, centerY, centerX + 100, centerY],
          stroke: '#18181B',
          strokeWidth: 2,
          fill: '#18181B'
        }
      };
    } else if (shapeToCreate === 'text' || shapeToCreate === 'label' ||
      (!shapeToCreate && (lowerPrompt.includes('text') || lowerPrompt.includes('label')))) {
      const textMatch = prompt.match(/["'](.+?)["']|text:\s*(.+?)(?:\s|$)|label:\s*(.+?)(?:\s|$)/i);
      const textContent = textMatch ? (textMatch[1] || textMatch[2] || textMatch[3]) : 'Text';
      newShape = {
        id: `shape-${Date.now()}`,
        type: TOOLS.TEXT,
        data: {
          x: centerX - 50,
          y: centerY - 20,
          text: textContent,
          fontSize: 24,
          fill: '#18181B'
        }
      };
    }

    if (newShape) {
      // Create multiple shapes if quantity > 1
      const shapesToCreate = [];
      for (let i = 0; i < quantity; i++) {
        let offsetX = 0;
        let offsetY = 0;

        // Position shapes in a row
        if (quantity > 1) {
          const totalWidth = (baseSize + spacing) * quantity - spacing;
          offsetX = (i * (baseSize + spacing)) - totalWidth / 2 + baseSize / 2;
        }

        const shapeInstance = JSON.parse(JSON.stringify(newShape));
        shapeInstance.id = `shape-${Date.now()}-${i}`;

        // Adjust position based on shape type
        if (shapeInstance.type === TOOLS.CIRCLE) {
          shapeInstance.data.x += offsetX;
          shapeInstance.data.y += offsetY;
        } else if (shapeInstance.type === TOOLS.RECTANGLE) {
          shapeInstance.data.x += offsetX;
          shapeInstance.data.y += offsetY;
        } else if (shapeInstance.type === TOOLS.PEN && shapeInstance.data.points) {
          shapeInstance.data.points = shapeInstance.data.points.map((val, idx) =>
            idx % 2 === 0 ? val + offsetX : val + offsetY
          );
        } else if (shapeInstance.type === TOOLS.ARROW) {
          shapeInstance.data.points = shapeInstance.data.points.map((val, idx) =>
            idx % 2 === 0 ? val + offsetX : val + offsetY
          );
        } else if (shapeInstance.type === TOOLS.TEXT) {
          shapeInstance.data.x += offsetX;
          shapeInstance.data.y += offsetY;
        }

        shapesToCreate.push(shapeInstance);
      }

      const newObjects = [...objects, ...shapesToCreate];
      commitObjects(newObjects);
      setSelectedId(shapesToCreate[shapesToCreate.length - 1].id);
      toast.success(`${quantity} shape${quantity > 1 ? 's' : ''} created!`);
      return true;
    }
    return false;
  };

  const executeShapeCommand = (action, currentObjects) => {
    const { shape_type, position, reference, text_content, quantity = 1, width: w, height: h } = action;

    // Default dimensions
    const baseSize = 150;
    const defaultW = w || baseSize;
    const defaultH = h || baseSize;
    const spacing = 50;

    let generatedShapes = [];

    for (let i = 0; i < quantity; i++) {
      let centerX = window.innerWidth / 2;
      let centerY = (window.innerHeight - 120) / 2;

      // Smart positioning
      if (reference === 'last' && currentObjects.length > 0) {
        const lastObj = currentObjects[currentObjects.length - 1];
        const box = getBoundingBox(lastObj);

        if (box) {
          if (position === 'right') {
            centerX = box.x + box.width + defaultW / 2 + spacing;
            centerY = box.y + box.height / 2;
          } else if (position === 'below') {
            centerX = box.x + box.width / 2;
            centerY = box.y + box.height + defaultH / 2 + spacing;
          } else if (position === 'left') {
            centerX = box.x - defaultW / 2 - spacing;
            centerY = box.y + box.height / 2;
          } else if (position === 'above') {
            centerX = box.x + box.width / 2;
            centerY = box.y - defaultH / 2 - spacing;
          }
        }
      }

      // Adjust for multiple quantity in a row if generating multiple
      if (quantity > 1) {
        // For simplicity, just offset X
        centerX += (i * (defaultW + spacing));
      }

      let newShape = null;
      const id = `shape-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      if (shape_type === 'rectangle' || shape_type === 'square') {
        newShape = {
          id, type: TOOLS.RECTANGLE,
          data: { x: centerX - defaultW / 2, y: centerY - defaultH / 2, width: defaultW, height: defaultH, stroke: '#18181B', strokeWidth: 2, fill: 'transparent' }
        };
      } else if (shape_type === 'circle') {
        newShape = {
          id, type: TOOLS.CIRCLE,
          data: { x: centerX, y: centerY, radius: defaultW / 2, stroke: '#18181B', strokeWidth: 2, fill: 'transparent' }
        };
      } else if (shape_type === 'triangle') {
        newShape = {
          id, type: TOOLS.PEN,
          data: {
            points: [centerX, centerY - defaultH / 2, centerX - defaultW / 2, centerY + defaultH / 2, centerX + defaultW / 2, centerY + defaultH / 2, centerX, centerY - defaultH / 2],
            stroke: '#18181B', strokeWidth: 2, closed: true
          }
        };
      } else if (shape_type === 'line') {
        newShape = {
          id, type: TOOLS.PEN,
          data: { points: [centerX - defaultW / 2, centerY, centerX + defaultW / 2, centerY], stroke: '#18181B', strokeWidth: 2 }
        };
      } else if (shape_type === 'arrow') {
        newShape = {
          id, type: TOOLS.ARROW,
          data: { points: [centerX - defaultW / 2, centerY, centerX + defaultW / 2, centerY], stroke: '#18181B', strokeWidth: 2, fill: '#18181B' }
        };
      } else if (shape_type === 'text') {
        newShape = {
          id, type: TOOLS.TEXT,
          data: { x: centerX - defaultW / 2, y: centerY - 12, text: text_content || 'Text', fontSize: 24, fill: '#18181B' }
        };
      }

      if (newShape) {
        generatedShapes.push(newShape);
        // Important: Update the currentObjects reference so subsequent steps in the same AI response 
        // (like wheels after a car body) can reference this new shape as "last".
        currentObjects.push(newShape);
      }
    }

    return generatedShapes;
  };

  const handleCustomPrompt = async () => {
    const trimmedPrompt = customPrompt.trim();
    if (!trimmedPrompt) {
      toast.error('Enter a prompt to run');
      return;
    }

    setLoadingCustomAI(true);

    // First try local parsing for common commands
    const localCreated = createShapeFromPrompt(trimmedPrompt);
    if (localCreated) {
      setCustomPrompt('');
      setLoadingCustomAI(false);
      return;
    }

    // Fall back to AI for complex commands
    try {
      const response = await axios.post(`${API}/ai/suggestions`, {
        board_id: board?.id || currentBoardId,
        objects,
        context: trimmedPrompt
      });
      console.log('AI Response:', response.data);

      const results = response.data;

      // Check if any results contain shape creation actions
      const hasCreateActions = results && results.length > 0 &&
        results.some(r => (r.action === 'create_shape') || (r.action && typeof r.action === 'object' && r.action.action === 'create_shape'));

      if (hasCreateActions) {
        // Execute shape creation commands
        let shapesCreated = 0;
        let currentObjects = [...objects]; // Start with local copy

        for (const result of results) {
          const actionData = result.action === 'create_shape' ? result : result.action;
          if (actionData && actionData.action === 'create_shape') {
            const newShapes = executeShapeCommand(actionData, currentObjects);
            if (newShapes && newShapes.length > 0) {
              shapesCreated += newShapes.length;
            }
          }
        }

        if (shapesCreated > 0) {
          commitObjects(currentObjects); // Commit all changes at once
          toast.success(`${shapesCreated} shape${shapesCreated > 1 ? 's' : ''} created!`);
        } else {
          toast.error('Could not create shapes from your request');
        }
      } else {
        // Show as suggestions
        setCustomSuggestions(results || []);
        if (results && results.length > 0) {
          toast.success('AI suggestions generated!');
        } else {
          toast.info('No suggestions available');
        }
      }

      setCustomPrompt('');
    } catch (error) {
      toast.error('Failed to process your request');
      console.error(error);
    } finally {
      setLoadingCustomAI(false);
    }
  };



  const handleAcceptSuggestion = (suggestion) => {
    const applied = applySuggestion(suggestion);
    if (applied) {
      toast.success('Suggestion applied!');
      setAiSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
    } else {
      toast.error('Could not apply this suggestion automatically');
    }
  };

  const handleDismissSuggestion = (suggestionId) => {
    toast.info('Suggestion dismissed');
    // Remove the dismissed suggestion from the list
    setAiSuggestions(prev => prev.filter(s => s.id !== suggestionId));
  };

  const handleShare = () => {
    // Dialog opens directly from button, this is not needed
  };

  const copyShareLink = () => {
    if (!board || !board.share_token) {
      toast.error('Board not ready. Please refresh the page.');
      return;
    }
    const shareLink = `${window.location.origin}/board/share/${board.share_token}`;
    navigator.clipboard.writeText(shareLink);
    toast.success('✓ Share link copied!');
  };

  const renderObject = (obj) => {
    const commonProps = {
      id: obj.id,
      draggable: selectedTool === TOOLS.SELECT,
      onClick: () => {
        if (selectedTool === TOOLS.ERASER) {
          deleteById(obj.id);
        } else {
          setSelectedId(obj.id);
        }
      },
      onDragEnd: (e) => {
        const newObjects = objects.map(o => {
          if (o.id === obj.id) {
            return {
              ...o,
              data: { ...o.data, x: e.target.x(), y: e.target.y() }
            };
          }
          return o;
        });
        setObjects(newObjects);
        saveToHistory(newObjects);
        broadcastUpdate(newObjects);
      }
    };

    switch (obj.type) {
      case TOOLS.PEN:
        return <Line key={obj.id} {...commonProps} {...obj.data} hitStrokeWidth={20} />;
      case TOOLS.RECTANGLE:
        return <Rect key={obj.id} {...commonProps} {...obj.data} />;
      case TOOLS.CIRCLE:
        return <Circle key={obj.id} {...commonProps} {...obj.data} />;
      case TOOLS.ARROW:
        return <Arrow key={obj.id} {...commonProps} {...obj.data} pointerLength={10} pointerWidth={10} hitStrokeWidth={20} />;
      case TOOLS.TEXT:
        return <Text key={obj.id} {...commonProps} {...obj.data} />;
      case TOOLS.STICKY:
        return (
          <React.Fragment key={obj.id}>
            <Rect 
              {...commonProps} 
              {...obj.data} 
              text={undefined} 
              cornerRadius={4}
            />
            <Text 
              {...obj.data}
              draggable={false}
              listening={false}
              width={obj.data.width - 20}
              height={obj.data.height - 20}
              align="center"
              verticalAlign="middle"
              onClick={undefined}
              text={obj.data.text}
              padding={10}
              fontSize={14}
              fontFamily="Permanent Marker, cursive"
              fill="#52525B"
            />
          </React.Fragment>
        );
      default:
        return null;
    }
  };

  if (!board) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading board...</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#F9FAFB] dark:bg-[#0A1929] overflow-hidden">
      {/* Top Bar */}
      <div className="glass border-b border-black/5 px-6 py-3 flex items-center justify-between z-40" data-testid="whiteboard-header">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/dashboard')}
            className="rounded-full"
            data-testid="back-to-dashboard"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          <h1 className="text-lg font-semibold" data-testid="board-title">{board.title}</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Background Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setBgType(prev => prev === 'dots' ? 'grid' : prev === 'grid' ? 'none' : 'dots')}
            className="rounded-full h-9 w-9 p-0 text-muted-foreground"
            title="Toggle Background"
          >
            <Grid3X3 className="w-4 h-4" />
          </Button>

          {/* Undo/Redo */}
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUndo}
              disabled={historyStep === 0}
              className="rounded-full h-9 w-9 p-0"
              data-testid="undo-button"
            >
              <Undo className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRedo}
              disabled={historyStep >= history.length - 1}
              className="rounded-full h-9 w-9 p-0"
              data-testid="redo-button"
            >
              <Redo className="w-4 h-4" />
            </Button>
          </div>

          {/* Users */}
          <div className="relative group flex items-center gap-2 cursor-pointer glass px-3 py-1.5 rounded-full" data-testid="connected-users">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">{connectedUsers.length + 1}</span>
            <div className="absolute top-full mt-2 right-0 w-48 bg-white dark:bg-[#0A1929] border shadow-lg rounded-xl p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <div className="text-xs font-semibold text-muted-foreground mb-2 px-2">Connected Users</div>
              <div className="flex items-center gap-2 px-2 py-1.5 text-sm">
                <div className="w-2 h-2 rounded-full bg-green-500" />
                <span className="truncate">You ({user?.name || 'User'})</span>
              </div>
              {connectedUsers.map(u => (
                <div key={u.sid} className="flex items-center gap-2 px-2 py-1.5 text-sm border-t border-black/5 dark:border-white/5">
                  <div className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="truncate">{u.name} {u.user_id === user?.id ? "(Another session)" : ""}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Buttons */}
          <Button
            variant="ghost"
            size="sm"
            onClick={loadAISuggestions}
            disabled={loadingAI}
            className="rounded-full"
            data-testid="ai-suggestions-button"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {loadingAI ? 'Loading...' : 'AI Suggestions'}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCustomAI(true)}
            disabled={loadingCustomAI}
            className="rounded-full"
            data-testid="custom-ai-button"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            {loadingCustomAI ? 'Loading...' : 'Custom AI'}
          </Button>

          {/* Save Button */}
          <Button
            size="sm"
            onClick={handleManualSave}
            disabled={saving}
            className="rounded-full"
            data-testid="save-board-button"
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>

          {/* Share */}
          <Button
            size="sm"
            onClick={() => setShowShareDialog(true)}
            className="rounded-full bg-orange-500 hover:bg-orange-600"
            data-testid="share-button"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            className="rounded-full h-9 w-9 p-0"
            title="Download Image"
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative bg-white dark:bg-slate-950" data-testid="canvas-container">
        {/* Background Pattern */}
        {bgType !== 'none' && (
          <div 
            className="absolute inset-0 pointer-events-none opacity-[0.4] dark:opacity-[0.1]"
            style={{
              backgroundImage: bgType === 'dots' 
                ? 'radial-gradient(#64748b 0.5px, transparent 0.5px)' 
                : 'linear-gradient(#e2e8f0 1px, transparent 1px), linear-gradient(90deg, #e2e8f0 1px, transparent 1px)',
              backgroundSize: bgType === 'dots' ? '20px 20px' : '40px 40px'
            }}
          />
        )}
        <Stage
          ref={stageRef}
          width={window.innerWidth}
          height={window.innerHeight - 120}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
          style={{ cursor: selectedTool === TOOLS.SELECT ? 'default' : 'crosshair', touchAction: 'none' }}
          data-testid="konva-stage"
        >
          <Layer ref={layerRef}>
            {objects.map(obj => renderObject(obj))}
            {currentShape && renderObject(currentShape)}
            {selectedTool === TOOLS.SELECT && <Transformer ref={transformerRef} />}
          </Layer>
        </Stage>

        {/* Cursors */}
        {Object.entries(cursors).map(([sid, cursor], idx) => (
          <div
            key={sid}
            style={{
              position: 'absolute',
              left: cursor.x,
              top: cursor.y,
              pointerEvents: 'none',
              zIndex: 1000
            }}
          >
            <div
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: CURSOR_COLORS[idx % CURSOR_COLORS.length],
                border: '2px solid white',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
              }}
            />
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-50" data-testid="toolbar">
        <div className="glass rounded-full px-4 py-3 flex items-center gap-2">
          <Button
            variant={selectedTool === TOOLS.SELECT ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSelectedTool(TOOLS.SELECT)}
            className="rounded-full h-10 w-10 p-0"
            data-testid="tool-select"
          >
            <Hand className="w-5 h-5" />
          </Button>
          <Button
            variant={selectedTool === TOOLS.PEN ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSelectedTool(TOOLS.PEN)}
            className="rounded-full h-10 w-10 p-0"
            data-testid="tool-pen"
          >
            <Pencil className="w-5 h-5" />
          </Button>
          <Button
            variant={selectedTool === TOOLS.RECTANGLE ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSelectedTool(TOOLS.RECTANGLE)}
            className="rounded-full h-10 w-10 p-0"
            data-testid="tool-rectangle"
          >
            <Square className="w-5 h-5" />
          </Button>
          <Button
            variant={selectedTool === TOOLS.CIRCLE ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSelectedTool(TOOLS.CIRCLE)}
            className="rounded-full h-10 w-10 p-0"
            data-testid="tool-circle"
          >
            <CircleIcon className="w-5 h-5" />
          </Button>
          <Button
            variant={selectedTool === TOOLS.TRIANGLE ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSelectedTool(TOOLS.TRIANGLE)}
            className="rounded-full h-10 w-10 p-0"
            title="Triangle"
          >
            <Triangle className="w-5 h-5" />
          </Button>
          <Button
            variant={selectedTool === TOOLS.ARROW ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSelectedTool(TOOLS.ARROW)}
            className="rounded-full h-10 w-10 p-0"
            data-testid="tool-arrow"
          >
            <ArrowRight className="w-5 h-5" />
          </Button>
          <Button
            variant={selectedTool === TOOLS.TEXT ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSelectedTool(TOOLS.TEXT)}
            className="rounded-full h-10 w-10 p-0"
            data-testid="tool-text"
          >
            <Type className="w-5 h-5" />
          </Button>
          <Button
            variant={selectedTool === TOOLS.STICKY ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSelectedTool(TOOLS.STICKY)}
            className="rounded-full h-10 w-10 p-0"
            title="Sticky Note"
          >
            <StickyNote className="w-5 h-5" />
          </Button>
          <div className="w-px h-6 bg-border mx-1" />
          <Button
            variant={selectedTool === TOOLS.ERASER ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setSelectedTool(TOOLS.ERASER)}
            className="rounded-full h-10 w-10 p-0"
            data-testid="tool-eraser"
          >
            <Eraser className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* AI Suggestions Panel */}
      {showAI && (
        <div className="absolute right-6 top-20 w-80 glass rounded-2xl p-6 z-40 animate-fade-in" data-testid="ai-panel">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#9D00FF]" />
              AI Suggestions
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAI(false)}
              className="rounded-full h-8 w-8 p-0"
              data-testid="close-ai-panel"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-3">
            {aiSuggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No suggestions available</p>
            ) : (
              aiSuggestions.map(suggestion => (
                <div
                  key={suggestion.id}
                  className="p-4 rounded-xl bg-white/50 hover:bg-white/80 transition-colors"
                  data-testid={`ai-suggestion-${suggestion.type}`}
                >
                  <h4 className="font-medium text-sm mb-1">{suggestion.title}</h4>
                  <p className="text-xs text-muted-foreground mb-3">{suggestion.description}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="rounded-full flex-1 h-8"
                      onClick={() => handleAcceptSuggestion(suggestion)}
                      data-testid="accept-suggestion"
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full flex-1 h-8"
                      onClick={() => handleDismissSuggestion(suggestion.id)}
                      data-testid="reject-suggestion"
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Custom AI Panel */}
      {showCustomAI && (
        <div className="absolute right-6 top-20 w-80 glass rounded-2xl p-6 z-40 animate-fade-in" data-testid="custom-ai-panel">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#9D00FF]" />
              Custom AI
            </h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowCustomAI(false)}
              className="rounded-full h-8 w-8 p-0"
              data-testid="close-custom-ai-panel"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Textarea
                placeholder="Describe what you want the AI to suggest"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                className="min-h-[80px]"
                data-testid="custom-ai-prompt"
              />
              <Button
                size="sm"
                className="rounded-full w-full"
                onClick={handleCustomPrompt}
                disabled={loadingCustomAI}
                data-testid="run-custom-prompt"
              >
                {loadingCustomAI ? 'Running...' : 'Run Custom Prompt'}
              </Button>
            </div>

            {customSuggestions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No suggestions available</p>
            ) : (
              customSuggestions.map(suggestion => (
                <div
                  key={suggestion.id}
                  className="p-4 rounded-xl bg-white/50 hover:bg-white/80 transition-colors"
                  data-testid={`custom-suggestion-${suggestion.type}`}
                >
                  <h4 className="font-medium text-sm mb-1">{suggestion.title}</h4>
                  <p className="text-xs text-muted-foreground mb-3">{suggestion.description}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="rounded-full flex-1 h-8"
                      onClick={() => handleAcceptSuggestion(suggestion)}
                      data-testid="accept-custom-suggestion"
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="rounded-full flex-1 h-8"
                      onClick={() => {
                        setCustomSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
                        toast.info('Suggestion dismissed');
                      }}
                      data-testid="reject-custom-suggestion"
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Share Dialog */}
      {showShareDialog && board && (
        <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Share This Board</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Copy this link to share your board with others:
              </p>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={`${window.location.origin}/board/share/${board.share_token}`}
                  className="flex-1 text-sm"
                  onClick={(e) => e.target.select()}
                />
                <Button
                  onClick={copyShareLink}
                  variant="default"
                  size="sm"
                >
                  Copy
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Anyone with this link can view and edit this board in real-time.
              </p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
