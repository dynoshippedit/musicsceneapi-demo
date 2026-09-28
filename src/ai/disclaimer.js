/**
 * src/ai/disclaimer.js
 *
 * Mandatory labeling for every AI surface that can touch financial data.
 * See FINANCIAL_DATA_POLICY.md: AI analysis of financials is strictly
 * user-initiated and opt-in, and every AI-produced financial output carries
 * this disclaimer with user responsibility stated explicitly.
 *
 * This is a product/privacy boundary, not legal advice, and it does not
 * claim to eliminate legal liability (see the policy doc).
 */

'use strict';

const AI_FINANCIAL_DISCLAIMER =
    'AI-generated output. Not financial advice. You are responsible for your ' +
    'own financial decisions; verify every figure against your own records ' +
    'before acting on it.';

const AI_FINANCIAL_USER_RESPONSIBILITY =
    'You requested this analysis. The platform does not take custody of your ' +
    'financial records and does not make financial decisions for you. ' +
    'Liability for decisions based on this output stays with you.';

const AI_INSIGHTS_NOT_REQUESTED =
    'AI insights were not requested for this report. They are strictly ' +
    'opt-in: request the report again with AI insights explicitly enabled ' +
    'to include them. No financial data was sent to any AI provider for ' +
    'this report.';

module.exports = {
    AI_FINANCIAL_DISCLAIMER,
    AI_FINANCIAL_USER_RESPONSIBILITY,
    AI_INSIGHTS_NOT_REQUESTED
};
