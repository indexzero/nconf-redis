'use strict';
/*
 * nconf-redis.js: Redis storage engine for nconf configuration(s)
 *
 * (C) 2011, Charlie Robbins
 *
 */

const async = require('async');
const nconf = require('nconf');

const logger = console;
//
// ### function Redis (options)
// #### @options {Object} Options for this instance
// Constructor function for the Redis nconf store which maintains
// a nested Redis key structure based on key delimiters `:`.
//
// e.g. 
//     my:nested:key, 'value' 
//       namespace:keys        ==> ['my']
//       namespace:nested:keys ==> ['key']
//       namespace:nested:key  ==> 'value'
//
let Redis = exports.Redis = function (options) {
    options = options || {};
    this.type = 'redis';
    this.namespace = ((options.namespace == null) ? 'nconf' : options.namespace); //允许空字符串

    this.client = options.client;
    if (!this.client) {
        const redis = require('redis');
        this.host = options.host || 'localhost';
        this.port = options.port || 6379;
        this.db = options.db || 0;
        this.client = redis.createClient(options.port, options.host);
        if (options.auth) {
            this.client.auth(options.auth);
        }
        this.client.select(this.db);
        this.client.on('error', function (err) {
            console.dir(err);
        });
    }
    this.ttl = options.ttl || 60 * 60 * 1000;
    this.cache = new nconf.Memory();
    // Suppress errors from the Redis client
};

//
// Define a getter so that `nconf.Redis` 
// is available and thus backwards compatible.
//
nconf.Redis = Redis;

Redis.prototype.key=function(...args) {
    if (this.namespace) args.unshift(this.namespace);
    return nconf.key.apply(nconf, args);
};

//
// ### function get (key, callback)
// #### @key {string} Key to retrieve for this instance.
// #### @callback {function} Continuation to respond to when complete.
// Retrieves the value for the specified key (if any).
//
Redis.prototype.getValue = async function (key,option) {
    let self = this,
        result = {},
        now = Date.now(),
        mtime = this.cache.mtimes[key],
        fullKey = this.key(key);

    if (!option) option = {};
    // if (arguments.length===2){
    //     option={};
    //     callback=arguments[1];
    // }

    // Set the callback if not provided for "fire and forget"
    // callback = callback || function () { };

    //
    // If the key exists in the cache and the ttl is less than
    // the value set for this instance, return from the cache.
    //
    if (mtime && (now - mtime < this.ttl)) {  //mtime==null时不读取memory
        return this.cache.get(key);
    }

    async function getRedisValue(fullKey) {
        //
        // If there are no keys, then the value to be retrieved is a literal
        // and we can simply return the value from redis directly.
        //
        logger.debug('redis:get', fullKey);
        let value = await self.client.get(fullKey);// , function (err, value) {
        // if (err) {
        //     console.error(fullKey, err);
        //     return callback && callback(err);
        // }
        result = JSON.parse(value);
        // if (result) {
        self.cache.set(key, result);
        // }
        return result;
    }

    async function addValue(source) {
        let value = await self.getValue(nconf.key(key, source),option);//, function (err, value) {

        result[source] = value;
        // next();
        // });
    }

    if (!option.tree) {
        return await getRedisValue(fullKey);
    } else { //目录树
        //
        // Get the set of all children keys for the `key` supplied. If the value
        // to be returned is an Object, this list will not be empty.
        //
        logger.debug('redis:smembers', fullKey + ':keys');
        let keys = await this.client.smembers(nconf.key(fullKey, 'keys')); //, function (err, keys) {

        if (keys && keys.length > 0) {
            //
            // If the value to be retrieved is an Object, recursively attempt
            // to get the value from redis. Here we use a recursive call to `this.get`
            // to support nested Object keys.
            //
            let fns = [];
            keys.forEach((_key) => {
                fns.push(addValue(_key));
            });
            await Promise.all(fns);
            self.cache.set(key, result);
            return result;
        }
        else {
            return await getRedisValue(fullKey);
        }
    }
};
/**
 *
 * @param key
 * @param callback
 * @return {*}
 */
