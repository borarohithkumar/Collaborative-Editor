# Collaborative Editor

A browser-based collaborative rich-text editor for working in shared document rooms. It combines a Tiptap editor with Socket.IO updates, collaborator presence, document chat, an activity feed, and document import/export tools.

**Live demo:** https://collaborative-editor-proj.vercel.app/  
**Repository:** https://github.com/borarohithkumar/Collaborative-Editor

## Features

- Create or join a document room using a document ID and display name.
- Synchronize document content between connected participants with Socket.IO.
- View connected collaborators and typing activity.
- Exchange messages in document chat and view a recent activity feed.
- Set a password for a document room; passwords are hashed with bcrypt before storage.
- Edit rich text with headings, lists, inline formatting, text colour, and highlighting.
- Import `.docx`, `.pdf`, `.txt`, and `.md` files. PDF import extracts text; it does not preserve the original page layout.
- Export to `.txt`, `.md`, `.html`, and `.docx`, or use the browser's print flow for PDF output.
- Switch between light and dark themes and view connection status.

## Tech stack

- **Frontend:** React, Vite, Tailwind CSS, Tiptap, Socket.IO Client, Framer Motion
- **Backend:** Node.js, Express, Socket.IO
- **Persistence:** MongoDB with Mongoose
- **Document utilities:** Mammoth, PDF.js, Marked, Turndown, DOMPurify, `html-docx-js-typescript`
- **Containerization:** Docker Compose configuration

## How it works

The React frontend provides the editor and room interface. The Express/Socket.IO backend manages document rooms, broadcasts content updates and participant events, and saves document content and metadata in MongoDB. The backend also persists recent chat messages and activity entries.

## Run locally

### Prerequisites

- Node.js and npm
- MongoDB, running locally or available through a MongoDB connection URI

### 1. Clone the repository

```bash
git clone https://github.com/borarohithkumar/Collaborative-Editor.git
cd Collaborative-Editor
```

### 2. Start the backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```dotenv
PORT=5000
MONGODB_URI=mongodb://127.0.0.1:27017/collaborative-editor
FRONTEND_URL=http://localhost:5173
```

Use your own MongoDB URI when using a hosted database. Start the API/socket server:

```bash
npm start
```

### 3. Start the frontend

Open a second terminal:

```bash
cd frontend
npm install
```

Create `frontend/.env`:

```dotenv
VITE_SOCKET_SERVER_URL=http://localhost:5000
```

Run the Vite development server:

```bash
npm run dev
```

Open the local URL printed by Vite, typically `http://localhost:5173`.

## Docker configuration

The repository includes `docker-compose.yaml` and per-service files named `dockerfile` (lowercase). Docker Compose normally looks for `Dockerfile` unless the build configuration specifies another filename. The Compose file also sets `VITE_SOCKET_SERVER_URL` to a fixed URL (`https://rbkreator.me`). Before using Compose in another environment, either rename the Dockerfiles or set `dockerfile: dockerfile` for each build, and change the frontend build argument to the URL of the backend that clients can reach.

## Design notes and limitations

- Content changes are broadcast through Socket.IO as document content updates. The project does not implement an operational-transformation or CRDT algorithm, so simultaneous edits are not guaranteed to merge without conflicts.
- Active document sessions are cached in backend memory. The current design should be treated as a single-backend-instance setup unless session state and Socket.IO coordination are redesigned for multiple instances.
- Password-protected rooms are an application feature, not a claim of end-to-end encryption or a security audit. Avoid using the public demo for sensitive documents.

## What this project helped me practise

React state and rich-text editing, Socket.IO room events, Express, MongoDB persistence, file conversion, configuration through environment variables, and container-based deployment concepts.
