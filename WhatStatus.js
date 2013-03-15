
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
  res.render('stats', { title:'WhatStatus', site_status:1, tracker_status:0, irc_status:1});
  // res.send("respond with a resource");
})


// Check all components every minute

var site_status_counter = 0;
var tracker_status_counter = 0;
var irc_status_counter = 0;

// Check Site Components
new cronJob('1 * * * * *', function(){
    
    // Get Site Status
    request('https://what.cdaaaa', function (error, response) {
        if (!error && response.statusCode == 200) {
            console.log("[Sitecheck] Site up");
            db.set("site-status", "1")
            site_status_counter = 0;
            console.log("[Sitecheck] Status counter: " + site_status_counter);
        } else {
            site_status_counter++;
            console.log("[Sitecheck] Status counter: " + site_status_counter);
            if(site_status_counter > 2) {
              db.set("site-status", "0")
              reset_uptime('site');
              console.log("[Sitecheck] Site down");
            }
        }
    });

    // Get Tracker Status
    var client = net.connect(34000, 'tracker.what.cd', function() {
      db.set("tracker-status", "1")
      console.log('[Trackercheck] Socket started');
      
      tracker_status_counter = 0;
      console.log("[Trackercheck] Status counter: " + tracker_status_counter);
    });
    client.on('end', function() {
      // console.log('[Trackercheck] Socket closed');
    });
    client.on('error', function() {
      console.log('[Trackercheck] Error');
      
      tracker_status_counter++;
      console.log("[Trackercheck] Status counter: " + tracker_status_counter);
      if(tracker_status_counter > 2) {
              db.set("tracker-status", "0")
              reset_uptime('tracker');
              console.log("[Trackercheck] Tracker down");
      }

      client.end();
    });
    client.on('timeout', function() {
      console.log('[Trackercheck] Timeout');
      
      tracker_status_counter++;
      console.log("[Trackercheck] Status counter: " + tracker_status_counter);
      if(tracker_status_counter > 2) {
              db.set("tracker-status", "0")
              reset_uptime('tracker');
              console.log("[Trackercheck] Tracker down");
      }

      client.end();
    });

    // Get IRC Status
    var client = net.connect(6667, 'irc.what.cd', function() {
      db.set("irc-status", "1")
      console.log('[IRCcheck] Socket started');

      irc_status_counter = 0;
      console.log("[IRCcheck] IRC counter: " + irc_status_counter);
    });
    client.on('end', function() {
      // console.log('[IRCcheck] Socket closed');
    });
    client.on('error', function() {
      console.log('[IRCcheck] Error');

      irc_status_counter++;
      console.log("[IRCcheck] Status counter: " + irc_status_counter);
      if(irc_status_counter > 2) {
              db.set("irc-status", "0")
              reset_uptime('irc');
              console.log("[IRCcheck] IRC down");
      }

      client.end();
    });
    client.on('timeout', function() {
      console.log('[IRCcheck] Timeout');

      irc_status_counter++;
      console.log("[IRCcheck] Status counter: " + irc_status_counter);
      if(irc_status_counter > 2) {
              db.set("irc-status", "0")
              reset_uptime('irc');
              console.log("[IRCcheck] IRC down");
      }

      client.end();
    });

    // Get new values from Redis
    update();
}, null, true, "Europe/Vienna");

// Statistics
new cronJob('1 * * * * *', function(){

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
  db.get("uptime:site", function(err, uptime_site) {
    db.get("uptimerecord:site", function(err, uptimerecord_site) {
      if(uptime_site > uptimerecord_site) {
        db.set('uptimerecord:site', uptime_site);
      }
    });
  });

  // Update Tracker Uptime Record
  db.get("uptime:tracker", function(err, uptime_tracker) {
    db.get("uptimerecord:tracker", function(err, uptimerecord_tracker) {
      if(uptime_tracker > uptimerecord_tracker) {
        db.set('uptimerecord:tracker', uptime_tracker);
      }
    });
  });

  // Update IRC Uptime Record
  db.get("uptime:irc", function(err, uptime_irc) {
    db.get("uptimerecord:irc", function(err, uptimerecord_irc) {
      if(uptime_irc > uptimerecord_irc) {
        db.set('uptimerecord:irc', uptime_irc);
      }
    });
  });


}, null, true, "Europe/Vienna");

http.createServer(app).listen(app.get('port'), function(){
  console.log("Express server listening on port: " + app.get('port'));
});
