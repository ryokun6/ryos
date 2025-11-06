import { ensureIndexedDBInitialized, STORES } from "@/utils/indexedDB";
import type { ChatMessage } from "@/types/chat";

const STORE_NAME = STORES.CHAT_MESSAGES;

interface ChatMessagesRecord {
  roomId: string;
  messages: ChatMessage[];
  updatedAt: number;
}

export type RoomMessagesMap = Record<string, ChatMessage[]>;

const handleTxCompletion = (
  db: IDBDatabase,
  resolve: () => void,
  reject: (error: unknown) => void
) => {
  return (event: Event) => {
    const tx = event.target as IDBTransaction;
    if (tx.error) {
      reject(tx.error);
    } else {
      resolve();
    }
    db.close();
  };
};

export const saveRoomMessages = async (
  roomId: string,
  messages: ChatMessage[]
): Promise<void> => {
  if (!roomId) return;

  const db = await ensureIndexedDBInitialized();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const record: ChatMessagesRecord = {
        roomId,
        messages,
        updatedAt: Date.now(),
      };

      store.put(record, roomId);

      tx.oncomplete = handleTxCompletion(db, resolve, reject);
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("Failed to save chat messages"));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error("Chat message transaction aborted"));
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
};

export const saveRoomMessagesBulk = async (
  map: RoomMessagesMap
): Promise<void> => {
  const entries = Object.entries(map);
  if (!entries.length) return;

  const db = await ensureIndexedDBInitialized();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const updatedAt = Date.now();

      for (const [roomId, messages] of entries) {
        if (!roomId) {
          continue;
        }
        const record: ChatMessagesRecord = {
          roomId,
          messages,
          updatedAt,
        };
        store.put(record, roomId);
      }

      tx.oncomplete = handleTxCompletion(db, resolve, reject);
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("Failed to bulk save chat messages"));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error("Chat message bulk transaction aborted"));
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
};

export const loadRoomMessages = async (
  roomId: string
): Promise<ChatMessage[]> => {
  if (!roomId) return [];

  const db = await ensureIndexedDBInitialized();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(roomId);

      request.onsuccess = () => {
        const record = request.result as ChatMessagesRecord | undefined;
        resolve(Array.isArray(record?.messages) ? record.messages : []);
      };
      request.onerror = () => reject(request.error);

      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("Failed to load chat messages"));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error("Chat message transaction aborted"));
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
};

export const loadAllRoomMessages = async (): Promise<RoomMessagesMap> => {
  const db = await ensureIndexedDBInitialized();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const messages: RoomMessagesMap = {};

      const request = store.openCursor();

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const key = cursor.key;
          const record = cursor.value as ChatMessagesRecord | undefined;
          if (
            typeof key === "string" &&
            record &&
            Array.isArray(record.messages)
          ) {
            messages[key] = record.messages;
          }
          cursor.continue();
        } else {
          resolve(messages);
        }
      };
      request.onerror = () => reject(request.error);

      tx.oncomplete = () => db.close();
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("Failed to enumerate chat messages"));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error("Chat message enumeration aborted"));
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
};

export const deleteRoomMessages = async (roomId: string): Promise<void> => {
  if (!roomId) return;

  const db = await ensureIndexedDBInitialized();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.delete(roomId);

      tx.oncomplete = handleTxCompletion(db, resolve, reject);
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("Failed to delete chat messages"));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error("Chat message deletion aborted"));
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
};

export const clearAllRoomMessages = async (): Promise<void> => {
  const db = await ensureIndexedDBInitialized();
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      store.clear();

      tx.oncomplete = handleTxCompletion(db, resolve, reject);
      tx.onerror = () => {
        db.close();
        reject(tx.error ?? new Error("Failed to clear chat messages"));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? new Error("Chat message clear aborted"));
      };
    } catch (error) {
      db.close();
      reject(error);
    }
  });
};