Redis.prototype.get=function(key,callback) {
    this.getValue(key, {tree: 1}).then((v) => {
        callback && callback(null, v);
    }).catch((err) => {
        console.error('ReadError:' + key, err);
        callback && callback(null, this.cache.get(key)); //读取失败则使用原来的值
    });
    if (!callback) {
        return this.cache.get(key);
    }
};

//
// ### function set (key, value, callback)
// #### @key {string} Key to set in this instance
// #### @value {literal|Object} Value for the specified key
// #### @callback {function} Continuation to respond to when complete.
// Sets the `value` for the specified `key` in this instance.
//
Redis.prototype.setValue=async function (key, value,option) {
    let self = this,
        path = nconf.path(key);

    if (!option) option={};

    await this._addKeys(key);

    let fullKey = this.key(key);

    //目录树
    if (option.tree && !Array.isArray(value) && value !== null && typeof value === 'object') {
        //
        // If the value is an `Object` (and not an `Array`) then
        // nest into the value and set the child keys appropriately.
        // This is done for efficient lookup when setting Object keys.
        // (i.e. If you set and Object then wish to later retrieve only a
        // member of that Object, the entire Object need not be retrieved).
        //
        let result=await self._setObject(fullKey, value);
        self.cache.set(key, value); //成功后,刷新缓存
        return result;
    }
    else {
        //
        // If the value is a simple literal (or an `Array`) then JSON
        // stringify it and put it into Redis.
        //

        let storeValue = JSON.stringify(value);
        logger.debug('redis:set', fullKey);
    
        const setArgs = [fullKey, storeValue];
        if (option.ttl) {
            setArgs.push('EX');
            setArgs.push(option.ttl);
        }
        let result = await self.client.set.apply(self.client, setArgs); //单位s
        self.cache.set(key, value);
        return result;
    }
};

/**
 *
 * @param key
 * @param value
 * @param callback
 */
Redis.prototype.set=function(key,value,callback) {
    if (!callback) {
        callback = function () {
        };
    }
    this.setValue(key, value, {tree: 1}).then((v) => callback(null, v)).catch(callback); //设置redis目录树
};

//
// ### function merge (key, value, callback)
// #### @key {string} Key to merge the value into
// #### @value {literal|Object} Value to merge into the key
// #### 2callback {function} Continuation to respond to when complete.
// Merges the properties in `value` into the existing object value
// at `key`. If the existing value `key` is not an Object, it will be
// completely overwritten.
//
Redis.prototype.merge = function(key,value,callback) {
    merge(key,value).then((v)=>callback(null,v)).catch(callback);
};

async function merge(key, value) {
    //
    // If the key is not an `Object` or is an `Array`,
    // then simply set it. Merging is for Objects.
    //
    if (typeof value !== 'object' || Array.isArray(value)) {
        return await this.setValue(key,value,{tree:1});
    }

    let self = this,
        path = nconf.path(key),
        fullKey = this.key(key);

    // Set the callback if not provided for "fire and forget"
    // callback = callback || function () {
    // };

    //
    // Get the set of all children keys for the `key` supplied. If the value
    // to be returned is an Object, this list will not be empty.
    //
    await this._addKeys(key);
    let keys = await self.client.smembers(nconf.key(fullKey, 'keys'));//, function (err, keys) {
    async function nextMerge(nested) {
        let keyPath = nconf.key.apply(null, path.concat([nested]));
        return await merge.call(self,keyPath, value[nested]);
    }

    if (keys && keys.length > 0) {
        //
        // If there are existing keys then we must do a recursive merge 
        // of the two Objects.
        //
        // return async.forEach(Object.keys(value), nextMerge, callback);
        let fns = [];
        Object.keys(value).forEach((nested) => {
            fns.push(nextMerge(nested));
        });
        return await Promise.all(fns);
    }

    //
    // Otherwise, we can simply invoke `set` to override the current
    // literal or Array value with our new Object value
    //
    return await this.setValue(key,value,{tree:1});
}

/**
 * 
 * @param key
 * @param option {{tree}}
 * @return {Promise<void|*|string>}
 */
