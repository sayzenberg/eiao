var express = require('express');
var app = express();
var MongoClient = require('mongodb').MongoClient;
var assert = require('assert');

var mongoUrl = 'mongodb://localhost:27017/eiao';

// Listen on all requests
app.get('*', (req, res) => {
    if (req.path) {
        var path = req.path.replace(/\//g, "");

        // Connect to DB
        MongoClient.connect(mongoUrl, (err, db) => {
            if (err) throw err

            getOrCreateOrdeal(db, path);

        });
    }
});

// Start listening on port 3000. TODO: Change this to 80
app.listen(3000, () => {
    console.log('Example app listening on port 3000!')
});

function getOrCreateOrdeal(db, path) {
    var collection = db.collection('ordeals');

    // Try to find an ordeal by the specified path
    collection.find({
        'path': path
    }).toArray((err, ordeals) => {
        if (ordeals.length !== 0) {
            console.log('Found an ordeal');
        } else {
            console.log('No ordeals');
            collection.insert({
                'path': path
            }, (err, result) => {
                console.log('Inserted ordeal ' + path);
            });
        }
    });
}