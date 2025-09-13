import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from './SocketContext';

export function useDocument() {
  const { slug } = useParams();
  const { socket } = useSocket();
  const [documentId, setDocumentId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDocumentId = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/documents/url/${slug}`);
      
      if (!response.ok) {
        throw new Error(response.status === 404 
          ? 'Document not found' 
          : 'Failed to fetch document');
      }
      
      const data = await response.json();
      setDocumentId(data.documentId);
    } catch (err) {
      console.error("Failed to get document ID:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    fetchDocumentId();
  }, [fetchDocumentId]);

  // Optional: Socket connection for real-time updates
  useEffect(() => {
    if (!documentId || !socket) return;

    const documentUpdateHandler = (update) => {
      // Handle real-time document updates here
      console.log('Document update:', update);
    };

    socket.on(`document:${documentId}`, documentUpdateHandler);

    return () => {
      socket.off(`document:${documentId}`, documentUpdateHandler);
    };
  }, [documentId, socket]);

  return { documentId, loading, error, refetch: fetchDocumentId };
}