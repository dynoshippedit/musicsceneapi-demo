/**
 * src/ai/groqClient.js
 *
 * Model invocation boundary. Nothing else in the codebase talks to groq-sdk.
 *
 * WHY: the monolith constructed `new Groq({ apiKey })` at module load (Phase 1
 * L41) and called `groq.chat.completions.create(...)` from inside three route
 * handlers. Two consequences the audit flagged:
 *
 *   - groq-sdk THROWS AT CONSTRUCTION when GROQ_API_KEY is entirely unset
 *     (empty string is accepted). Because construction happened at module
 *     scope, the whole application refused to load. Verified on git HEAD.
 *     Fixed here by lazy construction: the client is built on first use, so
 *     an unconfigured deployment boots and fails only when AI is requested.
 *     That is strictly more available than before and changes no response.
 *
 *   - no timeout. A hung Groq call hung the request forever. A timeout is
 *     added here; on timeout the error propagates to the SAME catch blocks the
 *     handlers already had, producing the SAME response bodies.
 *
 * Injectable for tests via createGroqClient({ transport }).
 */

'use strict';

const config = require('../config');

/** Default wall-clock budget for a single completion. */
const DEFAULT_TIMEOUT_MS = 20000;

class AiUnavailableError extends Error {
    constructor(message, cause) {
        super(message);
        this.name = 'AiUnavailableError';
        this.cause = cause;
    }
}

class AiTimeoutError extends Error {
    constructor(ms) {
        super(`Groq completion exceeded ${ms}ms`);
        this.name = 'AiTimeoutError';
    }
}

function createGroqClient({ transport, apiKey = config.groqApiKey, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    let client = transport || null;
    let constructionFailed = null;

    /** Build the SDK client on first use rather than at module load. */
    function getClient() {
        if (client) return client;
        if (constructionFailed) throw constructionFailed;
        try {
            // Required lazily so an unset key cannot break module loading.
            const Groq = require('groq-sdk');
            client = new Groq({ apiKey });
            return client;
        } catch (err) {
            constructionFailed = new AiUnavailableError(
                `Groq client unavailable: ${err.message}`, err
            );
            throw constructionFailed;
        }
    }

    /**
     * Whether AI calls can even be attempted. Handlers may use this to skip
     * work, but MUST NOT change their response shape based on it.
     */
    function isConfigured() {
        return !!(transport || (apiKey && String(apiKey).length > 0));
    }

    /**
     * Run one chat completion.
     * @param {object} opts
     * @param {Array<{role:string,content:string}>} opts.messages
     * @param {string} [opts.model]
     * @param {number} [opts.temperature]
     * @param {number} [opts.maxTokens]
     * @returns {Promise<{content:string, usage:object|undefined, model:string}>}
     */
    async function complete({ messages, model = config.groqModel, temperature = 0.7, maxTokens = 300 }) {
        const sdk = getClient();

        const call = sdk.chat.completions.create({
            messages,
            model,
            temperature,
            max_tokens: maxTokens
        });

        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(new AiTimeoutError(timeoutMs)), timeoutMs);
        });

        try {
            const completion = await Promise.race([call, timeout]);
            return {
                content: completion.choices?.[0]?.message?.content || '',
                usage: completion.usage,
                model
            };
        } finally {
            clearTimeout(timer);
        }
    }

    return { complete, isConfigured, getClient };
}

module.exports = createGroqClient();
module.exports.createGroqClient = createGroqClient;
module.exports.AiUnavailableError = AiUnavailableError;
module.exports.AiTimeoutError = AiTimeoutError;
module.exports.DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
