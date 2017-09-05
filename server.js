var WebSocketServer = require('websocket').server;
var WebSocketConnection = require('websocket').connection;
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
var clients = [];

wsServer.on('request', function(request) {
    if (!originIsAllowed(request.origin)) {
		request.reject();
		console.log('rejected origin ' + request.origin);
		return;
    }
    
	if (clients.length >= 16) {
		request.reject();
		console.log('server full ' + request.origin);
		return;
	}
	
    var connection = request.accept('pictochat-protocol', request.origin);
	
	
    console.log('connected ' + request.remoteAddress);
	
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
			
			var data = JSON.parse(message.utf8Data);
			
			switch (data.event) {
				case "join":
					if (data.username.length === 0 || !data.username.trim()) {
						connection.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA, "empty username");
						console.log("dropped client (bad username) " + connection.remoteAddress);
						return;
					}
				
					connection.username = data.username;
					clients.push(connection);
					
					console.log("auth new client: " + connection.username);
					
					var data_success = {"event": "auth success"};
					connection.send(JSON.stringify(data_success));
					
					clients.forEach(function(destination) {
						destination.sendUTF(message.utf8Data);
					});
					break;
				case "message":
					if (clients.indexOf(connection) == -1) {
						connection.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA, "invalid event");
						console.log("dropped client (no auth) " + connection.remoteAddress);
						return;
					}
					
					console.log("message from " + connection.username);
					
					clients.forEach(function(destination) {
						if (destination != connection)
							destination.sendUTF(message.utf8Data);
					});
					break;
				default:
					connection.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA, "invalid event");
					break;
			}
        }
    });
    connection.on('close', function(reasonCode, description) {
        console.log('disconnected ' + connection.remoteAddress);
		
        var index = clients.indexOf(connection);
        if (index !== -1) {
            clients.splice(index, 1);
        }
		
		var data = {"event": "leave", username: connection.username};
		
		clients.forEach(function(destination) {
			if (destination != connection)
				destination.sendUTF(JSON.stringify(data));
		});
    });
});