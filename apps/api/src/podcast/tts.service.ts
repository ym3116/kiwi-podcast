import { Injectable } from '@nestjs/common';
import { GeneratedPodcastScript, PodcastTurn } from './podcast-generation.types';

@Injectable()
export class TtsService {
  private readonly baseUrl = process.env.TTS_BASE_URL ?? 'https://litellm.tunnel.kiwiai.org';
  private readonly apiKey = process.env.TTS_API_KEY;
  private readonly model = process.env.TTS_MODEL ?? 'higgs-audio-v2';

  buildDialogue(script: GeneratedPodcastScript): string {
    return script.turns
      .map((turn) => `${this.speakerTag(turn)} ${turn.text}`)
      .join('\n');
  }

  buildInstructions(): string {
    const systemPrompt = [
      'You are an AI assistant designed to convert text into speech.',
      'If the user message includes a [SPEAKER*] tag, do not read out the tag. Use the specified voice for the following text.',
      '<|scene_desc_start|>',
      'SPEAKER0: A bright female voice, friendly, clear, American accent.',
      'SPEAKER1: A warm male voice, calm, clear, American accent.',
      '<|scene_desc_end|>',
    ].join('\n');

    return JSON.stringify({
      system_prompt: systemPrompt,
      seed: 12345,
      temperature: 0.5,
    });
  }

  async synthesize(script: GeneratedPodcastScript): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error('TTS_API_KEY must be configured');
    }

    const response = await fetch(this.openAiUrl('/audio/speech'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        voice: 'alloy',
        instructions: this.buildInstructions(),
        input: this.buildDialogue(script),
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new Error(message || `TTS returned ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  private speakerTag(turn: PodcastTurn): string {
    return turn.speaker === 'HOST_A' ? '[SPEAKER0]' : '[SPEAKER1]';
  }

  private openAiUrl(pathname: string): string {
    const base = this.baseUrl.replace(/\/$/, '');
    return `${base}${base.endsWith('/v1') ? '' : '/v1'}${pathname}`;
  }
}
