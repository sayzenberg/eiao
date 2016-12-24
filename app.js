// Requirements
var express = require('express');
var app = express();
var mongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var multer = require('multer');
var path = require('path');
var winston = require('winston');

// Date connection configuration
var database = null;
var mongoUrl = 'mongodb://localhost:27017/eiao';

// Image storage configuration
var publicDirName = 'public';
var uploadsDirName = 'uploads';
var uploadsPath = publicDirName + '/' + uploadsDirName + '/';

var options = multer.diskStorage({
    destination: uploadsPath,
    filename: function(req, file, cb) {
        var ext = path.extname(file.originalname);
        cb(null, path.basename(file.originalname, ext) + Date.now() + ext);
    }
});

var upload = multer({
    storage: options
});

// App configuration
app.set('views', './views');
app.set('view engine', 'pug');
app.use(express.static(publicDirName))
app.use('/milligram', express.static('node_modules/milligram/dist'))

// Logging configuration
winston.level = 'debug' // TODO: Change to 'log' when publishing

// Connect to MongoDB and globalize the connection
mongoClient.connect(mongoUrl, (err, db) => {
    database = db;
    routes(database);
});

function routes(db) {
    if (!db) {
        winston.error("Could not connect to database");
    }

    // Create a new ordeal whenever /ordeal/create is hit
    app.post('/ordeal/create', upload.single('image'), (req, res) => {
        var collection = db.collection('ordeals');
        var path = parsePath(req.body.path);

        var ordeal = {
            'path': path,
            'imageName': req.file.filename,
            'hits': 0
        }

        collection.insert(ordeal, (err, result) => {
            res.redirect('/' + path);
        });
    });

    // Display a leaderboard of the top 10 ordeals
    app.get('/leaderboard', (req, res) => {
        var collection = db.collection('ordeals');

        collection.find().sort({'hits': -1}).limit(10).toArray((err, topOrdeals) => {
            res.render('leaderboard', {
                data: topOrdeals
            });
        });
    });

    // Listen on all requests and show an ordeal or prompt the creation of one accordingly
    app.get('*', (req, res) => {
        if (req.path) {
            var path = parsePath(req.path);

            var collection = db.collection('ordeals');
            tryGetOrdeal(collection, path).then((ordeal) => {
                if (ordeal == null) {
                    // Show create ordeal page
                    res.render('createOrdeal', {
                        title: 'Create a new ordeal',
                        path: path
                    });
                } else {
                    // Display ordeal and increment hit counter
                    res.render('ordeal', {
                        title: ordeal.path + ' - Everything is an Ordeal',
                        path: ordeal.path,
                        image: uploadsDirName + '/' + ordeal.imageName,
                        hits: ordeal.hits + 1
                    });
                    incrementOrdealHits(collection, ordeal.path, ordeal.hits);
                }
            });
        }
    });
}

function parsePath(path) {
    return path.replace(/\//g, ''); // TODO: Add logic for failing on malformatted URLs
}

function tryGetOrdeal(collection, path) {
    var p = new Promise((resolve, reject) => {
        // Try to find an ordeal by the specified path
        collection.find({
            'path': path
        }).toArray((err, ordeals) => {
            if (ordeals.length == 0) {
                winston.debug('No ordeals found. Resolving null.');
                resolve(null);
            } else {
                winston.debug('Found an ordeal. Resolving with data.');
                resolve(ordeals[0]); // Operating on the assumption that there's only ever one ordeal
            }
        });
    });

    return p;
}

function incrementOrdealHits(collection, path, hits) {
    // Increment ordeal hits by one
    var result = collection.update({
        'path': path
    }, {
        $set: {
            hits: hits + 1
        }
    });

    if (!result) {
        winston.warn("Failed to update hits for " + path);
    }
}

// Start listening on port 3000. TODO: Change this to 80
app.listen(3000, () => {
    winston.info('Keeping track of life, one ordeal at a time.');
});