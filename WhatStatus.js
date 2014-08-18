/**
 * WhatStatus.info is a simple status page for torrent site.
 * @author dewey
 * https://github.com/dewey/WhatStatus
 */

var express = require('express'),
    http = require('http'),
    net = require('net'),
    path = require('path'),
    net = require('net'),
    redis = require('redis'),
    cronJob = require('cron').CronJob,
    date = require('date-format-lite'),
    request = require('request');

var app = express();
var db = redis.createClient();

// Catch connection errors if redis-server isn't running
db.on("error", function(err) {
    console.log(err.toString());
    console.log("       Make sure redis-server is started and listening for connections.");
});

app.configure(function() {
    app.set('port', process.env.PORT || 3000);
    app.set('views', __dirname + '/views');
    app.set('view engine', 'jade');
    app.use(express.favicon('images/favicon.ico'));
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(app.router);
    app.use(express.static(path.join(__dirname, 'public')));
});

app.configure('development', function() {
    app.use(express.errorHandler());
    app.locals.pretty = true;
    app.use(express.logger('dev'));
});


// If there's an outtage reset uptime record counter.
function reset_uptime(component) {
    db.set('uptime:' + component, 0);
}

// Render the index page
app.get('/', function(req, res) {
    res.render('index', {
        title: 'WhatStatus',
        logo_url: 'images/logos/logo.png'
    });
})

// Render the Stats page
app.get('/stats', function(req, res) {
    res.render('stats', {
        title: 'WhatStatus'
    });
})

// Render the About page
app.get('/about', function(req, res) {
    res.render('about', {
        title: 'WhatStatus'
    });
})

// Render the FAQ page
app.get('/faq', function(req, res) {
    res.render('faq', {
        title: 'WhatStatus'
    });
})

// JSON Response for uptime values
app.get('/api/uptime', function(req, res) {
    db.get('uptime:site', function(err, uptimeSite) {
        db.get('uptime:irc', function(err, uptimeIrc) {
            db.get('uptime:tracker', function(err, uptimeTracker) {
                res.json({
                    site: uptimeSite,
                    irc: uptimeIrc,
                    tracker: uptimeTracker
                })
            });
        });
    });
})

// JSON Response for uptime records
app.get('/api/records', function(req, res) {
    db.get('uptimerecord:site', function(err, uptimeRecordSite) {
        db.get('uptimerecord:irc', function(err, uptimeRecordIrc) {
            db.get('uptimerecord:tracker', function(err, uptimeRecordTracker) {
                res.json({
                    site: uptimeRecordSite,
                    irc: uptimeRecordIrc,
                    tracker: uptimeRecordTracker
                })
            });
        });
    });
})

// JSON Response for current component status
app.get('/api/status', function(req, res) {
    db.get('site-status', function(err, siteStatus) {
        db.get('irc-status', function(err, ircStatus) {
            db.get('tracker-status', function(err, trackerStatus) {
                res.json({
                    site: siteStatus,
                    irc: ircStatus,
                    tracker: trackerStatus
                })
            });
        });
    });
})

// JSON Response for tracker uptime with time stamps
app.get('/api/uptime/tracker', function(req, res) {
    db.lrange('trackeruptime', 0, -1, function(err, uptimesTrackerHistory) {
        var jsonObj = {};
        for (var i = 0; i < uptimesTrackerHistory.length; i++) {
            var tokens = uptimesTrackerHistory[i].split(':')
            jsonObj[tokens[0]] = tokens[1]
        }
        res.json(jsonObj)
    })
})

// JSON Response for tracker uptime with time stamps [array]
app.get('/api/2/uptime/tracker', function(req, res) {
    db.lrange('trackeruptime', 0, -1, function(err, uptimesTrackerHistory) {
        var jsonArray = [];
        for (var i = 0; i < uptimesTrackerHistory.length; i++) {
            var tokens = uptimesTrackerHistory[i].split(':')
            jsonArray.push({
                timestamp: tokens[0],
                status: tokens[1]
            });
        }
        res.json(jsonArray)
    })
})

// Check all components every minute
var site_status_counter = 0
var tracker_status_counter = 0
var irc_status_counter = 0

