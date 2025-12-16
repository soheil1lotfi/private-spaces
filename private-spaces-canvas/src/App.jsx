import React, { useState, useEffect, useRef, useCallback } from 'react';
import './App.css';
import { Stage, Layer, Rect, Circle, Star, Line, Transformer  } from 'react-konva';
import { v4 as uuidv4 } from 'uuid';

// Icon components 
const CircleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="10" />
  </svg>
);

const RectIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="2" />
  </svg>
);

const StarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="12,2 15,9 22,9 17,14 19,21 12,17 5,21 7,14 2,9 9,9" />
  </svg>
);

const PenIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M12 19l7-7 3 3-7 7-3-3z" />
    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" />
    <path d="M2 2l7.586 7.586" />
    <circle cx="11" cy="11" r="2" />
  </svg>
);

const TrashIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3,6 5,6 21,6" />
    <path d="M19,6v14a2,2 0 0,1-2,2H7a2,2 0 0,1-2-2V6m3,0V4a2,2 0 0,1,2-2h4a2,2 0 0,1,2,2v2" />
  </svg>
);

const LockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7,11V7a5,5 0 0,1,10,0v4" />
  </svg>
);

const UnlockIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7,11V7a5,5 0 0,1,9.9-1" />
  </svg>
);

// Predefined color palette
const colorPalette = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
];

// Cursor colors for users
const cursorColors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#FF8C42', '#A855F7',
  '#EC4899', '#10B981', '#F59E0B', '#6366F1', '#84CC16',
];

// Random nickname generator
const adjectives = ['Happy', 'Swift', 'Clever', 'Brave', 'Calm', 'Witty', 'Bold', 'Wise', 'Kind', 'Cool', 'Bright', 'Jolly'];
const animals = ['Panda', 'Fox', 'Owl', 'Tiger', 'Bear', 'Wolf', 'Eagle', 'Dolphin', 'Koala', 'Lynx', 'Rabbit', 'Hawk', 'Otter'];

// Generating some randome names??????
const generateNickname = () => {
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  return `${adj}${animal}`;
};

const generateUserColor = () => {
  return cursorColors[Math.floor(Math.random() * cursorColors.length)];
};

// localStorage key for private shapes
const PRIVATE_SHAPES_KEY = 'private-spaces-private-shapes';

