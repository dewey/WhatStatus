
/**
 * Module dependencies.
 */

var express = require('express')
    , http = require('http')
    , net = require('net')
    , path = require('path')
    , net = require('net')
    , redis = require('redis')
    , cronJob = require('cron').CronJob
    , date = require('date-format-lite')
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
  app.locals.pretty = true;
});

var status = {
  site : {
    status : "Updating...",
    url : "images/updating.png"
  },
  tracker : {
    status : "Updating...",
    url : "images/updating.png"
  },
  irc : {
    status : "Updating...",
    url : "images/updating.png"
  }
}

function setUpVars(component) {
  component.status = "Up";
  component.url = "images/up.png";
}

function setDownVars(component) {
  component.status = "Down";
  component.url = "images/down.png";
}

function setMaintenanceVars(component) {
  component.status = "Maintenance";
  component.url = "images/maintenance.png";
}

// If there's an outtage reset uptime record counter.
function reset_uptime(component) {
  db.set('uptime:' + component, 0);
}

function update() {
  db.get("site-status", function(err, reply) {
      if(reply == 1) {
        setUpVars(status.site);
      } else if (reply == 0) {
        setDownVars(status.site);
      } else {
        setMaintenanceVars(status.site);
      }
  });

  db.get("tracker-status", function(err, reply) {
      if(reply == 1) {
        setUpVars(status.tracker);
      } else if (reply == 0) {
        setDownVars(status.tracker);
      } else {
        setMaintenanceVars(status.tracker);
      }
  });

  db.get("irc-status", function(err, reply) {
      if(reply == 1) {
        setUpVars(status.irc);
      } else if (reply == 0) {
        setDownVars(status.irc);
      } else {
        setMaintenanceVars(status.irc);
      }
  });
}

app.get('/', function (req, res) {
  res.render('index', { title:'WhatStatus',
                        tracker_status:status.tracker.status,
                        tracker_status_url:status.tracker.url,
                        site_status:status.site.status,
                        site_status_url:status.site.url,
                        irc_status:status.irc.status,
                        irc_status_url:status.irc.url,
                        logo_url:"images/logo.png"
                      });
})

app.get('/stats', function (req, res) {
  res.render('stats', { title:'WhatStatus' });
})

app.get('/about', function (req, res) {
  res.render('about', { title:'WhatStatus' });
})

// JSON Response for uptime values.
app.get('/api/uptime', function (req, res) {
  db.get("uptime:site", function(err, uptimeSite) {
    db.get("uptime:irc", function(err, uptimeIrc) {
      db.get("uptime:tracker", function(err, uptimeTracker) {
        res.json({
          site: uptimeSite,
          irc: uptimeIrc,
          tracker: uptimeTracker
        })
      });
    });
  });
})

