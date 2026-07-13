import { Injectable } from '@nestjs/common';
import {
  GeneratedPodcastScript,
  PersonalPodcastScriptInput,
  PodcastChunkInput,
  PodcastTurn,
} from './podcast-generation.types';

@Injectable()
export class ScriptGeneratorService {
  private readonly baseUrl = process.env.LLM_BASE_URL;
  private readonly apiKey = process.env.LLM_API_KEY;
  private readonly model = process.env.LLM_MODEL;
  private readonly temperature = Number(process.env.LLM_TEMPERATURE ?? 0.7);

  buildPrompt(input: PodcastChunkInput): string {
    const chunkText = input.chunks
      .map((chunk, index) => {
        const page = chunk.pageNumber ? ` page ${chunk.pageNumber}` : '';
        return `Chunk ${index + 1}${page}:\n${chunk.text}`;
      })
      .join('\n\n');

    return [
      'Create a concise educational podcast script from the provided class material chunks.',
      'Use two hosts named HOST_A and HOST_B.',
      'Ground the script only in the supplied chunks. Do not mention missing files, URLs, or implementation details.',
      'Return only valid JSON with this shape:',
      '{"title":"string","summary":"string","durationTargetMinutes":number,"turns":[{"speaker":"HOST_A","text":"string"},{"speaker":"HOST_B","text":"string"}]}',
      '',
      `Document: ${input.documentName}`,
      `Document ID: ${input.documentId}`,
      '',
      chunkText,
    ].join('\n');
  }

  buildPersonalPrompt(input: PersonalPodcastScriptInput): string {
    const chunkText = input.chunks
      .map((chunk, index) => {
        const source = chunk.documentName ?? input.documentName;
        const page = chunk.pageNumber ? `, page ${chunk.pageNumber}` : '';
        return `Source ${index + 1} (${source}${page}):\n${chunk.text}`;
      })
      .join('\n\n');
    const wordTargets = { 5: '650-800', 10: '1300-1600', 15: '1950-2400' } as const;
    return [
      'Create a grounded educational podcast responding to the student request below.',
      'Use two hosts named HOST_A and HOST_B. Use only facts supported by the supplied source chunks.',
      `Difficulty: ${input.difficulty}.`,
      `Target duration: ${input.durationMinutes} minutes (${wordTargets[input.durationMinutes]} words).`,
      'Return only valid JSON with this shape:',
      '{"title":"string","summary":"string","durationTargetMinutes":number,"turns":[{"speaker":"HOST_A","text":"string"},{"speaker":"HOST_B","text":"string"}]}',
      '',
      `Student request: ${input.prompt}`,
      '',
      chunkText,
    ].join('\n');
  }

  async generate(input: PodcastChunkInput): Promise<GeneratedPodcastScript> {
    return this.generateFromPrompt(this.buildPrompt(input));
  }

  async generatePersonal(input: PersonalPodcastScriptInput): Promise<GeneratedPodcastScript> {
    return this.generateFromPrompt(this.buildPersonalPrompt(input));
  }

  private async generateFromPrompt(prompt: string): Promise<GeneratedPodcastScript> {
    if (!this.baseUrl || !this.apiKey || !this.model) {
      throw new Error('LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL must be configured');
    }

    const response = await fetch(this.openAiUrl('/chat/completions'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        temperature: this.temperature,
        messages: [
          {
            role: 'system',
            content:
              'You write clear, audio-friendly educational podcast scripts and return strict JSON only.',
          },
          { role: 'user', content: prompt },
        ],
      }),
    });

    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(body?.error?.message || `LLM returned ${response.status}`);
    }

    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('LLM response did not include message content');
    }

    return this.validateScript(this.parseJson(content));
  }

  private openAiUrl(pathname: string): string {
    const base = (this.baseUrl ?? '').replace(/\/$/, '');
    return `${base}${base.endsWith('/v1') ? '' : '/v1'}${pathname}`;
  }

  private parseJson(content: string): unknown {
    const trimmed = content.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    return JSON.parse(fenced?.[1] ?? trimmed);
  }

  private validateScript(value: unknown): GeneratedPodcastScript {
    const script = value as Partial<GeneratedPodcastScript>;
    if (
      !script ||
      typeof script.title !== 'string' ||
      typeof script.summary !== 'string' ||
      typeof script.durationTargetMinutes !== 'number' ||
      !Array.isArray(script.turns)
    ) {
      throw new Error('LLM script JSON did not match the expected shape');
    }

    const turns = script.turns.map((turn) => this.validateTurn(turn));
    if (turns.length === 0) {
      throw new Error('LLM script must include at least one turn');
    }

    return {
      title: script.title.trim(),
      summary: script.summary.trim(),
      durationTargetMinutes: script.durationTargetMinutes,
      turns,
    };
  }

  private validateTurn(turn: unknown): PodcastTurn {
    const candidate = turn as Partial<PodcastTurn>;
    if (
      (candidate.speaker !== 'HOST_A' && candidate.speaker !== 'HOST_B') ||
      typeof candidate.text !== 'string' ||
      !candidate.text.trim()
    ) {
      throw new Error('LLM script contains an invalid turn');
    }

    return {
      speaker: candidate.speaker,
      text: candidate.text.trim(),
    };
  }
}
