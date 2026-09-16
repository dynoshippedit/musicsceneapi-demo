/**
 * src/repositories/operationsRepository.js
 *
 * Static operations fixtures extracted from mau5trap-production-api.js
 * (Phase 1 L2487-2567). Served by:
 *   GET /v3/operations/logistics
 *   GET /v3/operations/assets
 *   GET /v3/operations/contracts
 *
 * This is hardcoded demo data, not a database read. The block below was copied
 * programmatically from the source to guarantee byte fidelity — no value was
 * retyped. Preserved exactly, including `eta: null` and `recoupable: null`.
 *
 * Mutable: the handlers return these arrays by reference, so a caller that
 * mutated a returned object would corrupt the fixture process-wide. No current
 * handler does. Documented, not changed.
 */

'use strict';

const operationsData = {
    logistics: [
        {
            id: 1,
            item: "Mau5head Replica (Gen 4)",
            quantity: 150,
            status: "In Transit",
            vendor: "Fourthwall",
            tracking: "FW123456789",
            eta: "2025-12-18",
            location: "Los Angeles Warehouse"
        },
        {
            id: 2,
            item: "Tour Tee (BlackGummy)",
            quantity: 800,
            status: "Stocked",
            vendor: "Printful",
            tracking: "PF987654321",
            eta: null,
            location: "EU Fulfillment Center"
        },
        {
            id: 3,
            item: "REZZ Goggles Replica",
            quantity: 45,
            status: "Low Stock",
            vendor: "Merchbar",
            tracking: "MB456789123",
            eta: null,
            location: "Toronto Warehouse"
        }
    ],
    assets: [
        { id: 1, title: "deadmau5 - Strobe (Master WAV)", type: "Audio Master", artist: "deadmau5", uploaded: "2024-03-15", size: "248 MB", status: "Approved" },
        { id: 2, title: "REZZ - Edge (Official Video)", type: "Video", artist: "REZZ", uploaded: "2025-01-10", size: "1.8 GB", status: "Processing" },
        { id: 3, title: "BlackGummy - Album Artwork Pack", type: "Artwork", artist: "BlackGummy", uploaded: "2025-02-20", size: "89 MB", status: "Approved" }
    ],
    contracts: [
        {
            id: 1,
            artist: "deadmau5",
            type: "Master Recording",
            signedDate: "2018-06-01",
            term: "Perpetuity",
            advance: "$0",
            recoupable: null,
            royaltyRate: "50%",
            status: "Active",
            nextMilestone: null
        },
        {
            id: 2,
            artist: "REZZ",
            type: "Exclusive Recording",
            signedDate: "2022-11-15",
            term: "3 Albums",
            advance: "$150k",
            recoupable: "$120k remaining",
            royaltyRate: "Standard",
            status: "Active",
            nextMilestone: "Album 3 Q2 2026"
        },
        {
            id: 3,
            artist: "BlackGummy",
            type: "Single Deal + Option",
            signedDate: "2024-08-20",
            term: "2+2",
            advance: "$40k",
            recoupable: "Fully Recouped",
            royaltyRate: "18%",
            status: "Active",
            nextMilestone: "Option Mar 2026"
        }
    ]
};

module.exports = {
    operationsData,
    getLogistics: () => operationsData.logistics,
    getAssets: () => operationsData.assets,
    getContracts: () => operationsData.contracts
};
