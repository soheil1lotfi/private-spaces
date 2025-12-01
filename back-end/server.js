const express = require("express");
const cors = require("cors");
const http = require("http");
const { WebSocketServer } = require("ws");

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const wss = new WebSocketServer({ server });

let shapes = [];
const clients = new Set();

wss.on("connection", (ws) => {
  console.log("New client connected");
  clients.add(ws);

  ws.send(
    JSON.stringify({
      type: "INIT",
      shapes: shapes,
    })
  );

  ws.on("message", (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case "ADD_SHAPE":
        shapes.push(data.shape);
        broadcastExcept(ws, {
          type: "SHAPE_ADDED",
          shape: data.shape,
        });
        break;

      case "UPDATE_SHAPE":
        shapes = shapes.map((s) => (s.id === data.shape.id ? data.shape : s));
        broadcastExcept(ws, {
          type: "SHAPE_UPDATED",
          shape: data.shape,
        });
        break;

      case "DELETE_SHAPE":
        shapes = shapes.filter((s) => s.id !== data.id);
        broadcastExcept(ws, {
          type: "SHAPE_DELETED",
          id: data.id,
        });
        break;

      case "CLEAR_ALL":
        shapes = [];
        broadcast({ type: "ALL_CLEARED" });
        break;
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    clients.delete(ws);
  });
});

function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

function broadcastExcept(excludeWs, data) {
  const message = JSON.stringify(data);
  clients.forEach((client) => {
    if (client !== excludeWs && client.readyState === 1) {
      client.send(message);
    }
  });
}

server.listen(3001, () => {
  console.log("Server running on http://localhost:3001");
});
