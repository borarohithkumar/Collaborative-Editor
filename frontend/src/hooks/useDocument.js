import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from './SocketContext';

/**
 * A custom React hook to fetch document data based on a URL slug.
 *
 * This hook:
 * 1. Reads the 'slug' from the URL (e.g., /doc/my-cool-document).
 * 2. Fetches the full document data from the API using that slug.
 * 3. Manages loading and error states during the fetch.
 * 4. Subscribes to real-time socket updates for that document.
 * 5. Returns the document's ID, loading state, and error state.
 */
export function useDocument() {
  // Get the 'slug' parameter from the current URL
  // e.g., if the URL is /doc/hello-world, slug will be 'hello-world'
  const { slug } = useParams();
  
  // Get the shared socket instance from our context
  const { socket } = useSocket();

  // --- State ---
  const [documentId, setDocumentId] = useState(null); // The document's unique _id
  const [loading, setLoading] = useState(true); // True while fetching
  const [error, setError] = useState(null); // Holds any fetch error messages

  /**
   * Fetches the document's ID from the API using the URL slug.
   * We wrap this in `useCallback` so its reference only changes
   * if the 'slug' itself changes. This makes it safe to use in useEffect.
   */
  const fetchDocumentId = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Call the API endpoint to get the document by its slug
      const response = await fetch(`/api/documents/slug/${slug}`);

      if (!response.ok) {
        // Handle errors, providing a specific message for 404
        throw new Error(
          response.status === 404
            ? 'Document not found'
            : 'Failed to fetch document'
        );
      }

      const data = await response.json(); // 'data' is the full document object
      
      // Store the document's actual _id from the response
      setDocumentId(data._id);
    } catch (err) {
      console.error("Failed to get document ID:", err);
      setError(err.message);
    } finally {
      // Ensure loading is set to false even if an error occurs
      setLoading(false);
    }
  }, [slug]); // This function will re-create only if the `slug` changes

  // --- Effects ---

  // [Effect] Fetch the document ID when the hook mounts or the slug changes.
  useEffect(() => {
    fetchDocumentId();
  }, [fetchDocumentId]); // Runs whenever fetchDocumentId (i.e., the slug) changes

  // [Effect] Handle real-time socket subscriptions for this document.
  useEffect(() => {
    // Wait until we have a documentId and a socket connection
    if (!documentId || !socket) return;

    // Define the handler for updates
    const documentUpdateHandler = (update) => {
      // Handle real-time document updates here
      // e.g., update local state, refetch, etc.
      console.log('Socket update for document:', update);
    };

    // Subscribe to a specific room/event for this document
    socket.on(`document:${documentId}`, documentUpdateHandler);

    // This is the CRITICAL cleanup function.
    // It runs when the component unmounts or when documentId/socket changes.
    return () => {
      socket.off(`document:${documentId}`, documentUpdateHandler);
    };
  }, [documentId, socket]); // Re-subscribe if the doc ID or socket connection changes

  // Return the state and a 'refetch' function to the component
  return { documentId, loading, error, refetch: fetchDocumentId };
}