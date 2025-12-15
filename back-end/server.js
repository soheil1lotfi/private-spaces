const express = require("express");
const cors = require("cors");
const http = require("http");
const { WebSocketServer } = require("ws");
const mongoose = require("mongoose");
const Y = require("yjs");
const { setupWSConnection } = require('y-websocket/bin/utils');

const app = express();

app.use(cors());
app.use(express.json());

const dbURI =
  "mongodb+srv://soheil1lotfi:soloLotfi@cscw.93kngev.mongodb.net/?appName=CSCW";
const server = http.createServer(app);

// Connect to MongoDB
mongoose
  .connect(dbURI)
  .then(() => {
    server.listen(3001, () => {
      console.log("Server running on http://localhost:3001");
    });
  })
  .catch((err) => {
    console.error("MongoDB connection error:", err);
  });

// Y.js WebSocket Server
const wss = new WebSocketServer({ server });

// Store Y.js documents
const docs = new Map(); // docName -> Y.Doc

// Get or create Y.js document
function getYDoc(docName) {
  if (!docs.has(docName)) {
    const doc = new Y.Doc();
    docs.set(docName, doc);

    // Load from MongoDB on first access
    loadDocumentFromDB(docName, doc);

    // Setup persistence
    setupPersistence(docName, doc);
  }
  return docs.get(docName);
}

// Load Y.js document from MongoDB
async function loadDocumentFromDB(docName, ydoc) {
  try {
    const Shape = require("./models/shapes");
    const dbShapes = await Shape.find();

    if (dbShapes.length > 0) {
      // Y.js Standard: Load within transaction
      ydoc.transact(() => {
        const shapesMap = ydoc.getMap("shapes");
        dbShapes.forEach((shape) => {
          shapesMap.set(shape.id, {
            id: shape.id,
            x: shape.x,
            y: shape.y,
            type: shape.type,
            fill: shape.fill,
            isPrivate: shape.isPrivate || false,
            isLocked: shape.isLocked || false,
          });
        });
      });
      console.log(`Loaded ${dbShapes.length} shapes from MongoDB`);
    }
  } catch (error) {
    console.error("Error loading from MongoDB:", error);
  }
}

// Persist Y.js document to MongoDB periodically
function setupPersistence(docName, ydoc) {
  const Shape = require("./models/shapes");
  const shapesMap = ydoc.getMap("shapes");

  let isDirty = false;

  shapesMap.observe(() => {
    isDirty = true;
  });

  setInterval(async () => {
    if (!isDirty) return;
    isDirty = false;

    try {
      await Shape.deleteMany({});

      const shapes = [];
      // Y.js Standard: Read within transaction context
      ydoc.transact(() => {
        shapesMap.forEach((shape) => {
          if (!shape.isPrivate) {
            shapes.push({
              id: shape.id,
              x: shape.x,
              y: shape.y,
              type: shape.type,
              fill: shape.fill,
              isPrivate: shape.isPrivate || false,
              isLocked: shape.isLocked || false,
            });
          }
        });
      });

      if (shapes.length > 0) {
        await Shape.insertMany(shapes);
        console.log(`Persisted ${shapes.length} shapes to MongoDB`);
      }
    } catch (error) {
      console.error("Error persisting to MongoDB:", error);
    }
  }, 5000);
}

// Y.js Standard: Use y-websocket's setupWSConnection
wss.on("connection", (ws, req) => {
  console.log("New Y.js client connected");

  const docName = req.url.slice(1).split('?')[0] || 'collaborative-whiteboard';
  const doc = getYDoc(docName);

  // This handles all protocol correctly!
  setupWSConnection(ws, req, doc);
});

console.log("Y.js WebSocket server initialized");
