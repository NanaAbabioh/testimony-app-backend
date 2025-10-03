// Data Saver utility for managing user preferences and network-based detection
// Helps optimize content delivery based on connection quality and user choice

const KEY = "ah:dataSaver"; // LocalStorage key for user preference
export type DataSaverPref = "on" | "off" | "auto";

/**
 * Detects if the network suggests saving data based on browser APIs
 * Uses Network Information API to check for slow connections or explicit saveData flag
 */
export function getNetworkSaysSave(): boolean {
  // Server-side rendering or environments without navigator
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  try {
    // Check for Network Information API support
    const connection = (navigator as any).connection || 
                      (navigator as any).mozConnection || 
                      (navigator as any).webkitConnection;
    
    if (!connection) {
      return false; // API not supported
    }

    // Explicit saveData flag from user's browser/OS
    if (connection.saveData === true) {
      return true;
    }

    // Check for slow connection types that should trigger data saving
    const slowConnections = ["slow-2g", "2g"];
    if (connection.effectiveType && slowConnections.includes(connection.effectiveType)) {
      return true;
    }

    // Additional checks for very slow connections
    if (connection.downlink && connection.downlink < 0.5) { // < 500 kbps
      return true;
    }

    return false;
  } catch (error) {
    // Fallback gracefully if API access fails
    console.warn("Error checking network connection:", error);
    return false;
  }
}

/**
 * Gets the user's data saver preference from localStorage
 * Returns "auto" as default if no preference is set
 */
export function getDataSaverPref(): DataSaverPref {
  if (typeof window === "undefined") return "auto";
  
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "on" || stored === "off" || stored === "auto") {
      return stored as DataSaverPref;
    }
    return "auto"; // Default fallback
  } catch (error) {
    // LocalStorage might be disabled or throw errors
    console.warn("Error reading data saver preference:", error);
    return "auto";
  }
}

/**
 * Saves the user's data saver preference to localStorage
 */
export function setDataSaverPref(value: DataSaverPref): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.setItem(KEY, value);
    
    // Dispatch custom event to notify components of preference change
    window.dispatchEvent(new CustomEvent("dataSaverPreferenceChange", {
      detail: { preference: value, isEffective: isDataSaverEffective() }
    }));
  } catch (error) {
    console.warn("Error saving data saver preference:", error);
  }
}

/**
 * Determines if data saver mode should be active based on user preference and network conditions
 * - "on": Always save data
 * - "off": Never save data  
 * - "auto": Save data if network suggests it (slow connection, saveData flag, etc.)
 */
export function isDataSaverEffective(): boolean {
  const pref = getDataSaverPref();
  
  if (pref === "on") return true;
  if (pref === "off") return false;
  
  // "auto" mode - defer to network conditions
  return getNetworkSaysSave();
}

/**
 * Gets a human-readable description of the current data saver status
 * Useful for UI display
 */
export function getDataSaverStatus(): {
  preference: DataSaverPref;
  isActive: boolean;
  reason: string;
} {
  const preference = getDataSaverPref();
  const isActive = isDataSaverEffective();
  
  let reason: string;
  if (preference === "on") {
    reason = "Always enabled";
  } else if (preference === "off") {
    reason = "Disabled by user";
  } else if (isActive) {
    reason = "Enabled due to slow connection";
  } else {
    reason = "Disabled - good connection";
  }
  
  return { preference, isActive, reason };
}

/**
 * Hook-like function to listen for data saver preference changes
 * Returns cleanup function
 */
export function onDataSaverChange(callback: (isEffective: boolean) => void): () => void {
  if (typeof window === "undefined") {
    return () => {}; // No-op for server-side
  }
  
  const handler = (event: Event) => {
    const customEvent = event as CustomEvent;
    callback(customEvent.detail?.isEffective ?? isDataSaverEffective());
  };
  
  window.addEventListener("dataSaverPreferenceChange", handler);
  
  // Return cleanup function
  return () => {
    window.removeEventListener("dataSaverPreferenceChange", handler);
  };
}