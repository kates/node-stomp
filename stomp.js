var sys = require("sys");
var tcp = require("net");

function Connection(host, port, login, password){
  sys.puts("host " + host + " port " + port);
  host = host || "127.0.0.1";
  port = port || 61613;
  this.login = login || "";
  this.password = password || "";
  
  this.commands = [];
  this.subscriptions = [];
  this.buffer = [];
  
  this.regex = /^(CONNECTED|MESSAGE|RECEIPT|ERROR)\n([\s\S]*?)\n\n([\s\S]*?)\0\n$/;
  
  var self = this;
  
  var conn = tcp.createConnection(port, host);
  conn.setEncoding("ascii");
  conn.setTimeout(0);
  conn.setNoDelay(true);
    
  conn.addListener("connect", function(){
    this.write("CONNECT\nlogin:" + self.login + "\npassword:" + self.password + "\n\n\x00");
  });
  
  conn.addListener("end", function(){
    if(this.readyState && this.readyState == "open"){
      conn.close();
    }
  });
    
  conn.addListener("close", function(had_error){
    this.close();
  });
  
  conn.addListener("drain", function(){
    
  });
  
  conn.addListener("data", function(data){
    var frames = data.split("\0\n");
    var frame = null;
    while(frame = frames.shift()){
      self.processMessage(frame + "\0\n");
      //self.buffer.push(frame + "\0\n");
    }
  });
  
  this.conn = conn;
  this.processCommands();
  this.processMessages();
}

Connection.prototype.transmit = function(msg, callback){
	if (this.conn.write(msg)) {
		if (typeof callback == 'function') callback(msg);
	} else {
		if (typeof callback == 'function') {
			this.conn.on('drain', function() {
				callback(msg);
			});
		}
	}
};

Connection.prototype.prepareMessage = function(msg){
  var body = (msg.data || "");
  var headers = [];
  headers["content-length"] = body.length;
  for(h in msg.headers){
    headers.push(h + ":" + msg.headers[h]);
  }
  return msg.command + "\n" + headers.join("\n") + "\n\n" + body + "\n\x00";
};

Connection.prototype.processCommands = function(){
  if(this.conn.readyState == "open"){
    var m = null;
    while(m = this.commands.shift()){
      this.transmit(this.prepareMessage(m), m.callback);
    }
  }
  
  if(this.conn.readyState == "closed"){
    return;
  }
  
  var self = this;
  setTimeout(function(){self.processCommands()}, 100);
};

Connection.prototype.parseHeader = function(s){
  var lines = s.split("\n");
  var headers = {};
  for(var i=0; i<lines.length; i++){
    var header = lines[i].split(":");
    var headerName = header.shift().trim();
    headers[headerName] = header.join(':').trim();
  }
  return headers;
};

Connection.prototype.parse = function(data){
  var fragment = data.match(this.regex);
  if(fragment){
    var headers = this.parseHeader(fragment[2]);
    var body = fragment[3];
    return {command: fragment[1], headers: headers, body: body, original: data};
  } else {
    return {command: "", headers: [], body: "", original: data};
  }
}

Connection.prototype.processMessages = function(){
  var msg = null;
  while(msg = this.buffer.shift()){
    this.processMessage(msg);
  }
  var self = this;
  setTimeout((function(){self.processMessages()}), 100);
};

Connection.prototype.processMessage = function(data){
  var message = this.parse(data);
  switch(message.command){
  case "MESSAGE":
    var callable = this.subscriptions[message.headers["destination"]];
    if(callable){ callable.call(this, message); }
    break;
  case "CONNECTED":
    break;
  case "RECEIPT":
    break;
  case "ERROR":
    var callable = this.subscriptions[message.headers["destination"]];
    if(callable){ callable.call(this, message); }
    break;
  }
};

Connection.prototype.publish = function(destination, data, headers, callback){
  headers && (headers["destination"] = destination) || (headers = {"destination": destination});
  this.commands.push({command: "SEND", headers: headers, data: data, callback: callback});
};

Connection.prototype.subscribe = function(destination, headers, callback){
  headers && (headers["destination"] = destination) || (headers = {"destination": destination});
  this.commands.push({command: "SUBSCRIBE", headers: headers});
  this.subscriptions[destination] = callback;
}

Connection.prototype.ack = function(msg){
  headers = {"message-id": msg.headers["message-id"]};
  msg.headers["transaction"] && (headers["transaction"] = msg.headers["transaction"]);
  //this.commands.push(this.prepareMessage({command: "ACK", headers: headers}));
  this.transmit(this.prepareMessage({command: "ACK", headers: headers}));
};

Connection.prototype.unsubscribe = function(destination){
  this.commands.push({command: "UNSUBSCRIBE", headers: {"destination": destination}});
  this.subscriptions[destination] = null;
};

Connection.prototype.begin = function(transaction_id){
  this.commands.push({command: "BEGIN", headers: {"transaction": transaction_id}});
};

Connection.prototype.commit = function(transaction_id){
  this.commands.push({command: "COMMIT", headers: {"transaction": transaction_id}});
};

Connection.prototype.abort = function(transaction_id){
  this.commands.push({command: "ABORT", headers: {"transaction": transaction_id}});
};

Connection.prototype.disconnect = function(){
  this.commands.push({command: "DISCONNECT", headers: {}});
};

Connection.prototype.close = function(){
  this.conn.close();
};


// Client
// really just a thin wrapper for the Connection object.
// defaults: localhost, 61613
function Client(host, port, login, password){
  this.conn = new Connection(host, port, login, password);
};

Client.prototype.publish = function(destination, data, headers, callback){
  this.conn.publish(destination, data, headers, callback);
};

Client.prototype.subscribe = function(destination, headers, callback){
  if(typeof headers == "function"){
    new_headers = {};
    callback = headers;
    headers = {};
  }
  
  this.conn.subscribe(destination, headers, callback);
};

Client.prototype.ack = function(msg){
  this.conn.ack(msg);
};

Client.prototype.unsubscribe = function(destination){
  this.conn.unsubscribe(destination);
};

Client.prototype.begin = function(transaction_id){
  this.conn.begin(transaction_id);
};

Client.prototype.commit = function(transaction_id){
  this.conn.commit(transaction_id);
};

Client.prototype.abort = function(transaction_id){
  this.conn.abort(transaction_id);
};

Client.prototype.disconnect = function(){
  this.conn.disconnect();
};

Client.prototype.close = function(){
  this.conn.close();
};

exports.Client = Client;
