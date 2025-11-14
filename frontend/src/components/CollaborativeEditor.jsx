import { useState, useEffect, useRef, useCallback } from "react";
import {
  FileText,
  Copy,
  Save,
  Download,
  Upload,
  Wifi,
  WifiOff,
  Moon,
  Sun,
  FilePlus,
  User,
  Trash2,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Undo,
  Redo,
  Palette,
  Highlighter,
} from "lucide-react";
import { io } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import SimpleBar from "simplebar-react";
import "simplebar-react/dist/simplebar.min.css";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";
import { marked } from "marked"; // Converts markdown string to HTML string
import TurndownService from "turndown"; // Converts HTML string to markdown string
import DOMPurify from "dompurify";

// --- Turndown Setup ---
// Initialize Turndown to convert HTML back to Markdown for export
const turndownService = new TurndownService();
// Add a rule for strikethrough, which isn't default
turndownService.addRule("strikethrough", {
  filter: ["s", "strike", "del"],
  replacement: (content) => `~~${content}~~`,
});

// --- Constants ---
// URL for the Socket.io backend server
const SOCKET_SERVER_URL =
  import.meta.env.VITE_SOCKET_SERVER_URL || "http://localhost:5000";

// --- Helper Components ---

/**
 * Displays a "Connected" or "Offline" badge.
 */
