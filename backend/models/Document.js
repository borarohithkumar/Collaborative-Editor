import mongoose from "mongoose";
import bcrypt from "bcrypt";

/**
 * Defines the schema for a *single* activity log entry.
 * This will be used as a subdocument inside the main Document schema.
 */
const activitySchema = new mongoose.Schema(
  {
    message: {
      type: String,
      required: true,
    },
    /**
     * We store a *snapshot* of the user, not a ref.
     * This is a critical design choice. It ensures that if a
     * user changes their name later, the log entry remains
     * historically accurate (e.g., "Bob joined," not "Admin joined").
     */
    user: {
      userId: { type: String, required: true },
      name: { type: String, required: true },
      color: { type: String },
    },
  },
  {
    /**
     * This automatically adds 'createdAt' and 'updatedAt' timestamps
     * to each activity log entry. The 'createdAt' is what we use
     * in the frontend to show "9:04 AM".
     */
    timestamps: true,
  }
);

/**
 * Defines the main schema for the Document.
 */
const documentSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      /**
       * Provides a default value if one isn't given (e.g., on creation).
       * This matches the 'doc_xxxxxxx' format the frontend creates.
       */
      default: () => `doc_${Math.random().toString(36).substr(2, 7)}`,
      required: true,
    },
    title: {
      type: String,
      default: "Untitled Document",
    },
    content: {
      type: String,
      default: "", // Default to an empty document
    },
    version: {
      type: Number,
      default: 0,
    },
    password: {
      type: String, // The *hashed* password will be stored here
    },
    collaborators: [
      // This is an array of embedded collaborator objects
      {
        userId: String,
        name: String,
        color: String,
        // Note: These are great for future features (e.g., showing live cursors)
        // but are not currently used in the main backend logic.
        cursorPosition: Number,
        lastSeen: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    /**
     * An array of activity subdocuments.
     * This embeds the activitySchema defined above.
     */
    activity: [activitySchema],
  },
  {
    /**
     * Adds 'createdAt' and 'updatedAt' to the main document.
     * 'updatedAt' is useful for knowing when the doc was last saved.
     */
    timestamps: true,
  }
);

/**
 * Mongoose "pre-save" middleware (or "hook").
 * This function automatically runs *before* any 'document.save()' operation.
 * We use it to hash the password securely.
 */
documentSchema.pre("save", async function (next) {
  // 'this' refers to the document being saved
  
  // 1. If the password field wasn't modified, or if it's empty,
  //    skip the hashing logic and move to the next step.
  if (!this.isModified("password") || !this.password) {
    return next();
  }

  // 2. The password *was* modified, so we must hash it.
  try {
    const salt = await bcrypt.genSalt(10); // Generate a salt (10 rounds)
    this.password = await bcrypt.hash(this.password, salt); // Hash the password
    next(); // Continue with the save operation
  } catch (err) {
    next(err); // Pass any errors to Mongoose
  }
});

/**
 * Helper method added to the document schema.
 * This allows us to call 'doc.comparePassword(candidate)'
 * to safely check a password.
 * @param {string} candidatePassword - The plain-text password from the user.
 * @returns {Promise<boolean>} - True if the password matches.
 */
documentSchema.methods.comparePassword = function (candidatePassword) {
  // 'this.password' is the already-hashed password from the database
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model("Document", documentSchema);