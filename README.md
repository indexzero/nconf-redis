# nconf-redis

A Redis store for [nconf][0]

## Installation

### Installing npm (node package manager)
``` bash
  $ curl http://npmjs.org/install.sh | sh
```

### Installing nconf-redis
``` bash
  $ [sudo] npm install nconf
  $ [sudo] npm install nconf-redis
```

## Motivation
`tldr;?`: To break the [nconf][0] codebase into small modules that work together.

## Usage
The store provided by `nconf-redis` will persist all of your configuration settings to a Redis server. All calls to `.get()`, `.set()`, `.clear()`, `.reset()` are asynchronous taking an additional callback parameter.

The Redis engine also has an in-memory cache with a default TTL of one hour. To change this, just pass the `ttl` option to `.use()`.

``` js
  var nconf = require('nconf');
  
  //
  // Requiring `nconf-redis` will extend the `nconf`
  // module.
  //
  require('nconf-redis');
  
  nconf.use('redis', { host: 'localhost', port: 6379, ttl: 60 * 60 * 1000, db: 0 });
```

#### Author: [Charlie Robbins](http://www.nodejitsu.com)

[0]: https://github.com/indexzero/nconf