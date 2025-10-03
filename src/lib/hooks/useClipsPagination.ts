// lib/hooks/useClipsPagination.ts
'use client';

import { useState, useCallback, useRef } from 'react';
import { ClipDTO } from '../types';

interface ClipsResponse {
  items: ClipDTO[];
  nextCursor?: string;
  meta: {
    count: number;
    hasMore: boolean;
    queryTimeMs: number;
    query: {
      categoryId?: string;
      month?: string;
      sort: string;
      limit: number;
      hasCursor: boolean;
    };
  };
}

interface UseClipsPaginationOptions {
  categoryId?: string;
  month?: string;
  sort?: 'recent' | 'mostSaved';
  limit?: number;
  initialLoad?: boolean;
}

interface UseClipsPaginationResult {
  clips: ClipDTO[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  reset: () => void;
  totalLoaded: number;
  queryTimeMs: number | null;
}

export function useClipsPagination(
  options: UseClipsPaginationOptions = {}
): UseClipsPaginationResult {
  const {
    categoryId,
    month,
    sort = 'recent',
    limit = 20,
    initialLoad = true
  } = options;

  // State
  const [clips, setClips] = useState<ClipDTO[]>([]);
  const [loading, setLoading] = useState(initialLoad);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [queryTimeMs, setQueryTimeMs] = useState<number | null>(null);

  // Refs to track current state
  const nextCursor = useRef<string | null>(null);
  const isLoadingRef = useRef(false);

  // Build query parameters
  const buildQueryParams = useCallback((cursor?: string) => {
    const params = new URLSearchParams();
    
    if (categoryId) params.set('categoryId', categoryId);
    if (month) params.set('month', month);
    params.set('sort', sort);
    params.set('limit', limit.toString());
    if (cursor) params.set('cursor', cursor);
    
    return params.toString();
  }, [categoryId, month, sort, limit]);

  // Fetch clips with cursor
  const fetchClips = useCallback(async (cursor?: string, replace: boolean = false) => {
    // Prevent concurrent requests
    if (isLoadingRef.current) return;
    
    try {
      isLoadingRef.current = true;
      setLoading(true);
      setError(null);

      const queryString = buildQueryParams(cursor);
      const response = await fetch(`/api/clips?${queryString}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data: ClipsResponse = await response.json();
      
      setQueryTimeMs(data.meta.queryTimeMs);
      setHasMore(!!data.nextCursor);
      nextCursor.current = data.nextCursor || null;

      if (replace) {
        // Replace all clips (refresh)
        setClips(data.items);
      } else {
        // Append new clips (pagination)
        setClips(prev => {
          // Deduplicate by clip ID
          const existingIds = new Set(prev.map(clip => clip.id));
          const newClips = data.items.filter(clip => !existingIds.has(clip.id));
          return [...prev, ...newClips];
        });
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load clips';
      console.error('[useClipsPagination] Error:', err);
      setError(message);
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, [buildQueryParams]);

  // Load more clips (pagination)
  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingRef.current) return;
    await fetchClips(nextCursor.current || undefined, false);
  }, [hasMore, fetchClips]);

  // Refresh from beginning
  const refresh = useCallback(async () => {
    nextCursor.current = null;
    setHasMore(true);
    await fetchClips(undefined, true);
  }, [fetchClips]);

  // Reset state
  const reset = useCallback(() => {
    setClips([]);
    setError(null);
    setHasMore(true);
    setQueryTimeMs(null);
    nextCursor.current = null;
    isLoadingRef.current = false;
  }, []);

  // Auto-load on mount if enabled
  useState(() => {
    if (initialLoad) {
      fetchClips(undefined, true);
    }
  });

  // Auto-refresh when key parameters change
  useState(() => {
    if (initialLoad) {
      refresh();
    }
  });

  return {
    clips,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
    reset,
    totalLoaded: clips.length,
    queryTimeMs,
  };
}

/**
 * Simplified hook for infinite scrolling
 */
export function useInfiniteClips(options: UseClipsPaginationOptions = {}) {
  const pagination = useClipsPagination({ ...options, initialLoad: true });

  // Auto-load more when scrolling near bottom
  const handleScroll = useCallback(() => {
    if (
      pagination.hasMore &&
      !pagination.loading &&
      window.innerHeight + window.scrollY >= document.body.offsetHeight - 1000
    ) {
      pagination.loadMore();
    }
  }, [pagination]);

  // Attach scroll listener
  useState(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  });

  return pagination;
}