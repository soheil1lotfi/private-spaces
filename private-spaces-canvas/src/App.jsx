import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { Stage, Layer, Rect, Circle, Star, Transformer  } from 'react-konva';
import { v4 as uuidv4 } from 'uuid';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

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
  const [selectedShapeId, setSelectedShapeId] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);

  const lastShapeUpdateRef = useRef(0);
  const SHAPE_THROTTLE_MS = 100; 
  const dragStartPositions = useRef({}); // Store initial positions when drag starts

  const [selectedIds, setSelectedIds] = useState([]);
  const transformerRef = useRef(null);
  const shapeRefs = useRef({});

  // Generate user identity once on mount
  const userRef = useRef({
    id: uuidv4(),
    nickname: generateNickname(),
    color: generateUserColor(),
  });

  // Y.js refs
  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const shapesMapRef = useRef(null);
  const awarenessRef = useRef(null);

  useEffect(() => {
      if (transformerRef.current) {
          const nodes = selectedIds
              .map(id => shapeRefs.current[id])
              .filter(node => node); // Filter out undefined
          
          transformerRef.current.nodes(nodes);
          transformerRef.current.getLayer()?.batchDraw();
      }
  }, [selectedIds]);

  // Save private shapes to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem(PRIVATE_SHAPES_KEY, JSON.stringify(privateShapes));
  }, [privateShapes]);

  // Y.js initialization
  useEffect(() => {
    setOnlineUsers([userRef.current]);
    
    // Create Y.js document
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Connect to WebSocket provider
    const provider = new WebsocketProvider(
      `ws://${window.location.hostname}:3001`,
      'collaborative-whiteboard',
      ydoc
    );
    providerRef.current = provider;

    // Get shared data structures
    const shapesMap = ydoc.getMap('shapes');
    shapesMapRef.current = shapesMap;

    // Get awareness for ephemeral state
    const awareness = provider.awareness;
    awarenessRef.current = awareness;

    // Set local user state in awareness
    awareness.setLocalState({
      user: userRef.current,
      cursor: { x: 0, y: 0 },
      dragging: null,
      isPrivateMode: false,
    });

    // Connection status
    provider.on('status', (event) => {
      setIsConnected(event.status === 'connected');
      if (event.status === 'connected') {
        console.log('Connected to Y.js server');
      }
    });

    // Listen to shapes changes
    const updateShapes = () => {
      const shapesArray = [];
      shapesMap.forEach((shape) => {
        if (!shape.isPrivate) {
          shapesArray.push(shape);
        }
      });
      setShapes(shapesArray);
    };

    shapesMap.observe(updateShapes);
    updateShapes();

    // Listen to awareness changes
    const updateAwareness = () => {
      const states = awareness.getStates();
      const newCursors = {};
      const users = [];

      states.forEach((state) => {
        if (!state.user) return;

        // Cursors for other users
        if (state.user.id !== userRef.current.id && !state.isPrivateMode) {
          newCursors[state.user.id] = {
            ...state.user,
            x: state.cursor?.x || 0,
            y: state.cursor?.y || 0,
            isPrivateMode: state.isPrivateMode || false,
          };
        }

        // Track online users
        users.push({
          ...state.user,
          isPrivateMode: state.isPrivateMode || false,
        });
      });

      setCursors(newCursors);
      setOnlineUsers(users);
    };

    awareness.on('change', updateAwareness);
    updateAwareness();

    // Mouse move tracking
    const handleMouseMove = (e) => {
      const localState = awareness.getLocalState();
      awareness.setLocalState({
        ...localState,
        cursor: { x: e.clientX, y: e.clientY },
      });
    };

    window.addEventListener('mousemove', handleMouseMove);

    // Cleanup
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      shapesMap.unobserve(updateShapes);
      awareness.off('change', updateAwareness);
      provider.destroy();
      ydoc.destroy();
    };
  }, []);

  const handleClick = (e) => {
    // If clicking on empty canvas
    if (e.target === e.target.getStage()) {
      const stage = e.target.getStage();
      const pointerPosition = stage.getPointerPosition();

      const newShape = {
        id: uuidv4(),
        x: pointerPosition.x,
        y: pointerPosition.y,
        type: selectedTool,
        fill: selectedColor,
        isPrivate: isPrivateMode,
        isLocked: false,
      };

      if (isPrivateMode) {
        setPrivateShapes(prev => [...prev, newShape]);
      } else {
        shapesMapRef.current.set(newShape.id, newShape);
      }
      
      setSelectedIds([]);
      setSelectedShapeId(null);
    }
  };

  const handleShapeClick = (e, shape) => {
    e.cancelBubble = true;
    const id = shape.id;
    const isMultiSelect = e.evt.shiftKey || e.evt.ctrlKey || e.evt.metaKey;

    if (!isMultiSelect) {
      setSelectedIds([id]);
    } else {
      setSelectedIds(prev =>
        prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
      );
    }
    setSelectedShapeId(id);
  };

  const handleDragStart = (e, shape) => {
    const id = shape.id;
    
    // Check if someone else is dragging via awareness
    const states = awarenessRef.current.getStates();
    let isDraggingByOther = false;
    states.forEach((state) => {
      if (state.user && state.user.id !== userRef.current.id && state.dragging === id) {
        isDraggingByOther = true;
      }
    });

    if (isDraggingByOther) {
      e.currentTarget.stopDrag();
      return;
    }

    // Store initial positions for all selected shapes
    dragStartPositions.current = {};
    if (selectedIds.includes(id)) {
      selectedIds.forEach(selectedId => {
        const selectedShape = allShapes.find(s => s.id === selectedId);
        if (selectedShape) {
          dragStartPositions.current[selectedId] = { x: selectedShape.x, y: selectedShape.y };
        }
      });
    } else {
      dragStartPositions.current[id] = { x: shape.x, y: shape.y };
    }

    // Set dragging in awareness
    const localState = awarenessRef.current.getLocalState();
    awarenessRef.current.setLocalState({
      ...localState,
      dragging: id,
    });

    if (!selectedIds.includes(id)) {
      setSelectedIds([id]);
    }
  };

  const handleDragMove = (e, shape) => {
    const now = Date.now();
    if (now - lastShapeUpdateRef.current < SHAPE_THROTTLE_MS) {
      return;
    }
    lastShapeUpdateRef.current = now;

    const id = shape.id;
    const newX = e.target.x();
    const newY = e.target.y();

    // Get initial position for this shape
    const initialPos = dragStartPositions.current[id];
    if (!initialPos) return;

    // Calculate delta from initial position
    const deltaX = newX - initialPos.x;
    const deltaY = newY - initialPos.y;

    // If this shape is part of a multi-selection, move all selected shapes
    if (selectedIds.includes(id) && selectedIds.length > 1) {
      selectedIds.forEach(selectedId => {
        const initialSelectedPos = dragStartPositions.current[selectedId];
        if (!initialSelectedPos) return;

        const updatedX = initialSelectedPos.x + deltaX;
        const updatedY = initialSelectedPos.y + deltaY;

        const selectedShape = allShapes.find(s => s.id === selectedId);
        if (selectedShape) {
          if (selectedShape.isPrivate) {
            setPrivateShapes(prev =>
              prev.map(s => (s.id === selectedId ? { ...s, x: updatedX, y: updatedY } : s))
            );
          } else {
            const shapeData = shapesMapRef.current.get(selectedId);
            if (shapeData) {
              shapesMapRef.current.set(selectedId, { ...shapeData, x: updatedX, y: updatedY });
            }
          }

          // Update the Konva node position directly for smooth dragging
          if (shapeRefs.current[selectedId] && selectedId !== id) {
            shapeRefs.current[selectedId].position({ x: updatedX, y: updatedY });
          }
        }
      });
    } else {
      // Single shape drag
      if (shape.isPrivate) {
        setPrivateShapes(prev =>
          prev.map(s => (s.id === id ? { ...s, x: newX, y: newY } : s))
        );
      } else {
        const shapeData = shapesMapRef.current.get(id);
        if (shapeData) {
          shapesMapRef.current.set(id, { ...shapeData, x: newX, y: newY });
        }
      }
    }
  };

  const handleDragEnd = () => {
    // Clear stored positions
    dragStartPositions.current = {};
    
    // Release drag lock
    const localState = awarenessRef.current.getLocalState();
    awarenessRef.current.setLocalState({
      ...localState,
      dragging: null,
    });
  };

  const handleDelete = (id, isPrivate) => {
    if (isPrivate) {
      setPrivateShapes(prev => prev.filter(s => s.id !== id));
    } else {
      shapesMapRef.current.delete(id);
    }
    setSelectedIds(prev => prev.filter(i => i !== id));
    setSelectedShapeId(null);
  };

  const handleClearAll = () => {
    if (isPrivateMode) {
      setPrivateShapes([]);
    } else {
      shapesMapRef.current.clear();
    }
    setSelectedIds([]);
    setSelectedShapeId(null);
  };

  const handlePrivateModeToggle = () => {
    if (!isPrivateMode) {
      setShowPrivateConfirmation(true);
    } else {
      // Exiting private mode - share private shapes
      if (privateShapes.length > 0) {
        privateShapes.forEach(shape => {
          const sharedShape = { ...shape, isPrivate: false };
          shapesMapRef.current.set(shape.id, sharedShape);
        });
        setPrivateShapes([]);
      }

      setIsPrivateMode(false);
      const localState = awarenessRef.current.getLocalState();
      awarenessRef.current.setLocalState({
        ...localState,
        isPrivateMode: false,
      });
    }
  };

  const confirmPrivateMode = () => {
    setIsPrivateMode(true);
    const localState = awarenessRef.current.getLocalState();
    awarenessRef.current.setLocalState({
      ...localState,
      isPrivateMode: true,
    });
    setShowPrivateConfirmation(false);
  };

  const handleColorChange = (newColor) => {
    setSelectedColor(newColor);
    setShowColorPicker(false);
    
    // Change color of all selected shapes
    if (selectedIds.length > 0) {
      selectedIds.forEach(id => {
        const shape = allShapes.find(s => s.id === id);
        if (shape) {
          if (shape.isPrivate) {
            setPrivateShapes(prev =>
              prev.map(s => (s.id === id ? { ...s, fill: newColor } : s))
            );
          } else {
            const shapeData = shapesMapRef.current.get(id);
            if (shapeData) {
              shapesMapRef.current.set(id, { ...shapeData, fill: newColor });
            }
          }
        }
      });
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.length > 0) {
        e.preventDefault();
        selectedIds.forEach(id => {
          const shape = allShapes.find(s => s.id === id);
          if (shape) {
            handleDelete(id, shape.isPrivate);
          }
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds]);

  const renderShape = (shape) => {
    const isSelected = selectedIds.includes(shape.id);
    
    // Check if being dragged by another user
    let isDraggingByOther = false;
    let draggingUserColor = null;
    const states = awarenessRef.current?.getStates();
    if (states) {
      states.forEach((state) => {
        if (state.user && state.user.id !== userRef.current.id && state.dragging === shape.id) {
          isDraggingByOther = true;
          draggingUserColor = state.user.color;
        }
      });
    }

    const shapeProps = {
      key: shape.id,
      id: shape.id,
      x: shape.x,
      y: shape.y,
      fill: shape.fill,
      stroke: isDraggingByOther ? draggingUserColor : (isSelected ? '#0096FF' : '#000'),
      strokeWidth: isDraggingByOther ? 3 : (isSelected ? 2 : 1),
      dash: shape.isPrivate ? [8, 4] : undefined,
      draggable: !isDraggingByOther,
      onClick: (e) => handleShapeClick(e, shape),
      onTap: (e) => handleShapeClick(e, shape),
      onDragStart: (e) => handleDragStart(e, shape),
      onDragMove: (e) => handleDragMove(e, shape),
      onDragEnd: handleDragEnd,
      ref: (node) => {
        if (node) {
          shapeRefs.current[shape.id] = node;
        } else {
          delete shapeRefs.current[shape.id];
        }
      },
    };

    if (shape.type === 'circle') {
      return <Circle {...shapeProps} radius={50} />;
    } else if (shape.type === 'star') {
      return <Star {...shapeProps} numPoints={5} innerRadius={20} outerRadius={40} />;
    } else {
      return <Rect {...shapeProps} width={100} height={100} />;
    }
  };

  const allShapes = [...shapes, ...privateShapes];

  const tools = [
    { id: 'circle', label: 'Circle', icon: <CircleIcon /> },
    { id: 'rectangle', label: 'Rectangle', icon: <RectIcon /> },
    { id: 'star', label: 'Star', icon: <StarIcon /> },
  ];

  return (
    <div className="app">
      {/* Connection Status */}
      <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
        {isConnected ? '● Connected' : '○ Connecting...'}
      </div>

      {/* Toolbar */}
      <div className="toolbar">
        <div className="toolbar-section">
          <span className="section-label">Welcome, {userRef.current.nickname}!</span>
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
                    onClick={() => handleColorChange(color)}
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