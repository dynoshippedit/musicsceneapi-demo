/**
 * src/routes/reports.js
 *
 * PDF/CSV report and export endpoints.
 *
 * Handler bodies were moved VERBATIM from mau5trap-production-api.js. They are
 * registered in their original relative order, which matters because Express
 * binds the first matching route. Cross-domain shadowing was checked and does
 * not exist: all duplicate registrations fall within a single domain.
 *
 * Routes (3):
 *   GET    /v3/reports/monthly/:artistId/:month
 *   POST   /v3/reports/generate-all
 *   GET    /v3/exports
 */

'use strict';

// PDFDocument was a module-scope import in the original monolith. When the
// export handler moved here in Phase 2 it kept the bare `PDFDocument` reference
// but lost the import, so GET /v3/exports?format=pdf threw
// "PDFDocument is not defined" -> 500. Restored here (Phase 3).
const PDFDocument = require('pdfkit-table');

/**
 * @param {object} app Express application
 * @param {object} ctx dependency bundle from src/routes/context.js
 */
function register(app, ctx) {
    const {
        config, logger, JWT_SECRET, bcrypt, jwt, fs, path,
        sequelize, User, Artist, Stats,
        authenticateToken, hasArtistAccess, filterDataByAccess, checkExportAccess, generateToken,
        calculateTotalRevenue, flattenData, filterMetrics,
        generatePieChart, generateBarChart, generateLineChart, generateDonutChart,
        cache, emailService, sendEmail, entityAuditService,
        artistRepo, labelData, getArtistData, getAllArtists,
        operationsRepo, operationsData,
        prospects, anrSubmissions, anrState, userIntegrations, salesData, apiCache,
        aiService, performLinearRegression, generateSyntheticHistory,
        integrationFacade, fetchArtistData, getIntegrationStatus, SERVICES, limiters,
        generateMonthlyReport
    } = ctx;

    function getLabelOverview(timeframe) {
        const totalRevenue = labelData.artists.reduce((sum, a) => sum + calculateTotalRevenue(a), 0);
        const totalStreams = labelData.artists.reduce((sum, a) => sum + (a.totalStreams || 0), 0);
        const topArtist = artistRepo.topByMonthlyListeners();

        return {
            metric: 'Label Overview',
            timeframe,
            totalRevenue,
            totalStreams,
            activeArtists: labelData.artists.length,
            topArtist: topArtist ? topArtist.name : 'N/A'
        };
    }

    // Generate monthly report (PDF)
    app.get('/v3/reports/monthly/:artistId/:month', authenticateToken, async (req, res) => {
        const { artistId, month } = req.params;

        if (!hasArtistAccess(req.user, artistId)) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const artist = labelData.artists.find(a => a.id === artistId);
        if (!artist) {
            return res.status(404).json({ error: 'Artist not found' });
        }

        try {
            const pdfBuffer = await generateMonthlyReport(artist, month);

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${artist.name}_${month}_report.pdf"`);
            res.send(pdfBuffer);
        } catch (error) {
            logger.error('Report generation failed:', error);
            res.status(500).json({ error: 'Report generation failed' });
        }
    });

    // Generate and save monthly report for auto-printing
    app.post('/v3/reports/generate-all', authenticateToken, async (req, res) => {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { month } = req.body;
        if (!month) {
            return res.status(400).json({ error: 'Month parameter required (YYYY-MM)' });
        }

        const reportsDir = path.join(__dirname, 'reports', month);
        if (!fs.existsSync(reportsDir)) {
            fs.mkdirSync(reportsDir, { recursive: true });
        }

        const generatedReports = [];

        for (const artist of labelData.artists) {
            try {
                const pdfBuffer = await generateMonthlyReport(artist, month);
                const filename = `${artist.name}_${month}_report.pdf`;
                const filepath = path.join(reportsDir, filename);

                fs.writeFileSync(filepath, pdfBuffer);
                generatedReports.push({ artist: artist.name, filename, path: filepath });
            } catch (error) {
                console.error(`Failed to generate report for ${artist.name}:`, error);
            }
        }

        res.json({
            message: 'Reports generated successfully',
            count: generatedReports.length,
            reports: generatedReports,
            directory: reportsDir
        });
    });

    // Export Endpoint
    app.get('/v3/exports', authenticateToken, checkExportAccess, async (req, res) => {
        const { format = 'pdf', artistId, timeframe = '30d', metrics = 'all' } = req.query;

        try {
            // Fetch data
            let data;
            if (artistId) {
                data = labelData.artists.find(a => a.id === artistId);
                if (!data) return res.status(404).json({ error: 'Artist not found' });
            } else {
                data = getLabelOverview(timeframe);
            }

            // Filter metrics if not 'all'
            const dataToExport = metrics === 'all' ? data : filterMetrics(data, metrics.split(','));

            if (format === 'pdf') {
                const doc = new PDFDocument();
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader('Content-Disposition', `attachment; filename="${artistId || 'label_overview'}_${Date.now()}.pdf"`);

                doc.pipe(res);

                // Header
                doc.fontSize(25).text('mau5trap Intelligence Report', { align: 'center' });
                doc.moveDown();
                doc.fontSize(16).text(`Subject: ${data.name || 'Label Overview'}`, { align: 'left' });
                doc.fontSize(12).text(`Timeframe: ${timeframe}`, { align: 'left' });
                doc.fontSize(12).text(`Generated: ${new Date().toLocaleString()}`, { align: 'left' });
                doc.moveDown();

                // Divider
                doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
                doc.moveDown();

                // Content
                doc.fontSize(14).text('Metrics Breakdown:', { underline: true });
                doc.moveDown(0.5);

                Object.entries(dataToExport).forEach(([key, value]) => {
                    if (typeof value === 'object') {
                        doc.fontSize(12).font('Helvetica-Bold').text(`${key.toUpperCase()}:`);
                        doc.font('Helvetica').fontSize(10).text(JSON.stringify(value, null, 2));
                    } else {
                        doc.fontSize(12).text(`${key}: ${value}`);
                    }
                    doc.moveDown(0.5);
                });

                // Footer
                doc.fontSize(10).text('Generated by mau5trap OS v5.0', 50, 700, { align: 'center', color: 'grey' });

                doc.end();

            } else if (format === 'csv') {
                const createCsvWriter = require('csv-writer').createObjectCsvWriter;
                const filePath = path.join(__dirname, `temp_${Date.now()}.csv`);

                const flattened = flattenData(dataToExport);
                const headers = Object.keys(flattened).map(key => ({ id: key, title: key }));

                const csvWriter = createCsvWriter({
                    path: filePath,
                    header: headers
                });

                await csvWriter.writeRecords([flattened]);

                res.download(filePath, `${artistId || 'label'}_export.csv`, (err) => {
                    if (err) console.error('Download error:', err);
                    try {
                        fs.unlinkSync(filePath); // Clean up temp file
                    } catch (e) {
                        console.error('Cleanup error:', e);
                    }
                });

            } else {
                res.status(400).json({ error: 'Invalid format. Use pdf or csv' });
            }

        } catch (err) {
            logger.error('Export failed:', err);
            res.status(500).json({ error: 'Export failed' });
        }
    });
}

module.exports = { register };
