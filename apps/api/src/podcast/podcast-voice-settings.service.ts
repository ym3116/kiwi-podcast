import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  EpisodeVoiceOverrides,
  PodcastVoiceSettings,
  PRESET_VOICES,
  VoiceProfile,
} from './podcast-management.types';
import { TtsService } from './tts.service';

@Injectable()
export class PodcastVoiceSettingsService {
  constructor(@Inject(TtsService) private readonly tts: TtsService) {}

  environmentDefaults(): PodcastVoiceSettings {
    return this.tts.defaultVoiceSettings();
  }

  validateSettings(value: unknown): PodcastVoiceSettings {
    const candidate = value as Partial<PodcastVoiceSettings>;
    return {
      host: this.validateProfile(candidate?.host),
      speaker: this.validateProfile(candidate?.speaker),
    };
  }

  validateOverrides(value: unknown): EpisodeVoiceOverrides {
    const candidate = value as EpisodeVoiceOverrides;
    return {
      ...(candidate?.host ? { host: this.validateProfile(candidate.host) } : {}),
      ...(candidate?.speaker ? { speaker: this.validateProfile(candidate.speaker) } : {}),
    };
  }

  validateProfile(value: unknown): VoiceProfile {
    const profile = value as Partial<VoiceProfile>;
    if (profile?.mode !== 'preset' && profile?.mode !== 'custom') {
      this.badRequest('Invalid voice mode');
    }
    if (!PRESET_VOICES.includes(profile.voice as VoiceProfile['voice'])) {
      this.badRequest('Invalid preset voice');
    }
    const description = profile.description?.trim();
    const referenceText = profile.referenceText?.trim();
    if (!description || description.length > 500) {
      this.badRequest('Voice description is required and must be at most 500 characters');
    }
    if (!referenceText || referenceText.length > 300) {
      this.badRequest('Reference phrase is required and must be at most 300 characters');
    }
    if (!Number.isInteger(profile.seed) || Math.abs(profile.seed!) > 2147483647) {
      this.badRequest('Voice seed must be an integer');
    }
    return {
      mode: profile.mode,
      voice: profile.voice as VoiceProfile['voice'],
      description,
      seed: profile.seed!,
      referenceText,
    };
  }

  parseSettings(value: Prisma.JsonValue | null): PodcastVoiceSettings | null {
    if (!value) return null;
    try {
      return this.validateSettings(value);
    } catch {
      return null;
    }
  }

  parseOverrides(value: Prisma.JsonValue | null): EpisodeVoiceOverrides {
    if (!value) return {};
    try {
      return this.validateOverrides(value);
    } catch {
      return {};
    }
  }

  resolve(
    defaults: PodcastVoiceSettings,
    overrides: EpisodeVoiceOverrides,
  ): PodcastVoiceSettings {
    return {
      host: overrides.host ?? defaults.host,
      speaker: overrides.speaker ?? defaults.speaker,
    };
  }

  same(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  preview(value: unknown): Promise<Buffer> {
    return this.tts.preview(this.validateProfile(value));
  }

  private badRequest(message: string): never {
    throw new HttpException({ error: message }, HttpStatus.BAD_REQUEST);
  }
}
