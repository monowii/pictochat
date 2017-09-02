var WebSocketServer = require('websocket').server;
var finalhandler = require('finalhandler')
var http = require('http')
var serveStatic = require('serve-static')

// Serve up public/ folder
var serve = serveStatic('public/', {'index': ['index.html']});

// Create server
var server = http.createServer(function onRequest (req, res) {
  serve(req, res, finalhandler(req, res))
});
server.listen(8080, function() {
    console.log((new Date()) + ' Server is listening on port 8080');
});

wsServer = new WebSocketServer({
    httpServer: server
});

function originIsAllowed(origin) {
  //https://github.com/theturtle32/WebSocket-Node/blob/master/docs/WebSocketRequest.md#origin
  return true;
}

var max_connections = 16;
var connections = [];

wsServer.on('request', function(request) {
    if (!originIsAllowed(request.origin)) {
		request.reject();
		console.log('rejected origin ' + request.origin);
		return;
    }
    
	if (connections.length >= 16) {
		request.reject();
		console.log('server full ' + request.origin);
		return;
	}
	
    var connection = request.accept('pictochat-protocol', request.origin);
	
	connections.push(connection);
    console.log('connected ' + request.remoteAddress);
	
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
            console.log('message: ' + message.utf8Data);
			
			connections.forEach(function(destination) {
				destination.sendUTF(message.utf8Data);
			});
        }
    });
    connection.on('close', function(reasonCode, description) {
        console.log('disconnected ' + connection.remoteAddress);
		
        var index = connections.indexOf(connection);
        if (index !== -1) {
            connections.splice(index, 1);
        }
    });
});