function App() {
  const [shapes, setShapes] = useState([]);
  const [privateShapes, setPrivateShapes] = useState(() => {
    // Load private shapes from localStorage on initial render
    const saved = localStorage.getItem(PRIVATE_SHAPES_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedTool, setSelectedTool] = useState('circle');
  const [selectedColor, setSelectedColor] = useState('#4ECDC4');
  const [isConnected, setIsConnected] = useState(false);
  const [isPrivateMode, setIsPrivateMode] = useState(false);
  const [showPrivateBanner, setShowPrivateBanner] = useState(true);
  const [showPrivateConfirmation, setShowPrivateConfirmation] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [cursors, setCursors] = useState({}); // { userId: { id, nickname, color, x, y } }
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentLine, setCurrentLine] = useState(null);
  const [selectionBox, setSelectionBox] = useState(null); // { x1, y1, x2, y2 }
  const [isSelectingBox, setIsSelectingBox] = useState(false);
  const [contextMenu, setContextMenu] = useState(null); // { x, y }
  const wsRef = useRef(null);

  const lastShapeUpdateRef = useRef(0);
  const SHAPE_THROTTLE_MS = 100; 

const [selectedIds, setSelectedIds] = useState([]);
const transformerRef = useRef(null);
const shapeRefs = useRef({});

  // Generate user identity once on mount
  const userRef = useRef({
    id: uuidv4(),
    nickname: generateNickname(),
    color: generateUserColor(),
  });

  useEffect(() => {
      if (transformerRef.current) {
          const nodes = selectedIds
              .map(id => shapeRefs.current[id])
              .filter(node => node); // Filter out undefined

          transformerRef.current.nodes(nodes);
          transformerRef.current.getLayer()?.batchDraw();
      }
  }, [selectedIds]);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => {
      if (contextMenu) {
        setContextMenu(null);
      }
    };

    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [contextMenu]);

  // Save private shapes to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(PRIVATE_SHAPES_KEY, JSON.stringify(privateShapes));
  }, [privateShapes]);

  useEffect(() => {
    setOnlineUsers([userRef.current]);
    const ws = new WebSocket('ws://localhost:3001');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to server');
      setIsConnected(true);
      // Send user identity to server
      ws.send(JSON.stringify({
        type: 'USER_JOIN',
        user: userRef.current,
      }));
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case 'INIT':
          setShapes(data.shapes);
          // Initialize cursors and online users from existing users
          if (data.users) {
            const initialCursors = {};
            data.users.forEach(user => {
              initialCursors[user.id] = user;
            });
            setCursors(initialCursors);
            
            // Ensure current user is in the list
            const users = [...data.users];
            if (!users.find(u => u.id === userRef.current.id)) {
              users.push(userRef.current);
            }
            setOnlineUsers(users);
          }

          break;

        case 'USER_JOINED':
          setCursors(prev => ({
            ...prev,
            [data.user.id]: data.user,
          }));
          setOnlineUsers(prev => {
            if (prev.find(u => u.id === data.user.id)) return prev;
            return [...prev, data.user];
          });
          break;

        case 'USER_LEFT':
          setCursors(prev => {
            const next = { ...prev };
            delete next[data.userId];
            return next;
          });
          setOnlineUsers(prev => prev.filter(u => u.id !== data.userId));
          break;

        case 'CURSOR_UPDATE':
          setCursors(prev => ({
            ...prev,
            [data.userId]: {
              ...prev[data.userId],
              x: data.x,
              y: data.y,
            },
          }));
          break;

        case 'SHAPE_ADDED':
          setShapes(prev => {
            if (prev.find(s => s.id === data.shape.id)) return prev;
            return [...prev, data.shape];
          });
          break;

        case 'SHAPE_UPDATED':
          setShapes(prev =>
            prev.map(s => s.id === data.shape.id ? data.shape : s)
          );
          break;

        case 'SHAPE_DELETED':
          setShapes(prev => prev.filter(s => s.id !== data.id));
          break;

        case 'ALL_CLEARED':
          setShapes([]);
          break;

        case 'PRIVATE_MODE_CHANGED':
          // Update online users to reflect private mode status
          setOnlineUsers(prev => {
            const updated = prev.map(u => u.id === data.userId ? { ...u, isPrivateMode: data.isPrivateMode } : u);
            
            // If user left private mode, restore their cursor
            if (!data.isPrivateMode) {
              const user = updated.find(u => u.id === data.userId);
              if (user) {
                setCursors(prevCursors => ({
                  ...prevCursors,
                  [user.id]: user,
                }));
              }
            }
            
            return updated;
          });
          
          // If user entered private mode, remove their cursor
          if (data.isPrivateMode) {
            setCursors(prev => {
              const next = { ...prev };
              delete next[data.userId];
              return next;
            });
          }
          break;
      }
    };

    ws.onclose = () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    };

    return () => ws.close();
  }, []);

  // Track mouse movement and send cursor updates (throttled)
  useEffect(() => {
    let lastSent = 0;

    const handleMouseMove = (e) => {
      // Don't send cursor position if in private mode
      if (isPrivateMode) return;

      const now = Date.now();
      if (now - lastSent < SHAPE_THROTTLE_MS
        

      ) return;
      lastSent = now;

      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'CURSOR_MOVE',
          x: e.clientX,
          y: e.clientY,
        }));
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isPrivateMode]);

  const sendMessage = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  // Track previous color to only update when color actually changes
  const prevColorRef = useRef(selectedColor);
  
  // Update color of selected shapes when color changes
  useEffect(() => {
    // Skip if no shapes are selected
    if (selectedIds.length === 0) {
      prevColorRef.current = selectedColor;
      return;
    }

    // Skip if color hasn't changed
    if (prevColorRef.current === selectedColor) {
      return;
    }

    const allShapes = [...shapes, ...privateShapes];
    const shapesToUpdate = allShapes.filter(s => selectedIds.includes(s.id));

    if (shapesToUpdate.length === 0) {
      prevColorRef.current = selectedColor;
      return;
    }

    shapesToUpdate.forEach(shape => {
      const updatedShape = { ...shape, fill: selectedColor };
      
      if (shape.isPrivate) {
        setPrivateShapes(prev =>
          prev.map(s => s.id === shape.id ? updatedShape : s)
        );
      } else {
        setShapes(prev =>
          prev.map(s => s.id === shape.id ? updatedShape : s)
        );
        sendMessage({ type: 'UPDATE_SHAPE', shape: updatedShape });
      }
    });

    prevColorRef.current = selectedColor;
  }, [selectedColor, selectedIds, shapes, privateShapes, sendMessage]);

  const handleClick = () => {
      // Click handling is now done in handleMouseUp for better drag detection
      // This is kept for shape onClick events only
  };

  // Delete all selected shapes (for context menu)
  const handleDeleteSelected = () => {
    const allShapesLocal = [...shapes, ...privateShapes];

    selectedIds.forEach(id => {
      const shape = allShapesLocal.find(s => s.id === id);
      if (shape) {
        if (shape.isPrivate) {
          setPrivateShapes(prev => prev.filter(s => s.id !== id));
        } else {
          setShapes(prev => prev.filter(s => s.id !== id));
          sendMessage({ type: 'DELETE_SHAPE', id });
        }
      }
    });

    setSelectedIds([]);
    setContextMenu(null);
  };

  // Handle right-click context menu
  const handleContextMenu = (e) => {
    e.evt.preventDefault();

    if (selectedIds.length > 0) {
      setContextMenu({
        x: e.evt.clientX,
        y: e.evt.clientY,
      });
    }
  };

  const handleClearAll = () => {
    if (isPrivateMode) {
      // In private mode, only clear private shapes
      setPrivateShapes([]);
    } else {
      // In public mode, clear everything
      if (shapes.length > 0) {
        setShapes([]);
        sendMessage({ type: 'CLEAR_ALL' });
      }
      if (privateShapes.length > 0) {
        setPrivateShapes([]);
      }
    }
  };

  const handleDragEnd = (e, shape) => {
    const node = e.target;

    if (shape.isPrivate) {
        setPrivateShapes(prev =>
            prev.map(s => s.id === shape.id 
                ? { ...s, x: node.x(), y: node.y() } 
                : s
            )
        );
    } else {
        // Update local state for all selected shapes
        const idsToUpdate = selectedIds.includes(shape.id) ? selectedIds : [shape.id];
        setShapes(prev => prev.map(s => {
            if (idsToUpdate.includes(s.id)) {
                const ref = shapeRefs.current[s.id];
                return ref ? { ...s, x: ref.x(), y: ref.y() } : s;
            }
            return s;
        }));

        if (selectedIds.includes(shape.id)) {
            selectedIds.forEach(id => {
                const s = shapes.find(sh => sh.id === id);
                const ref = shapeRefs.current[id];
                if (s && ref) {
                    const updatedShape = { ...s, x: ref.x(), y: ref.y() };
                    sendMessage({ type: 'UPDATE_SHAPE', shape: updatedShape });
                }
            });

            // Unlock all selected shapes
            sendMessage({ 
                type: 'UNLOCK_GROUP_REQUEST', 
                shapeIds: selectedIds 
            });
        } else {
            sendMessage({ 
                type: 'UPDATE_SHAPE', 
                shape: { ...shape, x: node.x(), y: node.y() } 
            });
            sendMessage({ type: 'UNLOCK_REQUEST', shapeId: shape.id });
        }
    }
};

  const handleDragMove = (e, shape) => {
      const node = e.target;
      const dx = node.x() - shape.x;
      const dy = node.y() - shape.y;

      if (shape.isPrivate) {
          setPrivateShapes(prev =>
              prev.map(s => s.id === shape.id 
                  ? { ...s, x: node.x(), y: node.y() } 
                  : s
              )
          );
      } else {
          // Move all selected shapes together
          if (selectedIds.includes(shape.id) && selectedIds.length > 1) {
              // Direct node manipulation for performance
              selectedIds.forEach(id => {
                  if (id !== shape.id) {
                      const otherNode = shapeRefs.current[id];
                      const otherShape = shapes.find(s => s.id === id);
                      if (otherNode && otherShape) {
                          otherNode.x(otherShape.x + dx);
                          otherNode.y(otherShape.y + dy);
                      }
                  }
              });

              // Throttled network update for all selected shapes
              const now = Date.now();
              if (now - lastShapeUpdateRef.current >= SHAPE_THROTTLE_MS) {
                  lastShapeUpdateRef.current = now;
                  selectedIds.forEach(id => {
                      const s = shapes.find(sh => sh.id === id);
                      const n = shapeRefs.current[id];
                      if (s && n) {
                          const updatedShape = { ...s, x: n.x(), y: n.y() };
                          sendMessage({ type: 'UPDATE_SHAPE', shape: updatedShape });
                      }
                  });
              }
          } else {
              // Single shape movement
              const now = Date.now();
              if (now - lastShapeUpdateRef.current >= SHAPE_THROTTLE_MS) {
                  lastShapeUpdateRef.current = now;
                  sendMessage({ 
                      type: 'UPDATE_SHAPE', 
                      shape: { ...shape, x: node.x(), y: node.y() } 
                  });
              }
        }
    }
  };

  const handleDragStart = (e, shape) => {
    const isLockedByOther = shape.isLocked && shape.lockedBy !== userRef.current.id;

    if (isLockedByOther) {
        e.target.stopDrag();
        return;
    }

    // If dragging a selected shape, lock all selected shapes
    if (selectedIds.includes(shape.id)) {
        if (!shape.isPrivate) {
            sendMessage({ 
                type: 'LOCK_GROUP_REQUEST', 
                shapeIds: selectedIds 
            });
        }
    } else {
        // If dragging unselected shape, select it and lock only it
        setSelectedIds([shape.id]);
        if (!shape.isPrivate) {
            sendMessage({ type: 'LOCK_REQUEST', shapeId: shape.id });
        }
    }
  };
  
  const handlePrivateModeToggle = () => {
    if (!isPrivateMode) {
      setShowPrivateConfirmation(true);
    } else {
      const sharedShapes = privateShapes.map(s => ({ ...s, isPrivate: false }));
      setShapes(prev => [...prev, ...sharedShapes]);
      setIsPrivateMode(false);
      // Clear the cursor from other screens when leaving private mode
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'PRIVATE_MODE_CHANGED',
          isPrivateMode: false,
        }));
      }
      let tempShapes = privateShapes;
      setPrivateShapes([]);
      sharedShapes.forEach(shape => {
        sendMessage({ type: 'ADD_SHAPE', shape });
      });
      setIsPrivateMode(false);
    }
  };

  const confirmPrivateMode = () => {
    setIsPrivateMode(true);
    setShowPrivateBanner(true);
    setShowPrivateConfirmation(false);
    // Notify server that user entered private mode
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'PRIVATE_MODE_CHANGED',
        isPrivateMode: true,
      }));
    }
  };

  // Helper function to get bounding box of a shape
  const getShapeBounds = (shape) => {
    switch (shape.type) {
      case 'circle':
        return {
          x1: shape.x - 40,
          y1: shape.y - 40,
          x2: shape.x + 40,
          y2: shape.y + 40,
        };
      case 'rect':
        return {
          x1: shape.x,
          y1: shape.y,
          x2: shape.x + 80,
          y2: shape.y + 80,
        };
      case 'star':
        return {
          x1: shape.x - 40,
          y1: shape.y - 40,
          x2: shape.x + 40,
          y2: shape.y + 40,
        };
      case 'pen':
        if (!shape.points || shape.points.length < 2) return null;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < shape.points.length; i += 2) {
          minX = Math.min(minX, shape.points[i]);
          maxX = Math.max(maxX, shape.points[i]);
          minY = Math.min(minY, shape.points[i + 1]);
          maxY = Math.max(maxY, shape.points[i + 1]);
        }
        return { x1: minX, y1: minY, x2: maxX, y2: maxY };
      default:
        return null;
    }
  };

  // Check if two rectangles intersect
  const boxesIntersect = (box1, box2) => {
    if (!box1 || !box2) return false;
    return !(box1.x2 < box2.x1 || box1.x1 > box2.x2 || box1.y2 < box2.y1 || box1.y1 > box2.y2);
  };

  // Pen drawing and selection box handlers
  const handleMouseDown = (e) => {
    // Ignore right-click (button 2)
    if (e.evt.button === 2) return;

    // Only start selection/drawing if clicking on empty stage
    if (e.target !== e.target.getStage()) return;

    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();

    if (selectedTool === 'pen') {
      setIsDrawing(true);
      setCurrentLine({
        id: uuidv4(),
        type: 'pen',
        points: [pos.x, pos.y],
        fill: selectedColor,
        isPrivate: isPrivateMode,
        isLocked: false,
        lockedBy: null,
      });
    } else {
      // Start marquee selection
      setIsSelectingBox(true);
      setSelectionBox({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
    }
  };

  const handleMouseMove = (e) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();

    if (isDrawing && selectedTool === 'pen' && currentLine) {
      setCurrentLine(prev => ({
        ...prev,
        points: [...prev.points, pos.x, pos.y],
      }));
    } else if (isSelectingBox && selectionBox) {
      setSelectionBox(prev => ({
        ...prev,
        x2: pos.x,
        y2: pos.y,
      }));
    }
  };

  const handleMouseUp = () => {
    if (isDrawing && currentLine) {
      setIsDrawing(false);

      // Only save if we have more than just a starting point
      if (currentLine.points.length > 2) {
        if (isPrivateMode) {
          setPrivateShapes(prev => [...prev, currentLine]);
        } else {
          setShapes(prev => [...prev, currentLine]);
          sendMessage({ type: 'ADD_SHAPE', shape: currentLine });
        }
      }

      setCurrentLine(null);
    } else if (isSelectingBox && selectionBox) {
      // Check if it was just a click (small movement)
      const boxWidth = Math.abs(selectionBox.x2 - selectionBox.x1);
      const boxHeight = Math.abs(selectionBox.y2 - selectionBox.y1);

      if (boxWidth < 5 && boxHeight < 5) {
        // It was a click, not a drag
        if (selectedIds.length > 0) {
          // Deselect all if something is selected
          setSelectedIds([]);
        } else {
          // Create a new shape at click position
          const newShape = {
            id: uuidv4(),
            x: selectionBox.x1,
            y: selectionBox.y1,
            type: selectedTool,
            fill: selectedColor,
            isPrivate: isPrivateMode,
            isLocked: false,
            lockedBy: null,
          };

          if (isPrivateMode) {
            setPrivateShapes(prev => [...prev, newShape]);
          } else {
            setShapes(prev => [...prev, newShape]);
            sendMessage({ type: 'ADD_SHAPE', shape: newShape });
          }
        }
      } else {
        // It was a drag - select shapes inside the box
        const correctedBox = {
          x1: Math.min(selectionBox.x1, selectionBox.x2),
          y1: Math.min(selectionBox.y1, selectionBox.y2),
          x2: Math.max(selectionBox.x1, selectionBox.x2),
          y2: Math.max(selectionBox.y1, selectionBox.y2),
        };

        const allShapesLocal = [...shapes, ...privateShapes];
        const selectedShapeIds = allShapesLocal
          .filter(shape => {
            const shapeBounds = getShapeBounds(shape);
            return boxesIntersect(shapeBounds, correctedBox);
          })
          .map(shape => shape.id);

        setSelectedIds(selectedShapeIds);
      }

      setIsSelectingBox(false);
      setSelectionBox(null);
    }
  };

  const renderShape = (shape) => {
    const isLockedByOther = shape.isLocked && shape.lockedBy !== userRef.current.id;
    const isSelected = selectedIds.includes(shape.id); 

    const props = {
      key: shape.id,
      ref: (node) => {
        if (node) shapeRefs.current[shape.id] = node;
        else delete shapeRefs.current[shape.id];
      },
      x: shape.x,
      y: shape.y,
      fill: shape.fill,
      draggable: !isLockedByOther,
      onDragStart: (e) => handleDragStart(e, shape),
      opacity: isLockedByOther ? 0.6 : 1,
      onDragMove: (e) => handleDragMove(e, shape),
      onDragEnd: (e) => handleDragEnd(e, shape),
      onClick: (e) => {
            e.cancelBubble = true;
            // Ignore right-click
            if (e.evt.button === 2) return;
            if (isLockedByOther) return;

            if (e.evt.shiftKey) {
                // Shift+Click: Add/remove from selection
                setSelectedIds(prev =>
                    prev.includes(shape.id)
                        ? prev.filter(id => id !== shape.id)
                        : [...prev, shape.id]
                );
            } else {
                // regular click
                setSelectedIds([shape.id]);
            }
        },
      onContextMenu: (e) => {
            e.evt.preventDefault();
            e.cancelBubble = true;
            if (isLockedByOther) return;

            // If shape is already selected, keep current selection
            // If not, select just this shape
            if (!selectedIds.includes(shape.id)) {
                setSelectedIds([shape.id]);
            }

            // Show context menu
            setContextMenu({
                x: e.evt.clientX,
                y: e.evt.clientY,
            });
        },

      // Add dashed stroke for private shapes to visually distinguish them
      stroke: shape.isPrivate ? '#FF1493' : undefined,
      strokeWidth: shape.isPrivate ? 3 : 0,
      dash: shape.isPrivate ? [8, 4] : undefined,
    };

    switch (shape.type) {
      case 'circle':
        return <Circle {...props} radius={40} />;
      case 'rect':
        return <Rect {...props} width={80} height={80} />;
      case 'star':
        return <Star {...props} numPoints={5} innerRadius={20} outerRadius={40} />;
      case 'pen':
        return (
          <Line
            {...props}
            points={shape.points}
            stroke={shape.fill}
            strokeWidth={3}
            tension={0.5}
            lineCap="round"
            lineJoin="round"
            globalCompositeOperation="source-over"
          />
        );
      default:
        return null;
    }
  };

  // Combine shared and private shapes for rendering
  const allShapes = [...shapes, ...privateShapes];

  const tools = [
    { id: 'pen', icon: <PenIcon />, label: 'Pen' },
    { id: 'circle', icon: <CircleIcon />, label: 'Circle' },
    { id: 'rect', icon: <RectIcon />, label: 'Rectangle' },
    { id: 'star', icon: <StarIcon />, label: 'Star' },
  ];

  return (
    <div className="app-container">
      {/* Floating Toolbar */}
      <div className="toolbar">
        {/* Connection Status */}
        <div className="toolbar-section">
          <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            <span className="status-dot"></span>
            <span className="status-text">{isConnected ? 'Connected' : 'Disconnected'}</span>
          </div>
        </div>

        <div className="toolbar-divider"></div>

        {/* Shape Tools */}
        <div className="toolbar-section">
          <span className="section-label">Shapes</span>
          <div className="tool-group">
            {tools.map(tool => (
              <button
                key={tool.id}
                className={`tool-button ${selectedTool === tool.id ? 'active' : ''}`}
                onClick={() => setSelectedTool(tool.id)}
                title={tool.label}
              >
                {tool.icon}
              </button>
            ))}
          </div>
        </div>

        <div className="toolbar-divider"></div>

        {/* Color Picker */}
        <div className="toolbar-section">
          <span className="section-label">Color</span>
          <div className="color-picker-container">
            <button
              className="color-preview"
              style={{ backgroundColor: selectedColor }}
              onClick={() => setShowColorPicker(!showColorPicker)}
              title="Choose color"
            />
            {showColorPicker && (
              <div className="color-palette">
                {colorPalette.map(color => (
                  <button
                    key={color}
                    className={`color-swatch ${selectedColor === color ? 'active' : ''}`}
                    style={{ backgroundColor: color }}
                    onClick={() => {
                      setSelectedColor(color);
                      setShowColorPicker(false);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="toolbar-divider"></div>

        {/* Actions */}
        <div className="toolbar-section">
          <button
            className="action-button clear-button"
            onClick={handleClearAll}
            disabled={isPrivateMode ? privateShapes.length === 0 : allShapes.length === 0}
            title={isPrivateMode ? "Clear private shapes" : "Clear all shapes"}
          >
            <TrashIcon />
            <span>Clear</span>
          </button>
        </div>

        <div className="toolbar-divider"></div>

        {/* Private Mode */}
        <div className="toolbar-section">
          <button
            className={`action-button private-button ${isPrivateMode ? 'active' : ''}`}
            onClick={handlePrivateModeToggle}
            title={isPrivateMode ? 'Disable private mode' : 'Enable private mode'}
          >
            {isPrivateMode ? <UnlockIcon /> : <LockIcon />}
            <span>{isPrivateMode ? 'Share' : 'Go Private'}</span>
          </button>
        </div>
      </div>

      {/* Private Mode Banner - Red Border */}
      {isPrivateMode && (
        <>
          <div className="private-banner" />
          <div className="private-banner-label">
            <LockIcon />
            <span>Private Mode</span>
          </div>
        </>
      )}

      {/* Shape Counter */}
      <div className="shape-counter">
        <span>{allShapes.length} shape{allShapes.length !== 1 ? 's' : ''}{privateShapes.length > 0 ? ` (${privateShapes.length} private)` : ''}</span>
      </div>

      {/* Help Tooltip */}
      <div className="help-tooltip">
        <span>Click to add • Drag to select • Shift+Click multi-select • Right-click to delete</span>
      </div>

      {/* Private Mode Confirmation Modal */}
      {showPrivateConfirmation && (
        <div className="modal-overlay" onClick={() => setShowPrivateConfirmation(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-icon">
              <LockIcon />
            </div>
            <h3 className="modal-title">Enable Private Mode?</h3>
            <p className="modal-text">
              Your changes won't be shared with other collaborators while in private mode.
            </p>
            <div className="modal-actions">
              <button
                className="modal-button cancel"
                onClick={() => setShowPrivateConfirmation(false)}
              >
                Cancel
              </button>
              <button
                className="modal-button confirm"
                onClick={confirmPrivateMode}
              >
                Enable Private Mode
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Canvas */}
      <Stage
        width={window.innerWidth}
        height={window.innerHeight}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
        className="canvas"
        style={{ cursor: selectedTool === 'pen' ? 'crosshair' : 'default' }}
      >
        <Layer>
          {allShapes.map(renderShape)}
          {/* Render current line being drawn */}
          {currentLine && (
            <Line
              points={currentLine.points}
              stroke={currentLine.fill}
              strokeWidth={3}
              tension={0.5}
              lineCap="round"
              lineJoin="round"
              globalCompositeOperation="source-over"
            />
          )}
          {/* Render selection box while dragging */}
          {selectionBox && isSelectingBox && (
            <Rect
              x={Math.min(selectionBox.x1, selectionBox.x2)}
              y={Math.min(selectionBox.y1, selectionBox.y2)}
              width={Math.abs(selectionBox.x2 - selectionBox.x1)}
              height={Math.abs(selectionBox.y2 - selectionBox.y1)}
              fill="rgba(0, 150, 255, 0.1)"
              stroke="#0096FF"
              strokeWidth={1}
              dash={[4, 4]}
            />
          )}
          {/* Transformer for selection handle (visuals) */}
          <Transformer
              ref={transformerRef}
              resizeEnabled={false}
              rotateEnabled={false}
              borderStroke="#0096FF"
              borderStrokeWidth={2}
              anchorSize={8}
              anchorFill="#ffffff"
              anchorStroke="#0096FF"
              anchorCornerRadius={2}
          />
        </Layer>
      </Stage>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="context-menu-item delete"
            onClick={handleDeleteSelected}
          >
            <TrashIcon />
            <span>Delete {selectedIds.length > 1 ? `(${selectedIds.length})` : ''}</span>
          </button>
        </div>
      )}

      {/* Other users' cursors */}
      {Object.values(cursors).map(cursor => {
        // Don't show the current user's own cursor
        if (cursor.id === userRef.current.id) return null;
        
        return (
          <div
            key={cursor.id}
            className="user-cursor"
            style={{
              left: cursor.x,
              top: cursor.y,
              '--cursor-color': cursor.color,
            }}
          >
            <div className="cursor-plus" style={{ color: cursor.color }}>
              +
            </div>
            <span
              className="cursor-nickname"
              style={{ backgroundColor: cursor.color }}
            >
              {cursor.nickname}
            </span>
          </div>
        );
      })}

      {/* User Presence Panel */}
      <div className="user-presence-panel">
        <div className="presence-header">
          <span className="presence-title">Online ({onlineUsers.length})</span>
        </div>
        <div className="presence-list">
          {onlineUsers.map(user => (
            <div key={user.id} className={`presence-item ${user.isPrivateMode ? 'private-mode' : ''}`}>
              <div 
                className={`user-avatar ${user.isPrivateMode ? 'private-avatar' : ''}`}
                style={{ backgroundColor: user.color }}
                title={user.nickname}
              >
                {user.isPrivateMode ? '🔒' : user.nickname.charAt(0).toUpperCase()}
              </div>
              <span className="user-nickname">{user.nickname}</span>
              {user.id === userRef.current.id && <span className="user-label">(You)</span>}
              {user.isPrivateMode && <span className="user-label private">Private</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
