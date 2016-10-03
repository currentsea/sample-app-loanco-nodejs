var express = require('express');
var router = express.Router();

var _ = require('lodash');

var GoogleMapsAPI = require('googlemaps');

var docusign = require('docusign-esign'),
  async = require('async'),
  fs = require('fs'),
  path = require('path');

router.get('/loan/sailboat', function(req, res, next) {
	res.render('loan-sailboat', {
		signing_location_options: app.helpers.signing_location_options,
		authentication_options: app.helpers.authentication_options
	});
});

router.post('/loan/sailboat', function(req, res, next) {

	var body = req.body;

	// Get Google map
	var gmAPI = new GoogleMapsAPI({
		key: app.config.google_maps_api_key,
		// stagger_time:       1000, // for elevationPath
		// encode_polylines:   false,
		// secure:             true, // use https
		// proxy:              'http://127.0.0.1:9999' // optional, set a proxy for HTTP requests
	});
	var params = {
	  center: '37.808546, -122.409767',
	  zoom: 15,
	  size: '500x400',
	  maptype: 'roadmap',
	  markers: [
	    {
	      location: '37.808546, -122.409767',
	      icon: 'http://chart.apis.google.com/chart?chst=d_map_pin_icon&chld=cafe%7C996600'
	    }
	  ],
	  style: [
	    {
	      feature: 'road',
	      element: 'all',
	      rules: {
	        hue: '0x00ff00'
	      }
	    }
	  ]
	};
	
	// Download the map 
	var gmApiImageUrl = gmAPI.staticMap(params);
	var request = require('request').defaults({ encoding: null });
	request.get(gmApiImageUrl, function (mapErr, response, imageBody) {
		if(mapErr){
			console.error('gmAPI.staticMap error');
			console.error(err);
		} else {
    		var gmapBase64Doc = new Buffer(imageBody).toString('base64');
    	}

		var file1Base64 = app.helpers.getLocalDocument('pdfs/LoanSailboat.docx');
		var file2Base64 = app.helpers.getLocalDocument('pdfs/LoanSailboatAppraiser.docx');

	    // create an envelope that will store the document(s), field(s), and recipient(s)
	    var envDef = new docusign.EnvelopeDefinition();
	    envDef.setEmailSubject('Sailboat Loan Application');
	    envDef.setEmailBlurb('Please sign the Loan application to start the application process.');

	    // add documents to the envelope
	    var doc1 = new docusign.Document();
	    doc1.setDocumentBase64(file1Base64);
	    doc1.setName('Application'); // can be different from actual file name
	    doc1.setFileExtension('docx');
	    doc1.setDocumentId('1'); // hardcode so we can easily refer to this document later

	    if(!mapErr){
		    var doc2 = new docusign.Document();
		    doc2.setDocumentBase64(gmapBase64Doc);
		    doc2.setName('Map'); // can be different from actual file name
		    doc2.setFileExtension('png');
		    doc2.setDocumentId('2'); // hardcode so we can easily refer to this document later
		}

	    var doc3 = new docusign.Document();
	    doc3.setDocumentBase64(file2Base64);
	    doc3.setName('Appraiser'); // can be different from actual file name
	    doc3.setFileExtension('docx');
	    doc3.setDocumentId('3'); // hardcode so we can easily refer to this document later

	    var docs = [];
	    docs.push(doc1);
	    if(!mapErr){
	    	docs.push(doc2);
	    }
	    docs.push(doc3);
	    envDef.setDocuments(docs);

	    envDef.setEnforceSignerVisibility('true');

	    // Recipients
	    var signer = new docusign.Signer();
	    signer.setRoutingOrder(1);
	    signer.setEmail(body.inputEmail);
	    signer.setName(body.inputFirstName + ' ' + body.inputLastName);
	    signer.setRecipientId('1');
	    signer.setExcludedDocuments(['3']);

	    if(body.inputSigningLocation == 'embedded'){
	    	signer.setClientUserId('1001');
	    }
		if(body.inputAccessCode && body.inputAccessCode.length){
			signer.setAccessCode(body.inputAccessCode);
		}
		if(body.inputAuthentication == 'phone'){
			app.helpers.addPhoneAuthToRecipient(signer, body.inputPhone);
		}

	    var appraiserSigner = new docusign.Signer();
	    appraiserSigner.setRoutingOrder(2);
	    appraiserSigner.setEmail(body.inputAppraiserEmail);
	    appraiserSigner.setName(body.inputAppraiserFirstName + ' ' + body.inputAppraiserLastName);
	    appraiserSigner.setRecipientId('2');
	    // appraiserSigner.setExcludedDocuments([]); // this is NOT the way to make all documents visible, instead we need to add a Tab to each document (if it already has a tag, otherwise un-tagged documents are always visible) 

	    if(body.inputSigningLocationAppraiser == 'embedded'){
	    	appraiserSigner.setClientUserId('2002');
	    }
		if(body.inputAccessCodeAppraiser && body.inputAccessCodeAppraiser.length){
			appraiserSigner.setAccessCode(body.inputAccessCodeAppraiser);
		}
		if(body.inputAuthenticationAppraiser == 'phone'){
			app.helpers.addPhoneAuthToRecipient(appraiserSigner, body.inputAppraiserPhone);
		}

	    // Tabs

	    // can have multiple tabs, so need to add to envelope as a single element list
	    var tabList = {
	    	text: [],
	    	email: [],
	    	fullName: [],
	    	signHere: [],
	    	initialHere: [],
	    	dateSigned: [],
	    	formula: [],
	    	attachment: [],
	    	number: []
	    }

	    // Note: using anchorStrings (in tabs below) makes documentId and pageNumber irrelevant (they affect all documents and pages)

		// Email
		tabList.email.push(app.helpers.makeTab('Email', {
			recipientId: '1',
			anchorString: 'Applicant Email',
			anchorXOffset: '0',
			anchorYOffset: '0',
			value: body.inputEmail
		}));

		// FullName
		tabList.fullName.push(app.helpers.makeTab('FullName', {
			recipientId: '1',
			anchorString: 'Applicant Full Name',
			anchorXOffset: '0',
			anchorYOffset: '0',
		}));

		// Attachment
		tabList.attachment.push(app.helpers.makeTab('SignerAttachment', {
			recipientId: '1',
			anchorString: 'Please attach',
			anchorXOffset: '0',
			anchorYOffset: '40',
			optional: 'true'
		}));


		// SignHere
		tabList.signHere.push(app.helpers.makeTab('SignHere', {
			recipientId: '1',
			anchorString: 'Applicant Signature',
			anchorXOffset: '0',
			anchorYOffset: '4',
		}));


		// InitialHere
		tabList.initialHere.push(app.helpers.makeTab('InitialHere', {
			recipientId: '1',
			anchorString: 'Applicant Initial',
			anchorXOffset: '0',
			anchorYOffset: '0',
		}));


	    var tabs = new docusign.Tabs();
	    tabs.setTextTabs(tabList.text);
	    tabs.setNumberTabs(tabList.number);
	    tabs.setFormulaTabs(tabList.formula);
	    tabs.setEmailTabs(tabList.email);
	    tabs.setFullNameTabs(tabList.fullName);
	    tabs.setSignerAttachmentTabs(tabList.attachment);
	    tabs.setSignHereTabs(tabList.signHere);
	    tabs.setInitialHereTabs(tabList.initialHere);
	    tabs.setDateSignedTabs(tabList.dateSigned);

	    signer.setTabs(tabs);


	    // can have multiple tabs, so need to add to envelope as a single element list
	    var appraiserTabList = {
	    	text: [],
	    	email: [],
	    	fullName: [],
	    	signHere: [],
	    	initialHere: [],
	    	dateSigned: [],
	    	formula: [],
	    	attachment: [],
	    	number: []
	    }
	      

		// Email
		appraiserTabList.email.push(app.helpers.makeTab('Email', {
			recipientId: '2',
			anchorString: 'Appraiser Email',
			anchorXOffset: '0',
			anchorYOffset: '0',
			value: body.inputAppraiserEmail
		}));

		// FullName
		appraiserTabList.fullName.push(app.helpers.makeTab('FullName', {
			recipientId: '2',
			anchorString: 'Appraiser Full Name',
			anchorXOffset: '0',
			anchorYOffset: '0',
		}));

		// Appraisal amount
		appraiserTabList.text.push(app.helpers.makeTab('Number', {
			recipientId: '2',
			anchorString: 'Appraiser Estimate',
			anchorXOffset: '0',
			anchorYOffset: '0',
			locked: 'false'
		}));

		// SignHere
		appraiserTabList.signHere.push(app.helpers.makeTab('SignHere', {
			recipientId: '2',
			anchorString: 'Appraiser Signature',
			anchorXOffset: '0',
			anchorYOffset: '4',
		}));

		// BLANK TEXT (on first document, to make it visible to our Appraiser) 
		appraiserTabList.text.push(app.helpers.makeTab('Text', {
			recipientId: '2',
			documentId: '1',
			pageNumber: '1',
			xPosition: '0',
			yPosition: '0',
			value: '',
			locked: 'true'
		}));


	    var appraiserTabs = new docusign.Tabs();
	    appraiserTabs.setTextTabs(appraiserTabList.text);
	    appraiserTabs.setNumberTabs(appraiserTabList.number);
	    appraiserTabs.setFormulaTabs(appraiserTabList.formula);
	    appraiserTabs.setEmailTabs(appraiserTabList.email);
	    appraiserTabs.setFullNameTabs(appraiserTabList.fullName);
	    appraiserTabs.setSignerAttachmentTabs(appraiserTabList.attachment);
	    appraiserTabs.setSignHereTabs(appraiserTabList.signHere);
	    appraiserTabs.setInitialHereTabs(appraiserTabList.initialHere);
	    appraiserTabs.setDateSignedTabs(appraiserTabList.dateSigned);

	    appraiserSigner.setTabs(appraiserTabs);      


	    // add recipients
	    envDef.setRecipients(new docusign.Recipients());
	    envDef.getRecipients().setSigners([]);
	    envDef.getRecipients().getSigners().push(signer);
	    envDef.getRecipients().getSigners().push(appraiserSigner);

	    // send the envelope by setting |status| to "sent". To save as a draft set to "created"
	    // - note that the envelope will only be 'sent' when it reaches the DocuSign server with the 'sent' status (not in the following call)
	    envDef.setStatus('sent');

	    if(app.config.brand_id && app.config.brand_id.length){
	    	envDef.setBrandId(app.config.brand_id);
	    }

	    // instantiate a new EnvelopesApi object
	    var envelopesApi = new docusign.EnvelopesApi();

	   	app.helpers.removeEmptyAndNulls(envDef);

	   	// // pretty printing (no base64 bytes) 
	   	// var mockEnv = JSON.parse(JSON.stringify(envDef));
	   	// mockEnv.documents = _.map(mockEnv.documents,function(doc){
	   	// 	if(doc.documentBase64){
	   	// 		doc.documentBase64 = '<bytes here>';
	   	// 	}
	   	// 	return doc;
	   	// });
	   	// console.log(JSON.stringify(mockEnv,null,2));

	    // call the createEnvelope() API
	    envelopesApi.createEnvelope(app.config.auth.AccountId, envDef, null, function (error, envelopeSummary, response) {
			if (error) {
				console.error('Error: ' + error);
				console.error(envelopeSummary);
				res.send('Error creating envelope, please try again');
				return;
			}

			// Create and save envelope locally (temporary)
			app.helpers.createAndSaveLocal(req, envelopeSummary.envelopeId)
			.then(function(){

				req.session.remainingSigners = [];

				if(body.inputSigningLocationAppraiser == 'embedded'){
					req.session.remainingSigners.push(appraiserSigner);
				} else {
					req.session.remainingSigners.push('remote-signer');
				}

				req.session.remainingSigners.push('remote-signer'); // last signer is remote (employee) 

				if(body.inputSigningLocation == 'embedded'){
					app.helpers.getRecipientUrl(envelopeSummary.envelopeId, signer, function(err, data){
						if(err){
				        	res.send('Error with getRecipientUrl, please try again');
							return console.error(err);
						}

						req.session.envelopeId = envelopeSummary.envelopeId;
						req.session.signingUrl = data.getUrl();

						res.redirect('/sign/embedded');


					});
				} else {
					res.redirect('/sign/remote');
				}
			});

	    });


	});

});

module.exports = router;

