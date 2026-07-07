import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScriptGeneratorService } from './script-generator.service';

describe('ScriptGeneratorService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('builds prompts from document chunk text', () => {
    const service = new ScriptGeneratorService();
    const prompt = service.buildPrompt({
      classId: 'class-1',
      documentId: 'doc-1',
      documentName: 'Loops',
      chunks: [{ text: 'Loops repeat work.', pageNumber: '3' }],
    });

    expect(prompt).toContain('Document: Loops');
    expect(prompt).toContain('Chunk 1 page 3');
    expect(prompt).toContain('Loops repeat work.');
    expect(prompt).not.toContain('http');
  });

  it('uses existing LLM env config for OpenAI-compatible chat completions', async () => {
    process.env.LLM_BASE_URL = 'https://llm.example.test/v1';
    process.env.LLM_API_KEY = 'llm-key';
    process.env.LLM_MODEL = 'test-model';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                title: 'Loops podcast',
                summary: 'A summary',
                durationTargetMinutes: 5,
                turns: [{ speaker: 'HOST_A', text: 'Welcome.' }],
              }),
            },
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const service = new ScriptGeneratorService();
    const script = await service.generate({
      classId: 'class-1',
      documentId: 'doc-1',
      documentName: 'Loops',
      chunks: [{ text: 'Loops repeat work.' }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://llm.example.test/v1/chat/completions',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer llm-key' }),
      }),
    );
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('test-model');
    expect(script.title).toBe('Loops podcast');
  });
});
