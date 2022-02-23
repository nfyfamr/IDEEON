"use strict";

// wherever execute this program, current working directory is set
// to main directory of program
process.chdir(__dirname);

// add endsWith method in String class
String.prototype.endsWith = function(cmp) {
	if( this.length < cmp.length ) return false;
	return (this.substr(this.length-cmp.length, cmp.length) == cmp) ? true : false;
}
String.prototype.startsWith = function(cmp) {
	if( this.length < cmp.length ) return false;
	return (this.substr(0, cmp.length) == cmp) ? true : false;
}

var http 		= require('http'),
	fs 			= require('fs'),
	router 		= require('router'),
	compiler 	= require('compiler'),
	logger	 	= require('logger'),
	ideeon 		= require('ideeon'),
	fsm			= require('filesystem-manager'),
	path 		= require('path'),
	util		= require('util'),
	url			= require('url');


// load config file
var CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, '/config.json')).toString());

// set default root of modules
router.setWebRoot(CONFIG.__WEB_ROOT);
fsm.setFileSystemRoot(path.join(__dirname, CONFIG.__FS_ROOT));
logger.setLogPath(path.join(__dirname, CONFIG.__LOG_PATH));


///////////////////////////////////////////////////////////////////////////
// Adding Route 
///////////////////////////////////////////////////////////////////////////


router.add('/', function(req, res) {
	res.writeHead(200, {'Content-Type': 'text/html'});
	
	// if sesseion is logged in,
	// url '/' is mapped 'developtool.html'
	// or 'index.html'
	if( req.session.login ) {
		// attach filesystem instance to session
		req.session.fsInstance = fsm.getInstance(req.session.email);
		fs.createReadStream(CONFIG.__WEB_ROOT + '/developtool.html').pipe(res);
	} else {
		fs.createReadStream(CONFIG.__WEB_ROOT + '/index.html').pipe(res);
	}
});

// redirect to url '/'
router.add('/index.html', function(req, res) {
	res.writeHead(301, {'Location': '/'});
	res.end();
});

// session.login 
//    0: not login
//    1: login as memeber
//    2: login as nonmember
router.add('/login', function(req, res) {
	req.on('endData', function(data) {
		data = JSON.parse(data);

		// for keeping from seding packet before setting cookie
		// should process synchronously 
		new Promise(function(resolve, reject) {
			// if nonmember
			if( data['email'] == 'nonmemeber' ) {
				// set login level to 2
				req.session.login = 2;
				req.session.email = req.ip;
				req.session.userName = "Anonymous User";

				// check whether fsm instance of ip is already existing
				// if not be, create new fsm instance
				fsm.getInstance(req.session.email) || fsm.createUser(req.session.email);

				resolve();
			} else {
				// search user from DB 
				ideeon.login(data, function(err) {
					if( err ) {
						logger.log(err.stack);
						res.end('false');
						return false;
					}
					req.session.login = 1;
					req.session.email = data['email'];
					req.session.userName = req.session.email;

					resolve();
				});
			}
		}).then(function() {
			res.setHeader('Set-Cookie', ['USERNAME='+req.session.userName]);
			res.writeHead(200, {'Content-Type': 'text/plain'});
			res.end('true');
		});

		return true;
	});
}, 'POST');

router.add('/logout', function(req, res) {
	res.writeHead(200, {'Content-Type': 'text/plain'});
	
	var msg;
	if( req.session.login ) {
		msg = "you R logged out. GoodBye";
	} else {
		msg = "you already are logged out. Or didnt logged in";
	}

	// without destroying session just delete login flag
	req.session.login = false;
	res.end(msg);
});

router.add('/signup', function(req, res) {
	req.on('endData', function(data) {
		data = JSON.parse(data);
		res.writeHead(200, {'Content-Type': 'text/plain'});

		// querying DB to create new record
		ideeon.signup(data, function(err) {
			if( err ) { 
				logger.log(err.stack);
				res.end('false');
				return false;
			}
			// if creating new record is success
			// create users's filesystem space
			fsm.createUser(data.email);
			res.end('true');
			return true;
		});
	});
}, 'POST');

// /file/document receives 'data' object
// data = { solution(solution_name), type(solution_typ), folder(folder_path), fileName(file_name), source(source_data) }
// get: load document
router.add('/file/document', function(req, res) {
	res.writeHead(200, {'Content-Type': 'text/plain'});
	
	var query = req.query;
	if( !query['solution'] || !query['folder'] || !query['fileName'] ) {
		res.end('false');
		return false;
	}

	// for client side handling
	// send back data: solution, folder, fileName, type
	var data = req.session.fsInstance.readFile(path.join(query['solution'], query['folder'], query['fileName']));
	res.write(query['solution'] + '?');
	res.write(query['folder'] + '?');
	res.write(query['fileName'] + '?');
	res.write(req.session.fsInstance.getSolutionType(query['solution']) + '?');
	res.end(data);
}, 'GET');

// post: create new document
router.add('/file/document', function(req, res) {
	res.writeHead(200, {'Content-Type': 'text/plain'});

	req.on('endData', function(data) {
		data = JSON.parse(data);

		if( !data['solution'] || !data['folder'] || !data['fileName'] ) {
			res.end('false');
			return false;
		}
		if( !req.session.fsInstance.getWritable() ) {
			res.end('false');
			return false;
		}

		var check;
		// request creating new empty file to fsm instance
		check = req.session.fsInstance.writeFile(path.join(data['solution'], data['folder'], data['fileName']), '');
		res.end(String(check));
	});

}, 'POST');

