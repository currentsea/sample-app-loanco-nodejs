var express = require('express');
var exphbs  = require('express-handlebars');
var fs = require('fs');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var http = require('http');
var _ = require('lodash');
var moment = require('moment');

// In case of uncaught exception, print the full-stack
process.on('uncaughtException', function(err) {
  console.error((err && err.stack) ? err.stack : err);
});

var app = express();
GLOBAL.app = app;

app.config = require('./config');
app.helpers = require('./helpers');

app.locals.default_email = app.config.default_email;

// view engine setup
app.engine('hbs', exphbs({
  defaultLayout: 'main',
  extname: '.hbs',
  helpers: {
    toJSON : function(object) {
      return JSON.stringify(object);
    },
    ifCond : function(obj1, sign, obj2, options) {
      switch(sign){

        case '==':
          return obj1 == obj2 ? options.fn(this):options.inverse(this);

        case '===':
          return obj1 === obj2 ? options.fn(this):options.inverse(this);

        case '!=':
          return obj1 != obj2 ? options.fn(this):options.inverse(this);

        case '>=':
          return obj1 >= obj2 ? options.fn(this):options.inverse(this);

        case '<=':
          return obj1 <= obj2 ? options.fn(this):options.inverse(this);

        case '>':
          return obj1 > obj2 ? options.fn(this):options.inverse(this);

        case '<':
          return obj1 < obj2 ? options.fn(this):options.inverse(this);

        default:
          console.error('no sign match:', sign);
          break;
      }
    },
    moment: function(context, block){

      if (context && context.hash) {
        block = _.cloneDeep(context);
        context = undefined;
      }
      var date = moment(context);
      var hasFormat = false;

      // Reset the language back to default before doing anything else
      date.lang('en');

      for (var i in block.hash) {
        if (i === 'format') {
          hasFormat = true;
        }
        else if (date[i]) {
          date = date[i](block.hash[i]);
        } else {
          console.log('moment.js does not support "' + i + '"');
        }
      }

      if (hasFormat) {
        date = date.format(block.hash.format);
      }
      return date;
    }
  },
}));
app.set('view engine', 'hbs');
app.set('views', path.join(__dirname, 'views'));

// // uncomment after placing your favicon in /public
// app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.models = require('./models');

var session = require('express-session')
app.use(session({
  secret: 'kjh2398sh2nlsd',
  resave: false,
  saveUninitialized: false
}));


// set up a route to redirect http to https (in case dns not setup)
app.get('*',function(req,res,next){  
    if(app.config.force_https && !req.secure){
      var domain = req.host;
      return res.redirect('https://' + domain + req.url);
    }
    next();
})

app.use('/', function(req, res, next){
  // setup session id if not already set
  if(!req.session.id){
    req.session.id = require('guid').raw();
  }

  // update session settings
  req.session.config = req.session.config || {};
  var defaultsToUse = [
    'signing_location',
    'authentication',
    'access_code'
  ];
  _.each(defaultsToUse, function(key){
    req.session.config[key] = (key in req.session.config) ? req.session.config[key] : app.config[key];
  });

  next();
});

app.use('/', require('./routes/index'));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function(err, req, res, next) {
    console.error(err.stack);
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err.stack
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {}
  });
});

var privateKey = fs.readFileSync('sslcerts/server.key');
var certificate = fs.readFileSync('sslcerts/server.crt');

var credentials = {
  key: privateKey,
  cert: certificate
};

// Create the HTTP and HTTPS servers
var server = require('http').Server(app);
var httpsServer = require('https').Server(credentials, app);

app.setup = require('./setup');

// Start listening after signing in to DocuSign and retrieving our AccountID
app.config.loginToDocuSign(function(err){
  if(err){
    console.error('loginToDocuSign failure');
    return console.error(err);
  }

  // Check for template existance
  app.setup.Templates(function(err){
    if(err){
      console.log('Templates Error');
      console.error(err);
      // server.listen(port);
      return;
      // return console.error(err);
    }

    // app.setup.Brands(function(err){
    //   if(err){
    //     return console.error(err);
    //   }

      // server.listen(port);


      ////////////////////////////////////////////////
      // Start the server
      ////////////////////////////////////////////////
      server.listen(3801, function() {
        console.log('HTTP being served');
      });

      httpsServer.listen(8443, function() {
        console.log('HTTPS being served');
      });

    // });

  });
});
server.on('error', onError);

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

module.exports = app;
