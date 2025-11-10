import { Redis } from 'ioredis';

interface UserPresence {
  userId: string;
  isOnline: boolean;
  lastSeenAt: Date;
}

export class PresenceService {
  private readonly redis: Redis;
  private readonly PRESENCE_KEY = 'user:presence';

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async setOnline(userId: string): Promise<void> {
    const presence: UserPresence = {
      userId,
      isOnline: true,
      lastSeenAt: new Date(),
    };
    await this.redis.hset(this.PRESENCE_KEY, userId, JSON.stringify(presence));
  }

  async setOffline(userId: string): Promise<void> {
    const presence: UserPresence = {
      userId,
      isOnline: false,
      lastSeenAt: new Date(),
    };
    await this.redis.hset(this.PRESENCE_KEY, userId, JSON.stringify(presence));
  }

  async getPresence(userId: string): Promise<{ isOnline: boolean; lastSeenAt: Date } | null> {
    const data = await this.redis.hget(this.PRESENCE_KEY, userId);
    if (!data) return null;
    
    try {
      const presence = JSON.parse(data) as UserPresence;
      return {
        isOnline: presence.isOnline,
        lastSeenAt: new Date(presence.lastSeenAt)
      };
    } catch (error) {
      console.error('Error parsing presence data:', error);
      return null;
    }
  }
}
