import express from 'express';
import http from 'http';    
import {Server} from 'socket.io';
import mongoose from 'mongoose';
import cors from 'cors';
import Document from './models/Document.js';
import dotenv from 'dotenv';
dotenv.config();
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingInterval: 5000,
  pingTimeout: 3000
});

app.use(cors());
app.use(express.json());
console.log('🔗 Trying to connect to:', process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/collaborative-editor');
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/collaborative-editor', {
  serverSelectionTimeoutMS: 5000, // fail fast instead of hanging
})
.then(() => {
  console.log('✅ MongoDB connected successfully');
  server.listen(PORT, () => {
    console.log(`🚀 Collaboration server running on port ${PORT}`);
  });
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  process.exit(1);
});

// Track active document sessions
const documentSessions = new Map(); // documentId → { content, version, users }

// Helper function for document ID validation
const isValidDocumentId = (id) => {
  // Check if it's a valid MongoDB ObjectId
  if (mongoose.Types.ObjectId.isValid(id)) {
    return true;
  }
  // Check if it matches our custom ID format (doc_xxxxx)
  return /^doc_[a-z0-9]{9}$/.test(id);
};

io.on('connection', (socket) => {
  console.log("User connected:", socket.id);
  
  socket.emit('connection-ack', { 
    status: 'connected', 
    socketId: socket.id,
    timestamp: Date.now() 
  });

  socket.on('join-document', async ({ documentId, user }) => {
    try {
      if (!isValidDocumentId(documentId)) {
        throw new Error('Invalid document ID format');
      }

      socket.join(documentId);
      console.log(`User ${user.userId} joined document ${documentId}`);

      // Find or create document
      let doc = await Document.findOne({ 
        $or: [
          { _id: documentId },
          { slug: documentId }
        ]
      }).maxTimeMS(5000);
      
      if (!doc) {
        // Create new document with either ObjectId or custom ID
        const docData = {
          content: '',
          version: 0,
          collaborators: [user]
        };

        if (mongoose.Types.ObjectId.isValid(documentId)) {
          docData._id = documentId;
          docData.slug = documentId;
        } else {
          docData.slug = documentId;
        }

        doc = await Document.create(docData);
      } else {
        // Add user to collaborators if not already present
        const userIndex = doc.collaborators.findIndex(c => c.userId === user.userId);
        if (userIndex === -1) {
          doc.collaborators.push(user);
          await doc.save();
        }
      }

      // Initialize session
      if (!documentSessions.has(documentId)) {
        documentSessions.set(documentId, {
          content: doc.content,
          version: doc.version,
          users: new Map()
        });
      }

      const session = documentSessions.get(documentId);
      session.users.set(socket.id, user);

      // Send current document state to the new user
      socket.emit('document-state', {
        content: session.content,
        version: session.version,
        title: doc.title
      });

      // Broadcast updated collaborators list
      io.to(documentId).emit('collaborators-updated', doc.collaborators);

    } catch (err) {
      console.error('Join document error:', err);
      socket.emit('error', { 
        type: 'join-error', 
        message: err.message 
      });
    }
  });

  socket.on('text-operation', async (documentId, operation) => {
    try {
      if (!documentSessions.has(documentId)) return;

      const session = documentSessions.get(documentId);
      
      // Update in-memory content
      session.content = operation;
      session.version++;

      // Broadcast to other clients
      socket.to(documentId).emit('remote-operation', {
        operation,
        version: session.version,
        source: socket.id
      });

      // Save to database (debounced)
      await Document.findByIdAndUpdate(
        documentId,
        { 
          content: session.content,
          version: session.version,
          $addToSet: { collaborators: session.users.get(socket.id) } 
        }
      );

    } catch (err) {
      console.error('Text operation error:', err);
    }
  });

  socket.on('document-save', async ({ docId, content }) => {
    try {
      await Document.findByIdAndUpdate(
        docId,
        { 
          content: content,
          $set: { updatedAt: new Date() }
        }
      );
      console.log(`Document ${docId} saved successfully`);
    } catch (err) {
      console.error('Save error:', err);
    }
  });

  socket.on('update-title', async ({ docId, title }) => {
    try {
      await Document.findByIdAndUpdate(
        docId,
        { title: title }
      );
      socket.to(docId).emit('title-updated', title);
    } catch (err) {
      console.error('Title update error:', err);
    }
  });

  socket.on('disconnect', async () => {
    console.log("User disconnected:", socket.id);
    
    // Find all documents this user was in
    for (const [documentId, session] of documentSessions) {
      if (session.users.has(socket.id)) {
        const user = session.users.get(socket.id);
        session.users.delete(socket.id);
        
        // Remove user from collaborators in DB if they're no longer connected
        const doc = await Document.findById(documentId);
        if (doc) {
          const remainingConnections = Array.from(session.users.values())
            .some(u => u.userId === user.userId);
          
          if (!remainingConnections) {
            doc.collaborators = doc.collaborators.filter(c => c.userId !== user.userId);
            await doc.save();
          }
          
          io.to(documentId).emit('collaborators-updated', doc.collaborators);
        }

        // Clean up if no users left
        if (session.users.size === 0) {
          // Save final state before cleanup
          await Document.findByIdAndUpdate(
            documentId,
            { content: session.content, version: session.version }
          );
          documentSessions.delete(documentId);
        }
      }
    }
  });
});

// API endpoint to fetch document
app.get('/api/documents/:id', async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ error: "Document not found" });
    }
    res.json(doc);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch document" });
  }
});

// API endpoint to fetch or create document by slug
app.get('/api/documents/slug/:slug', async (req, res) => {
  try {
    let doc = await Document.findOne({ slug: req.params.slug });
    
    if (!doc) {
      doc = await Document.create({ 
        slug: req.params.slug,
        content: '',
        version: 0,
        collaborators: [] 
      });
    }
    
    res.json(doc);
  } catch (err) {
    console.error("Document error:", err);
    res.status(500).json({ error: "Failed to get document" });
  }
});

const PORT = process.env.PORT || 5000;
