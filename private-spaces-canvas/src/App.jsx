import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { Stage, Layer, Rect, Circle, Star } from 'react-konva';
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
const adjectives = ['Happy', 'Swift', 'Clever', 'Brave', 'Calm', 'Witty', 'Bold', 'Wise', 'Kind', 'Cool'];
const animals = ['Panda', 'Fox', 'Owl', 'Tiger', 'Bear', 'Wolf', 'Eagle', 'Dolphin', 'Koala', 'Lynx'];

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
  const [cursors, setCursors] = useState({}); // { oderId: { id, nickname, color, x, y } }
  const [selectedShapeId, setSelectedShapeId] = useState(null);
  const wsRef = useRef(null);

  const lastShapeUpdateRef = useRef(0);
  const SHAPE_THROTTLE_MS = 100; 

  // Generate user identity once on mount
  const userRef = useRef({
    id: uuidv4(),
    nickname: generateNickname(),
    color: generateUserColor(),
  });

  // Save private shapes to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(PRIVATE_SHAPES_KEY, JSON.stringify(privateShapes));
  }, [privateShapes]);

  useEffect(() => {
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
          // Initialize cursors from existing users
          if (data.users) {
            const initialCursors = {};
            data.users.forEach(user => {
              initialCursors[user.id] = user;
            });
            setCursors(initialCursors);
          }
          break;

        case 'USER_JOINED':
          setCursors(prev => ({
            ...prev,
            [data.user.id]: data.user,
          }));
          break;

        case 'USER_LEFT':
          setCursors(prev => {
            const next = { ...prev };
            delete next[data.userId];
            return next;
          });
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
  }, []);

  const sendMessage = (data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  };

  const handleClick = (e) => {
    if (e.target !== e.target.getStage()) return;

    setSelectedShapeId(null);

    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();

    const newShape = {
      id: uuidv4(),
      x: pos.x,
      y: pos.y,
      type: selectedTool,
      fill: selectedColor,
      isPrivate: isPrivateMode,
      isLocked: false,
    };

    if (isPrivateMode) {
      setPrivateShapes(prev => [...prev, newShape]);
    } else {
      setShapes(prev => [...prev, newShape]);
      sendMessage({ type: 'ADD_SHAPE', shape: newShape });
    }
  };

  const handleDelete = (id, isPrivate) => {
    if (isPrivate) {
      setPrivateShapes(prev => prev.filter(s => s.id !== id));
    } else {
      setShapes(prev => prev.filter(s => s.id !== id));
      sendMessage({ type: 'DELETE_SHAPE', id });
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
    const updatedShape = {
      ...shape,
      x: e.target.x(),
      y: e.target.y(),
    };

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
    if (!shape.isPrivate) {
        sendMessage({ type: 'UNLOCK_REQUEST', shapeId: shape.id });
    }
  };

  const handleDragMove = (e, shape) => {
    const updatedShape = {
      ...shape,
      x: e.target.x(),
      y: e.target.y(),
    };

    if (shape.isPrivate) {
      setPrivateShapes(prev =>
        prev.map(s => s.id === shape.id ? updatedShape : s)
      );
    } else {
      setShapes(prev =>
        prev.map(s => s.id === shape.id ? updatedShape : s)
      );
      // sendMessage({ type: 'UPDATE_SHAPE', shape: updatedShape });
              // NEW: Throttle network updates
      const now = Date.now();
      if (now - lastShapeUpdateRef.current >= SHAPE_THROTTLE_MS) {
          lastShapeUpdateRef.current = now;
          sendMessage({ type: 'UPDATE_SHAPE', shape: updatedShape });
      }
    }
  };

  const handleDragStart = (e, shape) => {
    if (shape.isLocked && shape.lockedBy !== userRef.current.id) {
        e.target.stopDrag();
        return;
    }
    
    if (!shape.isPrivate) {
        sendMessage({ type: 'LOCK_REQUEST', shapeId: shape.id });
    }
  };

  const handlePrivateModeToggle = () => {
    if (!isPrivateMode) {
      setShowPrivateConfirmation(true);
    } else {
      const sharedShapes = privateShapes.map(s => ({ ...s, isPrivate: false }));
      setShapes(prev => [...prev, ...sharedShapes]);
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
  };

  const renderShape = (shape) => {
    const isLockedByOther = shape.isLocked && shape.lockedBy !== userRef.current.id;

    const props = {
      key: shape.id,
      x: shape.x,
      y: shape.y,
      fill: shape.fill,
      draggable: !isLockedByOther,
      onDragStart: (e) => handleDragStart(e, shape),
      //remember to delete later
      opacity: isLockedByOther ? 0.6 : 1,
      onDragMove: (e) => handleDragMove(e, shape),
      onDragEnd: (e) => handleDragEnd(e, shape),
      onClick: () => setSelectedShapeId(shape.id),
      onDblClick: () => setSelectedShapeId(shape.id),
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
      default:
        return null;
    }
  };

  // Combine shared and private shapes for rendering
  const allShapes = [...shapes, ...privateShapes];

  const tools = [
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
        <span>Click to add • Drag to move • Click shape to select • Delete when selected</span>
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
        className="canvas"
      >
        <Layer>
          {allShapes.map(renderShape)}
        </Layer>
      </Stage>

      {/* Other users' cursors */}
      {Object.values(cursors).map(cursor => (
        <div
          key={cursor.id}
          className="user-cursor"
          style={{
            left: cursor.x,
            top: cursor.y,
            '--cursor-color': cursor.color,
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill={cursor.color}
            style={{ filter: 'drop-shadow(1px 1px 1px rgba(0,0,0,0.3))' }}
          >
            <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87c.48 0 .72-.58.38-.92L6.35 2.85a.5.5 0 0 0-.85.36Z" />
          </svg>
          <span
            className="cursor-nickname"
            style={{ backgroundColor: cursor.color }}
          >
            {cursor.nickname}
          </span>
        </div>
      ))}

      {/* Delete button for selected shape */}
      {selectedShapeId && (() => {
        const selectedShape = allShapes.find(s => s.id === selectedShapeId);
        if (selectedShape) {
          const deleteButtonX = selectedShape.x + 50;
          const deleteButtonY = selectedShape.y - 40;
          return (
            <button
              className="shape-delete-button"
              style={{
                left: `${deleteButtonX}px`,
                top: `${deleteButtonY}px`,
              }}
              onClick={() => {
                handleDelete(selectedShapeId, selectedShape.isPrivate);
                setSelectedShapeId(null);
              }}
              title="Delete shape"
            >
              ×
            </button>
          );
        }
      })()}
    </div>
  );
}

export default App;
