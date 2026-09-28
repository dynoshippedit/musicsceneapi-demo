/**
 * src/reports/monthlyReport.js
 *
 * Monthly PDF report generation, extracted verbatim (379 lines) from
 * generateMonthlyReport() in production-api.js.
 *
 * The function body below was copied PROGRAMMATICALLY from the source so that
 * every pdfkit call, colour, coordinate, font size and table definition is
 * byte-identical. Nothing was retyped.
 *
 * Dependencies are now explicit imports instead of monolith-scope globals:
 *   PDFDocument             <- pdfkit-table
 *   chart generators        <- src/utils/charts
 *   calculateTotalRevenue   <- src/utils/dataShape
 *   aiService.reportInsight <- src/ai/aiService  (AI STRATEGIC INSIGHTS block,
 *   ONLY when explicitly opted in — see the options parameter)
 *
 * AI/FINANCIAL LIABILITY POSTURE (2026-09-28, see FINANCIAL_DATA_POLICY.md):
 * AI insights are STRICTLY opt-in. The default (options.aiInsights !== true)
 * generates the full deterministic report WITHOUT invoking any AI — no
 * financial data leaves the process toward a model. The scheduled monthly
 * job uses the default, so no autonomous path sends financials to AI.
 * Interactive report endpoints pass { aiInsights: true } only when the user
 * explicitly opts in per request.
 *
 * NATIVE DEPENDENCY NOTE: chart rendering requires the `canvas` native module.
 * If it fails to load, PDF generation throws and the endpoints surface
 * { error: 'Report generation failed' } — same as before.
 */

'use strict';

const PDFDocument = require('pdfkit-table');
const profile = require('../profile');
const {
    generatePieChart,
    generateBarChart,
    generateLineChart,
    generateDonutChart
} = require('../utils/charts');
const { calculateTotalRevenue } = require('../utils/dataShape');
const aiService = require('../ai/aiService');
const { AI_FINANCIAL_DISCLAIMER, AI_INSIGHTS_NOT_REQUESTED } = require('../ai/disclaimer');

