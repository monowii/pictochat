var sqlite3 = require("sqlite3");
var db;

function create_database() {
    db = new sqlite3.Database("messages.sqlite3");
}

function create_table() {
    db.run("CREATE TABLE IF NOT EXISTS messages (username VARCHAR(16), date DATE, image TEXT, room CHAR)");
}

function insert(username, date, image, room) {
	db.run("INSERT INTO messages(username, date, image, room) VALUES(?, ?, ?, ?)", username, date, image, room);
}

function get_messages(callback) {
	db.all("SELECT * FROM messages ORDER BY date DESC", (err, all) => {
		if (err)
			throw err;
		
		callback(all);
	});
}

function init() {
	create_database();
	create_table();
}

function save(username, image, room) {
	var date = new Date().toISOString().slice(0, 19).replace('T', ' ');
	insert(username, date, image, room);
}

function close() {
	db.close();
}

module.exports = {
	init: init,
	save: save,
	get_messages: get_messages,
	close: close
};