// JSON Response for Uptime records
app.get('/api/records', function (req, res) {
  db.get("uptimerecord:site", function(err, uptimeRecordSite) {
    db.get("uptimerecord:irc", function(err, uptimeRecordIrc) {
      db.get("uptimerecord:tracker", function(err, uptimeRecordTracker) {
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
app.get('/api/status', function (req, res) {
  db.get("site-status", function(err, siteStatus) {
    db.get("irc-status", function(err, ircStatus) {
      db.get("tracker-status", function(err, trackerStatus) {
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
app.get('/api/uptime/tracker', function (req, res) {
  db.lrange("trackeruptime", 0, -1, function(err, uptimesTrackerHistory) {
    var jsonObj = {};
    for(var i = 0; i < uptimesTrackerHistory.length; i++) {
      var tokens = uptimesTrackerHistory[i].split(':')
      jsonObj[ tokens[0] ] = tokens[1]
    }
    res.json(jsonObj)
  })
})

// Check all components every minute
var site_status_counter = 0
var tracker_status_counter = 0
var irc_status_counter = 0

// Check Site Components (Cronjob running every minute)
new cronJob('1 * * * * *', function(){
    
    // Get Site Status
    request('https://what.cd', function (error, response) {
        if (!error && response.statusCode == 200) {
            console.log("[Check-Site] Site up");
            db.set("site-status", "1")
            site_status_counter = 0;
            console.log("[Check-Site] Status counter: " + site_status_counter);
        } else {
            site_status_counter++;
            console.log("[Check-Site] Status counter: " + site_status_counter);
            if(site_status_counter > 2) {
              db.set("site-status", "0")
              reset_uptime('site');
              console.log("[Check-Site] Site down");
            }
        }
    });

    // Get Tracker Status
    var client = net.connect(34000, 'tracker.what.cd', function() {
      db.set("tracker-status", "1")
      console.log('[Check-Tracker] Socket started');
      
      tracker_status_counter = 0;
      console.log("[Check-Tracker] Status counter: " + tracker_status_counter);
    });
    client.on('end', function() {
      // console.log('[Check-Tracker] Socket closed');
    });
    client.on('error', function() {
      console.log('[Check-Tracker] Error');
      
      tracker_status_counter++;
      console.log("[Check-Tracker] Status counter: " + tracker_status_counter);
      if(tracker_status_counter > 2) {
              db.set("tracker-status", "0")
              reset_uptime('tracker');
              console.log("[[Check-Tracker]] Tracker down");
      }

      client.end();
    });
    client.on('timeout', function() {
      console.log('[Check-Tracker] Timeout');
      
      tracker_status_counter++;
      console.log("[Check-Tracker] Status counter: " + tracker_status_counter);
      if(tracker_status_counter > 2) {
              db.set("tracker-status", "0")
              reset_uptime('tracker');
              console.log("[[Check-Tracker]] Tracker down");
      }

      client.end();
    });

    // Get IRC Status
    var client = net.connect(6667, 'irc.what.cd', function() {
      db.set("irc-status", "1")
      console.log('[Check-IRC] Socket started');

      irc_status_counter = 0;
      console.log("[Check-IRC] IRC counter: " + irc_status_counter);
    });
    client.on('end', function() {
      // console.log('[Check-IRC] Socket closed');
    });
    client.on('error', function() {
      console.log('[Check-IRC] Error');

      irc_status_counter++;
      console.log("[Check-IRC] Status counter: " + irc_status_counter);
      if(irc_status_counter > 2) {
              db.set("irc-status", "0")
              reset_uptime('irc');
              console.log("[Check-IRC] IRC down");
      }

      client.end();
    });
    client.on('timeout', function() {
      console.log('[Check-IRC] Timeout');

      irc_status_counter++;
      console.log("[Check-IRC] Status counter: " + irc_status_counter);
      if(irc_status_counter > 2) {
              db.set("irc-status", "0")
              reset_uptime('irc');
              console.log("[Check-IRC] IRC down");
      }

      client.end();
    });

    // Get new values from Redis
    update();
}, null, true, "Europe/Vienna");

/*
Statistics (hourly)

This cronjob is incrementing the uptime counters for the various monitored components
and updating the uptime records if the current uptime > the old record.
*/
new cronJob('1 * * * * *', function(){
  console.log("[Stats] Cronjob started")

  // Hourly Increment Uptime if Component is Up
  db.get("site-status", function(err, site_status) {
    if(site_status != 0) {
      db.incr('uptime:site');
    }
  });

  // Hourly Increment Uptime if Component is Up
  db.get("tracker-status", function(err, tracker_status) {
    if(tracker_status != 0) {
      db.incr('uptime:tracker');
    }
  });

  // Hourly Increment Uptime if Component is Up
  db.get("irc-status", function(err, irc_status) {
    if(irc_status != 0) {
      db.incr('uptime:irc');
    }
  });

  // Update Site Uptime Record
  db.get("uptime:site", function(err, uptimeSite) {
    db.get("uptimerecord:site", function(err, uptimerecordSite) {
      if(parseInt(uptimeSite) > parseInt(uptimerecordSite)) {
        db.set('uptimerecord:site', uptimeSite);
      }
    });
  });

  // Update Tracker Uptime Record
  db.get("uptime:tracker", function(err, uptimeTracker) {
    db.get("uptimerecord:tracker", function(err, uptimeRecordTracker) {
      if(parseInt(uptimeTracker) > parseInt(uptimeRecordTracker)) {
        console.log("[Stats-Tracker] Tracker Records updated")
        db.set('uptimerecord:tracker', uptimeTracker)
      }
    });
  });

  // Update IRC Uptime Record
  db.get("uptime:irc", function(err, uptimeIrc) {
    db.get("uptimerecord:irc", function(err, uptimerecordIrc) {
      if(parseInt(uptimeIrc) > parseInt(uptimerecordIrc)) {
        db.set('uptimerecord:irc', uptimeIrc);
      }
    });
  });

  /*
  Building string for Google Charts used to graph tracker uptime.
  String written to redis: DD.MM|int where int is the current tracker uptime.
  */
  db.get("uptime:tracker", function(err, uptimeTracker) {
    // Initialize new timestamp
    var now = new Date().format("DDMMYYYYhhmm");
    db.llen("trackeruptime", function(err, uptimesTrackerCount) {
      // Add new timestamp to redis, if there are more than 30 objects pop the oldest value.
      if(uptimesTrackerCount <= 30) {
        // Pushing Strings to Redis (I'm sorry!)
        db.rpush('trackeruptime', now + ":" + uptimeTracker);
      } else {
        db.lpop('trackeruptime');
      }
    });
  });
}, null, true, "Europe/Vienna");

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port: " + app.get('port'));
});
