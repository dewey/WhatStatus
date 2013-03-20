# WhatStatus
## Check health of IRC, Tracker and Site
===

WhatStatus is a simple status page for torrent sites. It's powered by Espress.JS and Redis.

## Installation:
===

- Install [Node.JS](http://nodejs.org/)
- Install the [Node Package Manager](https://github.com/isaacs/npm)
- Install [Redis](http://redis.io/)
- Clone the WhatStatus repository
- Navigate to the directory and run `npm install` which will install all the dependencies listed in `package.json`
- Start the app in [production mode](http://www.hacksparrow.com/running-express-js-in-production-mode.html).
- `NODE_ENV=production node WhatStatus.js`

The app is now running on port 3000. To serve it on your regular port 80 you'll have to setup nginx like this:


** nginx.conf: ** 

    server {
            listen 80;
            server_name whatstatus.info;
            autoindex off;
            access_log /var/log/nginx/whatstatus.access_log main;
            error_log /var/log/nginx/whatstatus.error_log info;
            root /home/dewey/www/whatstatus.info/WhatStatus/;
            location / {
                    proxy_set_header X-Real-IP $remote_addr;
                    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
                    proxy_set_header Host $http_host;
                    proxy_set_header X-NginX-Proxy true;
                    proxy_pass http://127.0.0.1:3000/;
                    proxy_redirect off;
            }
    }
    
** Important: **
If you are running your own instance don't forget to remove the google analytics tracking code in views/layout.jade.

## Further Information:
===
[WhatStatus.info/about](https://whatstatus.info/about)