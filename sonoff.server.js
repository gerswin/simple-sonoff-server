var ws = require("nodejs-websocket");
const fs = require('fs');

//config for wlan
config = JSON.parse(fs.readFileSync('./sonoff.config.json'));

//set initialized parameters
var state = {
    knownDevices: []
};

// device in der liste finden
state.getDeviceById = (deviceId) => {
    return state.knownDevices.find(d => d.id == deviceId);
};

state.updateKnownDevice = (device) => {
    var updated = false;

    for (var i = 0; i < state.knownDevices.length; i++) {
        if (state.knownDevices[i].id == device.id) {
            state.knownDevices[i] = device;
            updated = true;
        }
    }
    if (!updated) {
        state.knownDevices.push(device);
    }
};

state.pushMessage = a => {
    var rq = {
        "apikey": "111111111-1111-1111-1111-111111111111",
        "action": a.action,
        "deviceid": a.target,
        "params": { "switches": [{ "outlet": parseInt(a.outlet), "switch": a.value.switch }] },
        "userAgent": "app",
        "sequence": Date.now().toString(),
        "ts": 0,
        "from": "app"
    };
    console.log("value of ", a.value)
    console.log("value of ", a.outlet)

    var r = JSON.stringify(rq);
    //console.log('REQ | WS | APP | ' + r);
    var device = state.getDeviceById(a.target);
    if (!device.messages) device.messages = [];
    device.messages.push(rq);
    device.conn.sendText(r);
};

// ----------- https server ------------------------
// Import libraries
var express = require('express');
var server = express();
var bodyParser = require('body-parser')
var https = require('https');
var http = require('http');
var path = require('path');

// Register body-parser
server.use(bodyParser.json());
server.use(bodyParser.urlencoded({ extended: true }));

// Create https server & run
https.createServer({
    key: fs.readFileSync('./certs/66805011.key'),
    cert: fs.readFileSync('./certs/66805011.cert')
}, server).listen(config.server.httpsPort, function() {
    console.log('SONOFF API Server Started On Port %d', config.server.httpsPort);
});


// server.get('/', function(req, res) {
//     res.sendFile(path.join(__dirname + '/static/index.html'));
// });

server.use('/', express.static('static'))

server.get('/configDevice', function(req, res) {
    var _initDevice = () => {
        http.get('http://10.10.7.1/device', (res) => {
            if (res.statusCode !== 200) {
                console.log('Unable to connect to the target device. Code: ' + res.statusCode);
                res.resume();
                return;
            }
            res.setEncoding('utf8');
            var data = '';
            res.on('data', (c) => data += c);
            res.on('end', () => {
                var response = JSON.parse(data);
                var device = {
                    deviceid: response.deviceid,
                    apikey: response.apikey
                };

                console.log('device: ' + JSON.stringify(device));

                //send configuration to device, so that it will use that server as its cloud
                request.post('http://10.10.7.1/ap', {
                    json: true,
                    body: {
                        "version": 4,
                        "ssid": config.router.SSID,
                        "password": config.router.password,
                        "serverName": config.server.IP,
                        "port": config.server.httpsPort
                    }
                }, (err, response, body) => {
                    if (!err && response.statusCode == 200) {
                        console.log(JSON.stringify(response) + "\t" + body);
                        res.json({
                            "sucess": true
                        });
                    } else {
                        console.log('Unable to configure endpoint ' + err);
                        res.json({
                            "sucess": false
                        });
                    }
                });
            });
        }).on('error', (e) => {
            console.log(`Unable to establish connection to the device: ${e}`);
            res.json({
                "sucess": false
            });
        });
    };



});

server.post('/savecnf', function(request, respond) {
    let cnf = request.body
    let config = JSON.parse(fs.readFileSync('static/devices.json'));
    Object.keys(request.body).forEach(function(item) {
        console.log(item)

        config[item] = cnf[item]

    });
    console.log(config)
    var body = '';
    filePath = __dirname + '/static/conf.json';

    fs.writeFile('static/devices.json', JSON.stringify(config), (err) => {
        // throws an error, you could also catch it here
        if (err) throw err;

        // success case, the file was saved
        console.log('Lyric saved!');
    });
    // request.on('close', function (){
    //     console.log("emd")
    //     fs.appendFile(filePath, body, function() {
    //         respond.end();
    //     });
    // });
    console.log(request.body); // your JSON
    respond.send(request.body); // echo the result back
});

// Create https server & run
http.createServer(server).listen(config.server.httpPort, function() {
    console.log('API Server Started On Port %d', config.server.httpPort);
});

// Register routes
server.post('/dispatch/device', function(req, res) {
    console.log('REQ | %s | %s ', req.method, req.url);
    console.log('REQ | %s', JSON.stringify(req.body));
    res.json({
        "error": 0,
        "reason": "ok",
        "IP": config.server.IP,
        "port": config.server.websocketPort
    });
});

