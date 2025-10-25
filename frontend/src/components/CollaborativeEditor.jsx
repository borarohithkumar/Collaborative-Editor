import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Save, Download, Upload, Wifi, WifiOff, Copy, Moon, Sun } from 'lucide-react';
import { io } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';

// Premium-looking collaborative editor component (single-file)
// - Tailwind CSS classes are used for styling (light + dark)
// - Framer Motion used for small animations
// - Requires VITE_SOCKET_SERVER_URL in your frontend env to point to backend socket

const smallBadge = (children) => (
  <div className="inline-flex items-center gap-2 text-xs bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm px-2 py-1 rounded-full shadow-sm">
    {children}
  </div>
);

const ConnectionStatus = ({ isConnected }) => (
  <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${isConnected ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'} shadow-sm`}> 
    {isConnected ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
    <span>{isConnected ? 'Connected' : 'Offline'}</span>
  </div>
);

const Avatar = ({ user, isYou }) => (
  <div title={user.name} className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white shadow-md ${isYou ? 'ring-2 ring-indigo-400' : 'ring-1 ring-white/30'}`} style={{ background: user.color || '#7c3aed' }}>
    {user.name?.charAt(0).toUpperCase()}
  </div>
);

const Toast = ({ message, onClose, type = 'info' }) => (
  <AnimatePresence>
    {message && (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 8 }}
        className="fixed right-6 bottom-6 z-50 max-w-xs"
      >
        <div className={`px-4 py-2 rounded-lg shadow-lg text-sm ${type === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-white/95 dark:bg-gray-800/90 text-gray-900 dark:text-gray-100'}`}>
          <div className="flex items-center justify-between gap-2">
            <div>{message}</div>
            <button onClick={onClose} className="text-xs opacity-70 hover:opacity-100">Dismiss</button>
          </div>
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

const useDebouncedCallback = (cb, delay) => {
  const timeoutRef = useRef(null);
  return useCallback((...args) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => cb(...args), delay);
  }, [cb, delay]);
};

const getDocumentIdFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('doc');
  if (id) return id;
  return 'doc_' + Math.random().toString(36).substring(2, 11);
};

export default function CollaborativeEditor() {
  const [content, setContent] = useState('');
  const [docId] = useState(getDocumentIdFromUrl());
  const [title, setTitle] = useState('Untitled Document');
  const [currentUser] = useState(() => ({
    userId: 'user_' + Math.random().toString(36).substring(2, 9),
    name: 'User ' + Math.floor(Math.random() * 1000),
    color: `linear-gradient(135deg, hsl(${Math.floor(Math.random()*360)} 70% 50%), hsl(${Math.floor(Math.random()*360)} 60% 45%))`
  }));
  const [collaborators, setCollaborators] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [toast, setToast] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [darkMode, setDarkMode] = useState(false);

  const socketRef = useRef(null);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]); // This runs every time 'darkMode' changes

  useEffect(() => {
    const u = new URL(window.location);
    u.searchParams.set('doc', docId);
    window.history.replaceState({}, '', u);
  }, [docId]);

  useEffect(() => {
    // connect socket
    const url = import.meta.env.VITE_SOCKET_SERVER_URL || 'http://localhost:5000';
    const sock = io(url, {
      transports: ['websocket'],
      reconnectionAttempts: 6,
      timeout: 20000,
    });
    socketRef.current = sock;

    sock.on('connect', () => {
      setIsConnected(true);
      setToast('Connected to collaboration server');
      sock.emit('join-document', { documentId: docId, user: currentUser });
    });

    sock.on('disconnect', () => {
      setIsConnected(false);
      setToast('Disconnected — attempting reconnect');
    });

    sock.on('connect_error', (err) => {
      console.error('socket connect_error', err);
      setToast('Connection failed. Please check the backend server.');
    });

    sock.on('document-state', ({ content: serverContent, title: serverTitle }) => {
      if (typeof serverContent === 'string') setContent(serverContent);
      if (serverTitle) setTitle(serverTitle);
    });

    sock.on('remote-operation', ({ operation }) => {
      if (typeof operation === 'string') setContent(operation);
    });

    sock.on('collaborators-updated', (updated) => {
      setCollaborators(updated || []);
    });

    sock.on('error', (e) => {
      console.error('socket error', e);
      setToast(e.message || 'Unexpected socket error');
    });

    return () => {
      sock.disconnect();
    };
  }, [docId, currentUser]);

  // debounced autosave
  const saveToServer = useCallback((payload) => {
    if (!socketRef.current || !socketRef.current.connected) return;
    setIsSaving(true);
    socketRef.current.emit('document-save', payload, () => {
      // optional ack
      setIsSaving(false);
    });
  }, []);

  const debouncedSave = useDebouncedCallback((payload) => {
    saveToServer(payload);
    setToast('Auto-saved');
  }, 900);

  const handleContentChange = (e) => {
    const text = e.target.value;
    setContent(text);
    debouncedSave({ docId, content: text });
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('text-operation', docId, text);
    }
  };

  const handleTitleChange = (e) => {
    const t = e.target.value;
    setTitle(t);
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('update-title', { docId, title: t });
    }
  };

  const handleManualSave = () => {
    saveToServer({ docId, content });
    setToast('Saved');
  };

  const handleExport = () => {
    const blob = new Blob([content], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${title || 'document'}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setToast('Exported as .txt');
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      setContent(text);
      debouncedSave({ docId, content: text });
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('text-operation', docId, text);
      }
      setToast('File imported');
    };
    reader.readAsText(file);
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setToast('Share link copied');
    } catch (e) {
      setToast('Failed to copy link');
    }
  };

  // small helper UI pieces
  const stats = {
    chars: content.length,
    words: content.split(/\s+/).filter(Boolean).length,
  };

  return (
    // <div className={`${darkMode ? 'dark' : ''}`}>
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 text-gray-900 dark:text-gray-100 font-sans">

        {/* Top bar */}
        <header className="fixed top-4 left-1/2 -translate-x-1/2 w-[92%] max-w-6xl z-40">
          <div className="backdrop-blur-md bg-white/60 dark:bg-gray-900/60 rounded-2xl shadow-xl border border-white/50 dark:border-gray-700/40 px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-tr from-indigo-400 to-violet-500 shadow-md">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <input value={title} onChange={handleTitleChange} className="bg-transparent outline-none text-lg font-semibold w-64 md:w-96" />
              {smallBadge(<span className="text-xs">ID: {docId}</span>)}
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-3">
                <ConnectionStatus isConnected={isConnected} />
                <div className="flex -space-x-2 items-center">
                  {collaborators.slice(0,5).map(c => (
                    <Avatar key={c.userId} user={c} isYou={c.userId === currentUser.userId} />
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button onClick={() => setDarkMode(d => !d)} className="p-2 rounded-full hover:scale-105 transition">
                  {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>

                <button onClick={handleCopyLink} className="px-3 py-1 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-sm shadow-sm hover:scale-105 transition inline-flex items-center gap-2">
                  <Copy className="w-4 h-4" /> Share
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main layout */}
        <main className="max-w-6xl mx-auto pt-28 pb-12 px-4 grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* Editor area */}
          <section className="lg:col-span-8 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-white/60 dark:border-gray-800/40 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-500 dark:text-gray-400">Editing</div>
                <div className="text-sm text-gray-400">•</div>
                <div className="text-sm text-gray-500">{stats.words} words</div>
              </div>

              <div className="flex items-center gap-3">
                <button onClick={handleManualSave} className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/95 dark:bg-gray-800/90 border border-gray-100 dark:border-gray-700 shadow-sm hover:scale-[1.02] transition">
                  <Save className="w-4 h-4" /> <span className="text-sm">Save</span>
                </button>
                <div className="text-sm text-gray-400">{isSaving ? 'Saving...' : 'Synced'}</div>
              </div>
            </div>

            <textarea
              value={content}
              onChange={handleContentChange}
              className="w-full min-h-[60vh] resize-none rounded-xl p-6 text-base leading-relaxed bg-gradient-to-b from-white to-white/90 dark:from-gray-900 dark:to-gray-900/90 outline-none border border-transparent focus:border-indigo-300 transition shadow-inner
              /* --- For Firefox --- */
              [scrollbar-width:thin]
              [scrollbar-color:#9ca3af_transparent]
              dark:[scrollbar-color:#4b5563_transparent]

              /* --- For Chrome, Safari, and Opera --- */
              [&::-webkit-scrollbar]:w-2
              [&::-webkit-scrollbar-track]:bg-transparent
              [&::-webkit-scrollbar-thumb]:rounded-full
              [&::-webkit-scrollbar-thumb]:bg-gray-400
              dark:[&::-webkit-scrollbar-thumb]:bg-gray-600
              [&::-webkit-scrollbar-thumb:hover]:bg-gray-500
              dark:[&::-webkit-scrollbar-thumb:hover]:bg-gray-500"
              placeholder="Write your ideas — they are saved automatically."
            />

            <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
              <div>Characters: <strong className="text-gray-700 dark:text-gray-200">{stats.chars}</strong></div>
              <div>Last change: {/* placeholder for last changed time */} — live</div>
            </div>
          </section>

          {/* Right sidebar */}
          <aside className="lg:col-span-4 space-y-6">
            <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-white/40 dark:border-gray-800/30">
              <h4 className="font-semibold mb-3">Actions</h4>
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={handleManualSave} className="col-span-1 py-2 rounded-xl bg-gradient-to-tr from-indigo-500 to-violet-500 text-white flex items-center justify-center gap-2 shadow"> <Save className="w-4 h-4" /> Save </button>
                  <label className="col-span-1 py-2 rounded-xl bg-emerald-500 text-white flex items-center justify-center gap-2 cursor-pointer shadow"><Download className="w-4 h-4" /> <input type="file" accept=".txt,.md" onChange={handleImport} className="hidden" /> Import</label>
                  <button onClick={handleExport} className="col-span-1 py-2 rounded-xl bg-purple-900 text-white flex items-center justify-center gap-2 shadow"> <Upload className="w-4 h-4" /> Export </button>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-white/40 dark:border-gray-800/30">
              <h4 className="font-semibold mb-3">Collaborators</h4>
              <div className="flex items-center gap-3 mb-3">
                <Avatar user={currentUser} isYou />
                <div>
                  <div className="text-sm font-medium">{currentUser.name} <span className="text-xs text-gray-400">(You)</span></div>
                  <div className="text-xs text-gray-400">Active now</div>
                </div>
              </div>

              <div className="space-y-2 max-h-44 overflow-y-auto">
                {collaborators.length === 0 && <div className="text-sm text-gray-400">No collaborators yet</div>}
                {collaborators.map(c => (
                  <div key={c.userId} className="flex items-center gap-3">
                    <Avatar user={c} />
                    <div className="flex-1">
                      <div className="text-sm font-medium">{c.name}</div>
                      <div className="text-xs text-gray-400">Editing</div>
                    </div>
                    <div className="text-xs text-gray-500">{c.userId}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-lg border border-white/40 dark:border-gray-800/30">
              <h4 className="font-semibold mb-3">Activity</h4>
              <div className="text-xs text-gray-400">Recent edits and presence will appear here.</div>
              <div className="mt-3 space-y-2 text-sm">
                {collaborators.slice(0,5).map(c => (
                  <div key={c.userId} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: c.color }} />
                    <div className="flex-1">{c.name} edited — <span className="text-gray-400 text-xs">just now</span></div>
                    <div className="text-xs text-gray-400">{c.userId}</div>
                  </div>
                ))}
              </div>
            </div>

          </aside>
        </main>

        {/* small floating status */}
        <div className="fixed left-6 bottom-6 z-40">
          <div className="bg-white/95 dark:bg-gray-900/90 px-3 py-2 rounded-lg shadow-md border border-white/50 dark:border-gray-800/40 text-sm">
            <div className="flex items-center gap-3">
              <ConnectionStatus isConnected={isConnected} />
              <div className="text-sm text-gray-500">{isSaving ? 'Saving...' : 'All changes saved'}</div>
            </div>
          </div>
        </div>

        <Toast message={toast} onClose={() => setToast(null)} />

      </div>
    // </div>
  );
}