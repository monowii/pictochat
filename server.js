var WebSocketServer = require('websocket').server;
var WebSocketConnection = require('websocket').connection;

var mustache = require("mustache");
var express = require("express");
var app = express();
var server = require('http').createServer(app);
server.listen(8080);

var db = require("./database.js");

app.use(express.static("public"));

app.get("/history", function (req, res) {
	db.get_messages(function(all) {
		var messages = {"messages": all};
		
		res.send(mustache.render("<ul>{{#messages}}<li>{{username}} [{{room}}] / {{date}}<img src=\"{{image}}\"></li>{{/messages}}</ul>", messages));
	});
});



wsServer = new WebSocketServer({
    httpServer: server
});

db.init();

function originIsAllowed(origin) {
  //https://github.com/theturtle32/WebSocket-Node/blob/master/docs/WebSocketRequest.md#origin
  return true;
}

var RoomsNames = {A:1, B:2, C:3, D:4};

var max_connections_per_room = 16;
var clients = [];

function send_error(connection, event, message) {
	var error = {"event": event, "message": message};
	connection.send(JSON.stringify(error));
}

function broadcast_room(room, data_json, exclude_client) {
	clients.forEach(function(destination) {
		if (exclude_client != undefined && destination == exclude_client)
			return;
		if (destination.room == room)
			destination.sendUTF(JSON.stringify(data_json));
	});
}

function get_rooms_info() {
	var rooms_info = {'A': 0, 'B': 0, 'C': 0, 'D': 0};
	
	clients.forEach(function(destination) {
		if (destination.room == 'A') rooms_info.A++;
		if (destination.room == 'B') rooms_info.B++;
		if (destination.room == 'C') rooms_info.C++;
		if (destination.room == 'D') rooms_info.D++;
	});
	
	return rooms_info;
}

function is_username_tooken(username) {
	for (var i in clients)
		if (clients[i].username == username)
			return true;
	return false;
}

function is_room_full(room) {
	var i = 0;
	clients.forEach(function(destination) {
		if (destination.room == room)
			i++;
	});
	
	if (i < max_connections_per_room)
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
	
	var room_info_timeout = setInterval(function update() {
		if (!connection.connected) {
			clearInterval(this);
			return;
		}
		
		var rooms = get_rooms_info();
		var rooms_info = {"event": "rooms_info", "rooms": rooms};
		
		connection.send(JSON.stringify(rooms_info));
		
		return update;
	}(), 1000);
	
    connection.on('message', function(message) {
        if (message.type === 'utf8') {
			
			var data = JSON.parse(message.utf8Data);
			
			switch (data.event) {
				case "join":
					if (data.username === undefined || data.username.length === 0 || !data.username.trim()) {
						//connection.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA, "empty username");
						send_error(connection, "room_connection_error", "empty username")
						console.log("dropped client (bad username) " + connection.remoteAddress);
						return;
					}
					
					if (data.room === undefined || ['A', 'B', 'C', 'D'].indexOf(data.room) == -1) {
						//connection.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA, "incorrect room");
						send_error(connection, "room_connection_error", "incorrect room");
						console.log("dropped client (bad room) " + connection.remoteAddress);
						return;
					}
					
					if (is_room_full(data.room)) {
						//connection.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA, "room full");
						send_error(connection, "room_connection_error", "room full");
						console.log("dropped client (room full) " + connection.remoteAddress);
						return;
					}
					
					if (is_username_tooken(data.username)) {
						//connection.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA, "username already tooken");
						send_error(connection, "room_connection_error", "username already tooken");
						console.log("dropped client (username already tooken) " + connection.remoteAddress);
						return;
					}
					
					clearTimeout(room_info_timeout);
					
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
					var data_success = {"event": "room_connection_success", "clients": usernames_in_room};
					connection.send(JSON.stringify(data_success));
					
					var client_join = {"event": "client_join", "username": data.username};
					
					broadcast_room(connection.room, client_join);
					break;
				case "message":
					if (clients.indexOf(connection) == -1) {
						connection.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA, "invalid event");
						console.log("dropped client (no auth) " + connection.remoteAddress);
						return;
					}
					
					db.save(connection.username, data.image, connection.room);
					
					console.log("message room "+connection.room+" from " + connection.username);
					
					var client_message = {"event": "client_message", "username": connection.username, "image": data.image};
					
					broadcast_room(connection.room, client_message, connection);
					break;
				default:
					connection.drop(WebSocketConnection.CLOSE_REASON_INVALID_DATA, "invalid event");
					break;
			}
        }
    });
    connection.on('close', function(reasonCode, description) {
        var index = clients.indexOf(connection);
		
        if (index == -1)
			return;
		
		console.log("- room "+connection.room+": " + connection.username);
		clients.splice(index, 1);
		
		var data = {"event": "client_leave", username: connection.username};
		
		broadcast_room(connection.room, data, connection);
    });
});

process.on("SIGTERM", function() {
    db.close();
});