/**
 * Simple localStorage error handling utilities
 */

/**
 * Safely get item from localStorage
 */
export const safeGetItem = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error(`[LocalStorage] Error getting item ${key}:`, error);
    return null;
  }
};

/**
 * Safely set item in localStorage
 */
export const safeSetItem = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn(`[LocalStorage] Quota exceeded for key ${key}. Attempting cleanup...`);
      
      // Try to clean up some old data
      try {
        // Remove some old keys to make space
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const keyToCheck = localStorage.key(i);
          if (keyToCheck && keyToCheck !== key && keyToCheck.startsWith('ryos:')) {
            keysToRemove.push(keyToCheck);
          }
        }
        
        // Remove a few keys to make space
        for (let i = 0; i < Math.min(3, keysToRemove.length); i++) {
          localStorage.removeItem(keysToRemove[i]);
        }
        
        // Try again
        localStorage.setItem(key, value);
        console.log(`[LocalStorage] Successfully saved ${key} after cleanup`);
        return true;
      } catch (retryError) {
        console.error(`[LocalStorage] Failed to save ${key} even after cleanup:`, retryError);
        return false;
      }
    }
    
    console.error(`[LocalStorage] Error setting item ${key}:`, error);
    return false;
  }
};

/**
 * Safely remove item from localStorage
 */
export const safeRemoveItem = (key: string): boolean => {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`[LocalStorage] Error removing item ${key}:`, error);
    return false;
  }
};

/**
 * Check if localStorage is available
 */
export const isLocalStorageAvailable = (): boolean => {
  try {
    const testKey = '__test__';
    localStorage.setItem(testKey, 'test');
    localStorage.removeItem(testKey);
    return true;
  } catch (e) {
    return false;
  }
};

/**
 * Get localStorage usage info
 */
export const getLocalStorageUsage = () => {
  try {
    let used = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        const value = localStorage.getItem(key);
        if (value) {
          used += value.length * 2; // UTF-16 bytes
        }
      }
    }
    
    const total = 5 * 1024 * 1024; // 5MB estimate for Safari
    const percentUsed = Math.round((used / total) * 100);
    
    return {
      used,
      total,
      available: total - used,
      percentUsed,
    };
  } catch (error) {
    console.error('[LocalStorage] Error calculating usage:', error);
    return {
      used: 0,
      total: 5 * 1024 * 1024,
      available: 5 * 1024 * 1024,
      percentUsed: 0,
    };
  }
};