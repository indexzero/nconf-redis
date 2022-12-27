const nconf = require('nconf');
// nconf.use('memory');

const Redis = require("ioredis");

// Create a Redis instance.
// By default, it will connect to localhost:6379.
// We are going to cover how to specify connection options soon.
const redis = new Redis();

require('../lib/nconf-redis')/*.Redis*/;
// let {host, port, pwd, db}=redisOption;
let option = {
    client: redis,
    namespace: 'ec_service',
    ttl: 60 * 1000 //程序缓存时长
};
nconf.use('redis', option);


(async () => {
    let redis = nconf.stores.redis.getClient();
    console.log('********redis********');
    console.log('set(a)==>', await redis.set('a', 'aValue'));
    console.log('get(a)=>aValue =', await redis.get('a'));
    console.log('set(b,EX,100)==>', await redis.set('b', 'bValue', 'EX', 100));
    console.log('get(b)=>bValue =', await redis.get('b'));

    let redisA = nconf.stores.redis.getClient({namespace: 'A'});
    console.log('********redisA*********');
    console.log('set(a)==>', await redisA.set('a', 'aValue'));
    console.log('get(a)=>aValue =', await redisA.get('a'));
    console.log('set(b,EX,100)==>', await redisA.set('b', 'bValue', 'EX', 100));
    console.log('get(b)=>bValue =', await redisA.get('b'));
})();


nconf.load(() => { //加载缓存
    console.log('********loaded********');
    let now = Date.now();
    console.log('nconf.setSync=>' + now + '->null',
        nconf.set('test001', now)
    );
    console.log('nconf.getSync=>' + nconf.get('test001'), '!= ' + now); //

    setTimeout(() => {
        console.log(Date.now() + ' nconf.getSync=>' + now, nconf.get('test001'));
    }, 1000);

    let value2 = 'test002-value';
    nconf.set('test002', value2, (err, result) => {
        console.log('nconf.setCallback=>null', err, result);
        nconf.get('test002', (err, result) => {
            console.log('nconf.getCallback=>' + value2, err, result);
            console.log('nconf.getSync(test002)=>' + value2, nconf.get('test002'));
        });
    });
});





