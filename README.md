# WhatStatus
## Check health of IRC, Tracker and Site
===

WhatStatus is a simple status page for torrent sites. It's powered by [Espress](http://expressjs.com/) and Redis.

## Installation:
===

- Install [Node.JS](http://nodejs.org/)
- Install [Redis](http://redis.io/)
- Clone the WhatStatus repository
- Navigate to the directory and run `npm install` which will install all the dependencies listed in `package.json`

## Running the site

**Important:**
If you are running your own instance don't forget to remove the analytics tracking code in views/layout.jade before you continue to the next steps.

### Recommended: pm2

Install `pm2` with `npm install pm2 -g`. More information on: ttps://github.com/Unitech/PM2

Type `pm2 list` to get a list of all the currently running processes, this will still be empty but it'll create the necessary directories for the next step.

Create the pm2 config file called `whatstatus.info.json` and store it somewhere convenient like `~/.pm2/`.

    [{
        "name"        : "whatstatus.info",
        "script"      : "WhatStatus.js",
        "cwd"         : "/var/www/whatstatus.info/WhatStatus/",
        "env": {
            "NODE_ENV": "production"
        }
    }]

Then just run `pm2 add ~/.pm2/whatstatus.info.json` and now the service should be started and should show up in `pm2 list`.

### Alternative: `screen`, `forever` etc.

- Start the app in [production mode](http://www.hacksparrow.com/running-express-js-in-production-mode.html).
- `NODE_ENV=production node WhatStatus.js`

The app is now running on port 3000. To serve it on your regular port 443 or 80 you'll have to setup nginx like this:


### nginx configuration 

    server {
            listen 443;
            server_name whatstatus.info;
            autoindex off;
            access_log /var/log/nginx/whatstatus.info.access_log main;
            error_log /var/log/nginx/whatstatus.info.error_log info;
            root /var/www/whatstatus.info/WhatStatus/;
            location / {
                    proxy_set_header X-Real-IP $remote_addr;
                    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                    proxy_set_header Host $http_host;
                    proxy_set_header X-NginX-Proxy true;
                    proxy_pass http://127.0.0.1:3000/;
                    proxy_redirect off;
            }
    }
    
## Further Information:
===
[WhatStatus.info/about](https://whatstatus.info/about)