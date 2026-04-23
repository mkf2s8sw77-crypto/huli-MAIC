import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock fs — only intercept server-providers.yml; delegate everything else to real fs.
// This prevents YAML config from leaking host-machine state into tests while keeping
// the mock scoped to what provider-config actually reads.
let yamlOverride: string | null = null;

const PROVIDER_ENV_KEYS = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODELS',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_MODELS',
  'GOOGLE_API_KEY',
  'GOOGLE_BASE_URL',
  'GOOGLE_MODELS',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'DEEPSEEK_MODELS',
  'QWEN_API_KEY',
  'QWEN_BASE_URL',
  'QWEN_MODELS',
  'KIMI_API_KEY',
  'KIMI_BASE_URL',
  'KIMI_MODELS',
  'MINIMAX_API_KEY',
  'MINIMAX_BASE_URL',
  'MINIMAX_MODELS',
  'GLM_API_KEY',
  'GLM_BASE_URL',
  'GLM_MODELS',
  'SILICONFLOW_API_KEY',
  'SILICONFLOW_BASE_URL',
  'SILICONFLOW_MODELS',
  'DOUBAO_API_KEY',
  'DOUBAO_BASE_URL',
  'DOUBAO_MODELS',
  'GROK_API_KEY',
  'GROK_BASE_URL',
  'GROK_MODELS',
  'OLLAMA_BASE_URL',
  'OLLAMA_MODELS',
  'TTS_OPENAI_API_KEY',
  'TTS_AZURE_API_KEY',
  'TTS_GLM_API_KEY',
  'TTS_QWEN_API_KEY',
  'TTS_MINIMAX_API_KEY',
  'TTS_DOUBAO_API_KEY',
  'TTS_ELEVENLABS_API_KEY',
  'TTS_TENCENT_SECRET_ID',
  'TTS_TENCENT_SECRET_KEY',
  'ASR_OPENAI_API_KEY',
  'ASR_QWEN_API_KEY',
  'PDF_MINERU_BASE_URL',
  'PDF_MINERU_CLOUD_BASE_URL',
  'IMAGE_SEEDREAM_API_KEY',
  'IMAGE_QWEN_IMAGE_API_KEY',
  'IMAGE_NANO_BANANA_API_KEY',
  'IMAGE_MINIMAX_API_KEY',
  'IMAGE_GROK_API_KEY',
  'VIDEO_SEEDANCE_API_KEY',
  'VIDEO_KLING_API_KEY',
  'VIDEO_VEO_API_KEY',
  'VIDEO_SORA_API_KEY',
  'VIDEO_MINIMAX_API_KEY',
  'VIDEO_GROK_API_KEY',
  'TAVILY_API_KEY',
];

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  const isYaml = (p: unknown) => typeof p === 'string' && p.endsWith('server-providers.yml');
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (p: string) => (isYaml(p) ? yamlOverride !== null : actual.existsSync(p)),
      readFileSync: (p: string, ...args: unknown[]) =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        isYaml(p) ? (yamlOverride ?? '') : (actual.readFileSync as any)(p, ...args),
    },
    existsSync: (p: string) => (isYaml(p) ? yamlOverride !== null : actual.existsSync(p)),
    readFileSync: (p: string, ...args: unknown[]) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      isYaml(p) ? (yamlOverride ?? '') : (actual.readFileSync as any)(p, ...args),
  };
});

