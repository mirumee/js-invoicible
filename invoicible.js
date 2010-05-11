/*!
 * Invoicible/CentrumFaktur API 0.0.1 - JavaScript Invoicible Library
 *
 * Copyright (c) 2010 Mirek Mencel (http://mirumee.com)
 * Licensed under the GNU LESSER GENERAL PUBLIC LICENSE Version 3, 29 June 2007
 */

InvoicibleBasic = (function() {
	var 
	INVOICES_URI = "/api/1.0/invoices/",
	ESTIMATES_URI = "/api/1.0/estimates/",
	CUSTOMERS_URI = "/api/1.0/customers/",
	DEFAULT_SETTINGS = {
			method: "GET",
			protocol: "https"
		},
	appSettings = {};
	
	// -- Entry Point --
	var constructor = function(_settings) {
		if (!_settings || 
			!_settings.user ||
			!_settings.pass || 
			!_settings.domain) {
				Log.error("Username, password and domain name are mandatory.");
				return null;
			}
			

		Log.log("New invoicible object created: " + _settings);
		
		// Initialize application settings
		appSettings = InvoicibleUtils.merge(_settings, DEFAULT_SETTINGS);
		
		// Create real invoicible object along with it's all internal namespaces
		var I = {};
		I.invoices = {};
		I.estimates = {};
		I.customers = {};
		
		// -----------------------------------
		// -- Private utility functions
		
		var _call = function(settings) 
		{
			var settings = InvoicibleUtils.merge(settings, appSettings);
			
			var xhr = new XMLHttpRequest();
			var url = settings.protocol + "://" + settings.domain + settings.uri;
			var method = settings.method;
			var auth = RequestUtils.createBasicAuthRequest(settings.user, settings.pass);

			xhr.open(method, url, true);
			xhr.withCredentials = true;
			xhr.setRequestHeader('Authorization', auth);
			xhr.setRequestHeader("Content-Type","application/json");
			xhr.setRequestHeader("Accept", "application/json");
			xhr.onreadystatechange = function() {
				if (xhr.readyState == 4) // load is compleate
				{
					if (xhr.status == 200 || xhr.status == 204)
					{
						Log.debug("Success.");
						if (settings.onSuccess)
							settings.onSuccess(xhr);
					} else {
						Log.debug("Error status: " + xhr.status);
						if (settings.onFail)
							settings.onFail(xhr);
					}
					
				}
			};
			xhr.send(settings.data);
		};
		
		/**
		 * Adds some convenience methods to API collections.
		 *
		 * obj - collection parent
		 * propName - collection name
		 * uri - API URI address to fetch collections data from
		 * onDataLoad - function called each time new data is loaded
		 **/
		I._decorateAsyncCollection = function(obj, propName, uri, onDataLoad) {
			obj[propName] = {};
			var target = obj[propName];
			/**
			 * It loads all the resources and overwrites local cache
			 * array avaliable under all() getter.
			 *
			 * Parameters:
			 * offset - Index of the first requested element
			 * limit - Number of elements to fetch
			 * startDate - 'Y-m-d' ie. 2010-01-20
			 * endDate - 'Y-m-d' ie. 2010-01-30
			 *
			 * NOTE:
			 *	When you pass both offset/limit and startDate/endDate 
			 *	options, API will first filter your invoices
			 *	against date window and then limit resulted subset
			 *	to requested offset/limit.
			 **/
			target.load = function(onSuccess, onFail, filters) {
				var filters = filters || {};
				var _uri = uri + "?" +
					(filters.dateFrom ? "dateFrom=" + filters.startDate: "") + "&" +
					(filters.dateTo ? "dateTo=" + filters.endDate: "") + "&" +
					(filters.limit ? "limit=" + filters.limit: "") + "&" +
					(filters.offset ? "offset=" + filters.offset: "");
					
				_call({ uri: _uri,
					onSuccess: function(xhr) {
						target["_" + propName] = JSON.parse(xhr.responseText);
						
						Log.log(target["_" + propName].length + " " + propName + "(s) fetched.");
						
						// Add save/delete methods to each object
						target.forEach(function(item) {
							I._decorateCollectionItem(item, target);
						});
						
						onDataLoad.call(target);
						onSuccess.call(target, target["_" + propName]);
					},
					onFail: onFail
					});
				};
				
			target.all = function() {
				return target["_" + propName];
			}
			
			target.forEach = function(func, params) {
				for (var i = 0; i<target["_" + propName].length; i++)
				{
					func.call(target, target["_" + propName][i], params);
				}
			};
			
			target.new = function(data, onSuccess, onFail) {
				Log.debug("Creating new resource: " + uri);
				_call({ uri: uri,
					onSuccess: function(xhr) {
						var invoice = JSON.parse(xhr.responseText);
						I._decorateCollectionItem(invoice, target);
						Log.log("New resource createlod: " + invoice.resource_uri);
						target["_" + propName].push(invoice);
						onSuccess.call(invoice, invoice);
					},
					onFail: onFail,
					method: "POST",
					data: JSON.stringify(data)
				});
			};
		}
		
		I._decorateCollectionItem = function(obj, collection) {
			obj.save = function(onSuccess, onFail) {
				Log.debug("Trying to save resource: " + obj.resource_uri);
				_call({ uri: obj.resource_uri,
					onSuccess: function(xhr) {
						Log.log("Resource saved successfully: " + obj.resource_uri);
						onSuccess.call(obj);
					},
					onFail: onFail,
					method: "PUT",
					data: JSON.stringify(obj)
				});
			};
			
			obj.del = function(onSuccess, onFail) {
				Log.debug("Trying to delete resource: " + obj.resource_uri);
				_call({ uri: obj.resource_uri,
					onSuccess: function(xhr) {
						Log.log("Resource deleted successfully: " + obj.resource_uri);
						obj._disposeFromCollection();
						onSuccess.call(obj);
					},
					onFail: onFail,
					method: "DELETE",
					data: JSON.stringify(obj)
				});
			};
			
			// Helper removing object from local array.
			// To delete it from your remote account use del()
			obj._disposeFromCollection = function() {
				var cache = collection.all();
				for (var i = 0; i<cache.length && cache[i] != obj; i++);
				if (i < cache.length) cache.splice(i, 1);
			};
		}
		
		
		// -----------------------------------
		// -- Invoices namespace
		I._decorateAsyncCollection(I, "invoices", INVOICES_URI, function() {
			// On Before Success Event
			this.forEach(function(obj) {
				// Decorate comments collection
				I._decorateAsyncCollection(obj, "comments", obj.comments_uri);
			});
		});
		
		// -----------------------------------
		// -- Estimates namespace
		I._decorateAsyncCollection(I, "estimates", ESTIMATES_URI, function() {
			// On Before Success Event
			this.forEach(function(obj) {
				I._decorateAsyncCollection(obj, "comments", obj.comments_uri);
			});
		});

		// -----------------------------------
		// -- Clients namespace
		I._decorateAsyncCollection(I, "customers", CUSTOMERS_URI, function() {
			// On Before Success Event
			this.forEach(function(obj) {
				obj.save = function(onSuccess, onFail) {
					Log.debug("Trying to save resource: " + obj.resource_uri);
					_call({ uri: obj.resource_uri,
						onSuccess: function(xhr) {
							Log.log("Resource saved successfully: " + obj.resource_uri);
							onSuccess.call(obj);
						},
						onFail: onFail,
						method: "PUT",
						data: JSON.stringify(obj)
					});
				};
			});
		});

		
		return I;
	};
	return constructor;
})();


