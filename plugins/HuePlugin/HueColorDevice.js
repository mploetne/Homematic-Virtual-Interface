"use strict";
var hueconf = require("node-hue-api");
const EventEmitter = require('events');
const util = require('util');

var HomematicDevice;

var HueColorDevice = function(plugin, hueApi ,light,serialprefix) {


		var that = this;
		this.api =  hueApi;
		this.log = plugin.log;
		this.bridge = plugin.server.getBridge();
		this.plugin = plugin;
		HomematicDevice = plugin.server.homematicDevice;
		
		this.lightId = light["id"];
		this.isGroup = (light["uniqueid"] == undefined);
		this.transitiontime = 4; // Default Hue
		this.onTime = 0;
		this.lastLevel = 0;
		this.bri = 0;
		
		this.config = plugin.server.configuration;
		this.reportFaults = false;

		if (this.config!=undefined) {
			this.log.debug("Config is valid");	
			this.reportFaults = this.config.getValueForPluginWithDefault(this.plugin.name,"reportFaults",false);
		}

		this.log.debug("Setup new HUE Bridged Device %s",serialprefix + this.lightId );
		
		this.reload();
		 
		var serial = light["uniqueid"];

		this.hmDevice = new HomematicDevice(this.plugin.name);

	// try to load persistant object
		if (serial != undefined) {
			this.log.debug("Serial %s",serial);
			var data = this.bridge.deviceDataWithSerial(serial);
			if (data!=undefined) {
				this.hmDevice.initWithStoredData(data);
			}
		} 
		
		if (this.hmDevice.initialized == false) {
	// not found create a new one
			this.log.debug("no stored Object");
			this.hmDevice.initWithType("HM-LC-RGBW-WM", serialprefix  + this.lightId);
			this.hmDevice.firmware = light["swversion"];
			var uniqueid = light["uniqueid"];
	
			if (uniqueid!=undefined) {
				this.hmDevice.serialNumber = uniqueid
			}
			this.bridge.addDevice(this.hmDevice,true);
		} else {
			this.bridge.addDevice(this.hmDevice,false);
		}
		
		this.hmDevice.on('device_channel_install_test', function(parameter){
			that.alert();
			var channel = that.hmDevice.getChannel(parameter.channel);
			channel.endUpdating("INSTALL_TEST");
		});
		
		
		this.hmDevice.on('device_channel_value_change', function(parameter){
			
			var newValue = parameter.newValue;
			
			var channel = that.hmDevice.getChannel(parameter.channel);

			if (parameter.name == "PROGRAM") {
				switch(newValue) {
					case 0:
						that.effect("none");
					break;
					case 1:
					case 2:
					case 3:
						that.effect("colorloop");
					break;
					case 4:
						that.alert();
					break;
    			}
				channel.endUpdating("PROGRAM");
	      	}

	      if (parameter.name == "LEVEL") {
	       that.setLevel(newValue);
		   if ((that.onTime > 0) && (newValue>0)) {
		    setTimeout(function() {that.setLevel(0);}, that.onTime * 1000);
	       }
	       // reset the transition and on time 
	       that.transitiontime = 4;
	       that.onTime = 0;
	       if (newValue > 0) {
		       that.lastLevel = newValue;
	       }
	     }


		 if (parameter.name == "OLD_LEVEL") {
	       if (newValue==true) {
		      if (that.lastLevel == 0) {
			      that.lastLevel = 1;
		      }
		      that.setLevel(that.lastLevel); 
	       
	       }
	       
	     }

	    if ((parameter.name == "RAMP_TIME") && (channel.index == "1")) {
		  that.transitiontime = newValue*10;
		}

	    if ((parameter.name == "ON_TIME") && (channel.index == "1")) {
		  that.onTime = newValue;
		}


	    if (parameter.name == "COLOR") {
		  that.setColor(newValue);
	     }


	    if (parameter.name == "SATURATION") {
		  that.setSaturation(newValue);
	     }




	    });
		/*
	     this.updateTimer = setTimeout(function() {
		 	that.refreshDevice();
		 }, 1000);
*/

		EventEmitter.call(this);
	}
	
	util.inherits(HueColorDevice, EventEmitter);
	
	
	HueColorDevice.prototype.reload = function() {
		if (this.config!=undefined) {
			this.log.debug("Reload Lamp Configuration ...");
			this.refresh = (this.config.getValueForPluginWithDefault(this.plugin.name,"refresh",60))*1000;
			this.log.debug("Refresh Rate is %s ms",this.refresh);
		}
	}
	
	HueColorDevice.prototype.alert = function() {
		if (this.isGroup == true) {
		     this.api.setGroupLightState(this.lightId,{"alert":"lselect"}, function(err, result) {});
		} else {
			this.api.setLightState(this.lightId,{"alert":"lselect"}, function(err, result) {});
		}
	}


	HueColorDevice.prototype.effect = function(effectname) {
		if (this.isGroup == true) {
		     this.api.setGroupLightState(this.lightId,{"effect":effectname}, function(err, result) {});
		} else {
			this.api.setLightState(this.lightId,{"effect":effectname}, function(err, result) {});
		}
	}


	HueColorDevice.prototype.setColor = function(newColor) {
		var that = this;
		var newState = {};

		this.emit('direct_light_event', this);

	    var co_channel = that.hmDevice.getChannelWithTypeAndIndex("RGBW_COLOR","2");

	    if (newColor == 200) {
	      // SpeZiale
	        var white = co_channel.getParamsetValueWithDefault("MASTER","WHITE_HUE_VALUE",39609);
	        var sat = co_channel.getParamsetValueWithDefault("MASTER","DEFAULT_SATURATION",128);
   	        newState = {"hue":white,"sat":sat,"bri":this.bri};
	    } else {
	        newState = {"hue":(newColor/199)*65535,"sat":255,"bri":this.bri};
	    }

		this.log.debug("Hue Value set to " + JSON.stringify(newState) );

		if (co_channel != undefined) {
	        co_channel.startUpdating("COLOR");
		}



		if (that.isGroup == true) {

	    that.api.setGroupLightState(that.lightId,newState, function(err, result) {
	      if (co_channel != undefined) {
	        co_channel.endUpdating("COLOR");
	      }
	    });
			
		} else {
	    that.api.setLightState(that.lightId,newState, function(err, result) {
	      if (co_channel != undefined) {
	        co_channel.endUpdating("COLOR");
	      }
	    });
		}
	}


	HueColorDevice.prototype.setSaturation = function(newSaturation) {
		var that = this;
		var newState = {"sat":newSaturation};
		this.emit('direct_light_event', this);

		this.log.debug("Sat Value set to " + JSON.stringify(newState) );
	    var co_channel = that.hmDevice.getChannelWithTypeAndIndex("RGBW_COLOR","2");

		if (co_channel != undefined) {
	        co_channel.startUpdating("SATURATION");
		}



		if (that.isGroup == true) {

	    that.api.setGroupLightState(that.lightId,newState, function(err, result) {
	      if (co_channel != undefined) {
	        co_channel.endUpdating("SATURATION");
	      }
	    });
			
		} else {
	    that.api.setLightState(that.lightId,newState, function(err, result) {
	      if (co_channel != undefined) {
	        co_channel.endUpdating("SATURATION");
	      }
	    });
		}
	}


	HueColorDevice.prototype.setLevel = function(newLevel) {
	    var that = this;
		this.emit('direct_light_event', this);
	    var di_channel = that.hmDevice.getChannelWithTypeAndIndex("DIMMER","1");
		di_channel.startUpdating("LEVEL");
		di_channel.updateValue("LEVEL",newLevel);
		var newState = {"transitiontime":that.transitiontime};
		that.log.debug("New Level Hue: %s",newLevel);
	      if (newLevel > 0) {
	        newState["on"] = true;
	        newState["bri"] = (newLevel/1)*255;

	      } else {
	        newState["on"] = false;
	        newState["bri"] = 0;
	    }
		this.bri = newState["bri"];
		if (that.isGroup == true) {

	    that.api.setGroupLightState(that.lightId,newState, function(err, result) {
	     if (di_channel != undefined) {
	        di_channel.endUpdating("LEVEL");
	      }
	    });

		} else {

		that.api.setLightState(that.lightId,newState, function(err, result) {
	      if (di_channel != undefined) {
	        di_channel.endUpdating("LEVEL");
	      }
	    });
	    }
	}
	
	
	HueColorDevice.prototype.setLightData = function(lightData) {
		var that = this;

		that.api.setLightState(that.lightId,lightData, function(err, result) {
			// HM SEND
	    });
	}

	HueColorDevice.prototype.refreshDevice = function(device) {
	  var that = this;
	  that.log.debug("Refreshing Devices");
	  
	  if (that.isGroup == true) {
	  
	  this.api.getGroup(this.lightId, function(err, result) {
		that.log.debug(JSON.stringify(result));
	    var state = result["lastAction"]["on"];
	    var bri = result["lastAction"]["bri"];
	    var hue = result["lastAction"]["hue"];
	    var sat = result["lastAction"]["sat"];
		that.bri = bri;

	    var di_channel = that.hmDevice.getChannelWithTypeAndIndex("DIMMER","1");
	    var co_channel = that.hmDevice.getChannelWithTypeAndIndex("RGBW_COLOR","2");
		var white = co_channel.getParamsetValueWithDefault("MASTER","WHITE_HUE_VALUE",39609);
		var wsat = co_channel.getParamsetValueWithDefault("MASTER","DEFAULT_SATURATION",128);


	    if ((di_channel!=undefined) && (co_channel!=undefined)) {

	    if (state==true) {
	        di_channel.updateValue("LEVEL",(bri/254),true);
	        
	        
	        if ((hue == white) && (sat==wsat)) {
		        co_channel.updateValue("COLOR",200,true);
	        } else {
		        co_channel.updateValue("COLOR",Math.round((hue/65535)*199),true);
	        }
	    	} else {
	        di_channel.updateValue("LEVEL",0,true);
	    	}
	    }

	  });

	}
	  else {
	

	  this.api.lightStatus(this.lightId, function(err, result) {
	    var state = result["state"]["on"];
	    var bri = result["state"]["bri"];
	    var hue = result["state"]["hue"];
		var sat = result["state"]["sat"];
		that.bri = bri;

		if (that.reportFaults == true) {
			var reachable = result["state"]["reachable"];
			var ch_maintenance = that.hmDevice.getChannelWithTypeAndIndex("MAINTENANCE",0);
			var postToCCU = (ch_maintenance.getValue("UNREACH")==reachable);
			ch_maintenance.updateValue("UNREACH", !reachable,true);
			if (reachable == false) {
				ch_maintenance.updateValue("STICKY_UNREACH", true ,true);
			}
		}
	    
	    var di_channel = that.hmDevice.getChannelWithTypeAndIndex("DIMMER","1");
	    var co_channel = that.hmDevice.getChannelWithTypeAndIndex("RGBW_COLOR","2");
		var white = co_channel.getParamsetValueWithDefault("MASTER","WHITE_HUE_VALUE",39609);
	    if ((di_channel!=undefined) && (co_channel!=undefined)) {

	    if (state==true) {
	        di_channel.updateValue("LEVEL",(bri/254),true);
	        
	        if (hue==white) {
		        co_channel.updateValue("COLOR",200,true);
	        } else {
		        co_channel.updateValue("COLOR",Math.round((hue/65535)*199),true);
	        }
	        
	    	} else {
	        di_channel.updateValue("LEVEL",0,true);
	    	}
	    }

	  });
	}

	 this.updateTimer = setTimeout(function() {
		 	that.refreshDevice();
		 }, that.refresh);
	}

	HueColorDevice.prototype.refreshWithData = function (data) {
		var that = this;
		
		this.log.debug("Start Lamp update");

		var state = data["state"]["on"];
	    var bri = data["state"]["bri"];
	    var hue = data["state"]["hue"];
		var sat = data["state"]["sat"];
		that.bri = bri;

		if (this.reportFaults == true) {
			var reachable = data["state"]["reachable"];
			var ch_maintenance = this.hmDevice.getChannelWithTypeAndIndex("MAINTENANCE",0);
			var postToCCU = (ch_maintenance.getValue("UNREACH")==reachable);
			ch_maintenance.updateValue("UNREACH", !reachable,true);
			if (reachable == false) {
				ch_maintenance.updateValue("STICKY_UNREACH", true ,true);
			}
		}
	    
	    var di_channel = this.hmDevice.getChannelWithTypeAndIndex("DIMMER","1");
	    var co_channel = this.hmDevice.getChannelWithTypeAndIndex("RGBW_COLOR","2");
		var white = co_channel.getParamsetValueWithDefault("MASTER","WHITE_HUE_VALUE",39609);
	    if ((di_channel!=undefined) && (co_channel!=undefined)) {

	    if (state==true) {
		    this.log.debug("State is ON Level %s",(bri/254));
	        di_channel.updateValue("LEVEL",(bri/254),true);
	        
	        if (hue==white) {
		        co_channel.updateValue("COLOR",200,true);
	        } else {
		        this.log.debug("Update hue %s",Math.round((hue/65535)*199));
		        co_channel.updateValue("COLOR",Math.round((hue/65535)*199),true);
	        }
	        
	    	} else {
		        this.log.debug("State is off set Level to zero");
				di_channel.updateValue("LEVEL",0,true);
	    	}
	    }
       this.log.debug("Lamp update end");
	}


	module.exports = {
	  HueColorDevice : HueColorDevice
	}
