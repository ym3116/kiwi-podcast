import { Injectable } from '@nestjs/common';
import { PodcastTurn } from './podcast-generation.types';

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

  async buildAnchor(speaker: PodcastTurn['speaker'], anchor: string): Promise<Buffer> {
    const config = this.speakers[speaker];
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

  async synthesizeChunk(turns: PodcastTurn[], anchors: TtsAnchorMap): Promise<Buffer> {
    if (turns.length === 0) throw new Error('Cannot synthesize an empty podcast chunk');

    const refTexts: Record<TtsSpeakerTag, string> = {
      SPEAKER0: this.speakers.HOST_A.referenceText,
      SPEAKER1: this.speakers.HOST_B.referenceText,
    };
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
        system_prompt: this.buildSystemPrompt(),
        seed: this.multiSeed,
        temperature: this.temperature,
        ref_texts: refTexts,
      }),
    });
  }

  formatTurn(turn: PodcastTurn): string {
    return `[${this.speakers[turn.speaker].tag}] ${turn.text.trim()}`;
  }

  buildSystemPrompt(): string {
    return [
      'You are an AI assistant designed to convert text into speech.',
      "If the user's message includes a [SPEAKER*] tag, do not read out the tag and generate speech for the following text, using the specified voice.",
      '<|scene_desc_start|>',
      `SPEAKER0: ${this.speakers.HOST_A.description}`,
      `SPEAKER1: ${this.speakers.HOST_B.description}`,
      this.scene,
      '<|scene_desc_end|>',
    ].join('\n');
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