Redis.prototype.clearValue=async function (key,option) {
    let self = this,
        path = [].concat(nconf.path(key)),
        last = path.pop(),
        fullKey = this.key(key);
    
    if (!option) option = {};
    // 
    // Clear the key from the cache for this instance
    //
    this.cache.clear(key);
    
    //
    // Remove the `key` from the parent set of keys.
    //
    await this.client.srem(this.key.apply(this, path.concat(['keys'])), last);
    
    if (option.tree) {
        const keys = await self.client.smembers(nconf.key(fullKey, 'keys'));
        
        if (keys && keys.length > 0) {
            let count = 0;
            for (let child of keys) {
                count += (await self.clearValue(nconf.key(key, child), option));
            }
            return count;
        } else {
            //
            // Otherwise if this is just a simple literal, then 
            // simply remove it from Redis directly.
            //
            return (await self.client.del(fullKey)) && 1;
        }
    } else {
        return (await self.client.del(fullKey)) && 1;
    }
};

//
// ### function clear (key, callback)
// #### @key {string} Key to remove from this instance
// #### @callback {function} Continuation to respond to when complete.
// Removes the value for the specified `key` from this instance.
//
Redis.prototype.clear = function (key, callback) {
    if (!callback) {
        callback = function () {
        };
    }
    this.clearValue(key, {tree: 1}).then((v) => callback(null, v)).catch(callback); //设置redis目录树
};

//
// ### function save (value, callback) 
// #### @value {Object} Config object to set for this instance
// #### @callback {function} Continuation to respond to when complete.
// Removes any existing configuration settings that may exist in this
// instance and then adds all key-value pairs in `value`. 
//
Redis.prototype.save = function (value, callback) {
  if (Array.isArray(value) || typeof value !== 'object') {
    return callback(new Error('`value` to be saved must be an object.'));
  }
  
  let self = this,
      keys = Object.keys(value);
  
  // Set the callback if not provided for "fire and forget"
  callback = callback || function () { };

  //
  // Clear all existing keys associated with this instance.
  //
  this.reset(function (err) {
    if (err) {
      return callback(err);
    }
    
    //
    // Iterate over the keys in the new value, setting each of them.
    //
    async.forEach(keys, function (key, next) {
      self.set(key, value[key], next);
    }, callback);
  });
};

//
// ### function load (callback)
// #### @callback {function} Continuation to respond to when complete.
// Responds with an Object representing all keys associated in this instance.
//
Redis.prototype.load = function (callback) {
  let self   = this,
      result = {};

  // Set the callback if not provided for "fire and forget"
  callback = callback || function () { };

  this.client.smembers(this.key('keys'), function (err, keys) {
    if (err) {
      return callback(err);
    }

    function addValue (key, next) {
      self.get(key, function (err, value) {
        if (err) {
          return next(err);
        }

        result[key] = value;
        next();
      });
    }

    keys = keys || [];
    async.forEach(keys, addValue, function (err) {
        self.cache.mtimes = {}; //标记为已过期
        return err ? callback(err) : callback(null, result);
    });
  });
};

//
// ### function reset (callback)
// #### @callback {function} Continuation to respond to when complete.
// Clears all keys associated with this instance.
//
Redis.prototype.reset = function (callback) {
  let self = this;
  
  // Set the callback if not provided for "fire and forget"
  callback = callback || function () { };
  
  //
  // Get the list of of top-level keys, then clear each of them
  //
  this.client.smembers(this.key('keys'), function (err, existing) {
    if (err) {
      return callback(err);
    }
    
    existing = existing || [];
    async.forEach(existing, function (key, next) {
      self.clear(key, next);
    }, callback);
  });
};