//switch the device via postman (https) <= does not work from browser!!
server.get('/devices/:deviceId/:outlet/:state', function(req, res) {
    console.log('GET | %s | %s ', req.method, req.url);
    var d = state.getDeviceById(req.params.deviceId);
    if (!d) {
        res.status(404).send('Sonoff device ' + req.params.deviceId + ' not found');
    } else {
        res.sendStatus(200);
        //state.pushMessage({ action: 'update', value: { switch: req.params.state }, target: d.id });
        state.pushMessage({ action: 'update', value: { switch: req.params.state }, outlet: req.params.outlet, target: d.id });

    }
});

//get a list of known devices via postman (https) <= does not work from browser!!
server.get('/devices/:deviceId', function(req, res) {
    console.log('GET | %s | %s ', req.method, req.url);
    var d = state.getDeviceById(req.params.deviceId);
    if (!d) {
        res.status(404).send('Sonoff device ' + req.params.deviceId + ' not found');
    } else {
        res.json({ id: d.id, state: d.state, model: d.model, kind: d.kind, version: d.version });
    }
});

//get a list of known devices via postman (https) <= does not work from browser!!
server.get('/devices', function(req, res) {
    console.log('GET | %s | %s ', req.method, req.url);
    res.json(state.knownDevices.map(x => { return { id: x.id, state: x.state, model: x.model, kind: x.kind, version: x.version } }));
});
// ----------- https server ------------------------

// setup a server, that will respond to the SONOFF requests
// this is the replacement for the SONOFF cloud!
var wsOptions = {
    secure: true,
    key: fs.readFileSync('./certs/66805011.key'),
    cert: fs.readFileSync('./certs/66805011.cert'),
};

ws.createServer(wsOptions, function(conn) {
    console.log("WS | Server is up %s:%s to %s:%s", config.server.IP, config.server.websocketPort, conn.socket.remoteAddress, conn.socket.remotePort);
    conn.on("text", function(str) {
        var data = JSON.parse(str);
        //console.log('REQ | WS | DEV | %s', JSON.stringify(data));
        res = {
            "error": 0,
            "deviceid": data.deviceid,
            "apikey": "111111111-1111-1111-1111-111111111111"
        };
        if (data.action) {
            switch (data.action) {
                case 'date':
                    res.date = new Date().toISOString();
                    break;
                case 'query':
                    //device wants information
                    var device = state.getDeviceById(data.deviceid);
                    if (!device) {
                        console.log('ERR | WS | Unknown device ', data.deviceid);
                    } else {
                        /*if(data.params.includes('timers')){
                         console.log('INFO | WS | Device %s asks for timers',device.id);
                         if(device.timers){
                          res.params = [{timers : device.timers}];
                         }
                        }*/
                        res.params = {};
                        data.params.forEach(p => {
                            res.params[p] = device[p];
                        });
                    }
                    break;
                case 'update':
                    //device wants to update its state
                    var device = state.getDeviceById(data.deviceid);
                    if (!device) {
                        console.log('ERR | WS | Unknown device ', data.deviceid);
                    } else {
                        //console.log(JSON.stringify(data))
                        //console.log(JSON.stringify(data.params.rssi))
                        //console.log(JSON.stringify(data.params.switches))
                        //device.rssi = data.params.rssi
                        //device.mac =  data.params.staMac
                        device.state =((data.params.switch != undefined) ? [{"switch":data.params.switch,"outlet":0}] : data.params.switches)
                        device.conn = conn;
                        state.updateKnownDevice(device);
                    }

                    break;
                case 'register':
                    var device = {
                        id: data.deviceid
                    };

                    //this is not valid anymore?! type is not based on the first two chars
                    var type = data.deviceid.substr(0, 2);
                    if (type == '01') device.kind = 'switch';
                    else if (type == '02') device.kind = 'light';
                    else if (type == '03') device.kind = 'sensor'; //temperature and humidity. No timers here;

                    device.version = data.romVersion;
                    device.model = data.model;
                    device.conn = conn;
                    state.updateKnownDevice(device);
                    console.log('INFO | WS | Device %s registered', device.id);
                    break;
                default:
                    console.log('TODO | Unknown action "%s"', data.action);
                    break;
            }
        } else {
            if (data.sequence && data.deviceid) {
                var device = state.getDeviceById(data.deviceid);
                if (!device) {
                    console.log('ERR | WS | Unknown device ', data.deviceid);
                } else {
                    if (device.messages) {
                        var message = device.messages.find(item => item.sequence == data.sequence);
                        if (message) {
                            device.messages = device.messages.filter(function(item) {
                                return item !== message;
                            })
                            device.state = message.params.switch;
                            state.updateKnownDevice(device);
                            console.log('INFO | WS | APP | action has been accnowlaged by the device ' + JSON.stringify(data));
                        } else {
                            console.log('ERR | WS | No message send, but received an anser', JSON.stringify(data));
                        }
                    } else {
                        console.log('ERR | WS | No message send, but received an anser', JSON.stringify(data));
                    }
                }
            } else {
                console.log('TODO | WS | Not data action frame\n' + JSON.stringify(data));
            }
        }
        var r = JSON.stringify(res);
        //console.log('RES | WS | DEV | ' + r);
        conn.sendText(r);
    });
    conn.on("close", function(code, reason) {
        console.log("Connection closed");
    });
}).listen(config.server.websocketPort, config.server.IP);