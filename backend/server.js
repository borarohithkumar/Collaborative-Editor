import express from "express";
import http from "http";
import { Server } from "socket.io";
import mongoose from "mongoose";
import cors from "cors";
import Document from "./models/Document.js";
import dotenv from "dotenv";

// --- Setup ---
dotenv.config();
const app = express();
const server = http.createServer(app);

/**
 * Socket.io server instance.
 * We configure CORS to allow connections from our React frontend.
 * We also set a custom pingInterval/Timeout to detect broken connections
 * faster than the default.
 */
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173", // For PC debugging, allow rqsts from react app
      // process.env.FRONTEND_URL      // For phone debugging
    ],
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingInterval: 5000, // Send a ping every 5 seconds
  pingTimeout: 3000, // Consider connection lost if no pong after 3 seconds
});

// --- Middleware ---
app.use(cors()); // Enable CORS for any potential future REST routes
app.use(express.json()); // Allow server to parse JSON request bodies

// --- Database Connection ---
const DB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/collaborative-editor";
console.log("🔗 Trying to connect to:", DB_URI);

mongoose
  .connect(DB_URI, {
    serverSelectionTimeoutMS: 5000, // Fail fast if DB isn't reachable
  })
  .then(() => {
    console.log("✅ MongoDB connected successfully");
    // Only start the server *after* the database is connected
    server.listen(PORT, () => {
      console.log(`🚀 Collaboration server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1); // Exit the process if we can't connect to the DB
  });

// --- In-Memory State Management ---

/**
 * Tracks active document sessions to reduce database reads.
 * This is our "hot cache".
 *
 * Map<documentId, SessionData>
 *
 * SessionData: {
 * content: string, // The latest document content
 * version: number, // The current version number
 * users: Map<socket.id, userObject> // List of users in this session
 * }
 */
const documentSessions = new Map();

/**
 * A "mutex" or "lock" set.
 * This prevents a critical race condition where two users try to
 * join and *create* the same document at the exact same time.
 * We add a docId to this Set when a join begins and remove it
 * when the join is complete.
 */
const joiningDocs = new Set();

// --- Helper Functions ---

/**
 * Validates a document ID against our allowed formats.
 * @param {string} id - The document ID to check.
 * @returns {boolean}
 */
const isValidDocumentId = (id) => {
  // Check if it's a valid MongoDB ObjectId (for docs created in the DB)
  if (mongoose.Types.ObjectId.isValid(id)) {
    return true;
  }
  // Check if it matches our custom ID format (e.g., "doc_abc1234")
  return /^doc_[a-z0-9]{7}$/.test(id);
};

/**
 * Atomically saves a new activity to the database and
 * broadcasts it to all users in the room.
 * @param {string} docId - The document ID.
 * @param {object} user - The user object who performed the action.
 * @param {string} message - The activity message (e.g., "joined", "cleared the document").
 */
const logAndBroadcastActivity = async (docId, user, message) => {
  try {
    // 1. Create the activity subdocument
    const newActivity = {
      message: message,
      user: {
        userId: user.userId,
        name: user.name,
        color: user.color,
      },
      createdAt: new Date(),
    };

    // 2. Atomically push the new activity to the DB
    const updatedDoc = await Document.findByIdAndUpdate(
      docId,
      {
        $push: {
          activity: {
            $each: [newActivity], // Add the new item
            $sort: { createdAt: -1 }, // Keep the array sorted, newest first
            $slice: 50, // Keep only the latest 50 activities
          },
        },
      },
      { new: true } // Return the updated document
    ).select("activity"); // Only select the activity field for performance

    if (!updatedDoc) return; // Safety check

    // 3. Get the activity we just saved (it's the first one)
    const savedActivity = updatedDoc.activity[0];

    // 4. Broadcast this single new activity to all clients in the room
    io.to(docId).emit("new-activity", savedActivity);
  } catch (err) {
    console.error(`Failed to log activity for ${docId}:`, err);
  }
};

// --- Socket.io Connection Handling ---
io.on("connection", (socket) => {
  /**
   * Send a "hello" message to the client on successful connection.
   * This is good for client-side debugging and connection state.
   */
  socket.emit("connection-ack", {
    status: "connected",
    socketId: socket.id,
    timestamp: Date.now(),
  });

  /**
   * Handles a user's request to join a document.
   * This is the main entry point for a user.
   */
  socket.on("join-document", async ({ documentId, user }) => {
    // === 1. LOCKING MECHANISM ===
    // If a join for this doc is already in progress, ignore this request.
    // This prevents a race condition on document creation.
    if (joiningDocs.has(documentId)) {
      return;
    }
    // Acquire the lock
    joiningDocs.add(documentId);
    // === END LOCK ===

    try {
      // 1. Validate the document ID format
      if (!isValidDocumentId(documentId)) {
        throw new Error("Invalid document ID format");
      }

      // 2. Try to find the document in the database
      let doc = await Document.findById(documentId).maxTimeMS(5000);
      let isNewDoc = false;
      const newActivity = {
        message: "joined",
        user: { userId: user.userId, name: user.name, color: user.color },
      };

      if (!doc) {
        // --- SCENARIO 1: NEW DOCUMENT ---
        // Document doesn't exist, so we create it.
        // We create it with the user and the "joined" activity atomically.
        doc = await Document.create({
          _id: documentId, // Use the client-provided ID
          content: "",
          version: 0,
          collaborators: [user],
          activity: [newActivity], // Add "joined" activity on creation
          chat: [],
        });
        isNewDoc = true;
      }

      // 3. PASSWORD CHECK
      // If the document has a password, stop here and ask the client for it.
      if (doc.password) {
        socket.emit("password-required", { docId: documentId });
      } else {
        // --- SCENARIO 2: PUBLIC DOCUMENT (OR JUST CREATED) ---

        // 4. Join the Socket.io room for this document
        socket.join(documentId);
        console.log(`User ${user.userId} joined document ${documentId}`);

        let updatedDoc = doc;

        // 5. If it's an *existing* doc, update collaborator list
        if (!isNewDoc) {
          // A: Atomically $pull any old instance of this user
          await Document.findByIdAndUpdate(documentId, {
            $pull: { collaborators: { userId: user.userId } },
          }).maxTimeMS(5000);

          // B: Atomically $push the new user object
          updatedDoc = await Document.findByIdAndUpdate(
            documentId,
            { $push: { collaborators: user } },
            { new: true } // Return the updated document
          ).maxTimeMS(5000);

          // C: Log the "joined" activity
          await logAndBroadcastActivity(documentId, user, "joined");
        }

        // 6. Initialize the in-memory session if it's not already cached
        if (!documentSessions.has(documentId)) {
          documentSessions.set(documentId, {
            content: updatedDoc.content,
            version: updatedDoc.version,
            users: new Map(), // Initialize empty user map
          });
        }
        // Add this specific socket to the session
        documentSessions.get(documentId).users.set(socket.id, user);

        // 7. Broadcast the updated collaborator list to EVERYONE in the room
        io.to(documentId).emit(
          "collaborators-updated",
          updatedDoc.collaborators
        );

        // 8. Manually broadcast activity if it was a new doc
        if (isNewDoc) {
          io.to(documentId).emit("new-activity", updatedDoc.activity[0]);
        }

        // 9. Fetch the final, most up-to-date state
        const finalDocState = await Document.findById(documentId).maxTimeMS(
          5000
        );

        // 10. Send the full document state to the *joining user only*
        socket.emit("document-state", {
          content: finalDocState.content,
          version: finalDocState.version,
          title: finalDocState.title,
          activityLog: finalDocState.activity,
          chatHistory: finalDocState.chat,
          hasPassword: !!finalDocState.password, // Send true if password exists
        });
      }
    } catch (err) {
      console.error("Join document error:", err);
      socket.emit("error", {
        type: "join-error",
        message: err.message,
      });
    } finally {
      // === 3. RELEASE THE LOCK ===
      // This is critical. Always release the lock, even if an error occurred.
      joiningDocs.delete(documentId);
      // === END LOCK ===
    }
  });

  /**
   * Broadcasts when a user is typing.
   */
  socket.on("user-typing", (documentId, username) => {
    // Broadcast to everyone *except* the sender
    socket.to(documentId).emit("user-started-typing", username);
  });

  /**
   * Handles incoming text changes from a client.
   * This updates the in-memory cache and broadcasts to other users.
   * This does NOT hit the database, for performance.
   */
  socket.on("text-operation", (documentId, operation) => {
    try {
      if (!documentSessions.has(documentId)) return;

      const session = documentSessions.get(documentId);

      // Update in-memory content and version
      session.content = operation;
      session.version++;

      // Broadcast the new content to other clients
      socket.to(documentId).emit("remote-operation", {
        operation,
        version: session.version,
        source: socket.id, // Client can use this to ignore its own broadcasts
      });
    } catch (err) {
      console.error("In-memory text operation error:", err);
    }
  });

  /**
   * Handles a client's request to save the document to the database.
   * This uses an 'ack' callback to tell the client when the save is complete.
   */
  socket.on("document-save", async ({ docId, content }, ack) => {
    try {
      const session = documentSessions.get(docId);

      let versionToSave = 1; // Default version
      if (session) {
        // If session is active, use its version
        session.content = content; // Ensure session content is up-to-date
        versionToSave = session.version;
      }

      // Save the content and latest version to MongoDB
      await Document.findByIdAndUpdate(docId, {
        content: content,
        version: versionToSave,
        $set: { updatedAt: new Date() },
      });

      // Acknowledge the save so the client can update its UI (e.g., "Synced")
      if (ack) {
        ack({ status: "saved" });
      }
    } catch (err) {
      console.error("Save error:", err);
      if (ack) {
        ack({ status: "error", message: err.message });
      }
    }
  });

  /**
   * Handles updates to the document title.
   */
  socket.on("update-title", async ({ docId, title }) => {
    try {
      // 1. Find the user who sent this event from our session cache
      const session = documentSessions.get(docId);
      const user = session?.users.get(socket.id);

      if (!user) {
        return console.error("User not found in session for title update");
      }

      // 2. Save the new title to the DB
      await Document.findByIdAndUpdate(docId, { title: title });

      // 3. Broadcast the new title (and *who* changed it) to others
      socket.to(docId).emit("title-updated", { title, user });

      // 4. Log this action to the activity feed
      await logAndBroadcastActivity(docId, user, `set the title to "${title}"`);
    } catch (err) {
      console.error("Title update error:", err);
    }
  });

  /**
   * Handles a generic client-side action that needs to be logged.
   * (e.g., "cleared the document", "imported a file")
   */
  socket.on("log-action", async ({ docId, message }) => {
    try {
      const session = documentSessions.get(docId);
      const user = session?.users.get(socket.id);

      if (!user) return console.error("User not found for log-action");

      // Just call the helper!
      await logAndBroadcastActivity(docId, user, message);
    } catch (err) {
      console.error("Failed to log client action:", err);
    }
  });

  /**
   * Handles chat messages.
   * Broadcasts to everyone in the room (including sender) so timestamps sync easily.
   */
  socket.on("send-chat-message", async ({ docId, message, user }) => {
    const chatMsg = {
      id: Date.now() + Math.random().toString(36), // Unique ID
      text: message,
      user: user,
      timestamp: new Date(),
    };

    // 1. Broadcast immediately (for speed)
    io.to(docId).emit("receive-chat-message", chatMsg);

    // 2. Save to Database (Async)
    try {
      await Document.findByIdAndUpdate(docId, {
        $push: {
          chat: {
            $each: [chatMsg],
            $slice: -50, // Keep only the last 50 messages to save space
          },
        },
      });
    } catch (err) {
      console.error("Failed to save chat message:", err);
    }
  });

  /**
   * Handles password submission for a protected document.
   */
  socket.on("submit-password", async ({ docId, password, user }) => {
    try {
      const doc = await Document.findById(docId);
      if (!doc) {
        throw new Error("Document not found");
      }

      // This assumes a 'comparePassword' method on your Mongoose model
      // (likely using bcrypt.compare)
      const isMatch = await doc.comparePassword(password);

      if (!isMatch) {
        // Password was wrong. Tell the client.
        return socket.emit("error", {
          type: "auth-error",
          message: "Incorrect password",
        });
      }

      // --- PASSWORD IS CORRECT ---
      // The rest of this logic mirrors the public "join-document" flow.

      // 1. Join the Socket.io room
      socket.join(docId);
      console.log(`User ${user.userId} joined protected doc ${docId}`);

      // 2. Update collaborators (Must be separate steps to avoid MongoDB path conflict)

      // A: Atomically $pull any old instance of this user
      await Document.findByIdAndUpdate(docId, {
        $pull: { collaborators: { userId: user.userId } },
      }).maxTimeMS(5000);

      // B: Atomically $push the new user object
      const updatedDoc = await Document.findByIdAndUpdate(
        docId,
        { $push: { collaborators: user } },
        { new: true } // Return the final document
      ).maxTimeMS(5000);

      // 3. Initialize the in-memory session
      if (!documentSessions.has(docId)) {
        documentSessions.set(docId, {
          content: updatedDoc.content,
          version: updatedDoc.version,
          users: new Map(),
        });
      }
      documentSessions.get(docId).users.set(socket.id, user);

      // 4. Broadcast collaborator update to everyone
      io.to(docId).emit("collaborators-updated", updatedDoc.collaborators);

      // 5. Log the "joined" activity
      await logAndBroadcastActivity(docId, user, "joined");

      // 6. Fetch the final, most up-to-date state
      const finalDocState = await Document.findById(docId).maxTimeMS(5000);

      // 7. Send the complete state to the joining user
      socket.emit("document-state", {
        content: finalDocState.content,
        version: finalDocState.version,
        title: finalDocState.title,
        activityLog: finalDocState.activity,
        chatHistory: finalDocState.chat,
        hasPassword: !!finalDocState.password, // Send true if password exists
      });
    } catch (err) {
      console.error("Submit password error:", err);
      socket.emit("error", { type: "auth-error", message: err.message });
    }
  });

  /**
   * Handles a request to set or change a document's password.
   * Now requires the old password if one is already set.
   */
  socket.on("set-document-password", async ({ docId, password, oldPassword }) => {
      try {
        const doc = await Document.findById(docId);
        if (!doc) {
          throw new Error("Document not found");
        }

        // === SECURITY CHECK ===
        // If a password already exists, we MUST verify the old one.
        if (doc.password) {
          if (!oldPassword) {
            throw new Error("Current password is required to change it.");
          }
          // Use the schema's compare method
          const isMatch = await doc.comparePassword(oldPassword);
          if (!isMatch) {
            throw new Error("Incorrect current password.");
          }
        }

        // Set the new password
        doc.password = password;
        await doc.save(); // Triggers hashing hook

        // Send success message
        socket.emit("toast", { message: "Password updated successfully!" });

        // Broadcast to EVERYONE (including sender) that this doc is now password-protected
        // This ensures other users' UI updates to show "Change Password" instead of "Set"
        io.to(docId).emit("password-status-update", { hasPassword: true });
      } catch (err) {
        console.error("Set password error:", err);
        socket.emit("error", {
          type: "password-error",
          message: err.message || "Failed to set password",
        });
      }
    }
  );

  /**
   * Handles user disconnection.
   * This is crucial for cleaning up sessions and collaborator lists.
   */
  socket.on("disconnect", async () => {
    console.log("User disconnected:", socket.id);

    // We must check *every* active session to find where this user was.
    for (const [documentId, session] of documentSessions) {
      // Check if the disconnected socket ID was in this session
      if (session.users.has(socket.id)) {
        // Get the user data *before* deleting them from the session
        const user = session.users.get(socket.id);
        session.users.delete(socket.id);

        // Check if any *other* connections remain for this same user ID
        // (e.g., they have another tab open)
        const remainingConnections = Array.from(session.users.values()).some(
          (u) => u.userId === user.userId
        );

        // If no other connections exist, they are truly "offline"
        if (!remainingConnections) {
          try {
            // Remove the user from the database's collaborator list
            const doc = await Document.findByIdAndUpdate(
              documentId,
              {
                $pull: { collaborators: { userId: user.userId } },
              },
              { new: true } // Return the updated doc
            );

            if (doc) {
              // Broadcast the new, smaller collaborator list
              io.to(documentId).emit(
                "collaborators-updated",
                doc.collaborators
              );

              // Log the "left" activity
              await logAndBroadcastActivity(documentId, user, "left");
            }
          } catch (err) {
            console.error(
              `Error removing collaborator on disconnect: ${err.message}`
            );
          }
        }

        // --- Session Cleanup ---
        // If this was the last user, clean up the in-memory session
        if (session.users.size === 0) {
          console.log(`Cleaning up empty session: ${documentId}`);
          // Do one final save of the in-memory content
          await Document.findByIdAndUpdate(documentId, {
            content: session.content,
            version: session.version,
          });
          // Remove from the "hot cache"
          documentSessions.delete(documentId);
        }
      }
    }
  });
});

// --- Server Startup ---
const PORT = process.env.PORT || 5000;