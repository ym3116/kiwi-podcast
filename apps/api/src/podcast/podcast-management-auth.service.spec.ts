import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  PodcastAccessAuthService,
  PodcastPrincipal,
} from './podcast-access-auth.service';
import { PodcastManagementAuthService } from './podcast-management-auth.service';

describe('PodcastManagementAuthService', () => {
  it.each(['admin', 'professor', 'instructor'] as const)(
    'allows a verified %s with management scopes',
    async (role) => {
      const access = accessService(principal(role));
      const service = new PodcastManagementAuthService(
        access as unknown as PodcastAccessAuthService,
      );

      await expect(service.authorize('class-1', 'Bearer token')).resolves.toMatchObject({
        userId: 'user-1',
        role,
      });
      expect(access.authorize).toHaveBeenCalledWith('class-1', 'Bearer token', [
        'class:info:read',
        'podcast:manage',
      ]);
    },
  );

  it.each(['student', 'ta'] as const)('denies the effective Kiwi role %s', async (role) => {
    const service = new PodcastManagementAuthService(
      accessService(principal(role)) as unknown as PodcastAccessAuthService,
    );
    await expect(service.authorize('class-1', 'Bearer token')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

function accessService(value: PodcastPrincipal) {
  return { authorize: vi.fn().mockResolvedValue(value) };
}

function principal(role: PodcastPrincipal['role']): PodcastPrincipal {
  return {
    userId: 'user-1',
    classId: 'class-1',
    role,
    scopes: new Set(['class:info:read', 'podcast:manage']),
    accessToken: 'token',
    mode: 'live',
  };
}
