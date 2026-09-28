const entityAudit = require('./modules/entityAudit');

console.log("Testing Wikipedia Audit for 'lumenveil'...");
entityAudit.auditWikipedia('lumenveil')
    .then(result => {
        console.log("Result:", JSON.stringify(result, null, 2));
    })
    .catch(err => {
        console.error("Error:", err);
    });
