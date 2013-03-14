
/**
 * Module dependencies.
 */

var express = require('express')
    // , routes = require('./routes')
    // , index = require('./routes/index')
    // , stats = require('./routes/stats')
    , http = require('http')
    , path = require('path')
    , net = require('net')
    , redis = require('redis')
    , cronJob = require('cron').CronJob
    , request = require('request');

var app = express();
var db = redis.createClient();

app.configure(function(){
  app.set('port', process.env.PORT || 3000);
  app.set('views', __dirname + '/views');
  app.set('view engine', 'jade');
  app.use(express.favicon());
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function(){
  app.use(express.errorHandler());
});

// app.get('/', function(req, res) {
//     db.get("site-status", function(error, response) {
//         if(response) {
//             res.render('index', {
//                 test: response
//             });
//         } else {
//             res.render('index', {
//                 test: error
//             });
//         }
//     });
// });

// app.get('/', function (req, res) {
//     res.render(index);
// });
// app.get('/', routes.index);

app.get('/', function (req, res) {
  res.render('index', { title:'WhatStatus', site_status:1, tracker_status:0, irc_status:1});
  // res.send("respond with a resource");
})

app.get('/stats', function (req, res) {
  res.render('stats', { title:'WhatStatus', site_status:1, tracker_status:0, irc_status:1});
  // res.send("respond with a resource");
})


// new cronJob('1 * * * * *', function(){
//     // Get Site Status
//     request('https://what.cd', function (error, response) {
//         if (!error && response.statusCode == 200) {
//             console.log("Site: Up")
//             db.set("site-status", "up")
//         } else {
//             console.log("Site: Down")
//             db.set("site-status", "down")
//         }
//     });
// }, null, true, "Europe/Vienna");

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port " + app.get('port'));
});
