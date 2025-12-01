import React, { useState } from 'react'
import './App.css'
import { Stage, Layer, Rect, Circle, Text, Star } from 'react-konva';
import {useEffect, useRef } from 'react'

function App() {
  const [shapes, setShapes] = useState([]);
  const [selectedTool, setSelectedTool] = useState('circle');
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3001');
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('Connected to server');
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'INIT':
          setShapes(data.shapes);
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


  const sendMessage = (data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  };


  const handleClick = (e) => {
    const stage = e.target.getStage();
    const pos = stage.getPointerPosition();
    
    const newShape = {
      id: Date.now(),
      x: pos.x,
      y: pos.y,
      type: selectedTool,
      fill: `hsl(${Math.random() * 360}, 70%, 50%)`,
    };
    
    setShapes([...shapes, newShape]);
    sendMessage({ type: 'ADD_SHAPE', shape: newShape });
  };

  const handleDelete = (id) => {
    setShapes(prev => prev.filter(s => s.id !== id));
    sendMessage({ type: 'DELETE_SHAPE', id });
  };

  const handleClearAll = () => {
    setShapes([]);
    sendMessage({ type: 'CLEAR_ALL' });
  };
  const handleDragEnd = (e, shape) => {
    const updatedShape = {
      ...shape,
      x: e.target.x(),
      y: e.target.y(),
    };
    
    setShapes(prev => 
      prev.map(s => s.id === shape.id ? updatedShape : s)
    );
    console.log('updatedShape', updatedShape.x, updatedShape.y);
    sendMessage({ type: 'UPDATE_SHAPE', shape: updatedShape });
  };
  const renderShape = (shape) => {
    const props = {
      key: shape.id,
      x: shape.x,
      y: shape.y,
      fill: shape.fill,
      draggable: true,
      onDragEnd: (e) => handleDragEnd(e, shape),
      onDblClick: () => handleDelete(shape.id),
    };

    switch (shape.type) {
      case 'circle':
        return <Circle {...props} radius={40} />;
      case 'rect':
        return <Rect {...props} x={shape.x } y={shape.y } width={80} height={80} />;
      case 'star':
        return <Star {...props} numPoints={5} innerRadius={20} outerRadius={40} />;
      default:
        return null;
    }
  };

  return (
    <div>
      {/* Tools */}
      <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 100 }}>
        <button 
          onClick={() => setSelectedTool('circle')}
          style={{ fontWeight: selectedTool === 'circle' ? 'bold' : 'normal' }}
        >
          Circle
        </button>
        <button 
          onClick={() => setSelectedTool('rect')}
          style={{ fontWeight: selectedTool === 'rect' ? 'bold' : 'normal' }}
        >
          Rectangle
        </button>
        <button 
          onClick={() => setSelectedTool('star')}
          style={{ fontWeight: selectedTool === 'star' ? 'bold' : 'normal' }}
        >
          Star
        </button>
        <button onClick={() => handleClearAll()}>
          Clear All
        </button>
      </div>

      <Stage 
        width={window.innerWidth} 
        height={window.innerHeight}
        onClick={handleClick}
      >
        <Layer>
          {shapes.map(renderShape)}
        </Layer>
      </Stage>
    </div>
  );
}

export default App