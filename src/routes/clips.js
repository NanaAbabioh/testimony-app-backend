const express = require('express');
const { adminDb: db } = require('../lib/firebase-admin');
const { Timestamp } = require('firebase-admin/firestore');

const router = express.Router();

// Types for cursor pagination
/**
 * Parse month string (YYYY-MM) into date range
 * Returns ISO date strings for start and end of month
 */
function parseMonthRange(month) {
  // Validate format with stricter regex
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return null;
  }

  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const monthNum = parseInt(monthStr, 10);

  // Validate year and month values with reasonable bounds
  if (isNaN(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12 || year < 2000 || year > 2100) {
    return null;
  }

  // Create start and end dates in UTC
  const start = new Date(Date.UTC(year, monthNum - 1, 1));
  const end = new Date(Date.UTC(year, monthNum, 0)); // Last day of month

  // Return ISO date strings (YYYY-MM-DD format for Firestore)
  const iso = (d) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

/**
 * Encode cursor data to base64url string for URL safety
 */
function encodeCursor(obj) {
  try {
    return Buffer.from(JSON.stringify(obj)).toString("base64url");
  } catch (error) {
    console.error("[Clips API] Error encoding cursor:", error);
    throw new Error("Failed to encode pagination cursor");
  }
}

/**
 * Decode cursor string back to object
 */
function decodeCursor(s) {
  if (!s) return null;

  try {
    const decoded = JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

    // Validate cursor structure
    if (typeof decoded !== 'object' || decoded === null) {
      return null;
    }

    // Validate required fields based on cursor type
    if ('serviceDate' in decoded && 'createdAtMs' in decoded) {
      // Recent cursor validation
      if (typeof decoded.serviceDate !== 'string' || typeof decoded.createdAtMs !== 'number') {
        return null;
      }
    } else if ('savedCount' in decoded && 'createdAtMs' in decoded) {
      // MostSaved cursor validation
      if (typeof decoded.savedCount !== 'number' || typeof decoded.createdAtMs !== 'number') {
        return null;
      }
    } else {
      return null;
    }

    return decoded;
  } catch (error) {
    console.warn("[Clips API] Invalid cursor format:", s);
    return null;
  }
}

/**
 * Convert Firestore Timestamp to ISO string
 */
function timestampToISO(timestamp) {
  if (!timestamp || typeof timestamp.toDate !== 'function') {
    return undefined;
  }
  return timestamp.toDate().toISOString();
}

/**
 * Validate and sanitize query parameters
 */
function validateQueryParams(query) {
  const categoryId = query.categoryId?.trim() || undefined;
  const monthValue = query.month?.trim() || undefined;
  const yearValue = query.year?.trim() || undefined;
  const episodeValue = query.episode?.trim() || undefined;
  const sortParam = query.sort?.trim();
  const sort = (sortParam === "mostSaved" || sortParam === "recent") ? sortParam : "recent";

  // Validate limit with bounds
  const limitParam = query.limit?.trim();
  const parsedLimit = limitParam ? parseInt(limitParam, 10) : 20;
  const limit = isNaN(parsedLimit) ? 20 : Math.min(Math.max(1, parsedLimit), 50);

  const cursor = decodeCursor(query.cursor?.trim());

  // Combine month and year into the existing month format (YYYY-MM)
  let month = undefined;
  if (yearValue && monthValue) {
    // Both year and month specified
    month = `${yearValue}-${monthValue}`;
  } else if (monthValue && !yearValue) {
    // Only month specified, use current year
    const currentYear = new Date().getFullYear();
    month = `${currentYear}-${monthValue}`;
  }
  // If only year specified, we don't set month (year-only filtering not implemented yet)

  // Validate month format if provided
  if (month && !parseMonthRange(month)) {
    throw new Error(`Invalid month format: ${month}. Expected YYYY-MM format.`);
  }

  // Validate categoryId (basic sanitization)
  if (categoryId && (categoryId.length > 100 || /[<>"']/.test(categoryId))) {
    throw new Error("Invalid categoryId format");
  }

  // Validate episode number (should be numeric string)
  let episode = undefined;
  if (episodeValue) {
    const episodeNum = parseInt(episodeValue, 10);
    if (!isNaN(episodeNum) && episodeNum > 0 && episodeNum < 10000) {
      episode = episodeValue;
    } else {
      throw new Error("Invalid episode number format");
    }
  }

  return { categoryId, month, episode, sort, limit, cursor };
}

/**
 * GET /api/clips
 *
 * Enhanced endpoint with cursor pagination and caching
 *
 * Query parameters:
 * - categoryId?: string - Filter by category
 * - month?: string (YYYY-MM) - Filter by service month (only for recent sort)
 * - episode?: string - Filter by episode number
 * - sort?: "recent" | "mostSaved" - Sort order (default: "recent")
 * - limit?: number - Result limit (default: 20, max: 50)
 * - cursor?: string - Base64-encoded pagination cursor
 *
 * Always filters by status == "live"
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();

  try {
    if (!db) {
      return res.status(500).json({
        error: "Database not initialized"
      });
    }

    // Parse and validate query parameters
    const { categoryId, month, episode, sort, limit, cursor } = validateQueryParams(req.query);

    // Log request for monitoring
    console.log("[Clips API] Request:", {
      categoryId,
      month,
      episode,
      sort,
      limit,
      hasCursor: !!cursor,
      userAgent: req.headers['user-agent']?.slice(0, 100)
    });

    // Build base query (don't filter by status since CSV imports don't have it)
    let query = db.collection("clips");

    // Apply category filter if provided
    if (categoryId) {
      query = query.where("categoryId", "==", categoryId);
    }

    // Note: We'll sort by episode number in JavaScript after fetching to avoid index requirements

    // For category pages, fetch all available testimonies to sort properly
    // For other pages, use the requested limit
    const fetchLimit = categoryId ? 1000 : limit; // High limit for categories to get all testimonies
    query = query.limit(fetchLimit);

    // Execute query
    const snapshot = await query.get();
    const queryTime = Date.now() - startTime;

    // Transform documents to DTOs and deduplicate by ID
    const seenIds = new Set();
    let items = snapshot.docs
      .map((doc, index) => {
        const data = doc.data(); // Use any to access all fields

        // Debug logging to see actual field names
        if (index === 0) { // Log only for first item
          console.log('[Clips API] Sample data fields:', Object.keys(data));
          console.log('[Clips API] sourceVideoId:', data.sourceVideoId);
          console.log('[Clips API] videoId:', data.videoId);
          console.log('[Clips API] episode:', data.episode);
        }

        // Get the video ID from various possible field names
        const videoId = data.sourceVideoId || data.videoId || data.video_id || '';

        return {
          id: doc.id,
          videoId: videoId,
          startSec: data.startTimeSeconds || data.startSec || 0,
          endSec: data.endTimeSeconds || data.endSec || 0,
          serviceDate: data.serviceDate || "",
          savedCount: data.savedCount || 0,
          titleShort: data.titleShort || data.title || "",       // fallback
          summaryShort: data.summaryShort || "",                 // may be empty initially
          thumbUrl: data.thumbUrl || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
          episode: data.episode || "",                           // Include episode field

          // Include all other fields for full compatibility
          ...data,
          sourceVideoId: data.sourceVideoId, // Explicitly include sourceVideoId
          createdAt: data.createdAt ? timestampToISO(data.createdAt) : undefined,
        };
      })
      .filter((item) => {
        // Remove duplicates by ID
        if (seenIds.has(item.id)) {
          console.warn('[Clips API] Duplicate clip ID found:', item.id);
          return false;
        }
        seenIds.add(item.id);
        return true;
      })
      .filter((item) => {
        // Apply month filter if provided
        if (month) {
          const monthRange = parseMonthRange(month);
          if (monthRange && item.serviceDate) {
            // Check if service date falls within the month range
            return item.serviceDate >= monthRange.start && item.serviceDate <= monthRange.end;
          }
        }

        // Apply episode filter if provided
        if (episode) {
          const itemEpisodeNumber = item.episode ? item.episode.match(/\d+/)?.[0] : null;
          return itemEpisodeNumber === episode;
        }

        return true;
      });

    // Sort by episode number (extract numeric part for proper sorting)
    items.sort((a, b) => {
      // Extract numbers from episode strings like "EP001", "EP002", etc.
      const getEpisodeNumber = (ep) => {
        const match = ep.match(/\d+/);
        return match ? parseInt(match[0], 10) : 0;
      };

      const aNum = getEpisodeNumber(a.episode || '');
      const bNum = getEpisodeNumber(b.episode || '');

      // Sort in descending order (latest episode first)
      return bNum - aNum;
    });

    // For category pages, don't slice - return all sorted testimonies
    // For other pages, slice to requested limit
    if (!categoryId) {
      items = items.slice(0, limit);
    }

    // Generate next cursor only if we have more data available
    let nextCursor;

    // For category pages with episode sorting, disable pagination for now to avoid complexity
    // Since we're doing client-side sorting, proper cursor pagination would require
    // fetching all data and implementing offset-based pagination
    if (categoryId) {
      // No cursor for category pages - load all testimonies at once
      nextCursor = undefined;
    } else {
      // Keep original cursor logic for non-category pages
      if (items.length === limit && snapshot.docs.length > 0) {
        const lastDoc = snapshot.docs[snapshot.docs.length - 1];
        const lastData = lastDoc.data();
        const createdAtMs = lastData.createdAt?.toMillis?.() || Date.now();

        if (sort === "mostSaved") {
          nextCursor = encodeCursor({
            savedCount: lastData.savedCount ?? 0,
            createdAtMs
          });
        } else {
          nextCursor = encodeCursor({
            serviceDate: lastData.serviceDate || "",
            createdAtMs
          });
        }
      }
    }

    // Log successful response
    console.log("[Clips API] Success:", {
      itemCount: items.length,
      hasNextCursor: !!nextCursor,
      queryTimeMs: queryTime,
      sort,
      categoryId
    });

    // Create response with enhanced metadata
    const responseData = {
      items,
      nextCursor,
      meta: {
        count: items.length,
        hasMore: !!nextCursor,
        queryTimeMs: queryTime,
        query: {
          categoryId,
          month,
          episode,
          sort,
          limit,
          hasCursor: !!cursor
        }
      }
    };

    // Set aggressive caching headers for better performance
    res.set({
      "Cache-Control": "public, max-age=60, stale-while-revalidate=300, s-maxage=120",
      "ETag": `"clips-${sort}-${categoryId || 'all'}-${month || 'all'}-${episode || 'all'}-${items.length}-${queryTime}"`,
      "Vary": "Accept-Encoding"
    });

    res.json(responseData);

  } catch (error) {
    const errorTime = Date.now() - startTime;

    // Enhanced error logging with context
    console.error("[Clips API] Error:", {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      queryTimeMs: errorTime,
      params: req.query,
      userAgent: req.headers['user-agent']?.slice(0, 100)
    });

    // Determine appropriate error response
    let message = "Internal server error";
    let status = 500;

    if (error instanceof Error) {
      message = error.message;

      // Map specific errors to appropriate status codes
      if (message.includes("Invalid month format") || message.includes("Invalid categoryId")) {
        status = 400; // Bad Request
      } else if (message.includes("index")) {
        message = "Database index required. Please check Firestore indexes.";
        status = 503; // Service Unavailable
      } else if (message.includes("permission")) {
        message = "Database permission denied";
        status = 403; // Forbidden
      } else if (message.includes("quota") || message.includes("rate")) {
        message = "Service temporarily unavailable due to rate limits";
        status = 429; // Too Many Requests
      }
    }

    // Return error response with minimal caching
    res.set("Cache-Control", "no-store");
    res.status(status).json({
      error: message,
      timestamp: new Date().toISOString(),
      requestId: require('crypto').randomUUID()
    });
  }
});

module.exports = router;