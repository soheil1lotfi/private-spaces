import React, { useState, useEffect, useRef, useCallback } from 'react';
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

// Helper to create a nested Y.Map for a shape (CRDT-friendly)
const createYMapShape = (shapeData) => {
  const yShape = new Y.Map();
  yShape.set('x', shapeData.x);
  yShape.set('y', shapeData.y);
  yShape.set('type', shapeData.type);
  yShape.set('fill', shapeData.fill);
  yShape.set('isPrivate', shapeData.isPrivate);
  yShape.set('isLocked', shapeData.isLocked);
  return yShape;
};

// Helper to convert Y.Map shape to plain object
const yMapToShape = (yShape, id) => {
  if (yShape instanceof Y.Map) {
    return {
      id,
      x: yShape.get('x'),
      y: yShape.get('y'),
      type: yShape.get('type'),
      fill: yShape.get('fill'),
      isPrivate: yShape.get('isPrivate'),
      isLocked: yShape.get('isLocked'),
    };
  }
  // Fallback for plain objects (backwards compatibility)
  return { ...yShape, id };
};

function App() {
  const [shapes, setShapes] = useState([]);
  const [privateShapes, setPrivateShapes] = useState(() => {
    const saved = localStorage.getItem(PRIVATE_SHAPES_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedTool, setSelectedTool] = useState('circle');
  const [selectedColor, setSelectedColor] = useState('#4ECDC4');
  const [isConnected, setIsConnected] = useState(false);
  const [isPrivateMode, setIsPrivateMode] = useState(false);
  const [showPrivateConfirmation, setShowPrivateConfirmation] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [cursors, setCursors] = useState({});
  const [selectedShapeId, setSelectedShapeId] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  
  // Window dimensions for responsive canvas
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const [selectedIds, setSelectedIds] = useState([]);
  const transformerRef = useRef(null);
  const shapeRefs = useRef({});

  // Y.js-First: Store initial positions for delta calculation
  const dragInitialPositions = useRef({});
  const THROTTLE_MS = 16; 

  // Refs for keyboard handler (avoid recreating on every state change)
  const selectedIdsRef = useRef(selectedIds);
  const shapesRef = useRef(shapes);
  const privateShapesRef = useRef(privateShapes);

  // User identity - use useState with lazy init to ensure stable identity
  const [currentUser] = useState(() => ({
    id: uuidv4(),
    nickname: generateNickname(),
    color: generateUserColor(),
  }));

  // Y.js refs
  const ydocRef = useRef(null);
  const providerRef = useRef(null);
  const shapesMapRef = useRef(null);
  const awarenessRef = useRef(null);
  const shapesObserverRef = useRef(null);

  // Keep refs in sync with state
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);

  useEffect(() => {
    shapesRef.current = shapes;
  }, [shapes]);

  useEffect(() => {
    privateShapesRef.current = privateShapes;
  }, [privateShapes]);

  // Window resize handler
  useEffect(() => {
    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Update transformer when selection changes
  useEffect(() => {
    if (transformerRef.current) {
      const nodes = selectedIds
        .map(id => shapeRefs.current[id])
        .filter(node => node);
      
      transformerRef.current.nodes(nodes);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedIds]);

  // Save private shapes to localStorage
  useEffect(() => {
    localStorage.setItem(PRIVATE_SHAPES_KEY, JSON.stringify(privateShapes));
  }, [privateShapes]);

  // Y.js initialization
  useEffect(() => {
    // Don't set initial users - let awareness populate it
    
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const provider = new WebsocketProvider(
      `ws://${window.location.hostname}:3001`,
      'collaborative-whiteboard',
      ydoc
    );
    providerRef.current = provider;

    const shapesMap = ydoc.getMap('shapes');
    shapesMapRef.current = shapesMap;

    const awareness = provider.awareness;
    awarenessRef.current = awareness;

    // Store current user in a local variable for cleanup
    const user = currentUser;
    
    awareness.setLocalState({
      user,
      cursor: { x: 0, y: 0 },
      isPrivateMode: false,
    });

    provider.on('status', (event) => {
      setIsConnected(event.status === 'connected');
      if (event.status === 'connected') {
        console.log('Connected to Y.js server');
      }
    });

    // Y.js Standard: Observer with proper event handling and stored reference
    const updateShapes = () => {
      const shapesArray = [];
      shapesMap.forEach((shape, id) => {
        const shapeObj = yMapToShape(shape, id);
        if (!shapeObj.isPrivate) {
          shapesArray.push(shapeObj);
        }
      });
      setShapes(shapesArray);
    };

    // Store observer reference for cleanup
    shapesObserverRef.current = updateShapes;
    shapesMap.observeDeep(updateShapes);
    updateShapes(); // Initial load

    // Awareness changes
    const updateAwareness = () => {
      const states = awareness.getStates();
      const newCursors = {};
      const users = [];

      states.forEach((state) => {
        if (!state.user) return;

        if (state.user.id !== user.id && !state.isPrivateMode) {
          newCursors[state.user.id] = {
            ...state.user,
            x: state.cursor?.x || 0,
            y: state.cursor?.y || 0,
            isPrivateMode: state.isPrivateMode || false,
          };
        }

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

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      // Y.js Standard: Use stored observer reference for cleanup
      if (shapesObserverRef.current) {
        shapesMap.unobserveDeep(shapesObserverRef.current);
        shapesObserverRef.current = null;
      }
      awareness.off('change', updateAwareness);
      provider.destroy();
      ydoc.destroy();
    };
  }, [currentUser]);

  // Delete handler as callback for keyboard handler
  const handleDelete = useCallback((id, isPrivate) => {
    if (isPrivate) {
      setPrivateShapes(prev => prev.filter(s => s.id !== id));
    } else {
      // Y.js Standard: Use transaction
      ydocRef.current.transact(() => {
        shapesMapRef.current.delete(id);
      });
    }
    setSelectedIds(prev => prev.filter(i => i !== id));
    setSelectedShapeId(null);
  }, []);

  // Keyboard shortcuts - using refs to avoid recreation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdsRef.current.length > 0) {
        e.preventDefault();
        const allShapesCurrent = [...shapesRef.current, ...privateShapesRef.current];
        selectedIdsRef.current.forEach(id => {
          const shape = allShapesCurrent.find(s => s.id === id);
          if (shape) {
            handleDelete(id, shape.isPrivate);
          }
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDelete]); // Only depends on handleDelete which is memoized

  const handleClick = (e) => {
    if (e.target === e.target.getStage()) {
      if (selectedIds.length > 0) {
        setSelectedIds([]);
        return;
      }
      const stage = e.target.getStage();
      const pointerPosition = stage.getPointerPosition();

      const newShapeData = {
        id: uuidv4(),
        x: pointerPosition.x,
        y: pointerPosition.y,
        type: selectedTool,
        fill: selectedColor,
        isPrivate: isPrivateMode,
        isLocked: false,
      };

      if (isPrivateMode) {
        setPrivateShapes(prev => [...prev, newShapeData]);
      } else {
        // Y.js Standard: Use nested Y.Map for CRDT-friendly updates
        ydocRef.current.transact(() => {
          const yShape = createYMapShape(newShapeData);
          shapesMapRef.current.set(newShapeData.id, yShape);
        });
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
    
    // Determine which shapes will be dragged
    const shapesToDrag = selectedIds.includes(id) && selectedIds.length > 1 
      ? selectedIds 
      : [id];

    // Store initial positions for all shapes that will be dragged
    dragInitialPositions.current = {};
    const allShapesCurrent = [...shapes, ...privateShapes];
    shapesToDrag.forEach(shapeId => {
      const selectedShape = allShapesCurrent.find(s => s.id === shapeId);
      if (selectedShape) {
        dragInitialPositions.current[shapeId] = { 
          x: selectedShape.x, 
          y: selectedShape.y 
        };
      }
    });

    if (!selectedIds.includes(id)) {
      setSelectedIds([id]);
    }
  };

  // Throttle helper using requestAnimationFrame timing
  const throttledUpdate = useRef(null);
  
  // Y.js-First: Only update Y.js, let observer handle React/Konva updates
  const handleDragMove = (e, shape) => {
    // Skip if we're waiting for next frame
    if (throttledUpdate.current) {
      return;
    }
    
    // Set up throttle for next THROTTLE_MS
    throttledUpdate.current = setTimeout(() => {
      throttledUpdate.current = null;
    }, THROTTLE_MS);

    const id = shape.id;
    const node = e.target;
    const newX = node.x();
    const newY = node.y();

    // Get initial position
    const initialPos = dragInitialPositions.current[id];
    if (!initialPos) return;

    // Calculate delta from initial position
    const deltaX = newX - initialPos.x;
    const deltaY = newY - initialPos.y;

    // Use refs for current state to avoid stale closures
    const currentSelectedIds = selectedIdsRef.current;

    // Multi-select: update all selected shapes
    if (currentSelectedIds.includes(id) && currentSelectedIds.length > 1) {
      // Update Y.js shapes with nested Y.Map (CRDT-friendly per-property updates)
      ydocRef.current.transact(() => {
        currentSelectedIds.forEach(selectedId => {
          const initialSelectedPos = dragInitialPositions.current[selectedId];
          if (!initialSelectedPos) return;

          const updatedX = initialSelectedPos.x + deltaX;
          const updatedY = initialSelectedPos.y + deltaY;

          const yShape = shapesMapRef.current.get(selectedId);
          if (!yShape) return;
          
          // Check if it's a Y.Map (nested) or plain object
          if (yShape instanceof Y.Map) {
            if (yShape.get('isPrivate')) return;
            // CRDT-friendly: update individual properties
            yShape.set('x', updatedX);
            yShape.set('y', updatedY);
          } else {
            // Fallback for plain objects
            if (yShape.isPrivate) return;
            shapesMapRef.current.set(selectedId, { 
              ...yShape, 
              x: updatedX, 
              y: updatedY 
            });
          }

          // Update Konva node directly for smooth multi-select drag
          const konvaNode = shapeRefs.current[selectedId];
          if (konvaNode && selectedId !== id) {
            konvaNode.x(updatedX);
            konvaNode.y(updatedY);
          }
        });
      });
      
      // Handle private shapes separately (outside Y.js)
      const allShapesCurrent = [...shapesRef.current, ...privateShapesRef.current];
      const privateIds = currentSelectedIds.filter(selectedId => {
        const selectedShape = allShapesCurrent.find(s => s.id === selectedId);
        return selectedShape && selectedShape.isPrivate;
      });
      
      if (privateIds.length > 0) {
        setPrivateShapes(prev =>
          prev.map(s => {
            if (privateIds.includes(s.id)) {
              const initPos = dragInitialPositions.current[s.id];
              if (initPos) {
                const newPos = { ...s, x: initPos.x + deltaX, y: initPos.y + deltaY };
                // Update Konva node directly for smooth drag
                const konvaNode = shapeRefs.current[s.id];
                if (konvaNode && s.id !== id) {
                  konvaNode.x(newPos.x);
                  konvaNode.y(newPos.y);
                }
                return newPos;
              }
            }
            return s;
          })
        );
      }
    } else {
      // Single shape: update Y.js only
      if (shape.isPrivate) {
        setPrivateShapes(prev =>
          prev.map(s => (s.id === id ? { ...s, x: newX, y: newY } : s))
        );
      } else {
        // Y.js Standard: Use nested Y.Map for per-property CRDT updates
        ydocRef.current.transact(() => {
          const yShape = shapesMapRef.current.get(id);
          if (yShape instanceof Y.Map) {
            // CRDT-friendly: update individual properties (won't overwrite color changes)
            yShape.set('x', newX);
            yShape.set('y', newY);
          } else if (yShape) {
            // Fallback for plain objects
            shapesMapRef.current.set(id, { 
              ...yShape, 
              x: newX, 
              y: newY 
            });
          }
        });
      }
    }
  };

  // Sync final position on drag end (fixes throttling data loss)
  const handleDragEnd = (e, shape) => {
    const id = shape.id;
    const node = e.target;
    const finalX = node.x();
    const finalY = node.y();

    // Sync final position to Y.js
    if (!shape.isPrivate) {
      ydocRef.current.transact(() => {
        const yShape = shapesMapRef.current.get(id);
        if (yShape instanceof Y.Map) {
          yShape.set('x', finalX);
          yShape.set('y', finalY);
        } else if (yShape) {
          shapesMapRef.current.set(id, { ...yShape, x: finalX, y: finalY });
        }
      });

      // For multi-select, sync all other selected shapes too
      if (selectedIds.includes(id) && selectedIds.length > 1) {
        const initialPos = dragInitialPositions.current[id];
        if (initialPos) {
          const deltaX = finalX - initialPos.x;
          const deltaY = finalY - initialPos.y;

          ydocRef.current.transact(() => {
            selectedIds.forEach(selectedId => {
              if (selectedId === id) return; // Already synced above
              const initPos = dragInitialPositions.current[selectedId];
              if (!initPos) return;

              const yShape = shapesMapRef.current.get(selectedId);
              if (yShape instanceof Y.Map && !yShape.get('isPrivate')) {
                yShape.set('x', initPos.x + deltaX);
                yShape.set('y', initPos.y + deltaY);
              }
            });
          });
        }
      }
    } else {
      // Sync final position for private shape
      setPrivateShapes(prev =>
        prev.map(s => (s.id === id ? { ...s, x: finalX, y: finalY } : s))
      );
    }

    // Clear stored positions
    dragInitialPositions.current = {};
  };

  const handleClearAll = () => {
    if (isPrivateMode) {
      setPrivateShapes([]);
    } else {
      // Y.js Standard: Use transaction
      ydocRef.current.transact(() => {
        shapesMapRef.current.clear();
      });
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
        // Y.js Standard: Batch updates in transaction with nested Y.Maps
        ydocRef.current.transact(() => {
          privateShapes.forEach(shape => {
            const sharedShapeData = { ...shape, isPrivate: false };
            const yShape = createYMapShape(sharedShapeData);
            shapesMapRef.current.set(shape.id, yShape);
          });
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
      // Y.js Standard: CRDT-friendly per-property updates
      ydocRef.current.transact(() => {
        selectedIds.forEach(id => {
          const yShape = shapesMapRef.current.get(id);
          if (yShape instanceof Y.Map && !yShape.get('isPrivate')) {
            // CRDT-friendly: only update fill, preserves x/y from other clients
            yShape.set('fill', newColor);
          } else if (yShape && !yShape.isPrivate) {
            // Fallback for plain objects
            shapesMapRef.current.set(id, { ...yShape, fill: newColor });
          }
        });
      });
      
      // Handle private shapes separately (from React state)
      const allShapesCurrent = [...shapes, ...privateShapes];
      const privateIds = selectedIds.filter(id => {
        const shape = allShapesCurrent.find(s => s.id === id);
        return shape && shape.isPrivate;
      });
      
      if (privateIds.length > 0) {
        setPrivateShapes(prev =>
          prev.map(s => (privateIds.includes(s.id) ? { ...s, fill: newColor } : s))
        );
      }
    }
  };

  const renderShape = (shape) => {
    const isSelected = selectedIds.includes(shape.id);

    const shapeProps = {
      key: shape.id,
      id: shape.id,
      x: shape.x,
      y: shape.y,
      fill: shape.fill,
      stroke: isSelected ? '#0096FF' : '#000',
      strokeWidth: isSelected ? 2 : 1,
      dash: shape.isPrivate ? [8, 4] : undefined,
      draggable: true,
      onClick: (e) => handleShapeClick(e, shape),
      onTap: (e) => handleShapeClick(e, shape),
      onDragStart: (e) => handleDragStart(e, shape),
      onDragMove: (e) => handleDragMove(e, shape),
      onDragEnd: (e) => handleDragEnd(e, shape),
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
          <span className="section-label">Welcome, {currentUser.nickname}!</span>
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

      {/* Private Mode Banner */}
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
        <span>Click to add • Drag to move • Shift+Click for multi-select • Delete to remove</span>
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

      {/* Canvas - now responsive */}
      <Stage
        width={windowSize.width}
        height={windowSize.height}
        onClick={handleClick}
        className="canvas"
      >
        <Layer>
          {allShapes.map(renderShape)}
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
        if (cursor.id === currentUser.id) return null;
        
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
              {user.id === currentUser.id && <span className="user-label">(You)</span>}
              {user.isPrivateMode && <span className="user-label private">Private</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
