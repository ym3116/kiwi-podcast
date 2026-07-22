import { Injectable } from '@nestjs/common';
import * as crypto from 'node:crypto';
import { PodcastTurn } from './podcast-generation.types';
import { PodcastVoiceSettings, VoiceProfile } from './podcast-management.types';

export type TtsSpeakerTag = 'SPEAKER0' | 'SPEAKER1';
export type TtsAnchorMap = Record<TtsSpeakerTag, string>;

interface TtsSpeakerConfig {
  tag: TtsSpeakerTag;
  voice: string;
  description: string;
  referenceText: string;
}

@Injectable()
export class TtsService {
  private readonly baseUrl = process.env.TTS_BASE_URL ?? 'https://litellm.tunnel.kiwiai.org';
  private readonly apiKey = process.env.TTS_API_KEY;
  private readonly model = process.env.TTS_MODEL ?? 'higgs-audio-v2';
  private readonly temperature = Number(process.env.TTS_TEMPERATURE ?? 0.5);
  private readonly multiSeed = Number(process.env.TTS_MULTI_SEED ?? 12345);
  private readonly scene =
    process.env.TTS_SCENE_DESCRIPTION ??
    'The scene is two people having a lively, friendly podcast conversation. They are engaged, enthusiastic and animated, speaking with genuine emotion.';

  private readonly speakers: Record<PodcastTurn['speaker'], TtsSpeakerConfig> = {
    HOST_A: {
      tag: 'SPEAKER0',
      voice: process.env.TTS_HOST_A_VOICE ?? 'nova',
      description:
        process.env.TTS_HOST_A_DESCRIPTION ??
        'A bright female voice, warm, expressive and enthusiastic, American accent.',
      referenceText:
        process.env.TTS_HOST_A_REFERENCE_TEXT ??
        'Hi! I am so excited to dive into this with you today.',
    },
    HOST_B: {
      tag: 'SPEAKER1',
      voice: process.env.TTS_HOST_B_VOICE ?? 'onyx',
      description:
        process.env.TTS_HOST_B_DESCRIPTION ??
        'A lively male voice, warm, engaged and upbeat, British accent.',
      referenceText:
        process.env.TTS_HOST_B_REFERENCE_TEXT ??
        'Absolutely, I have been looking forward to this all week.',
    },
  };

  defaultVoiceSettings(): PodcastVoiceSettings {
    return {
      host: this.profileFor('HOST_A'),
      speaker: this.profileFor('HOST_B'),
    };
  }

  async buildAnchor(
    speaker: PodcastTurn['speaker'],
    anchor: string,
    settings?: PodcastVoiceSettings,
  ): Promise<Buffer> {
    const config = this.voiceFor(speaker, settings);
    if (config.mode === 'custom') {
      return this.requestSpeech({
        voice: 'alloy',
        input: config.referenceText,
        instructions: JSON.stringify({
          mode: 'build_anchor',
          anchor,
          scene: config.description,
          seed: config.seed,
          temperature: this.temperature,
        }),
      });
    }
    return this.requestSpeech({
      voice: config.voice,
      input: config.referenceText,
      instructions: JSON.stringify({
        mode: 'build_anchor',
        anchor,
        voice: config.voice,
        temperature: this.temperature,
      }),
    });
  }

  async synthesizeChunk(
    turns: PodcastTurn[],
    anchors: TtsAnchorMap,
    settings?: PodcastVoiceSettings,
  ): Promise<Buffer> {
    if (turns.length === 0) throw new Error('Cannot synthesize an empty podcast chunk');

    const orderedAnchors: TtsAnchorMap = {
      SPEAKER0: anchors.SPEAKER0,
      SPEAKER1: anchors.SPEAKER1,
    };

    return this.requestSpeech({
      voice: 'alloy',
      input: turns.map((turn) => this.formatTurn(turn)).join('\n'),
      instructions: JSON.stringify({
        mode: 'multi',
        speakers: orderedAnchors,
        system_prompt: this.buildSystemPrompt(settings),
        seed: this.multiSeed,
        temperature: this.temperature,
      }),
    });
  }

  formatTurn(turn: PodcastTurn): string {
    return `[${this.speakers[turn.speaker].tag}] ${turn.text.trim()}`;
  }

  buildSystemPrompt(settings?: PodcastVoiceSettings): string {
    const host = this.voiceFor('HOST_A', settings);
    const speaker = this.voiceFor('HOST_B', settings);
    return [
      'You are an AI assistant designed to convert text into speech.',
      "If the user's message includes a [SPEAKER*] tag, do not read out the tag and generate speech for the following text, using the specified voice.",
      '<|scene_desc_start|>',
      `SPEAKER0: ${host.description}`,
      `SPEAKER1: ${speaker.description}`,
      this.scene,
      '<|scene_desc_end|>',
    ].join('\n');
  }

  async preview(profile: VoiceProfile): Promise<Buffer> {
    const settings = { host: profile, speaker: profile };
    return this.buildAnchor('HOST_A', `preview-${crypto.randomUUID()}`, settings);
  }

  private voiceFor(speaker: PodcastTurn['speaker'], settings?: PodcastVoiceSettings): VoiceProfile {
    if (!settings) return this.profileFor(speaker);
    return speaker === 'HOST_A' ? settings.host : settings.speaker;
  }

  private profileFor(speaker: PodcastTurn['speaker']): VoiceProfile {
    const config = this.speakers[speaker];
    return {
      mode: 'preset',
      voice: config.voice as VoiceProfile['voice'],
      description: config.description,
      seed: speaker === 'HOST_A' ? Number(process.env.TTS_HOST_A_SEED ?? 505) : Number(process.env.TTS_HOST_B_SEED ?? 404),
      referenceText: config.referenceText,
    };
  }

  private async requestSpeech(input: {
    voice: string;
    input: string;
    instructions: string;
  }): Promise<Buffer> {
    if (!this.apiKey) throw new Error('TTS_API_KEY must be configured');

    const response = await fetch(this.openAiUrl('/audio/speech'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        voice: input.voice,
        instructions: input.instructions,
        input: input.input,
        response_format: 'wav',
      }),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(message || `TTS returned ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  private openAiUrl(pathname: string): string {
    const base = this.baseUrl.replace(/\/$/, '');
    return `${base}${base.endsWith('/v1') ? '' : '/v1'}${pathname}`;
  }
}
