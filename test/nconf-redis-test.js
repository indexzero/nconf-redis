/*
 * redis-store-test.js: Tests for the redis nconf storage engine.
 *
 * (C) 2011, Charlie Robbins
 *
 */

var vows = require('vows'),
    assert = require('assert');

try {
  var nconf = require('nconf'),
      data = require('nconf/test/fixtures/data').data,
      merge = require('nconf/test/fixtures/data').merge;
}
catch (ex) {
  var error = [
    'Error running tests: ' + ex.message,
    '',
    'To run `nconf-redis` tests you need to`',
    'install nconf locally in this project',
    '',
    '  cd ' + path.join(__dirname, '..'),
    '  npm install nconf',
    '  vows --spec',
    '',
    'OR',
    '',
    '  cd ' + path.join(__dirname, '..'),
    '  npm test',
    ''
  ].join('\n');

  console.log(error);
  process.exit(1);
}

//
// Require `nconf-redis` to extend `nconf
// 
require('../lib/nconf-redis');

vows.describe('nconf/stores/redis').addBatch({
  "When using the nconf redis store": {
    topic: new nconf.stores.Redis(),
    "the set() method": {
      "with a literal": {
        topic: function (store) {
          store.set('foo:literal', 'bazz', this.callback)
        },
        "should respond without an error": function (err, ok) {
          assert.isNull(err);
        }
      },
      "with an Array": {
        topic: function (store) {
          store.set('foo:array', data.arr, this.callback)
        },
        "should respond without an error": function (err, ok) {
          assert.isNull(err);
        }
      },
      "with an Object": {
        topic: function (store) {
          store.set('foo:object', data.obj, this.callback)
        },
        "should respond without an error": function (err, ok) {
          assert.isNull(err);
        }
      },
      "with null": {
        topic: function (store) {
          store.set('falsy:object', null, this.callback);
        },
        "should respond without an error": function(err, ok) {
          assert.isNull(err);
        }
      }
    }
  }
}).addBatch({
  "When using the nconf redis store": {
    topic: new nconf.stores.Redis(),
    "the get() method": {
      "with a literal value": {
        topic: function (store) {
          store.get('foo:literal', this.callback);
        },
        "should respond with the correct value": function (err, value) {
          assert.equal(value, data.literal);
        }
      },
      "with an Array value": {
        topic: function (store) {
          store.get('foo:array', this.callback);
        },
        "should respond with the correct value": function (err, value) {
          assert.deepEqual(value, data.arr);
        }
      },
      "with an Object value": {
        topic: function (store) {
          store.get('foo:object', this.callback);
        },
        "should respond with the correct value": function (err, value) {
          assert.deepEqual(value, data.obj);
        }
      },
      "with a nested Object value": {
        topic: function (store) {
          store.get('foo:object:auth', this.callback);
        },
        "should respond with the correct value": function (err, value) {
          assert.deepEqual(value, data.obj.auth);
        }
      },
      "with null": {
        topic: function(store) {
          store.get('falsy:object', this.callback);
        },
        "should respond with the correct value": function(err, value) {
          assert.equal(value, null);
        }
      }
    }
  }
}).addBatch({
  "When using the nconf redis store": {
    topic: new nconf.stores.Redis(),  
    "the clear() method": {
      topic: function (store) {
        var that = this;
        store.clear('foo', function (err) {
          if (err) {
            return that.callback(err);
          }
          
          store.get('foo', that.callback);
        });
      },
      "should actually remove the value from Redis": function (err, value) {
        assert.isNull(err);
        assert.isNull(value);
      }
    }
  }
}).addBatch({
  "When using the nconf redis store": {
    topic: new nconf.stores.Redis(),  
    "the save() method": {
      topic: function (store) {
        var that = this;
        store.save(data, function (err) {
          if (err) {
            return that.callback(err);
          }
          
          store.get('obj', that.callback);
        });
      },
      "should set all values correctly": function (err, value) {
        assert.isNull(err);
        assert.deepEqual(value, data.obj);
      }
    }
  }
}).addBatch({
  "When using the nconf redis store": {
    topic: new nconf.stores.Redis(),  
    "the load() method": {
      topic: function (store) {
        store.load(this.callback);
      },
      "should respond with the correct object": function (err, value) {
        assert.isNull(err);
        assert.deepEqual(value, data);
      }
    }
  }
}).addBatch({
  "when using the nconf redis store": {
    topic: new nconf.stores.Redis(),
    "the merge() method": {
      "when overriding an existing literal value": {
        topic: function (store) {
          var that = this;
          store.set('merge:literal', 'string-value', function () {
            store.merge('merge:literal', merge, function () {
              store.get('merge:literal', that.callback);
            });
          });
        },
        "should merge correctly": function (err, data) {
          assert.deepEqual(data, merge);
        }
      },
      "when overriding an existing Array value": {
        topic: function (store) {
          var that = this;
          store.set('merge:array', [1, 2, 3, 4], function () {
            store.merge('merge:array', merge, function () {
              store.get('merge:array', that.callback);
            });
          });
        },
        "should merge correctly": function (err, data) {
          assert.deepEqual(data, merge);
        }
      },
      "when merging into an existing Object value": {
        topic: function (store) {
          var that = this, current;
          current = {
            prop1: 2, 
            prop2: 'prop2',
            prop3: {
              bazz: 'bazz'
            },
            prop4: ['foo', 'bar']
          };
          
          store.set('merge:object', current, function () {
            store.merge('merge:object', merge, function () {
              store.get('merge:object', that.callback);
            });
          });
        },
        "should merge correctly": function (err, data) {
          assert.equal(data['prop1'], 1);
          assert.equal(data['prop2'].length, 3);
          assert.deepEqual(data['prop3'], {
            foo: 'bar',
            bar: 'foo',
            bazz: 'bazz'
          });
          assert.equal(data['prop4'].length, 2);        
        }
      }
    }
  }
}).addBatch({
  "When using the nconf redis store": {
    topic: new nconf.stores.Redis(),  
    "the reset() method": {
      topic: function (store) {
        var that = this;
        this.store = store;
        
        store.reset(function (err) {
          if (err) {
            return that.callback(err);
          }
          
          store.get('obj', that.callback);
        });
      },
      "should remove all keys from redis": function (err, value) {
        assert.isNull(err);
        assert.isNull(value);
        assert.length(Object.keys(this.store.cache.store), 0);
      }
    }
  }
}).export(module);