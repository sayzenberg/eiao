// Requirements
var express = require('express');
var app = express();
var mongoClient = require('mongodb').MongoClient;
var assert = require('assert');
var multer = require('multer');
var path = require('path');
var winston = require('winston');
var fs = require('fs');
var sharp = require('sharp');
var autoReap = require('multer-autoreap');

// Default values for port and db connection string
var localPort = '3000';
var localDB = 'mongodb://localhost:27017/eiao';

// Date connection configuration
var database = null;
var mongoUrl = process.env.CUSTOMCONNSTR_ordealDB || localDB;

// Image storage configuration
var publicDirName = 'public';
var uploadsDirName = 'uploads';
var uploadsPath = publicDirName + '/' + uploadsDirName + '/';
var longestImageDimension = 500;

var options = multer.diskStorage({
    filename: function(req, file, cb) {
        var ext = path.extname(file.originalname);
        cb(null, path.basename(file.originalname, ext) + Date.now() + ext);
    }
});

var upload = multer({
    storage: options
});

app.use(autoReap);

// App configuration
app.set('views', './views');
app.set('view engine', 'pug');
app.use(express.static(publicDirName))
app.use('/milligram', express.static('node_modules/milligram/dist'))
app.use('/jquery', express.static('node_modules/jquery/dist'))

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

    // Create a new ordeal whenever /api/ordeal/create is hit
    app.post('/api/ordeal/create', upload.single('image'), (req, res) => {
        if (req.file) {
            var processedImageName = 'p-' + req.file.filename;

            var fileStream = fs.readFile(req.file.path, (err, data) => {
                // Resize any image so that its longest side is no longer than longestImageDimension px
                sharp(data).resize(longestImageDimension, longestImageDimension).min().toFile(uploadsPath + processedImageName, (err) => {
                    if (err) {
                        winston.error('Could not save resized image');
                        winston.error(err);
                    }
                    var collection = db.collection('ordeals');
                    var path = parsePath(req.body.path);

                    var ordeal = {
                        'path': path,
                        'imageName': processedImageName,
                        'hits': 0
                    }

                    collection.insert(ordeal, (err, result) => {
                        if (err) {
                            winston.error('Error creating ordeal ' + path);
                            winston.error(err);
                        } else {
                            winston.info('Created ordeal ' + path);
                            res.send({
                                redirect: '/' + path
                            });
                        }
                    });
                });
            });
        } else {
            // This error is displayed in createOrdeal.pug via jQuery
            winston.warn('User did not submit an image. Returning 400');
            res.statusMessage = 'Please upload an image before submitting!';
            res.status(400).end();
        }
    });

    // Delete the data and image file for an ordeal
    app.delete('/api/ordeal/delete/:path', (req, res) => {
        var collection = db.collection('ordeals');
        var path = parsePath(req.params.path);

        // Delete the specified document and also retrieve it to get fileName
        collection.findAndModify({
            'path': path
        }, null, null, {
            remove: true
        }, (err, document) => {
            if (err) {
                winston.error('Unable to delete ' + path);
                winston.error(err);
            } else {
                // Delete image file corresponding to ordeal
                fs.unlink(uploadsPath + document.value.imageName, (err) => {
                    if (err) {
                        winston.error('Unable to delete image for ' + path);
                    }
                });
            }
        });

        res.send('Removed ordeal');
    });

    // Fetch a JSON-formatted object for an ordeal
    app.get('/api/ordeal/:path', (req, res) => {
        var collection = db.collection('ordeals');

        var path = parsePath(req.params.path);
        tryGetOrdeal(collection, path).then((ordeal) => {
            if (ordeal == null) {
                res.sendStatus(404);
            } else {
                ordeal.hits++;
                res.send(JSON.stringify(ordeal));
                incrementOrdealHits(collection, ordeal.path, --ordeal.hits);
            }
        });
    });

    // Display a leaderboard of the top 10 ordeals
    app.get('/leaderboard', (req, res) => {
        var collection = db.collection('ordeals');

        collection.find().sort({
            'hits': -1
        }).limit(10).toArray((err, topOrdeals) => {
            res.render('leaderboard', {
                data: topOrdeals
            });
        });
    });

    // Display a management panel
    app.get('/manage', (req, res) => {
        var collection = db.collection('ordeals');

        collection.find().toArray((err, topOrdeals) => {
            res.render('manage', {
                data: topOrdeals
            });
        });
    });

    // Listen on all requests and show an ordeal or prompt the creation of one accordingly
    app.get('/:ordeal', (req, res) => {
        var ordealPath = req.params.ordeal;
        if (ordealPath) {
            var path = parsePath(ordealPath);

            var collection = db.collection('ordeals');
            tryGetOrdeal(collection, path).then((ordeal) => {
                if (ordeal == null) {
                    // Show create ordeal page
                    winston.debug('Displaying createOrdeal.pug');
                    res.render('createOrdeal', {
                        title: 'Create a new ordeal',
                        path: path
                    });
                } else {
                    // Display ordeal and increment hit counter
                    winston.debug('Displaying ordeal ' + ordeal.path);
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

    // Display the homepage
    app.get('/', (req, res) => {
        var collection = db.collection('ordeals');

        var cursor = collection.aggregate({
            $group: {
                _id: '',
                hits: {
                    $sum: '$hits'
                }
            }
        }, {
            $project: {
                _id: 0,
                hits: '$hits'
            }
        });

        cursor.get((err, sumObj) => {
            res.render('homepage', {
                totalHits: sumObj.length === 0 ? 0 : sumObj[0].hits
            });
        });
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
                resolve(null);
            } else {
                var targetOrdeal = ordeals[0];
                delete targetOrdeal._id;
                resolve(targetOrdeal); // Operating on the assumption that there's only ever one ordeal
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
        winston.error("Failed to update hits for " + path);
    }
}

// Start listening on port 80
app.listen(process.env.PORT || localPort, () => {
    winston.info('Keeping track of life, one ordeal at a time.');
});