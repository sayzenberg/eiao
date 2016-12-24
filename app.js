var express = require('express');
var app = express();
var mongoClient = require('mongodb').MongoClient;
var assert = require('assert');

var mongoUrl = 'mongodb://localhost:27017/eiao';

app.set('views', './views');
app.set('view engine', 'pug');

// Listen on all requests
app.get('*', (req, res) => {
    if (req.path) {
        var path = req.path.replace(/\//g, ""); // TODO: Add logic for failing on malformatted URLs

        // Connect to DB
        mongoClient.connect(mongoUrl, (err, db) => {
            if (err) {
                throw err
            }

            var collection = db.collection('ordeals');
            tryGetOrdeal(collection, path).then((ordeal) => {
                if (ordeal == null) {
                    createOrdeal(collection, path);
                } else {
                    console.log('Found this ordeal: ' + ordeal.path);
                    res.render('ordeal', { title: 'Ordeal', message: 'Your ordeal: ' + ordeal.path });
                }
            });
        });
    }
});

// Start listening on port 3000. TODO: Change this to 80
app.listen(3000, () => {
    console.log('Example app listening on port 3000!')
});

function tryGetOrdeal(collection, path) {
    var p = new Promise((resolve, reject) => {
        // Try to find an ordeal by the specified path
        collection.find({
            'path': path
        }).toArray((err, ordeals) => {
            if (ordeals.length == 0) {
                console.log('No ordeals');
                resolve(null);
            } else {
                console.log('Found an ordeal');
                resolve(ordeals[0]); // Operating on the assumption that there's only ever one ordeal
            }
        });
    });

    return p;

}

function createOrdeal(collection, path) {
    collection.insert({
        'path': path
    }, (err, result) => {
        console.log('Inserted ordeal ' + path);
    });
}