const express = require("express");
const cors = require("cors");
const http = require("http");
const { WebSocketServer } = require("ws");
const mongoose = require("mongoose");
const Y = require("yjs");
const awarenessProtocol = require("y-protocols/awareness");
const syncProtocol = require("y-protocols/sync");
const encoding = require("lib0/encoding");
const decoding = require("lib0/decoding");

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
const docs = new Map(); // docName -> { doc: Y.Doc, awareness: Awareness, connections: Set }

const messageSync = 0;
const messageAwareness = 1;

// Get or create Y.js document
function getYDoc(docName) {
  if (!docs.has(docName)) {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);

    docs.set(docName, {
      doc,
      awareness,
      connections: new Set(),
    });

    // Broadcast updates to all connected clients
    doc.on("update", (update, origin) => {
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, messageSync);
      syncProtocol.writeUpdate(encoder, update);
      const message = encoding.toUint8Array(encoder);

      const docData = docs.get(docName);
      if (docData) {
        docData.connections.forEach((client) => {
          if (client !== origin && client.readyState === 1) {
            client.send(message);
          }
        });
      }
    });

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

      if (shapes.length > 0) {
        await Shape.insertMany(shapes);
        console.log(`Persisted ${shapes.length} shapes to MongoDB`);
      }
    } catch (error) {
      console.error("Error persisting to MongoDB:", error);
    }
  }, 5000);
}

wss.on("connection", (ws) => {
  console.log("New Y.js client connected");

  const docName = "collaborative-whiteboard";
  const { doc, awareness, connections } = getYDoc(docName);

  connections.add(ws);

  // Send sync step 1
  const encoderSync = encoding.createEncoder();
  encoding.writeVarUint(encoderSync, messageSync);
  syncProtocol.writeSyncStep1(encoderSync, doc);
  ws.send(encoding.toUint8Array(encoderSync));

  // Send awareness states
  const encoderAwareness = encoding.createEncoder();
  encoding.writeVarUint(encoderAwareness, messageAwareness);
  encoding.writeVarUint8Array(
    encoderAwareness,
    awarenessProtocol.encodeAwarenessUpdate(
      awareness,
      Array.from(awareness.getStates().keys())
    )
  );
  ws.send(encoding.toUint8Array(encoderAwareness));

  ws.on("message", (message) => {
    try {
      const uint8Array = new Uint8Array(message);
      const decoder = decoding.createDecoder(uint8Array);
      const messageType = decoding.readVarUint(decoder);

      if (messageType === messageSync) {
        // Handle sync message
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        syncProtocol.readSyncMessage(decoder, encoder, doc, ws);

        // Send reply to the sender (if any)
        if (encoding.length(encoder) > 1) {
          ws.send(encoding.toUint8Array(encoder));
        }
      } else if (messageType === messageAwareness) {
        // Handle awareness message
        awarenessProtocol.applyAwarenessUpdate(
          awareness,
          decoding.readVarUint8Array(decoder),
          ws
        );

        // Broadcast to other clients
        connections.forEach((client) => {
          if (client !== ws && client.readyState === 1) {
            client.send(uint8Array);
          }
        });
      }
    } catch (error) {
      console.error("Error handling message:", error);
    }
  });

  ws.on("close", () => {
    console.log("Y.js client disconnected");
    connections.delete(ws);

    // Remove from awareness
    awarenessProtocol.removeAwarenessStates(awareness, [ws], null);
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error);
  });
});

console.log("Y.js WebSocket server initialized");