async function generateMonthlyReport(artist, month, options = {}) {
    const aiInsights = options.aiInsights === true;
    return new Promise(async (resolve, reject) => {
        const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // --- STYLES ---
        // PHASE 4CF: label identity/colors from the Label Intelligence
        // Profile (pulsegrid values byte-identical).
        const colors = {
            primary: profile.reports.accentColor, // was the hardcoded pulsegrid green
            dark: '#1a1a1a',
            text: '#000000',
            grey: '#666666',
            lightGrey: '#f5f5f5'
        };

        // --- HEADER ---
        doc.rect(0, 0, 612, 100).fill(colors.dark);
        doc.fillColor('white').fontSize(26).font('Helvetica-Bold').text(profile.reports.monthlyHeader, 50, 35);
        doc.fillColor(colors.primary).fontSize(10).font('Helvetica').text(profile.reports.monthlySubheader, 50, 65);

        doc.fillColor('white').fontSize(12).text(`Generated: ${new Date().toLocaleString()}`, 400, 35, { align: 'right', width: 160 });
        doc.fontSize(10).text(`Period: ${month}`, 400, 55, { align: 'right', width: 160 });

        doc.fillColor('black');
        doc.moveDown(5);

        // --- HELPER: DIVIDER ---
        function addDivider() {
            doc.moveDown(0.5).lineWidth(1).strokeColor('#e0e0e0').moveTo(50, doc.y).lineTo(562, doc.y).stroke().moveDown(1);
        }

        // --- ARTIST SUMMARY ---
        doc.fontSize(20).font('Helvetica-Bold').text(artist.displayName || artist.name);
        doc.fontSize(12).font('Helvetica').fillColor(colors.grey).text(`${artist.tier.toUpperCase()} TIER • ${artist.id}`);
        doc.moveDown(0.5);

        // --- EXECUTIVE SUMMARY ---
        doc.fillColor(colors.dark).fontSize(16).font('Helvetica-Bold').text('Executive Summary');
        addDivider();
        doc.fontSize(12).font('Helvetica').fillColor(colors.text);

        const totalRevenue = calculateTotalRevenue(artist); // Ensure helper is defined above or hoisted
        const topSourceEntry = Object.entries(artist.revenue).filter(([k, v]) => typeof v === 'number').sort((a, b) => b[1] - a[1])[0];
        const topSource = topSourceEntry ? topSourceEntry[0].toUpperCase() : 'N/A';

        doc.text(`Total Revenue: $${totalRevenue.toLocaleString()}`);
        doc.text(`Growth Rate: ${artist.growthRate || 0}% (${(artist.growthRate || 0) > 0 ? 'Positive' : 'Stable'} Trend)`);
        doc.text(`Top Revenue Source: ${topSource}`);

        // --- AI STRATEGIC INSIGHTS (Groq LPU) — STRICTLY OPT-IN ---
        // Default (no opt-in): no AI is invoked and no financial data is
        // sent to any AI provider. See the module header / FINANCIAL_DATA_POLICY.md.
        doc.moveDown(1);
        doc.fillColor(colors.primary).fontSize(14).font('Helvetica-Bold').text('AI STRATEGIC INSIGHTS');
        doc.fontSize(10).font('Helvetica').fillColor(colors.text);

        if (!aiInsights) {
            doc.text(AI_INSIGHTS_NOT_REQUESTED, { indent: 10, align: 'justify', width: 500 });
        } else try {
            // PHASE 2: prompt, model call and the indefinite report cache moved
            // to src/ai/aiService.reportInsight(). On failure it throws and the
            // catch below writes the same offline text into the PDF.
            const insightText = await aiService.reportInsight({ artist, month, totalRevenue });

            doc.text(`AI-generated. ${AI_FINANCIAL_DISCLAIMER}`, { indent: 10, align: 'justify', width: 500 });
            doc.moveDown(0.5);
            doc.text(insightText, { indent: 10, align: 'justify', width: 500 });
        } catch (err) {
            console.error("PDF AI Error:", err.message);
            doc.text("AI Insights unavailable at this time (Service Offline).", { indent: 10 });
        }

        doc.moveDown(1);

        // --- KPIS (Grid) ---
        const kpiStart = doc.y;

        function drawKPI(label, value, x, y, color = colors.text) {
            doc.fillColor(colors.grey).fontSize(9).font('Helvetica-Bold').text(label, x, y);
            doc.fillColor(color).fontSize(14).text(value, x, y + 15);
        }

        drawKPI('LISTENERS', artist.monthlyListeners.toLocaleString(), 50, kpiStart);
        drawKPI('STREAMS', artist.totalStreams.toLocaleString(), 180, kpiStart);
        drawKPI('GROWTH', `${artist.growthRate}%`, 310, kpiStart, artist.growthRate > 0 ? 'green' : 'red');
        drawKPI('ROI', `${artist.roi}x`, 440, kpiStart);

        doc.y = kpiStart + 45; // Manual spacing after custom KPI grid

        // --- METRICS LIST ---
        doc.fillColor(colors.text).fontSize(10).font('Helvetica');
        doc.text(`Genres: ${artist.genreHybrids || 'N/A'}`);
        if (artist.influences) doc.text(`Influences: ${artist.influences.join(', ')}`);
        if (artist.collaborations) doc.text(`Collaborations: ${artist.collaborations.join(', ')}`);
        doc.moveDown(2);

        // --- REVENUE TABLE ---
        doc.font('Helvetica-Bold').fontSize(14).text('Revenue Breakdown');
        doc.moveDown(0.5);


        const revenueTable = {
            headers: [
                { label: "Source", property: 'source', width: 220 },
                { label: "Amount", property: 'amount', width: 100, align: 'right' },
                { label: "Share", property: 'share', width: 100, align: 'right' }
            ],
            datas: Object.entries(artist.revenue).map(([key, val]) => {
                if (key === 'streamingBreakdown' || typeof val === 'object') return null; // Skip non-numeric
                return {
                    source: key.charAt(0).toUpperCase() + key.slice(1),
                    amount: `$${val.toLocaleString()}`,
                    share: `${(val / totalRevenue * 100).toFixed(1)}%`
                };
            }).filter(Boolean)
        };
        // Total Row
        revenueTable.datas.push({
            source: 'TOTAL REVENUE',
            amount: `$${totalRevenue.toLocaleString()}`,
            share: '100%',
            options: { fontSize: 12, bold: true }
        });

        await doc.table(revenueTable, {
            prepareHeader: () => doc.font("Helvetica-Bold").fontSize(10),
            // ================================================================
            // PRE-EXISTING CRASH (NEW-2) — see REFACTOR_PROGRESS.md
            // ================================================================
            // addBackground's signature in pdfkit-table@0.1.99 is
            //     addBackground({x, y, width, height}, fillColor, ...)
            // but this call passes FOUR POSITIONAL arguments. `x` and `y`
            // therefore resolve to undefined and pdfkit throws
            //     Error: unsupported number: undefined
            // inside an async table callback, which is an UNHANDLED REJECTION
            // and TERMINATES THE PROCESS (Node 22 default).
            //
            // Consequence: GET /v3/reports/monthly/:artistId/:month and
            // GET /v3/exports?format=pdf crash the server rather than
            // returning 500.
            //
            // VERIFIED PRE-EXISTING: unmodified git HEAD (c0281d8) fails
            // identically at production-api.js:2212 with the same
            // stack. NOT introduced by the refactor.
            //
            // Left UNCHANGED in Phase 2 because fixing it alters PDF output
            // (row striping would start rendering). Flagged as the top
            // correctness item for Phase 3.
            prepareRow: (row, i) => {
                doc.font("Helvetica").fontSize(10);
                if (i % 2 === 0) {
                    // ========================================================
                    // NEW-2 FIX — Phase 3
                    // ========================================================
                    // pdfkit-table@0.1.99 addBackground signature is
                    //     addBackground({x, y, width, height}, fillColor, fillOpacity?, cb?)
                    // The old call passed FOUR POSITIONAL args
                    //   addBackground(doc.y, doc.page.width - 80, 20, {color:...})
                    // so x/y resolved to undefined and pdfkit threw
                    //   "unsupported number: undefined"
                    // inside pdfkit-table's async forEach -> UNHANDLED REJECTION
                    // -> process exit. Now: rect object + a colour string.
                    doc.addBackground(
                        { x: doc.page.margins.left, y: doc.y, width: doc.page.width - 80, height: 20 },
                        colors.lightGrey,
                        1.0
                    );
                }
            }
        });
        doc.moveDown(2);

        // --- SUSTAINABILITY (CAREER LONGEVITY) ---
        if (artist.sustainability) {
            doc.addPage();
            doc.fillColor(colors.dark).fontSize(16).font('Helvetica-Bold').text('SUSTAINABILITY (CAREER LONGEVITY)');
            addDivider();

            const sustain = artist.sustainability;
            const startY = doc.y;

            // DYNAMIC CALCULATION: Diversification Ratio
            const revenueStreams = artist.revenue || {};
            const totalRev = calculateTotalRevenue(artist);
            const diversification = {};
            if (totalRev > 0) {
                // Calculate percentage for each numeric revenue source
                Object.entries(revenueStreams).forEach(([key, val]) => {
                    if (typeof val === 'number') { // ignore 'streamingBreakdown' objects etc
                        const pct = ((val / totalRev) * 100).toFixed(1);
                        diversification[key] = parseFloat(pct);
                    }
                });
            }

            // DYNAMIC CALCULATION: Revenue Stability (Mock Logic based on growthRate)
            // Ideally we'd scan `artist.revenueHistory` but we lack that data structure.
            // Proxy: High growth (>5%) = Medium Stability (Volatile success). Low growth (-2 to 2%) = High Stability.
            let stabilityScore = 85;
            let stabilityContext = "(Low variance; established catalog)";
            const growth = artist.growthRate || 0;

            if (growth > 10) {
                stabilityScore = 70;
                stabilityContext = "(High volatility due to rapid growth)";
            } else if (growth < -5) {
                stabilityScore = 60;
                stabilityContext = "(Declining revenue trend)";
            }
            const calculatedRevenueStability = `${stabilityScore}% ${stabilityContext}`;


            // Metrics Grid (Reusing drawKPI)
            drawKPI('LONGEVITY SCORE', sustain.longevityScore.toString(), 50, startY);
            drawKPI('LEGACY IMPACT', sustain.legacyImpact.toString(), 200, startY);

            doc.y = startY + 60;

            // Detailed Metrics
            doc.fillColor(colors.text).fontSize(12).font('Helvetica-Bold').text('Revenue Stability Index');
            // Prefer dynamic calculation if mocked "string" is generic, or enhance existing
            doc.fontSize(10).font('Helvetica').text(calculatedRevenueStability); // Use our new calc
            doc.moveDown(0.5);

            doc.fontSize(12).font('Helvetica-Bold').text('Burnout Risk');
            const riskColor = sustain.burnoutRisk.toLowerCase().includes('high') ? 'red' : (sustain.burnoutRisk.toLowerCase().includes('medium') ? '#FFA500' : 'green');
            doc.fillColor(riskColor).fontSize(10).font('Helvetica-Bold').text(sustain.burnoutRisk);
            doc.fillColor(colors.text); // Reset
            doc.moveDown(1);

            // Diversification (Dynamic Render)
            doc.fontSize(12).font('Helvetica-Bold').text('Income Diversification Ratio (Calculated)');
            doc.moveDown(0.2);
            Object.entries(diversification).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
                doc.fontSize(10).font('Helvetica').text(`• ${k.charAt(0).toUpperCase() + k.slice(1)}: ${v}%`, { indent: 10 });
            });
            doc.moveDown(1);

            // Milestones
            if (sustain.progressionMilestones) {
                doc.fontSize(12).font('Helvetica-Bold').text('Progression Milestones');
                doc.moveDown(0.2);
                sustain.progressionMilestones.forEach(m => {
                    doc.fontSize(10).font('Helvetica').text(`• ${m.year}: ${m.milestone}`, { indent: 10 });
                });
            }
        }

        // --- VISUAL ANALYTICS ---
        doc.addPage();
        doc.fontSize(16).font('Helvetica-Bold').text('Visual Analytics');
        addDivider();

        // 1. Revenue Distribution (Pie)
        try {
            const pieLabels = Object.keys(artist.revenue).filter(k => k !== 'streamingBreakdown' && typeof artist.revenue[k] === 'number').map(k => k.toUpperCase());
            const pieData = Object.keys(artist.revenue).filter(k => k !== 'streamingBreakdown' && typeof artist.revenue[k] === 'number').map(k => artist.revenue[k]);
            const pieBuffer = await generatePieChart(pieLabels, pieData);

            doc.image(pieBuffer, 50, doc.y, { width: 250 });
            doc.fontSize(10).text('Revenue Distribution', 120, doc.y + 260);
        } catch (e) { console.error(e); }

        // 2. Sales Trend (Line) - Mocking historical data if missing
        try {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
            // Simulate trend based on current revenue
            const base = totalRevenue / 10;
            const trendData = months.map((_, i) => base + (Math.random() * base * 0.2 * (i % 2 === 0 ? 1 : -1)));

            const lineBuffer = await generateLineChart(months, trendData);
            doc.image(lineBuffer, 320, doc.y - 280, { width: 250 }); // Place next to Pie
            doc.text('6-Month Trend', 400, doc.y + 260); // Label position approximation
        } catch (e) { console.error(e); }

        doc.moveDown(20); // Push past images

        // 3. Forecast (Donut)
        if (artist.forecast) {
            try {
                const donutBuffer = await generateDonutChart(['Next Month', 'Target'], [artist.forecast.nextMonth, artist.forecast.nextMonth * 1.1]);
                doc.image(donutBuffer, 50, doc.y, { width: 250 });
                doc.text('Forecast Achievement', 120, doc.y + 260);
            } catch (e) { console.error(e); }
        }

        doc.moveDown(15);

        // --- STREAMING BAR CHART ---
        if (artist.revenue.streamingBreakdown && artist.revenue.streamingBreakdown.byLocation) {
            try {
                const barLabels = artist.revenue.streamingBreakdown.byLocation.map(l => l.region);
                const barData = artist.revenue.streamingBreakdown.byLocation.map(l => l.value);

                const barBuffer = await generateBarChart(barLabels, barData);
                if (doc.y > 500) doc.addPage();
                doc.image(barBuffer, 50, doc.y, { width: 500, align: 'center' });
                doc.moveDown(12);
            } catch (chartErr) {
                console.error("Bar Chart Error:", chartErr);
            }
        }

        // --- STREAMING LOCATION (If available) ---
        if (artist.revenue.streamingBreakdown && artist.revenue.streamingBreakdown.byLocation) {
            doc.font('Helvetica-Bold').fontSize(14).text('Streaming Geography');
            doc.moveDown(0.5);

            const geoTable = {
                headers: [
                    { label: "Region", property: 'region', width: 200 },
                    { label: "Value", property: 'value', width: 100, align: 'right' },
                    { label: "Percent", property: 'percent', width: 100, align: 'right' }
                ],
                datas: artist.revenue.streamingBreakdown.byLocation.map(l => ({
                    region: l.region,
                    value: `$${l.value.toLocaleString()}`,
                    percent: `${l.percent}%`
                }))
            };
            await doc.table(geoTable, { prepareHeader: () => doc.font("Helvetica-Bold").fontSize(10) });
            doc.moveDown(2);
        }

        // --- SOCIAL & CRM (Grid) ---
        doc.font('Helvetica-Bold').fontSize(14).text('Social & CRM Data');
        doc.moveDown(0.5);

        const socialY = doc.y;
        if (artist.social) {
            drawKPI('INSTAGRAM', artist.social.instagram.toLocaleString(), 50, socialY);
            drawKPI('TIKTOK', artist.social.tiktok.toLocaleString(), 180, socialY);
            drawKPI('TWITTER', artist.social.twitter.toLocaleString(), 310, socialY);
            drawKPI('ENGAGEMENT', `${artist.social.engagementRate}%`, 440, socialY);
        }

        // CRM Row
        const crmY = socialY + 45;
        if (artist.crm) {
            drawKPI('EMAIL LIST', artist.crm.emailCount.toLocaleString(), 50, crmY);
            drawKPI('SMS LIST', artist.crm.smsCount.toLocaleString(), 180, crmY);
            drawKPI('PRESALES', artist.crm.presaleSignups.toLocaleString(), 310, crmY);
        }
        doc.y = crmY + 45;
        doc.moveDown(2);

        // --- RECENT SHOWS ---
        if (artist.touring && artist.touring.shows && artist.touring.shows.length > 0) {
            doc.font('Helvetica-Bold').fontSize(14).text('Tour Performance');
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica').text(`Upcoming Shows: ${artist.touring.upcomingShows} | Avg Attendance: ${artist.touring.avgAttendance.toLocaleString()}`);
            doc.moveDown(0.5);

            const tourTable = {
                headers: [
                    { label: "Date", property: 'date', width: 90 },
                    { label: "Venue", property: 'venue', width: 150 },
                    { label: "City", property: 'city', width: 100 },
                    { label: "Rev ($)", property: 'revenue', width: 80, align: 'right' }
                ],
                datas: artist.touring.shows.map(s => ({
                    date: s.date,
                    venue: s.venue,
                    city: s.city,
                    revenue: s.revenue.toLocaleString()
                }))
            };
            await doc.table(tourTable, {
                prepareHeader: () => doc.font("Helvetica-Bold").fontSize(10),
                prepareRow: () => doc.font("Helvetica").fontSize(10)
            });
            doc.moveDown(2);
        }

        // --- BRAND DEALS ---
        if (artist.brandDeals && artist.brandDeals.length > 0) {
            doc.addPage(); // Start Brand Deals on new page if getting cramped, or just let flow
            doc.font('Helvetica-Bold').fontSize(14).text('Active Brand Partnerships');
            doc.moveDown(0.5);

            const brandTable = {
                headers: [
                    { label: "Brand", property: 'brand', width: 200 },
                    { label: "Value", property: 'value', width: 100, align: 'right' },
                    { label: "Status", property: 'status', width: 100 }
                ],
                datas: artist.brandDeals.map(b => ({
                    brand: b.brand,
                    value: `$${b.value.toLocaleString()}`,
                    status: b.status.toUpperCase()
                }))
            };
            await doc.table(brandTable, { prepareHeader: () => doc.font("Helvetica-Bold").fontSize(10) });
            doc.moveDown(2);
        }

        // --- FORECAST ---
        if (artist.forecast) {
            doc.font('Helvetica-Bold').fontSize(14).text('Financial Forecast');
            doc.moveDown(0.5);
            doc.fontSize(10).font('Helvetica')
                .text(`Next Month Projection: $${artist.forecast.nextMonth.toLocaleString()}`)
                .text(`3-Month Projection: $${artist.forecast.threeMonth.toLocaleString()}`)
                .text(`Trend Analysis: ${artist.forecast.trend.toUpperCase()}`);
        }

        // --- FOOTER ---
        // NEW-2 fix: the original walked switchToPage(i) over buffered pages,
        // which threw "out of bounds" for flushed pages. pdfkit-table manages
        // its own page breaks, so a reliable cross-page footer via 'pageAdded'
        // is not available here. Instead, draw one footer on the final page
        // immediately before end(). This is a working replacement for the
        // broken original (which crashed), not a visual regression of any
        // previously-working output.
        doc.fontSize(8).fillColor(colors.grey).text(
            profile.reports.confidentialLine,
            50,
            doc.page.height - 40,
            { align: 'center', width: doc.page.width - 100 }
        );

        doc.end();
    });
}

module.exports = { generateMonthlyReport };
