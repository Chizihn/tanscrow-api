interface UserPresence {
  userId: string;
  isOnline: boolean;
  lastSeen: Date;
}

class PresenceStore {
  private store = new Map<string, UserPresence>();

  setOnline(userId: string): UserPresence {
    const presence = {
      userId,
      isOnline: true,
      lastSeen: new Date()
    };
    this.store.set(userId, presence);
    return presence;
  }

  setOffline(userId: string): UserPresence {
    const existing = this.store.get(userId) || { userId, lastSeen: new Date(0) };
    const presence = {
      ...existing,
      isOnline: false,
      lastSeen: new Date()
    };
    this.store.set(userId, presence);
    return presence;
  }

  getPresence(userId: string): UserPresence {
    return this.store.get(userId) || {
      userId,
      isOnline: false,
      lastSeen: new Date(0)
    };
  }
}

export const presenceStore = new PresenceStore();
