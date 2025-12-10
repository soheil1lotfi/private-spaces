const express = require("express");
const cors = require("cors");
const http = require("http");
const { WebSocketServer } = require("ws");
const mongoose = require("mongoose");
const Shape = require("./models/shapes");
const app = express();
app.use(cors());
app.use(express.json());
const dbURI =
  "mongodb+srv://<db_username>:<db_password>@cscw.93kngev.mongodb.net/?appName=CSCW";
const server = http.createServer(app);
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

const wss = new WebSocketServer({ server });

let shapes = [];
const clients = new Map(); // Map<ws, { id, nickname, color, x, y }>

wss.on("connection", (ws) => {
  console.log("New client connected");

  ws.on("message", (message) => {
    const data = JSON.parse(message);

    switch (data.type) {
      case "USER_JOIN":
        // Register user with their identity
        clients.set(ws, {
          id: data.user.id,
          nickname: data.user.nickname,
          color: data.user.color,
          x: 0,
          y: 0,
        });
        console.log(`User joined: ${data.user.nickname}`);

        // Send current shapes and all other users to the new client
        ws.send(
          JSON.stringify({
            type: "INIT",
            shapes: shapes,
            users: Array.from(clients.values()).filter(
              (u) => u.id !== data.user.id
            ),
          })
        );

        // Notify other clients about the new user
        broadcastExcept(ws, {
          type: "USER_JOINED",
          user: clients.get(ws),
        });
        break;

      case "CURSOR_MOVE":
        const user = clients.get(ws);
        if (user) {
          user.x = data.x;
          user.y = data.y;
          broadcastExcept(ws, {
            type: "CURSOR_UPDATE",
            userId: user.id,
            x: data.x,
            y: data.y,
          });
        }
        break;

      case "ADD_SHAPE":
        shapes.push(data.shape);
        new Shape({
          id: data.shape.id,
          x: data.shape.x,
          y: data.shape.y,
          type: data.shape.type,
          fill: data.shape.fill,
          isPrivate: data.shape.isPrivate,
          isLocked: data.shape.isLocked,
        }).save();

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
    const user = clients.get(ws);
    if (user) {
      console.log(`User left: ${user.nickname}`);
      broadcastExcept(ws, {
        type: "USER_LEFT",
        userId: user.id,
      });
    }
    clients.delete(ws);
  });
});

function broadcast(data) {
  const message = JSON.stringify(data);
  clients.forEach((userData, ws) => {
    if (ws.readyState === 1) {
      ws.send(message);
    }
  });
}

function broadcastExcept(excludeWs, data) {
  const message = JSON.stringify(data);
  clients.forEach((userData, ws) => {
    if (ws !== excludeWs && ws.readyState === 1) {
      ws.send(message);
    }
  });
}