describe('provider-config', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    for (const key of PROVIDER_ENV_KEYS) {
      vi.stubEnv(key, undefined);
    }
    yamlOverride = null;
  });

  describe('resolveApiKey', () => {
    it('returns client key when provided', async () => {
      const { resolveApiKey } = await import('@/lib/server/provider-config');
      expect(resolveApiKey('openai', 'sk-client')).toBe('sk-client');
    });

    it('returns server key from env when no client key', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-server');
      const { resolveApiKey } = await import('@/lib/server/provider-config');
      expect(resolveApiKey('openai')).toBe('sk-server');
    });

    it('returns empty string when neither client nor server key exists', async () => {
      const { resolveApiKey } = await import('@/lib/server/provider-config');
      expect(resolveApiKey('openai')).toBe('');
    });

    it('prefers client key over server key', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-server');
      const { resolveApiKey } = await import('@/lib/server/provider-config');
      expect(resolveApiKey('openai', 'sk-client')).toBe('sk-client');
    });

    it('resolves non-OpenAI providers via their env prefix', async () => {
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-anthropic');
      const { resolveApiKey } = await import('@/lib/server/provider-config');
      expect(resolveApiKey('anthropic')).toBe('sk-anthropic');
    });

    it('returns empty string for unknown provider with no env var', async () => {
      const { resolveApiKey } = await import('@/lib/server/provider-config');
      expect(resolveApiKey('nonexistent-provider')).toBe('');
    });
  });

  describe('resolveBaseUrl', () => {
    it('returns client URL when provided', async () => {
      const { resolveBaseUrl } = await import('@/lib/server/provider-config');
      expect(resolveBaseUrl('openai', 'https://custom.api.com')).toBe('https://custom.api.com');
    });

    it('returns server URL from env when no client URL', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-test');
      vi.stubEnv('OPENAI_BASE_URL', 'https://proxy.example.com/v1');
      const { resolveBaseUrl } = await import('@/lib/server/provider-config');
      expect(resolveBaseUrl('openai')).toBe('https://proxy.example.com/v1');
    });

    it('returns undefined when neither client nor server URL exists', async () => {
      const { resolveBaseUrl } = await import('@/lib/server/provider-config');
      expect(resolveBaseUrl('openai')).toBeUndefined();
    });
  });

  describe('resolveProxy', () => {
    it('returns undefined when no proxy configured', async () => {
      const { resolveProxy } = await import('@/lib/server/provider-config');
      expect(resolveProxy('openai')).toBeUndefined();
    });

    it('returns proxy URL from YAML config', async () => {
      yamlOverride = `
providers:
  openai:
    apiKey: sk-yaml
    proxy: http://proxy.internal:8080
`;
      const { resolveProxy } = await import('@/lib/server/provider-config');
      expect(resolveProxy('openai')).toBe('http://proxy.internal:8080');
    });
  });

  describe('getServerProviders', () => {
    it('returns empty object when no providers configured', async () => {
      const { getServerProviders } = await import('@/lib/server/provider-config');
      expect(getServerProviders()).toEqual({});
    });

    it('returns provider metadata without API keys', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-secret');
      vi.stubEnv('OPENAI_BASE_URL', 'https://proxy.com/v1');
      vi.stubEnv('OPENAI_MODELS', 'gpt-4o,gpt-4o-mini');
      const { getServerProviders } = await import('@/lib/server/provider-config');
      const providers = getServerProviders();

      expect(providers.openai).toBeDefined();
      expect(providers.openai.models).toEqual(['gpt-4o', 'gpt-4o-mini']);
      expect(providers.openai.baseUrl).toBe('https://proxy.com/v1');
      // API key must NOT be exposed
      expect((providers.openai as Record<string, unknown>).apiKey).toBeUndefined();
    });

    it('lists multiple providers', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-openai');
      vi.stubEnv('ANTHROPIC_API_KEY', 'sk-anthropic');
      const { getServerProviders } = await import('@/lib/server/provider-config');
      const providers = getServerProviders();

      expect(Object.keys(providers)).toContain('openai');
      expect(Object.keys(providers)).toContain('anthropic');
    });

    it('omits providers without API key', async () => {
      vi.stubEnv('OPENAI_BASE_URL', 'https://proxy.com/v1');
      // No OPENAI_API_KEY set
      const { getServerProviders } = await import('@/lib/server/provider-config');
      const providers = getServerProviders();

      expect(providers.openai).toBeUndefined();
    });
  });

  describe('env var model parsing', () => {
    it('splits comma-separated models and trims whitespace', async () => {
      vi.stubEnv('OPENAI_API_KEY', 'sk-test');
      vi.stubEnv('OPENAI_MODELS', ' gpt-4o , gpt-4o-mini , ');
      const { getServerProviders } = await import('@/lib/server/provider-config');
      const providers = getServerProviders();

      expect(providers.openai.models).toEqual(['gpt-4o', 'gpt-4o-mini']);
    });
  });

  describe('resolveWebSearchApiKey', () => {
    it('returns client key first', async () => {
      const { resolveWebSearchApiKey } = await import('@/lib/server/provider-config');
      expect(resolveWebSearchApiKey('client-key')).toBe('client-key');
    });

    it('falls back to TAVILY_API_KEY env var', async () => {
      vi.stubEnv('TAVILY_API_KEY', 'tvly-bare-env');
      const { resolveWebSearchApiKey } = await import('@/lib/server/provider-config');
      expect(resolveWebSearchApiKey()).toBe('tvly-bare-env');
    });
  });

  describe('baseUrl-only providers (e.g. mineru)', () => {
    it('includes PDF provider from YAML when only baseUrl is configured (no apiKey)', async () => {
      yamlOverride = `
pdf:
  mineru:
    baseUrl: http://localhost:8888
`;
      const { getServerPDFProviders } = await import('@/lib/server/provider-config');
      const providers = getServerPDFProviders();

      expect(providers.mineru).toBeDefined();
      expect(providers.mineru.baseUrl).toBe('http://localhost:8888');
    });

    it('includes provider from env when only BASE_URL is set (no API_KEY)', async () => {
      vi.stubEnv('PDF_MINERU_BASE_URL', 'http://localhost:8888');
      const { getServerPDFProviders } = await import('@/lib/server/provider-config');
      const providers = getServerPDFProviders();

      expect(providers.mineru).toBeDefined();
      expect(providers.mineru.baseUrl).toBe('http://localhost:8888');
    });

    it('excludes PDF provider when only apiKey is configured (no baseUrl)', async () => {
      yamlOverride = `
pdf:
  mineru:
    apiKey: sk-fake
`;
      const { getServerPDFProviders } = await import('@/lib/server/provider-config');
      const providers = getServerPDFProviders();

      expect(providers.mineru).toBeUndefined();
    });
  });
});