//
// ### @private function _addKeys (key, callback) 
// #### @key {string} Key to add parent keys for
// #### @callback {function} Continuation to respond to when complete.
// Adds the full `key` path to Redis via `sadd`.
//
Redis.prototype._addKeys = async function (key) {
    let self = this,
        path = nconf.path(key);

    const fns = path.map((partial,index) => {
        const base = path.slice(0, index);
        base.push('keys');
        
        const parent = self.key.apply(self, base);
        logger.debug('redis:sadd', parent);
        return self.client.sadd(parent, partial);
    });
    return await Promise.all(fns);

    //
    // Iterate over the entire key path and add each key to the
    // parent key-set if it doesn't exist already.
    //
    // async.forEach(path, addKey, callback);
};


/**
 * ### @private function _setObject (key, value, callback)
 * Internal helper function for setting all keys of a nested object.
 * @param key {string} Key to set in this instance
 * @param value {Object} Value for the specified key
 * @return {Promise<*>} Continuation to respond to when complete.
 * @private
 */
Redis.prototype._setObject = async function (key, value) {
    let self = this,
        keys = Object.keys(value || {});

    async function addValue(child) {
        //
        // Add the child key to the parent key-set, then set the value.
        // Recursively call `setValueObject` in the event of nested Object(s).
        //
        await self.client.sadd(nconf.key(key, 'keys'), child);
        let fullKey = nconf.key(key, child),
            childValue = value[child];
        let result;
        if (!Array.isArray(childValue) && typeof childValue === 'object') {
            result = await self._setObject(fullKey, childValue);
        }
        else {
            childValue = JSON.stringify(childValue);
            logger.debug('redis:set', fullKey);
            result = await self.client.set(fullKey, childValue);
        }
        return result;
    }

    //
    // Iterate over the keys of the Object and set the appropriate values.
    //
    let fns = [];
    keys.forEach((child) => {
        fns.push(addValue(child));
    });
    return await Promise.all(fns);
};


class _RedisClient {
    /**
     *
     * @param redisStore {{namespace,client}}
     */
    constructor(redisStore) {
        this.namespace = redisStore.namespace;
        this.client = redisStore.client;
    }

    key(...args) {
        if (this.namespace) args.unshift(this.namespace);
        return nconf.key.apply(nconf, args);
    }

    /**
     *
     * @param args {[key]}
     * @return {Promise<void>}
     * @private
     */
    async get(...args) {
        args[0] = this.key(args[0]);
        return await this.client.get.call(this.client, args);
    }

    /**
     *
     * @param args {[key,value]}
     * @return {Promise<void>}
     * @private
     */
    async set(...args) {
        args[0] = this.key(args[0]);
        return await this.client.set.call(this.client, args);
    }

    /**
     *
     * @param args {[key]}
     * @return {Promise<void>}
     * @private
     */
    async del(...args) {
        args[0] = this.key(args[0]);
        return await this.client.del.call(this.client, args);
    }

    /**
     *
     * @param args
     * @return {Promise<void>}
     * @private
     */
    async smembers(...args) {
        args[0] = this.key(args[0]);
        return await this.client.smembers.call(this.client, args);
    }

    /**
     *
     * @param args
     * @return {Promise<void>}
     * @private
     */
    async sadd(...args) {
        args[0] = this.key(args[0]);
        return await this.client.sadd.call(this.client, args);
    }

    /**
     *
     * @param args
     * @return {Promise<void>}
     * @private
     */
    async srem(...args) {
        args[0] = this.key(args[0]);
        return await this.client.srem.call(this.client, args);
    }

    /**
     *
     * @param args {[key,score,value]}
     * @return {Promise<void>}
     * @private
     */
    async zincrby(...args) {
        args[0] = this.key(args[0]);
        return await this.client.zincrby.call(this.client, args);
    }

    /**
     *
     * @param args {[key,seconds]}
     * @return {Promise<void>}
     * @private
     */
    async expire(...args) {
        args[0] = this.key(args[0]);
        return await this.client.expire.call(this.client, args);
    }
}

/**
 * 获取redisClient,可附加namespace
 * @param option {{[namespace]}}
 * @return {_RedisClient}
 */
Redis.prototype.getClient=function (option) {
    if (!option) option = {};
    return new _RedisClient({
        namespace: option.namespace ? this.key(option.namespace) : this.namespace, //默认使用nconf的namepsace
        client: this.client
    });
};