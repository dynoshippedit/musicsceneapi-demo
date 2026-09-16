/**
 * src/validation/index.js
 *
 * Request-validation layer added in Phase 3. Uses the already-present `zod`
 * dependency (which was previously only wired to LLM output via SafeStatsSchema
 * and src/ai/responseParser), so this introduces no new package.
 *
 * Scope: the highest-value, externally-reachable request bodies where a
 * missing/malformed field previously produced an inconsistent error (or a
 * thrown exception). Validation is ADDITIVE and narrow — it only tightens
 * inputs that were already effectively required, so no existing valid request
 * is rejected.
 *
 * Usage in a route:
 *   const parsed = schemas.login.safeParse(req.body);
 *   if (!parsed.success) {
 *       return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues.map(i => i.message) });
 *   }
 *   const { email, password } = parsed.data;
 */

'use strict';

const { z } = require('zod');

const schemas = {
    // POST /v3/auth/login and /v3/auth/forgot-password both need an email.
    login: z.object({
        email: z.string().email(),
        password: z.string().min(1)
    }).strict(),

    forgotPassword: z.object({
        email: z.string().email()
    }).strict(),

    // POST /v3/users (admin). artistAccess/pageAccess are optional.
    createUser: z.object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().min(1),
        role: z.string().min(1),
        artistAccess: z.union([z.string(), z.array(z.string())]).optional(),
        pageAccess: z.array(z.string()).optional()
    }).strict(),

    // POST /v3/ai/query
    aiQuery: z.object({
        prompt: z.string().min(1).optional(),
        query: z.string().min(1).optional(),
        artistId: z.string().optional(),
        forceRefresh: z.boolean().optional()
    }).strict()
};

/**
 * Build a middleware that validates req.body against `schemaName` and pins the
 * parsed result to req.validatedBody. On failure it responds 400 with a stable
 * shape and DOES NOT call next().
 *
 * @param {string} schemaName key into `schemas`
 * @returns {(req,res,next)=>void}
 */
function validateBody(schemaName) {
    const schema = schemas[schemaName];
    if (!schema) throw new Error(`No request schema named "${schemaName}"`);

    return (req, res, next) => {
        const parsed = schema.safeParse(req.body || {});
        if (!parsed.success) {
            return res.status(400).json({
                error: 'Validation failed',
                details: parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`)
            });
        }
        req.validatedBody = parsed.data;
        next();
    };
}

module.exports = { schemas, validateBody };