import { create } from 'zustand';
import type { AiProvider, ChatMessage, ChatSession, ChatAgentTrace, ChatSource } from '@/types';
import { DEFAULT_MODEL } from '@/services/chatService';

/* ============================================================
   Chat store — manages conversation sessions and persists them
   to localStorage.  All streaming mutation goes through this
   store so components stay read-only subscribers.
   ============================================================ */

const STORAGE_KEY = 'atlas-chat-sessions';
const MAX_SESSIONS = 50;

interface ChatState {
  sessions:        ChatSession[];
  activeSessionId: string | null;

  /* ── Session CRUD ──────────────────────── */
  newSession:    () => string;
  deleteSession: (id: string) => void;
  selectSession: (id: string) => void;
  clearAll:      () => void;

  /* ── Message operations ────────────────── */
  addUserMessage:   (sessionId: string, content: string) => string;
  /** Create empty assistant placeholder that will be filled by streaming. */
  startAssistant:   (sessionId: string, model: string, provider: AiProvider) => string;
  appendDelta:      (sessionId: string, msgId: string, content: string) => void;
  appendThinking:   (sessionId: string, msgId: string, content: string) => void;
  setTrace:         (sessionId: string, msgId: string, trace: ChatAgentTrace[]) => void;
  markTraceDone:    (sessionId: string, msgId: string, traceId: string, latency?: string) => void;
  setSources:       (sessionId: string, msgId: string, sources: ChatSource[]) => void;
  finalizeMessage:  (sessionId: string, msgId: string) => void;
  setMessageError:  (sessionId: string, msgId: string, error: string) => void;

  /* ── Computed ──────────────────────────── */
  activeSession: () => ChatSession | null;
  getSession:    (id: string) => ChatSession | null;
}

/* ── Persistence helpers ─────────────────────────────────── */

function load(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as ChatSession[];
  } catch {
    return [];
  }
}

function save(sessions: ChatSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(0, MAX_SESSIONS)));
  } catch { /* quota exceeded — silently skip */ }
}

function makeId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function msgId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function newSessionObj(): ChatSession {
  return {
    id:        makeId(),
    title:     '新对话',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages:  [],
    model:     DEFAULT_MODEL.id,
    provider:  DEFAULT_MODEL.provider,
  };
}

function updateSession(
  sessions: ChatSession[],
  id: string,
  fn: (s: ChatSession) => ChatSession,
): ChatSession[] {
  return sessions.map((s) => (s.id === id ? fn(s) : s));
}

function updateMessage(
  s: ChatSession,
  msgId_: string,
  fn: (m: ChatMessage) => ChatMessage,
): ChatSession {
  return { ...s, messages: s.messages.map((m) => (m.id === msgId_ ? fn(m) : m)), updatedAt: Date.now() };
}

/* ── Store ─────────────────────────────────────────────────── */

const initialSessions = load();

export const useChatStore = create<ChatState>((set, get) => ({
  sessions:        initialSessions,
  activeSessionId: initialSessions[0]?.id ?? null,

  /* ── Session CRUD ──────────────────────── */

  newSession: () => {
    const sess = newSessionObj();
    set((s) => {
      const sessions = [sess, ...s.sessions];
      save(sessions);
      return { sessions, activeSessionId: sess.id };
    });
    return sess.id;
  },

  deleteSession: (id) => {
    set((s) => {
      const sessions = s.sessions.filter((x) => x.id !== id);
      save(sessions);
      const activeSessionId =
        s.activeSessionId === id ? (sessions[0]?.id ?? null) : s.activeSessionId;
      return { sessions, activeSessionId };
    });
  },

  selectSession: (id) => set({ activeSessionId: id }),

  clearAll: () => {
    save([]);
    set({ sessions: [], activeSessionId: null });
  },

  /* ── Message operations ────────────────── */

  addUserMessage: (sessionId, content) => {
    const id = msgId();
    const msg: ChatMessage = {
      id,
      role:      'user',
      content,
      timestamp: Date.now(),
    };
    set((s) => {
      let sessions = s.sessions;
      const exists = sessions.some((x) => x.id === sessionId);
      if (!exists) {
        // Create session on-the-fly if missing (e.g. first send).
        const sess = { ...newSessionObj(), id: sessionId };
        sessions = [sess, ...sessions];
      }
      const title = content.slice(0, 36) + (content.length > 36 ? '…' : '');
      sessions = updateSession(sessions, sessionId, (s) => ({
        ...s,
        title:    s.messages.length === 0 ? title : s.title,
        messages: [...s.messages, msg],
        updatedAt: Date.now(),
      }));
      save(sessions);
      return { sessions };
    });
    return id;
  },

  startAssistant: (sessionId, model, provider) => {
    const id = msgId();
    const msg: ChatMessage = {
      id,
      role:      'assistant',
      content:   '',
      thinking:  undefined,
      timestamp: Date.now(),
      model,
      provider,
      streaming: true,
      trace:     [],
    };
    set((s) => {
      const sessions = updateSession(s.sessions, sessionId, (sess) => ({
        ...sess,
        messages:  [...sess.messages, msg],
        updatedAt: Date.now(),
      }));
      save(sessions);
      return { sessions };
    });
    return id;
  },

  appendDelta: (sessionId, msgId_, content) => {
    set((s) => ({
      sessions: updateSession(s.sessions, sessionId, (sess) =>
        updateMessage(sess, msgId_, (m) => ({ ...m, content: m.content + content })),
      ),
    }));
  },

  appendThinking: (sessionId, msgId_, content) => {
    set((s) => ({
      sessions: updateSession(s.sessions, sessionId, (sess) =>
        updateMessage(sess, msgId_, (m) => ({ ...m, thinking: (m.thinking ?? '') + content })),
      ),
    }));
  },

  setTrace: (sessionId, msgId_, trace) => {
    set((s) => ({
      sessions: updateSession(s.sessions, sessionId, (sess) =>
        updateMessage(sess, msgId_, (m) => ({ ...m, trace })),
      ),
    }));
  },

  markTraceDone: (sessionId, msgId_, traceId, latency) => {
    set((s) => ({
      sessions: updateSession(s.sessions, sessionId, (sess) =>
        updateMessage(sess, msgId_, (m) => ({
          ...m,
          trace: m.trace?.map((t) =>
            t.id === traceId ? { ...t, done: true, ...(latency ? { latency } : {}) } : t,
          ),
        })),
      ),
    }));
  },

  setSources: (sessionId, msgId_, sources) => {
    set((s) => ({
      sessions: updateSession(s.sessions, sessionId, (sess) =>
        updateMessage(sess, msgId_, (m) => ({ ...m, sources })),
      ),
    }));
  },

  finalizeMessage: (sessionId, msgId_) => {
    set((s) => {
      const sessions = updateSession(s.sessions, sessionId, (sess) =>
        updateMessage(sess, msgId_, (m) => ({ ...m, streaming: false })),
      );
      save(sessions);
      return { sessions };
    });
  },

  setMessageError: (sessionId, msgId_, error) => {
    set((s) => {
      const sessions = updateSession(s.sessions, sessionId, (sess) =>
        updateMessage(sess, msgId_, (m) => ({ ...m, streaming: false, error })),
      );
      save(sessions);
      return { sessions };
    });
  },

  /* ── Computed ──────────────────────────── */

  activeSession: () => {
    const { sessions, activeSessionId } = get();
    return sessions.find((s) => s.id === activeSessionId) ?? null;
  },

  getSession: (id) => get().sessions.find((s) => s.id === id) ?? null,
}));