const ConnectionStatus = ({ isConnected }) => (
  <div
    className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
      isConnected
        ? "bg-emerald-50 text-emerald-800"
        : "bg-rose-50 text-rose-800"
    } shadow-sm`}
  >
    {isConnected ? (
      <Wifi className="w-4 h-4" />
    ) : (
      <WifiOff className="w-4 h-4" />
    )}
    <span>{isConnected ? "Connected" : "Offline"}</span>
  </div>
);

/**
 * Renders a circular user avatar with their initial and a unique color.
 */
const Avatar = ({ user, isYou, size = "default" }) => {
  const sizeClasses =
    size === "small"
      ? "w-7 h-7 text-xs" // Small size for header/activity
      : "w-9 h-9 text-sm"; // Default size for sidebar

  return (
    <div
      title={user.name}
      className={`
        ${sizeClasses} 
        rounded-full flex items-center justify-center font-semibold text-white shadow-md 
        ${isYou ? "ring-2 ring-indigo-400" : "ring-1 ring-white/30"}
      `}
      style={{
        // Use the user's color (which can be a gradient) or default to a purple
        backgroundImage: user.color?.includes("gradient")
          ? user.color
          : `linear-gradient(135deg, ${user.color || "#7c3aed"}, ${
              user.color || "#7c3aed"
            })`,
      }}
    >
      {user.name?.charAt(0).toUpperCase()}
    </div>
  );
};

/**
 * A self-dismissing notification toast.
 */
const Toast = ({ message, onClose, type = "info" }) => {
  // Effect to set a timer for automatically closing the toast
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose();
    }, 5000); // 5-second duration
    return () => clearTimeout(timer);
  }, [message, onClose]);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="fixed right-6 bottom-4 z-50 max-w-xs"
        >
          <div
            className={`px-4 py-2 rounded-lg shadow-lg text-sm ${
              type === "error"
                ? "bg-rose-50 text-rose-700"
                : "bg-white/95 dark:bg-gray-800/90 text-gray-900 dark:text-gray-100"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div>{message}</div>
              <button
                onClick={onClose}
                className="cursor-pointer text-xs opacity-70 hover:opacity-100"
              >
                Dismiss
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * Modal to force user to set their name on first visit.
 */
const NameModal = ({ isOpen, onSave, onClose }) => {
  const [localName, setLocalName] = useState("");

  const handleSave = () => {
    if (localName.trim()) {
      onSave(localName.trim());
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      handleSave();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

          {/* Modal Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl"
          >
            {/* close button */}
            {onClose && (
              <button
                onClick={onClose}
                title="Close"
                className="absolute top-3 right-3 p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            )}
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Welcome!
            </h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              What should we call you?
            </p>

            <div className="relative mt-4">
              <input
                id="name_input"
                type="text"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-3 pl-10 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                placeholder="Enter your name..."
                autoFocus
              />
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            </div>

            <button
              onClick={handleSave}
              className="cursor-pointer mt-4 w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            >
              Save and Join
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * A generic modal to confirm destructive actions (e.g., "Clear Document").
 */
const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, message }) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />

        {/* Modal Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {message}
          </p>

          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="cursor-pointer rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className="cursor-pointer rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            >
              Confirm
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

/**
 * Modal for selecting export formats.
 */
const ExportModal = ({ isOpen, onClose, onConfirm, formats, setFormats }) => {
  // Toggles a format (e.g., 'txt', 'md') in the state
  const toggleFormat = (format) => {
    setFormats((prev) => ({ ...prev, [format]: !prev[format] }));
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative w-full max-w-xs rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl"
          >
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Export Document As...
            </h3>

            <div className="mt-4 space-y-3">
              {["txt", "md", "html"].map((format) => (
                <label
                  key={format}
                  htmlFor={`format-${format}`}
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-700/60 cursor-pointer transition-all hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <input
                    type="checkbox"
                    id={`format-${format}`}
                    checked={formats[format]}
                    onChange={() => toggleFormat(format)}
                    className="h-5 w-5 rounded text-indigo-500 focus:ring-indigo-400 border-gray-300 dark:border-gray-600 dark:bg-gray-900"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    .{format.toUpperCase()}
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                      {format === "txt"
                        ? "(Plain Text)"
                        : format === "md"
                        ? "(Markdown)"
                        : "(HTML)"}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="cursor-pointer rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 focus:outline-none"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                className="cursor-pointer rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-600 focus:outline-none"
              >
                Export
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

/**
 * Modal to request password for a protected document.
 */
const PasswordModal = ({
  isOpen,
  onClose,
  onSubmit,
  password,
  setPassword,
  error,
  isJoining,
}) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
        />
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-gray-800 p-6 shadow-xl"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Password Required
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            This document is password protected. Please enter the password to
            join.
          </p>

          <div className="relative mt-4">
            <input
              id="pw_input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSubmit()}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-3 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="Enter password..."
              autoFocus
            />
          </div>
          {error && <p className="mt-2 text-sm text-rose-500">{error}</p>}
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="cursor-pointer rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              onClick={onSubmit}
              className="cursor-pointer rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-600 disabled:opacity-50"
              disabled={isJoining}
            >
              {isJoining ? (
                // Show spinner when joining
                <svg
                  className="w-5 h-5 animate-spin"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  ></path>
                </svg>
              ) : (
                "Join"
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    )}
  </AnimatePresence>
);

/**
 * The Tiptap editor's toolbar.
 */
const EditorToolbar = ({ editor }) => {
  const [, setVersion] = useState(0);

  // This effect forces the toolbar to re-render when the editor's
  // selection or marks change, ensuring buttons appear "active" correctly.
  useEffect(() => {
    if (!editor) return;
    const handler = () => setVersion((v) => v + 1);
    editor.on("transaction", handler);
    return () => editor.off("transaction", handler);
  }, [editor]);

  if (!editor) return null;

  // A generic button for the toolbar
  const ToggleButton = ({ icon: Icon, onAction, isActive = false, title }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault(); // Prevents editor from losing focus
        onAction();
      }}
      className={`p-1.5 rounded-md transition-all cursor-pointer ${
        isActive
          ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-200"
          : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
      }`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b border-gray-200 dark:border-gray-800/50">
      <ToggleButton
        icon={Bold}
        title="Bold"
        isActive={editor.isActive("bold")}
        onAction={() => editor.chain().focus().toggleBold().run()}
      />
      <ToggleButton
        icon={Italic}
        title="Italic"
        isActive={editor.isActive("italic")}
        onAction={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToggleButton
        icon={Strikethrough}
        title="Strike"
        isActive={editor.isActive("strike")}
        onAction={() => editor.chain().focus().toggleStrike().run()}
      />
      <ToggleButton
        icon={Code}
        title="Code"
        isActive={editor.isActive("code")}
        onAction={() => editor.chain().focus().toggleCode().run()}
      />

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-700 mx-1" />
      <ColorButton editor={editor} type="color" />
      <ColorButton editor={editor} type="highlight" />

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-700 mx-1" />

      <ToggleButton
        icon={Heading1}
        title="H1"
        isActive={editor.isActive("heading", { level: 1 })}
        onAction={() =>
          editor.chain().focus().toggleHeading({ level: 1 }).run()
        }
      />
      <ToggleButton
        icon={Heading2}
        title="H2"
        isActive={editor.isActive("heading", { level: 2 })}
        onAction={() =>
          editor.chain().focus().toggleHeading({ level: 2 }).run()
        }
      />

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-700 mx-1" />

      <ToggleButton
        icon={List}
        title="Bullet list"
        isActive={editor.isActive("bulletList")}
        onAction={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToggleButton
        icon={ListOrdered}
        title="Ordered list"
        isActive={editor.isActive("orderedList")}
        onAction={() => editor.chain().focus().toggleOrderedList().run()}
      />

      <div className="w-px h-5 bg-gray-300 dark:bg-gray-700 mx-1" />

      <ToggleButton
        icon={Undo}
        title="Undo"
        onAction={() => editor.chain().focus().undo().run()}
      />
      <ToggleButton
        icon={Redo}
        title="Redo"
        onAction={() => editor.chain().focus().redo().run()}
      />
    </div>
  );
};

/**
 * A special toolbar button for text color/highlighting that uses
 * a hidden <input type="color"> for the color picker.
 */
const ColorButton = ({ editor, type }) => {
  const isColor = type === "color";
  const Icon = isColor ? Palette : Highlighter;
  const title = isColor ? "Text Color" : "Highlight Color";
  const activeCheck = isColor ? "textStyle" : "highlight";

  const inputRef = useRef(null);
  // Get the current color from the editor's active marks
  const currentColor = editor.getAttributes(activeCheck).color;

  // Applies the new color from the color picker
  const handleColorChange = (e) => {
    const color = e.target.value;
    const chain = editor.chain().focus();
    if (isColor) {
      chain.setColor(color).run();
    } else {
      chain.toggleHighlight({ color }).run();
    }
  };

  // Unsets the color (e.g., on right-click)
  const unsetColor = () => {
    const chain = editor.chain().focus();
    if (isColor) {
      chain.unsetColor().run();
    } else {
      chain.unsetHighlight().run();
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        title={title}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => inputRef.current.click()} // Click the hidden input
        onContextMenu={(e) => {
          // Right-click to unset color
          e.preventDefault();
          unsetColor();
        }}
        className={`p-1.5 rounded-md transition-all cursor-pointer ${
          editor.isActive(activeCheck)
            ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-200"
            : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
        }`}
      >
        <Icon className="w-4 h-4" />
        {/* Swatch to show current color */}
        <span
          className="w-4 h-1 absolute bottom-1 left-1/2 -translate-x-1/2 rounded"
          style={{ backgroundColor: currentColor || "transparent" }}
        />
      </button>
      <input
        type="color"
        ref={inputRef}
        onInput={handleColorChange} // Use onInput for live updates
        value={currentColor || "#000000"}
        className="w-0 h-0 absolute -z-10 opacity-0" // Hide the input
      />
    </div>
  );
};

// --- Custom Hooks ---

/**
 * A custom hook that creates a debounced version of a callback function.
 * This is used to delay expensive operations like saving to the server
 * or emitting socket events while the user is actively typing.
 */
const useDebouncedCallback = (cb, delay) => {
  const cbRef = useRef(cb);
  const timeoutRef = useRef(null);

  // Always keep the latest callback in the ref
  useEffect(() => {
    cbRef.current = cb;
  }, [cb]);

  return useCallback(
    (...args) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        // Call the *latest* callback from the ref
        cbRef.current(...args);
      }, delay);
    },
    [delay] // Only depends on delay, which is stable
  );
};

// --- Helper Functions ---

/**
 * Triggers a browser download for the given content.
 */
const downloadFile = (content, fileName, mimeType) => {
  const blob = new Blob([content], { type: mimeType });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

/**
 * Reads the 'doc' query parameter from the URL on initial load.
 */
const getDocumentIdFromUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("doc"); // Will be null if not found
};

// Helper function to get or create a persistent userId
const getPersistentUserId = () => {
  let savedId = localStorage.getItem("collaborator_userId");
  if (!savedId) {
    savedId = "user_" + Math.random().toString(36).substring(2, 9);
    localStorage.setItem("collaborator_userId", savedId);
  }
  return savedId;
};

// --- Main Component ---

export default function CollaborativeEditor() {
  // --- State ---
  // Document and Lobby
  const [docId, setDocId] = useState(getDocumentIdFromUrl());
  const [lobbyInput, setLobbyInput] = useState("");
  const [title, setTitle] = useState("Untitled Document");
  // null = 'lobby', 'public' = in doc, 'private' = needs password
  const [docState, setDocState] = useState(null);
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [lobbyJoinTime, setLobbyJoinTime] = useState(0); // For password spinner

  // Networking and Status
  const [collaborators, setCollaborators] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [saveStatus, setSaveStatus] = useState("Synced"); // 'Synced', 'Unsaved', 'Saving'
  const [typingUser, setTypingUser] = useState(null);

  // User and UI
  const [username, setUsername] = useState("Anonymous");
  const [toast, setToast] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [stats, setStats] = useState({ chars: 0, words: 0 });

  // Modals
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
  });
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFormats, setExportFormats] = useState({
    txt: true,
    md: false,
    html: false,
  });

  // Activity Log
  const [activityLog, setActivityLog] = useState([]);

  // --- Tiptap Editor Instance ---
  const editor = useEditor({
    extensions: [
      StarterKit, // Includes History, Bold, Italic, etc.
      Placeholder.configure({
        placeholder: "Write your ideas — they are saved automatically.",
      }),
      TextStyle, // Required for Color
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: "",
    editorProps: {
      attributes: {
        class:
          "h-full p-6 prose dark:prose-invert prose-sm sm:prose-base max-w-none focus:outline-none placeholder:text-gray-400 dark:placeholder:text-gray-600",
      },
    },
    // This function is called on *every* editor update (e.g., key press)
    onUpdate: ({ editor }) => {
      // 1. Update UI state immediately
      setSaveStatus("Unsaved");
      emitTyping(); // Let others know we're typing

      // 2. Schedule heavier operations to run after the UI updates
      setTimeout(() => {
        if (editor.isDestroyed) return;

        // Calculate stats
        const text = editor.getText();
        setStats({
          chars: text.length,
          words: text.split(/\s+/).filter(Boolean).length,
        });

        // Schedule network calls
        debouncedEmitOperation(editor, docId); // Send new content to others
        debouncedSave(editor, docId); // Save new content to server/db
      }, 0);
    },
  });

  // --- Current User Object ---
  // This object is what we send to the socket server to identify us
  const [currentUser, setCurrentUser] = useState(() => ({
    userId: getPersistentUserId(), // 👈 USE THE PERSISTENT ID
    name: "Anonymous", // Default name, updated by effect
    color: `linear-gradient(135deg, hsl(${Math.floor(
      Math.random() * 360
    )} 70% 50%), hsl(${Math.floor(Math.random() * 360)} 60% 45%))`,
  }));

  // // [Effect] Inject custom CSS for all scrollbars to avoid Tailwind conflicts
  // useEffect(() => {
  //   const styleId = "custom-scrollbar-styles";
  //   let styleTag = document.getElementById(styleId);

  //   // Create the style tag if it doesn't exist
  //   if (!styleTag) {
  //     styleTag = document.createElement("style");
  //     styleTag.id = styleId;
  //     document.head.appendChild(styleTag);
  //   }

  //   // Define the custom CSS rules
  //   styleTag.textContent = `
  //     /* ================================================================
  //       1. OLD WEB-BROWSER-ONLY STYLING (WebKit: Chrome, Safari)
  //       This block targets older browsers OR browsers that do NOT
  //       support the new 'scrollbar-color' standard.
  //     ================================================================
  //     */
  //     @supports not (scrollbar-color: auto) {

  //       /* --- GLOBAL: Hide buttons --- */
  //       ::-webkit-scrollbar-button {
  //         display: none !important;
  //         width: 0 !important;
  //         height: 0 !important;
  //       }

  //       /* --- Style #editor-scroller, #collab-scroller --- */
  //       #editor-scroller::-webkit-scrollbar,
  //       #collab-scroller::-webkit-scrollbar {
  //         width: 8px !important;
  //       }

  //       #editor-scroller::-webkit-scrollbar-track,
  //       #collab-scroller::-webkit-scrollbar-track {
  //         background: transparent !important;
  //       }

  //       #editor-scroller::-webkit-scrollbar-thumb,
  //       #collab-scroller::-webkit-scrollbar-thumb {
  //         background-color: #9ca3af !important; /* gray-400 */
  //         border-radius: 9999px !important;
  //       }

  //       .dark #editor-scroller::-webkit-scrollbar-thumb,
  //       .dark #collab-scroller::-webkit-scrollbar-thumb {
  //         background-color: #4b5563 !important; /* gray-600 */
  //       }

  //       /* --- Style #activity-scroller --- */

  //       /* HIDE the horizontal bar */
  //       #activity-scroller::-webkit-scrollbar:horizontal {
  //         display: none !important;
  //         height: 0 !important;
  //       }

  //       /* STYLE the vertical bar */
  //       #activity-scroller::-webkit-scrollbar:vertical {
  //         width: 8px !important;
  //       }

  //       #activity-scroller::-webkit-scrollbar-track:vertical {
  //         background: transparent !important;
  //       }

  //       #activity-scroller::-webkit-scrollbar-thumb:vertical {
  //         background-color: #9ca3af !important; /* gray-400 */
  //         border-radius: 9999px !important;
  //       }

  //       .dark #activity-scroller::-webkit-scrollbar-thumb:vertical {
  //         background-color: #4b5563 !important; /* gray-600 */
  //       }
  //     }

  //     /* ================================================================
  //       2. MODERN BROWSER STYLING (Firefox & new Chrome/Edge)
  //       This block ONLY runs in browsers that support the new
  //       'scrollbar-color' standard. This PREVENTS the conflict.
  //     ================================================================
  //     */
  //     @supports (scrollbar-color: auto) {

  //       /* --- Style #editor-scroller, #collab-scroller --- */
  //       /* (These browsers don't have scrollbar buttons) */
  //       #editor-scroller,
  //       #collab-scroller {
  //         scrollbar-width: thin !important;
  //         scrollbar-color: #9ca3af transparent !important; /* gray-400 */
  //       }

  //       .dark #editor-scroller,
  //       .dark #collab-scroller {
  //         scrollbar-color: #4b5563 transparent !important; /* gray-600 */
  //       }

  //       /* --- Style #activity-scroller --- */
  //       #activity-scroller {
  //         /* 'thin' hides the horizontal bar and styles the vertical */
  //         scrollbar-width: thin !important;
  //         scrollbar-color: #9ca3af transparent !important; /* thumb, track */
  //       }

  //       .dark #activity-scroller {
  //         scrollbar-color: #4b5563 transparent !important;
  //       }
  //     }
  //   `;
  //   // Cleanup function
  //   return () => {
  //     const existingStyle = document.getElementById(styleId);
  //     if (existingStyle) {
  //       document.head.removeChild(existingStyle);
  //     }
  //   };
  // }, []); // The empty array [] means this effect runs only once on mount

  // This effect synchronizes the `currentUser` object with the `username` state
  useEffect(() => {
    setCurrentUser((prevUser) => ({
      ...prevUser,
      name: username,
    }));
  }, [username]);

  // --- Refs ---
  const socketRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const collaboratorListRef = useRef(null); // For auto-scrolling
  const activityListRef = useRef(null); // For auto-scrolling

  const mainRef = useRef(null); // for dynamic setting of ht calculated of aside
  const asideRef = useRef(null); // for dynamic calc of aside's ht to set to main

  // --- Effects ---

// [Effect] Dynamically set main's height to match the aside
  useEffect(() => {
    const mainEl = mainRef.current;
    const asideEl = asideRef.current;

    // Only run on large screens (where grid is active)
    if (mainEl && asideEl && window.innerWidth >= 1024) {
      
      // 1. Get the aside's computed height
      const asideHeight = asideEl.offsetHeight;

      // 2. Get the main's padding
      const mainStyles = getComputedStyle(mainEl);
      const paddingTop = parseFloat(mainStyles.paddingTop);
      const paddingBottom = parseFloat(mainStyles.paddingBottom);

      // 3. Apply the formula
      // (Aside Height + Main Padding Top + Main Padding Bottom)
      mainEl.style.height = `${asideHeight + paddingTop + paddingBottom}px`;
    }

    // We only need this to run once on load,
    // because your aside height is now constant.
  }, []); // Empty array means it runs once on mount

  // [Effect] Toggle dark mode class on <html> element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  // [Effect] Check for saved username in localStorage on initial load
  useEffect(() => {
    const savedName = localStorage.getItem("collaborator_username");
    if (savedName) {
      setUsername(savedName);
    } else {
      // If no name, force the user to set one
      setIsNameModalOpen(true);
    }
  }, []); // Runs only once on mount

  // [Effect] Synchronize the `docId` with the URL query string
  useEffect(() => {
    const u = new URL(window.location);
    if (docId) {
      // If we have a valid docId, set it in the URL
      u.searchParams.set("doc", docId);
    } else {
      // If docId is null (e.g., in lobby), remove it from the URL
      u.searchParams.delete("doc");
    }
    window.history.replaceState({}, "", u);
  }, [docId]);

  // [Effect] Initialize and connect the Socket.io client
  // Runs ONLY ONCE on component mount.
  useEffect(() => {
    const sock = io(SOCKET_SERVER_URL, {
      transports: ["websocket"],
      reconnectionAttempts: 6,
      timeout: 20000,
    });
    socketRef.current = sock;

    sock.on("connect", () => setIsConnected(true));
    sock.on("disconnect", () => setIsConnected(false));
    sock.on("connect_error", (err) => {
      console.error("socket connect_error", err);
      setToast("Connection failed. Please check the backend server.");
    });

    // Disconnect socket on component unmount
    return () => {
      sock.disconnect();
    };
  }, []); // Empty dependency array = runs once on mount

  // [Helper] Adds a new item to the top of the activity log
  // const addActivity = useCallback((message, user = null) => {
  //   setActivityLog((prevLog) =>
  //     [
  //       {
  //         id: Date.now() + Math.random(),
  //         message,
  //         user, // The user object (or null for system)
  //         timestamp: new Date(),
  //       },
  //       ...prevLog,
  //     ].slice(0, 50)
  //   ); // Keep only the latest 50 activities
  // }, []); // No dependencies, function is stable

  // [Effect] Register all socket event listeners
  // This effect re-runs if its dependencies (like `editor` or `username`) change,
  // ensuring the listeners always have access to the latest state.
  useEffect(() => {
    if (!socketRef.current || !editor || !isConnected) return;

    const sock = socketRef.current;

    // --- Listener Setup ---

    // Fired when we successfully join a doc and server sends its state
    const onDocumentState = ({
      content: serverContent,
      title: serverTitle,
      activityLog: serverActivityLog, // GET THE SAVED LOG
    }) => {
      // addActivity("You joined the document", currentUser);

      if (editor && typeof serverContent === "string")
        editor.commands.setContent(serverContent, false);
      if (serverTitle) setTitle(serverTitle);

      // Our "constant" hardcoded element
  const loadMessage = {
    _id: "client_load_message",
    user: null, // Makes it a "System" message
    message: "Document loaded successfully.",
    createdAt: new Date().toISOString(),
  };

  // Check if serverActivityLog is a valid array AND has items
  if (Array.isArray(serverActivityLog) && serverActivityLog.length > 0) {
    // --- SCENARIO 1: SUCCESS ---
    // Server log has items (like "User Joined").
    // We add our message to it.
    // Result: ["User Joined", "Document loaded"] (2+ elements)
    setActivityLog([...serverActivityLog, loadMessage]);
  } else {
    // --- SCENARIO 2: EMPTY LOG ([], null, or undefined) ---
    // The server log is empty. We must create 2 elements.

    // Our "constant" hardcoded element #2
    const welcomeMessage = {
       _id: "client_welcome_message",
       user: null,
       message: "Welcome to the document!",
       createdAt: new Date(Date.now() - 1000).toISOString(), // 1 sec older
    };

    // Result: ["Welcome", "Document loaded"] (Exactly 2 elements)
    setActivityLog([welcomeMessage, loadMessage]);
  }

      const duration = Date.now() - lobbyJoinTime;
      const minDisplayTime = 1000; // Min 1 sec for spinner

      // **SPINNER FIX**: Only hide spinner and modal *after* min display time
      if (lobbyJoinTime === 0 || duration >= minDisplayTime) {
        setDocState("public");
        setIsJoining(false);
      } else {
        setTimeout(() => {
          setDocState("public");
          setIsJoining(false);
        }, minDisplayTime - duration);
      }
    };

    // Fired when another user changes the document content
    const onRemoteOperation = ({ operation }) => {
      if (editor && typeof operation === "string")
        editor.commands.setContent(operation, false); // `false` = don't emit change
    };

    // Fired when the list of collaborators changes (join/leave)
    const onCollaboratorsUpdated = (updatedList) => {
      const newList = updatedList || [];
      // === Filter duplicates from the server ===
      const uniqueUserIds = new Set();
      const uniqueList = newList.filter(user => {
        if (uniqueUserIds.has(user.userId)) {
          return false; // Found a duplicate, skip it
        }
        uniqueUserIds.add(user.userId);
        return true; // First time seeing this user, keep it
      });

      // Use functional state update to compare old and new lists
      setCollaborators((prevCollaborators) => {
        const prevIds = new Set(prevCollaborators.map((c) => c.userId));
        // Use the *unique* list for comparison
        const newIds = new Set(uniqueList.map((c) => c.userId));

        // Log users who joined
        newList.forEach((user) => {
          if (!prevIds.has(user.userId) && user.userId !== currentUser.userId) {
            // addActivity("joined", user);
          }
        });

        // Log users who left
        prevCollaborators.forEach((user) => {
          if (!newIds.has(user.userId) && user.userId !== currentUser.userId) {
            // addActivity("left", user);
          }
        });

        return uniqueList; // Set the new state
      });
    };

    // Fired on any server-side error
    const onError = (e) => {
      console.error("socket error", e);
      setToast(e.message || "An unexpected error occurred");
      setIsJoining(false);

      if (e.type === "auth-error") {
        setDocState("private"); // Re-show password modal
      } else if (e.type === "join-error") {
        setDocState(null); // Stay in lobby
        setDocId(null); // Reset docId
        setLobbyInput(""); // Clear bad ID from input
      }
    };

    // Fired when another user starts typing
    const onUserStartedTyping = (name) => {
      if (name === username) return; // Ignore our own typing
      setTypingUser(name);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      // Hide "is typing" message after 3 seconds
      typingTimeoutRef.current = setTimeout(() => {
        setTypingUser(null);
      }, 3000);
    };

    // Fired if the doc we try to join requires a password
    const onPasswordRequired = () => {
      setDocState("private"); // Show the password modal
    };

    // Fired when another user changes the title
    const onTitleUpdated = ({ title: newTitle, user }) => {
      setTitle(newTitle);

      // 2. Log the activity using the user object from the server
      // addActivity(`set the title to "${newTitle}"`, user);
    };

    // LISTENER for "new-activity"
    const onNewActivity = (newActivity) => {
      // This receives the *single* new activity from the server
      setActivityLog(
        (prevLog) => [newActivity, ...prevLog].slice(0, 50) // Add to top, keep list at 50
      );
    };

    // Fired when the server wants to send a toast (e.g., "Password set")
    const onToast = ({ message }) => {
      setToast(message);
      // addActivity(message, null); // Add to activity log as system message
    };

    // --- Register Listeners ---
    sock.on("document-state", onDocumentState);
    sock.on("remote-operation", onRemoteOperation);
    sock.on("collaborators-updated", onCollaboratorsUpdated);
    sock.on("error", onError);
    sock.on("user-started-typing", onUserStartedTyping);
    sock.on("password-required", onPasswordRequired);
    sock.on("title-updated", onTitleUpdated);
    sock.on("new-activity", onNewActivity);
    sock.on("toast", onToast);

    // --- Cleanup Function ---
    // This runs when the effect re-runs or component unmounts
    return () => {
      sock.off("document-state", onDocumentState);
      sock.off("remote-operation", onRemoteOperation);
      sock.off("collaborators-updated", onCollaboratorsUpdated);
      sock.off("error", onError);
      sock.off("user-started-typing", onUserStartedTyping);
      sock.off("password-required", onPasswordRequired);
      sock.off("title-updated", onTitleUpdated);
      sock.off("new-activity", onNewActivity);
      sock.off("toast", onToast);
    };
  }, [
    editor,
    username,
    isConnected,
    lobbyJoinTime,
    currentUser,
    setDocState,
    setToast,
    setTypingUser,
    setDocId,
    setLobbyInput,
    setIsJoining,
  ]);

  // [Effect] Attempt to join a document room
  // This runs whenever the connection, docId, or user info changes.
  useEffect(() => {
    if (!isConnected || !socketRef.current || !docId || !currentUser) return;

    // We are now attempting to join, so clear old activity
    setActivityLog([]);
    // Record the time we *started* joining (for the spinner logic)
    setLobbyJoinTime(Date.now());
    console.log("Attempting to join document:", docId);
    socketRef.current.emit("join-document", {
      documentId: docId,
      user: currentUser,
    });
  }, [isConnected, docId, currentUser]); // Note: addActivity is not needed here

  // [Effect] Auto-scroll collaborators list to bottom, activity list to top
  useEffect(() => {
    if (collaboratorListRef.current) {
      collaboratorListRef.current.scrollTop =
        collaboratorListRef.current.scrollHeight;
    }
    if (activityListRef.current) {
      activityListRef.current.scrollTop = 0; // New items are added to the top
    }
  }, [collaborators, activityLog]); // Runs when collaborators or activity changes

  // --- Debounced Functions ---

  // [Callback] Sends the full document to the server for saving
  // We use useCallback to memoize it, so it's stable for debouncing
  const saveToServer = useCallback(
    (payload, toastMessage = "Auto-saved") => {
      if (!socketRef.current || !socketRef.current.connected) return;

      setSaveStatus("Saving");
      const saveStartTime = Date.now();

      // Emit to server and wait for an acknowledgement callback
      socketRef.current.emit("document-save", payload, () => {
        const duration = Date.now() - saveStartTime;
        const minDisplayTime = 700; // Show "Saving..." for at least 700ms

        if (duration < minDisplayTime) {
          // If save was too fast, wait to prevent UI flashing
          setTimeout(() => {
            setSaveStatus("Synced");
            setToast(toastMessage);
          }, minDisplayTime - duration);
        } else {
          // If save was slow, update immediately
          setSaveStatus("Synced");
          setToast(toastMessage);
        }
      });
    },
    [setSaveStatus, setToast] // Dependencies
  );

  // Debounced version of `saveToServer` (waits 900ms after last key press)
  const debouncedSave = useDebouncedCallback((editor, docId) => {
    if (editor.isDestroyed) return;
    saveToServer({ docId, content: editor.getHTML() }, "Auto-saved");
  }, 900);

  // Debounced version of emitting "text-operation" (waits 500ms)
  const debouncedEmitOperation = useDebouncedCallback((editor, docId) => {
    if (editor.isDestroyed) return;
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("text-operation", docId, editor.getHTML());
    }
  }, 500);

  // Debounced version of emitting "user-typing" (waits 500ms)
  const emitTyping = useDebouncedCallback(() => {
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit("user-typing", docId, username);
      }
    }, 500);

  // Debounced version of emitting "update-title" (waits 700ms)
const debouncedEmitTitleUpdate = useDebouncedCallback((newTitle) => {
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit("update-title", { docId, title: newTitle });
    }
  }, 700); // 700ms delay after last keystroke

  // --- Event Handlers ---

  // Called from the NameModal
  const handleSaveName = (newName) => {
    localStorage.setItem("collaborator_username", newName);
    setUsername(newName);
    setIsNameModalOpen(false);
  };

  // Called from the ConfirmationModal for clearing content
  const handleConfirmClear = () => {
    editor.commands.clearContent(true); // `true` = emit update
    // Manually trigger save/emit since `onUpdate` might not fire
    debouncedSave(editor, docId);
    debouncedEmitOperation(editor, docId);
    setConfirmModal({ ...confirmModal, isOpen: false });
    // addActivity("cleared the document", currentUser);
    if (socketRef.current) {
      socketRef.current.emit("log-action", {
        docId,
        message: "cleared the document",
      });
    }
  };

  // Opens the "Clear Document" confirmation modal
  const handleClear = () => {
    setConfirmModal({
      isOpen: true,
      title: "Clear Document",
      message:
        "Are you sure you want to clear the entire document? This action cannot be undone.",
      onConfirm: handleConfirmClear,
    });
  };

  // Called from lobby "Join" button
  const handleLobbyJoin = () => {
    if (lobbyInput.trim()) {
      setDocId(lobbyInput.trim());
    }
  };

  // Called from lobby "Create" button
  const handleLobbyCreate = () => {
    const newDocId = "doc_" + Math.random().toString(36).substring(2, 9);
    setDocId(newDocId);
  };

  // Called from "New Document" button in header
  const handleNewDocument = () => {
    // Reloads the page at the root URL, putting user back in the lobby
    window.location.href = window.location.origin;
  };

  // Called when user types in the title input
  const handleTitleChange = (e) => {
    // Emit title change to other users
    // if (socketRef.current && socketRef.current.connected) {
    //   socketRef.current.emit("update-title", { docId, title: t });
    // }
    const newTitle = e.target.value;
    // 1. Update local state immediately for a responsive UI
    setTitle(newTitle);
    // 2. Call the debounced function to emit the change to the server
    debouncedEmitTitleUpdate(newTitle);
  };

  // Called from "Save" buttons
  const handleManualSave = () => {
    saveToServer({ docId, content: editor.getHTML() }, "Saved");
  };

  // Called from ExportModal "Export" button
  const handleConfirmExport = () => {
    const { txt, md, html } = exportFormats;
    const docTitle = title || "document";
    let exported = false;

    if (html) {
      const htmlContent = editor.getHTML();
      downloadFile(htmlContent, `${docTitle}.html`, "text/html");
      exported = true;
    }
    if (md) {
      const markdownContent = turndownService.turndown(editor.getHTML());
      downloadFile(
        markdownContent,
        `${docTitle}.md`,
        "text/plain;charset=utf-8"
      );
      exported = true;
    }
    if (txt) {
      const textContent = editor.getText();
      downloadFile(textContent, `${docTitle}.txt`, "text/plain;charset=utf-8");
      exported = true;
    }

    if (exported) setToast("Export complete!");
    setIsExportModalOpen(false);
    setExportFormats({ txt: true, md: false, html: false }); // Reset
  };

  // Opens the export modal
  const handleExport = () => {
    setIsExportModalOpen(true);
  };

  // Called when user selects a file for import
  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name;
    const titleWithoutExtension = fileName.replace(/\.[^/.]+$/, "");
    const reader = new FileReader();

    reader.onload = (ev) => {
      try {
        const markdownText = ev.target.result;
        // XSS Mitigation: Convert Markdown to HTML, then sanitize the HTML
        const unsafeHtmlContent = marked(markdownText); // Convert MD to HTML
        const safeHtmlContent = DOMPurify.sanitize(unsafeHtmlContent); // 👈 SANITIZE HERE

        // 1. Set title from file name
        setTitle(titleWithoutExtension);
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit("update-title", {
            docId,
            title: titleWithoutExtension,
          });
        }

        // 2. Append content (or set if editor is empty)
        if (editor.getText().length === 0) {
          editor.commands.setContent(safeHtmlContent, true);
        } else {
          const combinedHtml = editor.getHTML() + "<p></p>" + safeHtmlContent;
          editor.commands.setContent(combinedHtml, true);
        }

        // 3. Trigger save/emit
        debouncedEmitOperation(editor, docId);
        debouncedSave(editor, docId);

        setToast("File imported");
        // addActivity(`imported "${fileName}"`, currentUser);
        if (socketRef.current) {
          socketRef.current.emit("log-action", {
            docId,
            message: `imported "${fileName}"`,
          });
        }
      } catch (err) {
        console.error("Failed to parse Markdown:", err);
        setToast("Failed to import: Invalid file");
      }
    };
    reader.readAsText(file);
    e.target.value = null; // Clear input
  };

  // Called from "Share" button
  const handleCopyLink = () => {
    try {
      navigator.clipboard.writeText(window.location.href);
      setToast("Share link copied");
    } catch (e) {
      setToast("Failed to copy link");
    }
  };

  // Called from PasswordModal "Join" button
  const handleSubmitPassword = () => {
    if (!password) return;
    setLobbyJoinTime(Date.now()); // Start spinner timer
    setIsJoining(true);
    socketRef.current.emit("submit-password", {
      docId,
      password,
      user: currentUser,
    });
    setPassword(""); // Clear password from input
  };

  // Called from "Set" password button in sidebar
  const handleSetPassword = () => {
    if (!newPassword) {
      setToast("Password cannot be empty");
      return;
    }
    socketRef.current.emit("set-document-password", {
      docId,
      password: newPassword,
    });
    setNewPassword(""); // Clear input
    // addActivity("updated the document password", currentUser);
    if (socketRef.current) {
      socketRef.current.emit("log-action", {
        docId,
        message: "updated the document password",
      });
    }
  };

  // --- Render ---
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 text-gray-900 dark:text-gray-100 font-sans">
      {/* --- Lobby Screen --- */}
      {/* This renders *only* if we are not in a document (docState is null) */}
      {!docState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-100 dark:bg-gray-900">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm text-center"
          >
            <div className="p-2 rounded-xl bg-linear-to-tr from-indigo-400 to-violet-500 shadow-md w-16 h-16 mx-auto flex items-center justify-center">
              <FileText className="w-8 h-8 text-white" />
            </div>
            <h2 className="mt-6 text-2xl font-semibold text-gray-900 dark:text-white">
              Document Editor
            </h2>

            {/* If docId exists (from URL), show "Joining..." */}
            {docId ? (
              <p className="mt-4 text-gray-500 dark:text-gray-400">
                Joining document...
              </p>
            ) : (
              // If no docId, show the join/create form
              <div className="mt-6 text-left">
                <p
                  htmlFor="lobby_input"
                  className="mt-2 text-sm text-gray-500 dark:text-gray-400"
                >
                  To join an existing document, enter its ID below.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <input
                    type="text"
                    id="lobby_input"
                    value={lobbyInput}
                    onChange={(e) => setLobbyInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleLobbyJoin()}
                    className="flex-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    placeholder="Enter Document ID (e.g., doc_...)"
                  />
                  <button
                    onClick={handleLobbyJoin}
                    className="px-3 py-2 rounded-lg bg-indigo-500 text-white shadow-sm hover:bg-indigo-600 cursor-pointer"
                  >
                    Join
                  </button>
                </div>

                <div className="relative flex items-center justify-center my-4">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-gray-300 dark:border-gray-700"></span>
                  </div>
                  <span className="relative z-10 bg-gray-100 dark:bg-gray-900 px-2 text-xs uppercase text-gray-500">
                    Or
                  </span>
                </div>

                <button
                  onClick={handleLobbyCreate}
                  className="cursor-pointer w-full rounded-lg bg-gray-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
                >
                  Create New Document
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* --- Main Header Bar --- */}
      <header className="fixed top-4 left-1/2 -translate-x-1/2 w-[92%] max-w-6xl z-40">
        <div className="backdrop-blur-md bg-white/60 dark:bg-gray-900/60 rounded-2xl shadow-xl border border-white/50 dark:border-gray-700/40 px-4 py-3 flex items-center justify-between gap-4">
          {/* Left Side: Icon, Title, Doc ID */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="p-2 rounded-xl bg-linear-to-tr from-indigo-400 to-violet-500 shadow-md">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <input
              name="title_field"
              value={title}
              onChange={handleTitleChange}
              className="bg-transparent outline-none text-lg font-semibold w-full"
            />
            <div className="hidden sm:block">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(docId);
                  setToast("Document ID copied!");
                }}
                className="cursor-pointer inline-flex items-center gap-2 text-xs bg-white/60 dark:bg-gray-800/60 backdrop-blur-sm px-2 py-1 rounded-full shadow-sm transition-all hover:bg-white/90 dark:hover:bg-gray-700/90"
                title="Copy Document ID"
              >
                <span className="whitespace-nowrap">ID: {docId}</span>
                <Copy className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Right Side: Status, Avatars, Actions */}
          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-3">
              <ConnectionStatus isConnected={isConnected} />
              <div className="flex -space-x-2 items-center">
                {collaborators.slice(0, 5).map((c) => (
                  <Avatar
                    key={c.userId}
                    user={c}
                    isYou={c.userId === currentUser.userId}
                    size="small"
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleNewDocument}
                title="New Document"
                className="cursor-pointer p-[9px] rounded-full text-gray-600 dark:text-gray-300 transition-all bg-white/50 dark:bg-gray-800/60 border border-gray-900/10 dark:border-gray-100/10 hover:bg-white dark:hover:bg-gray-800 hover:scale-105"
              >
                <FilePlus className="w-4.5 h-4.5" />
              </button>

              <button
                onClick={() => setDarkMode((d) => !d)}
                className={`
                  cursor-pointer rounded-full text-gray-600 dark:text-gray-300 transition-all 
                  bg-white/50 dark:bg-gray-800/60 border border-gray-900/10 dark:border-gray-100/10 
                  hover:bg-white dark:hover:bg-gray-800 hover:scale-105
                  ${darkMode ? "p-[8.8px]" : "p-[7.6px]"} 
                `}
              >
                {darkMode ? (
                  <Sun className="w-4.5 h-4.5" />
                ) : (
                  <Moon className="w-5 h-5" />
                )}
              </button>

              <button
                onClick={handleCopyLink}
                className="cursor-pointer px-3 py-1 rounded-full bg-linear-to-r from-indigo-500 to-purple-500 text-white text-sm shadow-sm hover:scale-105 transition inline-flex items-center gap-2"
              >
                <Copy className="w-4 h-4" /> Share
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* --- Main Content Area --- */}
      <main ref={mainRef} className="max-w-6xl mx-auto max-lg:min-h-screen pt-26 pb-16 px-4 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Editor Card */}
        <section className="lg:col-span-8 max-lg:h-100 lg:h-full overflow-hidden flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700/50 px-6 py-5">
          {/* Editor Card Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Editing
              </div>
              <div className="text-sm text-gray-400">•</div>
              <div className="text-sm text-gray-500">{stats.words} words</div>
            </div>
            <div className="flex items-center gap-3">
              {/* Save Status Badge */}
              <div
                className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                  saveStatus === "Saving"
                    ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300"
                    : saveStatus === "Unsaved"
                    ? "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
                    : "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300"
                }`}
              >
                {saveStatus === "Saving" && (
                  <svg
                    className="w-3 h-3 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    ></path>
                  </svg>
                )}
                <span>
                  {saveStatus === "Saving"
                    ? "Saving..."
                    : saveStatus === "Unsaved"
                    ? "Unsaved"
                    : "Synced"}
                </span>
              </div>
              <button
                onClick={handleManualSave}
                title="Save now"
                className="cursor-pointer p-1.5 rounded-full text-gray-500 hover:text-indigo-600 hover:bg-indigo-100 dark:text-gray-600 dark:hover:text-indigo-200 dark:hover:bg-indigo-900/50 transition-all"
              >
                <Save className="w-4 h-4" />
              </button>
              <button
                onClick={handleClear}
                title="Clear Document"
                className="cursor-pointer p-1.5 rounded-full text-gray-500 hover:text-rose-500 hover:bg-rose-500/10 dark:text-gray-600 dark:hover:text-rose-400 dark:hover:bg-rose-500/10 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          {/* Editor Container */}
          <div className="overflow-hidden w-full rounded-xl bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800/50 shadow-inner transition-all focus-within:ring-1 focus-within:ring-indigo-400 flex-1 flex flex-col">
            <EditorToolbar editor={editor} />
            <EditorContent
              id="editor-scroller"
              editor={editor}
              className="h-full w-full overflow-y-auto"
            />
          </div>
          {/* Editor Card Footer (Stats) */}
          <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
            <div>
              Characters:{" "}
              <strong className="text-gray-700 dark:text-gray-200">
                {stats.chars}
              </strong>
            </div>
            <div>Last change: — live</div>
          </div>
        </section>

        {/* --- Right Sidebar --- */}
        <aside ref={asideRef} className="lg:col-span-4 space-y-6 lg:h-full">
          {/* Actions Card */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-xl border border-gray-200 dark:border-gray-700/50">
            <h4 className="font-semibold mb-3">Actions</h4>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={handleManualSave}
                  className="cursor-pointer col-span-1 py-2 rounded-xl bg-linear-to-tr from-indigo-500 to-violet-500 text-white flex items-center justify-center gap-2 shadow"
                >
                  <Save className="w-4 h-4" /> Save
                </button>
                <label className="col-span-1 py-2 rounded-xl bg-emerald-500 text-white flex items-center justify-center gap-2 cursor-pointer shadow">
                  <Download className="w-4 h-4" />
                  <input
                    type="file"
                    accept=".txt,.md"
                    onChange={handleImport}
                    className="hidden"
                    name="import_file"
                  />
                  Import
                </label>
                <button
                  onClick={handleExport}
                  className="cursor-pointer col-span-1 py-2 rounded-xl bg-purple-900 text-white flex items-center justify-center gap-2 shadow"
                >
                  <Upload className="w-4 h-4" /> Export
                </button>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700/50 pt-3 mt-3">
                <label
                  className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  htmlFor="doc_pw"
                >
                  Set Document Password
                </label>
                <div className="flex items-center gap-2 mt-1.5">
                  <input
                    id={"doc_pw"}
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSetPassword()}
                    placeholder="Set password..."
                    className="flex-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 p-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    onClick={handleSetPassword}
                    className="px-2 py-1.5 rounded-lg bg-indigo-500 text-white shadow-sm hover:bg-indigo-600 cursor-pointer"
                  >
                    Set
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Collaborators Card */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-xl border border-gray-200 dark:border-gray-700/50">
            <h4 className="font-semibold mb-3">Collaborators</h4>
            <div className="flex items-center gap-3 mb-3 px-1">
              <Avatar user={currentUser} isYou />
              <div className="flex-1">
                <div className="text-sm font-medium">
                  {username}{" "}
                  <span className="text-xs text-gray-400">(You)</span>
                </div>
                <div className="text-xs text-gray-400">Active now</div>
              </div>
              <button
                onClick={() => setIsNameModalOpen(true)}
                className="cursor-pointer text-sm font-medium text-indigo-500 hover:underline focus:outline-none"
              >
                Edit
              </button>
            </div>
            <SimpleBar
              id="collab-scroller"
              ref={collaboratorListRef}
              className="h-10 pl-1 pr-2 "
            >
              {collaborators.length === 0 && (
                <div className="text-sm text-gray-400">
                  No collaborators yet
                </div>
              )}
              {collaborators.map((c) => (
                <div key={c.userId} className="flex items-center gap-3 pb-[3px] mb-2 last:pb-0 last:mb-0">
                  <Avatar user={c} />
                  <div className="flex-1">
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-gray-400">Editing</div>
                  </div>
                  <div className="text-xs text-gray-500">{c.userId}</div>
                </div>
              ))}
              {/* "Is Typing" indicator appears here */}
              <AnimatePresence>
                {typingUser && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="text-sm italic text-gray-500 dark:text-gray-400 mt-3 pt-3 border-t border-gray-200 dark:border-gray-700/50"
                  >
                    {typingUser} is typing...
                  </motion.div>
                )}
              </AnimatePresence>
            </SimpleBar>
          </div>

          {/* Activity Card */}
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-xl border border-gray-200 dark:border-gray-700/50">
            <h4 className="font-semibold mb-2.5">Activity</h4>

            {/* {activityLog.length === 0 ? (
              <div className="text-xs text-gray-400">
                Recent activity will appear here.
              </div>
            ) : ( */}
              <SimpleBar
                id="activity-scroller"
                ref={activityListRef}
                className="space-y-3 text-sm h-20 pr-2 pl-1"
              >
                {/* Render each activity log item */}
                {activityLog.map((activity) => (
                  <div
                    key={activity._id}
                    className="flex items-center gap-2 my-1 first:mt-0"
                  >
                    <div>
                      {activity.user ? (
                        <Avatar
                          user={activity.user}
                          isYou={activity.user.userId === currentUser.userId}
                          size="small"
                        />
                      ) : (
                        // Fallback icon for system messages
                        <div className="px-px flex items-center justify-center text-gray-500 dark:text-gray-300 transition-all">
                          <FileText className="w-[24.5px] h-[24.5px]" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="whitespace-nowrap">
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                          {activity.user ? activity.user.name : "System"}
                        </span>
                        <span className="text-gray-600 dark:text-gray-400">
                          {" "}
                          {activity.message}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        {/* Format timestamp to locale time, e.g., "9:04 AM" */}
                        {new Date(activity.createdAt).toLocaleTimeString(
                          navigator.language,
                          {
                            hour: "numeric",
                            minute: "2-digit",
                          }
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </SimpleBar>
            {/* )} */}
          </div>
        </aside>
      </main>

      {/* --- Floating Status (Bottom-Left) --- */}
      <div className="fixed left-6 bottom-3 z-40">
        <div className="bg-white/95 dark:bg-gray-900/90 px-3 py-2 rounded-lg shadow-md border border-white/50 dark:border-gray-800/40 text-sm">
          <div className="flex items-center gap-3">
            <ConnectionStatus isConnected={isConnected} />
            <div className="text-sm text-gray-500">
              {saveStatus === "Saving"
                ? "Saving..."
                : saveStatus === "Unsaved"
                ? "Unsaved"
                : "All changes saved"}
            </div>
          </div>
        </div>
      </div>

      {/* --- Modals (Portal-like) --- */}
      <Toast message={toast} onClose={() => setToast(null)} />
      <NameModal
        isOpen={isNameModalOpen}
        onSave={handleSaveName}
        onClose={() => setIsNameModalOpen(false)}
      />
      <ConfirmationModal
        {...confirmModal}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      />
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onConfirm={handleConfirmExport}
        formats={exportFormats}
        setFormats={setExportFormats}
      />
      <PasswordModal
        isOpen={docState === "private"}
        onClose={() => (window.location.href = window.location.origin)} // Go home
        onSubmit={handleSubmitPassword}
        password={password}
        setPassword={setPassword}
        error={toast && toast.includes("Incorrect") ? toast : null}
        isJoining={isJoining}
      />
    </div>
  );
}