// put: update document
router.add('/file/document', function(req, res) {
	req.on('endData', function(data) {
		data = JSON.parse(data);

		if( !data['solution'] || !data['folder'] || !data['fileName'] || !data['source'] ) {
			res.end('false');
			return false;
		}
		if( !req.session.fsInstance.getWritable() ) {
			res.end('false');
			return false;
		}

		var check;
		// request writing file to fsm instance
		check = req.session.fsInstance.writeFile(path.join(data['solution'], data['folder'], data['fileName']), data['source']);
		res.end(String(check));
	});
}, 'PUT');

// /file/solution receives 'data' object
// data = { solution(solution_name), type(solution_typ) }
// post: create new solution
router.add('/file/solution', function(req, res) {
	res.writeHead(200, {'Content-Type': 'text/html'});
	
	req.on('endData', function(data) {
		data = JSON.parse(data);

		if( !data['solution'] || !data['type'] ) {
			res.end('false');
			return false;
		}

		// request to create new solution to fsm instance
		var rtn = req.session.fsInstance.createSolution(data['solution'], data['type'].toLowerCase());
		res.end(String(rtn));
	});
}, 'POST');


// '/compile' receives 'data' object
// data = { solution(solution_name), folder(folder_path), fileName(file_name), type(target_OS) }
// put: compile solution
router.add('/compile', function(req, res) {
	res.writeHead(200, {'Content-Type': 'text/plain'});

	req.on('endData', function(data) {
		data = JSON.parse(data);

		if( !data['solution'] || !data['folder'] || !data['fileName'] ) {
			res.end('false');
			return false;
		}

		var srcType;
		// objectName = ('fileName.ext' -> 'fileName')
		data['objectName'] = data['fileName'].substring(0, data['fileName'].lastIndexOf('.'));
		data['type'] = (data['type'].trim() == 'Unix' ? 'unix' : 'win') + "_" + (srcType = req.session.fsInstance.getSolutionType(data['solution']).trim());
		compiler.setDirectoryRoot(path.join(req.session.fsInstance.getRootPath()));
		// compile(solutionName, type(c or java), sourcePath, objectName, compilerOption, callback)
		compiler.compile(data['solution'], data['type'], path.join(data['folder'], data['fileName']), data['objectName'], null, function(err, stderr) {
			if( err ) {
				logger.log(err.stack);
				res.end(stderr);
				return false;
			}

			var object = data['objectName'];
			if( data['type'].startsWith('win') ) {
				object += (srcType == 'java' ? '.class' : '.exe');
			}

			// add routing 
			// For temporary downloaing and executing, url of binary is provided temporarily
			// /run/solution/.bin/fileName: get executing log
			// /solution/.bin/fileName: get binary file
			router.add(path.join('/', data['solution'], '.bin', object), function(req, res) {
				res.writeHead(200, {'Content-Type': 'application/octet-streame'});
				try{
					fs.createReadStream(path.join(req.session.fsInstance.getRootPath(), data['solution'], '.bin', object)).pipe(res);
				} catch(err) {
					logger.log(err.stack);
					end('false');
				}
			}, 'GET');

			router.add(path.join('/run', data['solution'], object), function(req, res) {
				res.writeHead(200, {'Content-Type': 'text/plain'});

				var comm = "";
				if( srcType == 'java' ) {
					comm += "java" + " ";
					comm += "-cp " + path.join(req.session.fsInstance.getRootPath(), data['solution'], '.bin') + " ";
					comm += data['objectName'];
				} else {
					if( data['type'].startsWith('win') ) {
						comm += "wine" + " ";
						comm += path.join(req.session.fsInstance.getRootPath(), data['solution'], '.bin', data['objectName']) + ".exe";
					} else {
						comm += path.join(req.session.fsInstance.getRootPath(), data['solution'], '.bin', data['objectName']);
					}
				}
				console.log(comm);
				compiler.exec(comm, function(error, stdout, stderr) {
					if( error ) {
						console.log(error);
						logger.log(error.stack);
						res.end('false');
					}
					res.end(stdout);
				});
			}, 'GET');
			
			res.end("true");
		});
	});
}, 'PUT');


// return filesystem tree object
router.add('/solutionexplorer', function(req, res) {
	res.writeHead(200, {'Content-Type': 'application/json'});

	res.write(JSON.stringify(req.session.fsInstance.fsTree));
	res.end();
}, 'GET');



router.add('/favicon.ico', function(req, res) {
	res.writeHead(200, {'Content-Type': 'image/png'});
	fs.createReadStream(CONFIG.__WEB_ROOT + '/res/favicon.ico').pipe(res);
});

// unimplemented
router.add('/run/run', function(req, res) {
	res.writeHead(200, {'Content-Type': 'application/octet-stream'});
}, 'GET');

router.add(['/setting/preference', '/run/runconfiguration'], function(req, res) {
	res.writeHead(200, {'Content-Type': 'text/html'});
	res.end('response from server: OK, for ' + req.url);
});
// until here




router.printRtt();



///////////////////////////////////////////////////////////////////////////
// Running The Server
///////////////////////////////////////////////////////////////////////////

var server = http.createServer(function(req, res) {
	try {
		router.routing(req, res);
	} catch( e ) {
		logger.log(e.stack);
	}
}).listen(CONFIG.PORT || 8000);

router.routing.port = CONFIG.PORT;
console.log("start on 54.65.248.44:" + (CONFIG.PORT || 8000));
console.log("========================================================================================");
