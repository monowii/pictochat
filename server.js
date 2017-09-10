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

var RoomsNames = {A:1, B:2, C:3, D:4};

var max_connections = 16;
var clients = [];

function is_room_full(room) {
	var i = 0;
	clients.forEach(function(destination) {
		if (destination.room == room)
			i++;
	});
	
	if (i < 16)
		return false;
	else
		return true;
}

wsServer.on('request', function(request) {
    if (!originIsAllowed(request.origin)) {
		request.reject();
		console.log('rejected origin ' + request.origin);
		return;
    }
	
    var connection = request.accept('pictochat-protocol', request.origin);
	
    console.log('connected ' + request.remoteAddress);
	
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
			
			var data = JSON.parse(message.utf8Data);
			
			switch (data.event) {
				case "check_username":
					//TODO, check if username is already tooken
					var rooms_info = {'A': 0, 'B': 0, 'C': 0, 'D': 0};
					
					clients.forEach(function(destination) {
						if (destination.room == 'A') rooms_info.A++;
						if (destination.room == 'B') rooms_info.B++;
						if (destination.room == 'C') rooms_info.C++;
						if (destination.room == 'D') rooms_info.D++;
					});
					
					var check_username = {"event": "check username success", "rooms_info": rooms_info};
					connection.send(JSON.stringify(check_username));
					
					break;
				case "join":
					if (data.username === undefined || data.username.length === 0 || !data.username.trim()) {
						connection.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA, "empty username");
						console.log("dropped client (bad username) " + connection.remoteAddress);
						return;
					}
					
					if (data.room === undefined || ['A', 'B', 'C', 'D'].indexOf(data.room) == -1) {
						connection.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA, "incorrect room");
						console.log("dropped client (bad room) " + connection.remoteAddress);
						return;
					}
					
					if (is_room_full(data.room)) {
						connection.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA, "room full");
						console.log("dropped client (room full) " + connection.remoteAddress);
						return;
					}
				
					connection.username = data.username;
					connection.room = data.room;
					clients.push(connection);
					
					console.log("+ room "+connection.room+": " + connection.username);
					
					var usernames_in_room = [];
					clients.forEach(function(destination) {
						if (destination != connection)
							if (destination.room == connection.room)
								usernames_in_room.push(destination.username);
					});
					var data_success = {"event": "room_connection success", "clients": usernames_in_room};
					connection.send(JSON.stringify(data_success));
					
					var client_join = {"event": "client_join", "username": data.username};
					
					clients.forEach(function(destination) {
						if (destination.room == connection.room)
							destination.sendUTF(JSON.stringify(client_join));
					});
					break;
				case "message":
					if (clients.indexOf(connection) == -1) {
						connection.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA, "invalid event");
						console.log("dropped client (no auth) " + connection.remoteAddress);
						return;
					}
					
					console.log("message room "+connection.room+" from " + connection.username);
					
					var client_message = {"event": "client_message", "username": connection.username, "image": data.image};
					
					clients.forEach(function(destination) {
						if (destination != connection)
							if (destination.room == connection.room)
								destination.sendUTF(JSON.stringify(client_message));
					});
					break;
				default:
					connection.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA, "invalid event");
					break;
			}
        }
    });
    connection.on('close', function(reasonCode, description) {
        console.log("- room "+connection.room+": " + connection.username);
		
        var index = clients.indexOf(connection);
        if (index !== -1) {
            clients.splice(index, 1);
        }
		
		var data = {"event": "client_leave", username: connection.username};
		
		clients.forEach(function(destination) {
			if (destination != connection)
				if (destination.room == connection.room)
					destination.sendUTF(JSON.stringify(data));
		});
    });
});