node-stomp
==========

## Overview
A simple STOMP client.

## Usage
### Subscribing
**Basic**

    var sys = require("sys"),
      stomp = require("./stomp");
    
    var client = new stomp.Client("localhost", 61613);
    client.subscribe("/queue/news", function(data){
      sys.puts(data.body);
    });

**ACK**

    var sys = require("sys"),
      stomp = require("./stomp");
    
    var client = new stomp.Client("localhost", 61613);
    client.subscribe("/queue/news", {ack: "client"}, function(data){
      sys.puts(data.body);
      client.ack(data);
    });
    

### Publishing
    var stomp = require("./stomp");
    
    var client = new stomp.Client("localhost", 61613);
    client.publish("/queue/news", "Stomp for NodeJS!");
    
## TODO
* make durable
* add SSL support

## License
MIT License
    