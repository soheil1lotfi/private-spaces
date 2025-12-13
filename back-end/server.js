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
  "mongodb+srv://soheil1lotfi:soloLotfi@cscw.93kngev.mongodb.net/?appName=CSCW";
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
const clients = new Map(); // Map<ws, { id, nickname, color, x, y, isPrivateMode }

wss.on("connection", (ws) => {
  console.log("New client connected");

  ws.on("message", async (message) => {
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
          isPrivateMode: false,
        });
        console.log(`User joined: ${data.user.nickname}`);

        const dbShapes = await Shape.find();
        console.log(
          `User joined: ${data.user.nickname} with color: ${data.user.color}`
        );

        const dbShapes = await Shape.find();
        console.log(
          `User joined: ${data.user.nickname} with color: ${data.user.color}`
        );

        // Send current shapes and ALL users (including this new user) to the new client
        const allUsers = Array.from(clients.values());
        ws.send(
          JSON.stringify({
            type: "INIT",
            shapes: dbShapes,
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
        await Shape.findOneAndUpdate(
          { id: data.shape.id },
          {
            x: data.shape.x,
            y: data.shape.y,
            type: data.shape.type,
            fill: data.shape.fill,
            isPrivate: data.shape.isPrivate,
            isLocked: data.shape.isLocked,
          }
        );

        shapes = shapes.map((s) => (s.id === data.shape.id ? data.shape : s));
        broadcastExcept(ws, {
          type: "SHAPE_UPDATED",
          shape: data.shape,
        });
        break;

      case "DELETE_SHAPE":
        await Shape.deleteOne({ id: data.id });

        shapes = shapes.filter((s) => s.id !== data.id);
        broadcastExcept(ws, {
          type: "SHAPE_DELETED",
          id: data.id,
        });
        break;

      case "CLEAR_ALL":
        await Shape.deleteMany({});

        shapes = [];
        broadcast({ type: "ALL_CLEARED" });
        break;

      case "LOCK_REQUEST":
        const shapeToLock = shapes.find((s) => s.id === data.shapeId);
        const requestingUser = clients.get(ws);

        if (
          shapeToLock.isLocked &&
          shapeToLock.lockedBy !== requestingUser.id
        ) {
          ws.send(
            JSON.stringify({
              type: "LOCK_DENIED",
              shapeId: data.shapeId,
            })
          );
        } else {
          shapeToLock.isLocked = true;
          shapeToLock.lockedBy = requestingUser.id;

          ws.send(
            JSON.stringify({
              type: "LOCK_GRANTED",
              shapeId: data.shapeId,
            })
          );

          broadcastExcept(ws, {
            type: "SHAPE_UPDATED",
            shape: shapeToLock,
          });
        }
        break;

      case "UNLOCK_REQUEST":
        const shapeToUnlock = shapes.find((s) => s.id === data.shapeId);
        const unlockingUser = clients.get(ws);

        if (shapeToUnlock && shapeToUnlock.lockedBy === unlockingUser.id) {
          shapeToUnlock.isLocked = false;
          shapeToUnlock.lockedBy = null;

          broadcast({
            type: "SHAPE_UPDATED",
            shape: shapeToUnlock,
          });
        }
        break;

      case "PRIVATE_MODE_CHANGED":
        const userPrivate = clients.get(ws);
        if (userPrivate) {
          userPrivate.isPrivateMode = data.isPrivateMode;
          console.log(
            `User ${userPrivate.nickname} private mode: ${data.isPrivateMode}`
          );

          // Broadcast private mode change to all other clients
          broadcastExcept(ws, {
            type: "PRIVATE_MODE_CHANGED",
            userId: userPrivate.id,
            isPrivateMode: data.isPrivateMode,
          });
        }
        break;
    }
  });

  ws.on("close", () => {
    const user = clients.get(ws);
    if (user) {
      shapes.forEach((shape) => {
        if (shape.lockedBy === user.id) {
          shape.isLocked = false;
          shape.lockedBy = null;
          broadcast({ type: "SHAPE_UPDATED", shape });
        }
      });
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