// ----------------------
// -- Helpers

InvoicibleUtils = {};
InvoicibleUtils.merge = function(target, defaults) {
	if (!target) target = {};
	for(var key in defaults)
	{
		target[key] = target[key] || defaults[key];
	}
	return target;
}

RequestUtils = {};
RequestUtils.createBasicAuthRequest = function(user, pass) {
	var tok = user + ':' + pass;	
	var hash = Base64.encode(tok);
	return "Basic " + hash;
}

StringUtils = {};
StringUtils.trimL = function (str) {
	for (var i=0; str.charAt(i) == ' '; i++);
	return str.substring(i, str.length);
}

StringUtils.trimR = function (str) {
	for (var i=0; str.charAt(i) != ' ' && i < str.length; i++);
	return str.substring(0, i);
}
 
StringUtils.trim = function (str) {
	return StringUtils.trimR(StringUtils.trimL(str));
}

StringUtils.isEmpty = function (str) {
	if (str == null || str == undefined) return false;
	var _str;
	_str = StringUtils.trim(str);
	if (_str == null || _str == "") {
		return true
	}
	return false
}


// -- Dumb-simple logging
Log = {};
Log.mode = "";
Log.debug = function(msg)
{
	if (Log.mode == "debug")
		console.log("DEBUG: " + msg);
};
Log.log = function(msg)
{
	console.log("INFO: " + msg);
};
Log.error = function(msg)
{
	console.error("ERROR: " + msg);
}
