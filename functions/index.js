const admin = require('firebase-admin');
admin.initializeApp();
const config = require('./config.json');
let fireactjsSaasFunctions =  require('@fireactjs/saas-cloud-functions')(config);
exports.fireactjsSaas = fireactjsSaasFunctions;
