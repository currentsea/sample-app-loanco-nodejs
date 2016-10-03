var express = require('express');
var router = express.Router();
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var marked = require('marked');

router.get('/', function(req, res, next) {
	console.log(app.config);
	res.render('index', { title: 'LoanCo' });
});

// Include all of our routes
app.use('/', require('./loan-personal'));
app.use('/', require('./loan-auto'));
app.use('/', require('./loan-sailboat'));
app.use('/', require('./sign'));
app.use('/', require('./envelopes'));
app.use('/', require('./webhooks'));

// Static/Markdown pages
var pages = [
	'about-us',
];
pages.forEach(function(page){
	router.get('/' + page, function(req, res, next){
	  	var file = fs.readFileSync(path.join(__dirname, '../views/markdown/'+page+'.md'), 'utf8');
		var htmlContent = marked(file.toString());
		res.render('static',{
			content: htmlContent
		});
	});
});

router.get('/restart-session', function(req, res, next) {
	req.session.destroy();
	res.redirect('/');
});

module.exports = router;

