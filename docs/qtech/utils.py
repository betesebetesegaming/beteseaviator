import os
import sys
import datetime
import configparser
import urllib
import urllib.request
import urllib.parse
import urllib.error
import http.client
import socket
import time
import json
from random import choice
from string import ascii_uppercase

# Per-request timeout (seconds) so a dropped/stalled connection fails fast
# instead of blocking the whole run indefinitely. Override with CW_TIMEOUT.
REQUEST_TIMEOUT = int(os.environ.get("CW_TIMEOUT", "30"))
# Transient network errors are retried a few times before giving up.
MAX_ATTEMPTS = int(os.environ.get("CW_RETRIES", "3"))
RETRY_BACKOFF = 2  # seconds, multiplied by attempt number

def log( msg ):
	now = datetime.datetime.now()
	print (str(now) + "\t" + msg)
	return

def error( msg ):
	log( "ERROR: " + msg )
	sys.exit( 1 )
	return

def warning( msg ):
	log( "WARNING: " + msg )
	return

class Config:
	def getoption( self, config, section, option ):
		if config.has_option( section, option ) == False:
			error( "Config option '" + option + "' in section '" + section + "' not found" )
		return config.get( section, option )

	def __init__( self, filename ):
		if os.path.exists( filename ) == False:
			error( "Config file '" + filename + "' not found" )
		config = configparser.ConfigParser()
		config.read( filename )
		vars = [ "walleturl", "rollbackurl","walletsession", "passkey", 
		"playerid", "currency", "gameid", "device", "clienttype", "category", "completed", "amount", 
		"blockedplayerid", "amounttoreachinsufficientfund", "blockedwalletsession", "walletsessionExpired", 
		"rewardurl", "depositurl", "withdrawurl", "verifybalanceondeposit"]
		for var in vars:
			eval( 'setattr( self, "' + var + '", self.getoption( config, "wallet", "' + var + '" ) )' )

def 	dorequest(reqline, customheaders, payload):
	headervalue = {'Accept':'application/json','User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/89.0.4389.90 Safari/537.36'}
	headervalue.update(customheaders)

	if len(payload) > 0:
		data = json.dumps(payload)
		headervalue['Content-Type'] = 'application/json'
		req = urllib.request.Request( url=reqline, data=data.encode(), headers=headervalue)
	else:
		req = urllib.request.Request( url=reqline, headers=headervalue)
	httpHandler = urllib.request.HTTPSHandler()
	if "CW_DEBUG" in os.environ:
		httpHandler.set_http_debuglevel(1)
	opener = urllib.request.build_opener(httpHandler)
	urllib.request.install_opener(opener)

	lasterr = None
	for attempt in range(1, MAX_ATTEMPTS + 1):
		try:
			return urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT)
		except urllib.error.HTTPError as err:
			# 4xx/5xx are valid API responses the tester must inspect
			# (error-code cases) — never retry, return as the response.
			return err
		except (AttributeError, TypeError) as err:
			# Preserved from the original tester: some handlers surface these
			# as pseudo-responses rather than raising to the caller.
			print(str(err) + "=-------------------")
			return err
		except (urllib.error.URLError, http.client.HTTPException,
				ConnectionError, socket.timeout, TimeoutError, OSError) as err:
			# Transient network failure (dropped connection, reset, timeout).
			# Retry a few times before failing the run.
			lasterr = err
			if attempt < MAX_ATTEMPTS:
				warning("Transient network error on %s (attempt %d/%d): %s — retrying"
					% (reqline, attempt, MAX_ATTEMPTS, err))
				time.sleep(RETRY_BACKOFF * attempt)

	error( "Failed to connect after %d attempts to: %s (%s)" % (MAX_ATTEMPTS, reqline, lasterr) )

def randomstr():
	str = ''.join(choice(ascii_uppercase) for i in range(12))
	return str