// Check Site Components (Cronjob running every minute)
new cronJob('*/1 * * * *', function() {

    // Get Site Status
    request('https://what.cd', function(error, response) {
        if (!error && response.statusCode == 200) {
            db.set('site-status', '1')
            site_status_counter = 0;
        } else {
            site_status_counter++;
            console.log("[Check-Site] Status counter: " + site_status_counter);
            if (site_status_counter > 2) {
                db.set('site-status', '0')
                reset_uptime('site');
                console.log("[Check-Site] Site down");
            }
        }
    });

    // Get Tracker Status
    request('http://tracker.what.cd:34000', function(error, response, body) {
        console.log('[Check-Tracker] Body: ' + body);
        if(!error && body.length > 0 && body.indexOf('is down') == -1) {
            db.set('tracker-status', '1')
            tracker_status_counter = 0;
        } else {
            tracker_status_counter++;
            console.log("[Check-Tracker] Status counter: " + tracker_status_counter);
            if (tracker_status_counter > 2) {
                db.set('tracker-status', '0')
                reset_uptime('tracker');
                console.log("[Check-Tracker] Tracker down");
            }
        }
    });

    // Get IRC Status
    var client = net.connect(6667, 'irc.what-network.net', function() {
        db.set('irc-status', '1')
        irc_status_counter = 0;
    });

    // Socket connection closed
    client.on('end', function() {

    });

    // Error on connecting to target host
    client.on('error', function() {
        irc_status_counter++;
        console.log("[Check-IRC] Status counter: " + irc_status_counter);
        if (irc_status_counter > 2) {
            db.set('irc-status', '0')
            reset_uptime('irc');
            console.log("[Check-IRC] IRC down");
        }

        client.end();
    });

    client.on('timeout', function() {
        console.log("[Check-IRC] Timeout");
        client.end();
    });
}, null, true, "Europe/Vienna");

/*
Statistics (hourly)

This cronjob is incrementing the uptime counters for the various monitored components
and updating the uptime records if the current uptime > the old record.
*/

// Initialize Redis Keys to prevent "null" values
function initializeRedis(component) {
    db.exists(component, function(err, reply) {
        if (reply != 1) {
            db.set(component, 0);
        }
    });
}

initializeRedis('uptimerecord:site')
initializeRedis('uptimerecord:tracker')
initializeRedis('uptimerecord:irc')
initializeRedis('uptime:site')
initializeRedis('uptime:tracker')
initializeRedis('uptime:irc')

new cronJob('0 * * * *', function() {
    console.log("[Stats] Cronjob started")

    // Hourly Increment Uptime if Component is Up
    db.get('site-status', function(err, siteStatus) {
        if (siteStatus != 0) {
            db.incr('uptime:site');
        }

        // Update Site Uptime Record
        db.get('uptime:site', function(err, uptimeSite) {
            db.get('uptimerecord:site', function(err, uptimerecordSite) {
                if (parseInt(uptimeSite) > parseInt(uptimerecordSite)) {
                    console.log("[Stats-Site] Site Records updated [" + uptimerecordSite + " to " + uptimeSite + "]");
                    db.set('uptimerecord:site', uptimeSite);
                }
            });
        });
    });

    // Hourly Increment Uptime if Component is Up
    db.get('tracker-status', function(err, trackerStatus) {
        if (trackerStatus != 0) {
            db.incr('uptime:tracker');
        }
        // Update Tracker Uptime Record
        db.get('uptime:tracker', function(err, uptimeTracker) {
            db.get('uptimerecord:tracker', function(err, uptimerecordTracker) {
                if (parseInt(uptimeTracker) > parseInt(uptimerecordTracker)) {
                    console.log("[Stats-Tracker] Tracker Records updated [" + uptimerecordTracker + " to " + uptimeTracker + "]");
                    db.set('uptimerecord:tracker', uptimeTracker);
                }
            });
        });

        /*
    Building string for Google Charts used to graph tracker uptime.
    String written to redis: DDMMYYYYhhmm|int where int is the current tracker uptime.
    */
        db.get('uptime:tracker', function(err, uptimeTracker) {
            // Initialize new timestamp
            var now = new Date().format('DDMMYYYYhhmm');
            db.llen('trackeruptime', function(err, uptimesTrackerCount) {
                // Add new timestamp to redis, if there are more than 24 objects pop the oldest value.
                if (uptimesTrackerCount <= 24) {
                    // Pushing Strings to Redis (I'm sorry!)
                    db.rpush('trackeruptime', now + ":" + uptimeTracker);
                } else {
                    db.lpop('trackeruptime');
                }
            });
        });
    });

    // Hourly Increment Uptime if Component is Up
    db.get('irc-status', function(err, ircStatus) {
        if (ircStatus != 0) {
            db.incr('uptime:irc');
        }
        // Update IRC Uptime Record
        db.get('uptime:irc', function(err, uptimeIrc) {
            db.get('uptimerecord:irc', function(err, uptimerecordIrc) {
                if (parseInt(uptimeIrc) > parseInt(uptimerecordIrc)) {
                    console.log("[Stats-Irc] Irc Records updated [" + uptimerecordIrc + " to " + uptimeIrc + "]")
                    db.set('uptimerecord:irc', uptimeIrc);
                }
            });
        });
    });

}, null, true, "Europe/Vienna");

http.createServer(app).listen(app.get('port'), function() {
    console.log("WhatStatus server listening on port: " + app.get('port'));
});