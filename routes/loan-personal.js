var express = require('express');
var router = express.Router();

var _ = require('lodash');

var docusign = require('docusign-esign'),
  async = require('async'),
  fs = require('fs'),
  path = require('path');

router.get('/loan/personal', function(req, res, next) {
	res.render('loan-personal', {
		signing_location_options: app.helpers.signing_location_options,
		authentication_options: app.helpers.authentication_options
	});
});

router.post('/loan/personal', function(req, res, next) {
	// console.log('BODY:', typeof req.body, req.body.inputEmail, req.body);

	var body = req.body;

    // create an envelope that will store the document(s), field(s), and recipient(s)
    var envDef = new docusign.EnvelopeDefinition();
    envDef.setEmailSubject('Personal Loan Application');
    envDef.setEmailBlurb('Please sign the Loan application to start the application process.');

    // add a document to the envelope
    var doc = new docusign.Document();
	var file1Base64 = app.helpers.getLocalDocument('pdfs/LoanPersonal.docx');
    // var base64Doc = new Buffer(file1Base64).toString('base64');
    doc.setDocumentBase64(file1Base64);
    doc.setName('Document'); // can be different from actual file name
    doc.setFileExtension('docx');
    doc.setDocumentId('1'); // hardcode so we can easily refer to this document later

    var docs = [];
    docs.push(doc);
    envDef.setDocuments(docs);


    // Recipient
    var signer = new docusign.Signer();
    signer.setEmail(body.inputEmail);
    signer.setName(body.inputFirstName + ' ' + body.inputLastName);
    signer.setRecipientId('1');
    if(body.inputSigningLocation == 'embedded'){
    	signer.setClientUserId('1001');
    }
	if(body.inputAuthentication == 'phone'){
		app.helpers.addPhoneAuthToRecipient(signer, body.inputPhone);
	}
	if(body.inputAccessCode && body.inputAccessCode.length){
		signer.setAccessCode(body.inputAccessCode);
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
    	number: []
    }

    // Note: using anchorStrings (in tabs below) makes documentId and pageNumber irrelevant (they affect all documents and pages)

	// FullName
	tabList.fullName.push(app.helpers.makeTab('FullName', {
		recipientId: '1',
		anchorString: 'Name',
		anchorXOffset: '58',
		anchorYOffset: '-2',
		locked: 'false'
	}));

	// Email
	tabList.email.push(app.helpers.makeTab('Email', {
		recipientId: '1',
		name: 'Email',
		tabLabel: 'Email',
		anchorString: 'Email',
		anchorXOffset: '55',
		anchorYOffset: '-2',
		value: body.inputEmail
	}));

	// Phone
	tabList.text.push(app.helpers.makeTab('Text', {
		recipientId: '1',
		name: 'Phone',
		tabLabel: 'Phone',
		anchorString: 'Phone',
		anchorXOffset: '65',
		anchorYOffset: '-2',
		value: body.inputPhone,
		locked: 'false',
	}));

	// Address Line 1
	tabList.text.push(app.helpers.makeTab('Text', {
		recipientId: '1',
		name: 'AddressLine1',
		tabLabel: 'AddressLine1',
		anchorString: 'Address',
		anchorXOffset: '80',
		anchorYOffset: '-2',
		value: body.inputAddress1,
		locked: 'false',
	}));

	// Address Line 2
	tabList.text.push(app.helpers.makeTab('Text', {
		recipientId: '1',
		name: 'AddressLine2',
		tabLabel: 'AddressLine2',
		anchorString: 'Address',
		anchorXOffset: '80',
		anchorYOffset: '20',
		value: body.inputAddress2,
		required: 'false',
		locked: 'false',
	}));

	// Address city/state/zip
	tabList.text.push(app.helpers.makeTab('Text', {
		recipientId: '1',
		name: 'AddressCityStateZip',
		tabLabel: 'AddressCityStateZip',
		anchorString: 'Address',
		anchorXOffset: '80',
		anchorYOffset: '40',
		value: body.inputCity + ', ' + body.inputState + ' ' + body.inputZip,
		locked: 'false',
	}));

	// Amount
	tabList.number.push(app.helpers.makeTab('Number', {
		recipientId: '1',
		name: 'Amount',
		tabLabel: 'Amount',
		anchorString: 'Amount',
		anchorXOffset: '75',
		anchorYOffset: '-2',
		locked: 'false',
		value: body.inputLoanAmount
	}));
	
	// Payment payback period (months) 
	tabList.number.push(app.helpers.makeTab('Number', {
		recipientId: '1',
		name: 'PaymentDuration',
		tabLabel: 'PaymentDuration',
		anchorString: 'Payment Duration',
		anchorXOffset: '150',
		anchorYOffset: '-2',
		locked: 'false',
		value: body.inputLoanLength
	}));
	
	// Monthly payments (calculated field)
	tabList.formula.push(app.helpers.makeTab('FormulaTab', {
		recipientId: '1',
		name: 'MonthlyPayment',
		tabLabel: 'MonthlyPayment',
		anchorString: 'Monthly Payment',
		anchorXOffset: '180',
		anchorYOffset: '-2',
		formula: '[Amount]/[PaymentDuration]'
	}));


	// SignHere
	tabList.signHere.push(app.helpers.makeTab('SignHere', {
		recipientId: '1',
		anchorString: 'DocuSign API rocks',
		anchorXOffset: '10',
		anchorYOffset: '60',
	}));


    var tabs = new docusign.Tabs();
    tabs.setTextTabs(tabList.text);
    tabs.setNumberTabs(tabList.number);
    tabs.setFormulaTabs(tabList.formula);
    tabs.setEmailTabs(tabList.email);
    tabs.setFullNameTabs(tabList.fullName);
    tabs.setSignHereTabs(tabList.signHere);
    tabs.setInitialHereTabs(tabList.initialHere);
    tabs.setDateSignedTabs(tabList.dateSigned);

    signer.setTabs(tabs);

    // add recipients (in this case a single signer) to the envelope
    envDef.setRecipients(new docusign.Recipients());
    envDef.getRecipients().setSigners([]);
    envDef.getRecipients().getSigners().push(signer);

    // send the envelope by setting |status| to "sent". To save as a draft set to "created"
    // - note that the envelope will only be 'sent' when it reaches the DocuSign server with the 'sent' status (not in the following call)
    envDef.setStatus('sent');

    // instantiate a new EnvelopesApi object
    var envelopesApi = new docusign.EnvelopesApi();

   	app.helpers.removeEmptyAndNulls(envDef);

    // call the createEnvelope() API
    envelopesApi.createEnvelope(app.config.auth.AccountId, envDef, null, function (error, envelopeSummary, response) {
		if (error) {
			console.error('Error: ' + response);
			console.error(envelopeSummary);
	        res.send('Error creating envelope, please try again');
	        return;
		}

		// Create and save envelope locally (temporary)
		app.helpers.createAndSaveLocal(req, envelopeSummary.envelopeId)
		.then(function(){

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

module.exports = router;

