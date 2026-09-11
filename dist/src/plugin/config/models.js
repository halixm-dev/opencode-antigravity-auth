const DEFAULT_MODALITIES = {
    input: ["text", "image", "pdf"],
    output: ["text"],
};
export const OPENCODE_MODEL_DEFINITIONS = {
    "antigravity-gemini-3-pro": {
        name: "Gemini 3 Pro (Antigravity)",
        limit: { context: 1048576, output: 65535 },
        modalities: DEFAULT_MODALITIES,
        variants: {
            low: { thinkingLevel: "low" },
            high: { thinkingLevel: "high" },
        },
    },
    "antigravity-gemini-3.1-pro": {
        name: "Gemini 3.1 Pro (Antigravity)",
        limit: { context: 1048576, output: 65535 },
        modalities: DEFAULT_MODALITIES,
        variants: {
            low: { thinkingLevel: "low" },
            high: { thinkingLevel: "high" },
        },
    },
    "antigravity-gemini-3.8-flash": {
        name: "Gemini 3.8 Flash (Antigravity)",
        limit: { context: 1048576, output: 65536 },
        modalities: DEFAULT_MODALITIES,
        variants: {
            low: { thinkingLevel: "low" },
            medium: { thinkingLevel: "medium" },
            high: { thinkingLevel: "high" },
        },
    },
    "antigravity-gemini-3.7-flash": {
        name: "Gemini 3.7 Flash (Antigravity)",
        limit: { context: 1048576, output: 65536 },
        modalities: DEFAULT_MODALITIES,
        variants: {
            low: { thinkingLevel: "low" },
            medium: { thinkingLevel: "medium" },
            high: { thinkingLevel: "high" },
        },
    },
    "antigravity-gemini-3.6-flash": {
        name: "Gemini 3.6 Flash (Antigravity)",
        limit: { context: 1048576, output: 65536 },
        modalities: DEFAULT_MODALITIES,
        variants: {
            low: { thinkingLevel: "low" },
            medium: { thinkingLevel: "medium" },
            high: { thinkingLevel: "high" },
        },
    },
    "antigravity-gemini-3-flash": {
        name: "Gemini 3 Flash (Antigravity)",
        limit: { context: 1048576, output: 65536 },
        modalities: DEFAULT_MODALITIES,
        variants: {
            minimal: { thinkingLevel: "minimal" },
            low: { thinkingLevel: "low" },
            medium: { thinkingLevel: "medium" },
            high: { thinkingLevel: "high" },
        },
    },
    "antigravity-claude-sonnet-4-6": {
        name: "Claude Sonnet 4.6 (Antigravity)",
        limit: { context: 200000, output: 64000 },
        modalities: DEFAULT_MODALITIES,
    },
    "antigravity-claude-opus-4-6-thinking": {
        name: "Claude Opus 4.6 Thinking (Antigravity)",
        limit: { context: 200000, output: 64000 },
        modalities: DEFAULT_MODALITIES,
        variants: {
            low: { thinkingConfig: { thinkingBudget: 8192 } },
            max: { thinkingConfig: { thinkingBudget: 32768 } },
        },
    },
    "gemini-2.5-flash": {
        name: "Gemini 2.5 Flash (Gemini CLI)",
        limit: { context: 1048576, output: 65536 },
        modalities: DEFAULT_MODALITIES,
    },
    "gemini-2.5-pro": {
        name: "Gemini 2.5 Pro (Gemini CLI)",
        limit: { context: 1048576, output: 65536 },
        modalities: DEFAULT_MODALITIES,
    },
    "gemini-3-flash-preview": {
        name: "Gemini 3 Flash Preview (Gemini CLI)",
        limit: { context: 1048576, output: 65536 },
        modalities: DEFAULT_MODALITIES,
    },
    "gemini-3-pro-preview": {
        name: "Gemini 3 Pro Preview (Gemini CLI)",
        limit: { context: 1048576, output: 65535 },
        modalities: DEFAULT_MODALITIES,
    },
    "gemini-3.1-pro-preview": {
        name: "Gemini 3.1 Pro Preview (Gemini CLI)",
        limit: { context: 1048576, output: 65535 },
        modalities: DEFAULT_MODALITIES,
    },
    "gemini-3.1-pro-preview-customtools": {
        name: "Gemini 3.1 Pro Preview Custom Tools (Gemini CLI)",
        limit: { context: 1048576, output: 65535 },
        modalities: DEFAULT_MODALITIES,
    },
};
//# sourceMappingURL=models.js.map