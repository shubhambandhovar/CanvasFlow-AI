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
  Undo, Redo, Users, Share2, Sparkles, Download, Menu, X, ChevronLeft
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
  ERASER: 'eraser'
};

const CURSOR_COLORS = ['#FF0055', '#00E5FF', '#00FF99', '#FFD500', '#9D00FF'];

export const WhiteboardPage = () => {
  const { boardId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  
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
  
  // Share dialog
  const [showShareDialog, setShowShareDialog] = useState(false);
  
  const stageRef = useRef(null);
  const transformerRef = useRef(null);
  const layerRef = useRef(null);

  useEffect(() => {
    loadBoard();
    setupSocket();
    
    return () => {
      if (socket) socket.disconnect();
    };
  }, [boardId, loadBoard, setupSocket, socket]);

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

  const loadBoard = async () => {
    try {
      const response = await axios.get(`${API}/boards/${boardId}`);
      setBoard(response.data);
      setObjects(response.data.objects || []);
      setBoardVersion(response.data.version || 0);
      setHistory([response.data.objects || []]);
      setHistoryStep(0);
    } catch (error) {
      toast.error('Failed to load board');
      navigate('/dashboard');
    }
  };

  const setupSocket = () => {
    const newSocket = io(BACKEND_URL, {
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      newSocket.emit('join_board', {
        board_id: boardId,
        user_id: user.id,
        name: user.name
      });
    });

    newSocket.on('users_list', (data) => {
      setConnectedUsers(data.users);
    });

    newSocket.on('user_joined', (data) => {
      toast.success(`${data.name} joined the board`);
      setConnectedUsers(prev => [...prev, { user_id: data.user_id, name: data.name, cursor: { x: 0, y: 0 } }]);
    });

    newSocket.on('user_left', (data) => {
      toast.info(`${data.name} left the board`);
      setConnectedUsers(prev => prev.filter(u => u.user_id !== data.user_id));
      setCursors(prev => {
        const newCursors = { ...prev };
        delete newCursors[data.user_id];
        return newCursors;
      });
    });

    newSocket.on('cursor_moved', (data) => {
      setCursors(prev => ({
        ...prev,
        [data.user_id]: data.cursor
      }));
    });

    newSocket.on('board_updated', (data) => {
      // Apply remote updates without modifying local undo/redo history
      setObjects(data.objects);
      if (typeof data.version === 'number') {
        setBoardVersion(data.version);
      }
    });

    setSocket(newSocket);
  };

  const saveToHistory = (newObjects) => {
    const newHistory = history.slice(0, historyStep + 1);
    newHistory.push(newObjects);
    setHistory(newHistory);
    setHistoryStep(newHistory.length - 1);
  };

  const broadcastUpdate = (newObjects) => {
    if (socket) {
      const nextVersion = boardVersion + 1;
      setBoardVersion(nextVersion);
      socket.emit('board_update', {
        board_id: boardId,
        objects: newObjects,
        version: nextVersion
      });
    }
  };

  const commitObjects = (newObjects) => {
    setObjects(newObjects);
    saveToHistory(newObjects);
    broadcastUpdate(newObjects);
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
    const rect = {
      id: `rect-${Date.now()}`,
      type: TOOLS.RECTANGLE,
      data: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        stroke: '#18181B',
        strokeWidth: 2,
        fill: 'transparent'
      }
    };
    const newObjects = objects.filter(o => o.id !== target.id).concat(rect);
    commitObjects(newObjects);
    setSelectedId(rect.id);
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
    }

    setCurrentShape(newShape);
  };

  const handleMouseMove = (e) => {
    const stage = e.target.getStage();
    const pointerPos = stage.getPointerPosition();

    // Send cursor position to other users
    if (socket) {
      socket.emit('cursor_move', {
        board_id: boardId,
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
        board_id: boardId,
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
            centerX, centerY - height/2,
            centerX - width/2, centerY + height/2,
            centerX + width/2, centerY + height/2,
            centerX, centerY - height/2
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
        board_id: boardId,
        objects,
        context: trimmedPrompt
      });
      
      const results = response.data;
      
      if (results && results.length > 0 && results[0].action === 'create_shape') {
        // Execute shape creation commands
        let shapesCreated = 0;
        
        for (const command of results) {
          const created = executeShapeCommand(command);
          if (created) shapesCreated++;
        }
        
        if (shapesCreated > 0) {
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

  const executeShapeCommand = (command) => {
    const baseSize = 150;
    const spacing = 50;
    let centerX = window.innerWidth / 2;
    let centerY = (window.innerHeight - 120) / 2;
    
    // Calculate position based on reference
    if (command.position && command.position !== 'center') {
      let referenceObj = null;
      
      if (command.reference === 'last' || !command.reference) {
        referenceObj = objects.length > 0 ? objects[objects.length - 1] : null;
      } else {
        // Find by type
        const refType = command.reference;
        if (refType === 'triangle') {
          referenceObj = [...objects].reverse().find(obj => obj.type === TOOLS.PEN && obj.data.closed);
        } else if (refType === 'circle') {
          referenceObj = [...objects].reverse().find(obj => obj.type === TOOLS.CIRCLE);
        } else if (refType === 'rectangle' || refType === 'square') {
          referenceObj = [...objects].reverse().find(obj => obj.type === TOOLS.RECTANGLE);
        }
      }
      
      if (referenceObj) {
        if (command.position === 'below') {
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
        } else if (command.position === 'above') {
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
        } else if (command.position === 'right') {
          if (referenceObj.type === TOOLS.CIRCLE) {
            centerX = referenceObj.data.x + referenceObj.data.radius + baseSize / 2 + spacing;
            centerY = referenceObj.data.y;
          } else if (referenceObj.type === TOOLS.RECTANGLE) {
            centerX = referenceObj.data.x + referenceObj.data.width + baseSize / 2 + spacing;
            centerY = referenceObj.data.y + referenceObj.data.height / 2;
          }
        } else if (command.position === 'left') {
          if (referenceObj.type === TOOLS.CIRCLE) {
            centerX = referenceObj.data.x - referenceObj.data.radius - baseSize / 2 - spacing;
            centerY = referenceObj.data.y;
          } else if (referenceObj.type === TOOLS.RECTANGLE) {
            centerX = referenceObj.data.x - baseSize / 2 - spacing;
            centerY = referenceObj.data.y + referenceObj.data.height / 2;
          }
        }
      }
    }
    
    let baseShape = null;
    
    // Create base shape
    if (command.shape_type === 'triangle') {
      const height = baseSize;
      const width = baseSize;
      baseShape = {
        id: `shape-${Date.now()}`,
        type: TOOLS.PEN,
        data: {
          points: [
            centerX, centerY - height/2,
            centerX - width/2, centerY + height/2,
            centerX + width/2, centerY + height/2,
            centerX, centerY - height/2
          ],
          stroke: '#18181B',
          strokeWidth: 2,
          closed: true
        }
      };
    } else if (command.shape_type === 'circle') {
      baseShape = {
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
    } else if (command.shape_type === 'rectangle' || command.shape_type === 'square') {
      baseShape = {
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
    } else if (command.shape_type === 'arrow') {
      baseShape = {
        id: `shape-${Date.now()}`,
        type: TOOLS.ARROW,
        data: {
          points: [centerX - 100, centerY, centerX + 100, centerY],
          stroke: '#18181B',
          strokeWidth: 2,
          fill: '#18181B'
        }
      };
    } else if (command.shape_type === 'text') {
      baseShape = {
        id: `shape-${Date.now()}`,
        type: TOOLS.TEXT,
        data: {
          x: centerX - 50,
          y: centerY - 20,
          text: command.text_content || 'Text',
          fontSize: 24,
          fill: '#18181B'
        }
      };
    }
    
    if (!baseShape) return false;
    
    // Create multiple if quantity > 1
    const quantity = command.quantity || 1;
    const shapesToCreate = [];
    
    for (let i = 0; i < quantity; i++) {
      let offsetX = 0;
      
      if (quantity > 1) {
        const totalWidth = (baseSize + spacing) * quantity - spacing;
        offsetX = (i * (baseSize + spacing)) - totalWidth / 2 + baseSize / 2;
      }
      
      const shapeInstance = JSON.parse(JSON.stringify(baseShape));
      shapeInstance.id = `shape-${Date.now()}-${i}`;
      
      if (shapeInstance.type === TOOLS.CIRCLE) {
        shapeInstance.data.x += offsetX;
      } else if (shapeInstance.type === TOOLS.RECTANGLE) {
        shapeInstance.data.x += offsetX;
      } else if (shapeInstance.type === TOOLS.PEN && shapeInstance.data.points) {
        shapeInstance.data.points = shapeInstance.data.points.map((val, idx) => 
          idx % 2 === 0 ? val + offsetX : val
        );
      } else if (shapeInstance.type === TOOLS.ARROW) {
        shapeInstance.data.points = shapeInstance.data.points.map((val, idx) => 
          idx % 2 === 0 ? val + offsetX : val
        );
      } else if (shapeInstance.type === TOOLS.TEXT) {
        shapeInstance.data.x += offsetX;
      }
      
      shapesToCreate.push(shapeInstance);
    }
    
    const newObjects = [...objects, ...shapesToCreate];
    commitObjects(newObjects);
    setSelectedId(shapesToCreate[shapesToCreate.length - 1].id);
    return true;
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
    setShowShareDialog(true);
  };

  const copyShareLink = () => {
    const shareLink = `${window.location.origin}/board/share/${board.share_token}`;
    navigator.clipboard.writeText(shareLink);
    toast.success('Share link copied to clipboard!');
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
          <div className="flex items-center gap-2" data-testid="connected-users">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{connectedUsers.length + 1}</span>
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
            onClick={handleShare}
            className="rounded-full"
            data-testid="share-button"
          >
            <Share2 className="w-4 h-4 mr-2" />
            Share
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative" data-testid="canvas-container">
        <Stage
          ref={stageRef}
          width={window.innerWidth}
          height={window.innerHeight - 120}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{ cursor: selectedTool === TOOLS.SELECT ? 'default' : 'crosshair' }}
          data-testid="konva-stage"
        >
          <Layer ref={layerRef}>
            {objects.map(obj => renderObject(obj))}
            {currentShape && renderObject(currentShape)}
            {selectedTool === TOOLS.SELECT && <Transformer ref={transformerRef} />}
          </Layer>
        </Stage>

        {/* Cursors */}
        {Object.entries(cursors).map(([userId, cursor], idx) => (
          <div
            key={userId}
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
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Board</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Anyone with this link can view and collaborate on this board.
            </p>
            <div className="flex gap-2">
              <Input
                readOnly
                value={`${window.location.origin}/board/share/${board.share_token}`}
                className="flex-1"
                data-testid="share-link-input"
              />
              <Button onClick={copyShareLink} data-testid="copy-share-link">
                Copy Link
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
