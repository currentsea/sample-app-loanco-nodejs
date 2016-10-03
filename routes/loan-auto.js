var express = require('express');
var router = express.Router();

var _ = require('lodash');

var docusign = require('docusign-esign'),
  async = require('async'),
  fs = require('fs'),
  path = require('path');

router.get('/loan/auto', function(req, res, next) {
	res.render('loan-auto', {
		signing_location_options: app.helpers.signing_location_options,
		authentication_options: app.helpers.authentication_options
	});
});

router.post('/loan/auto', function(req, res, next) {

	var body = req.body;

	// create an envelope that will store the document(s), field(s), and recipient(s)
	var envDef = new docusign.EnvelopeDefinition();
	envDef.setEmailSubject('Auto Loan Application');
	envDef.setEmailBlurb('Please sign the Loan application to start the application process.');
	envDef.setTemplateId(app.config.templatesByKey.cosigner_on_auto_loan.id);

	// create a template role with a valid templateId and roleName and assign signer info
	var tRoleApplicant = new docusign.TemplateRole();
	// tRoleApplicant.recipientId = "1";
	tRoleApplicant.setRoleName('applicant');
	tRoleApplicant.setName(body.inputFirstName + ' ' + body.inputLastName);
	tRoleApplicant.setEmail(body.inputEmail);
    if(body.inputSigningLocation == 'embedded'){
    	tRoleApplicant.setClientUserId('1001');
    }
	if(body.inputAccessCode && body.inputAccessCode.length){
		tRoleApplicant.setAccessCode(body.inputAccessCode);
	}
	if(body.inputAuthentication == 'phone'){
		app.helpers.addPhoneAuthToRecipient(tRoleApplicant, body.inputPhone);
	}

	var tabList = {
		text: [],
		number: []
	};
	tabList.text.push(app.helpers.makeTab('Text', {
		tabLabel: 'Phone',
		value: body.inputPhone
	}));
	tabList.number.push(app.helpers.makeTab('Number', {
		tabLabel: 'Amount',
		value: body.inputLoanAmount
	}));
	tabList.number.push(app.helpers.makeTab('Number', {
		tabLabel: 'Duration',
		value: body.inputLoanLength
	}));
	

	// Set default Tab values in template
	var tabs = new docusign.TemplateTabs();
    tabs.setTextTabs(tabList.text);
    tabs.setNumberTabs(tabList.number);
    tRoleApplicant.setTabs(tabs);


	var tRoleCosigner = new docusign.TemplateRole();
	if(body.inputCosignerCheckbox){
		tRoleCosigner.setRoleName('cosigner');
		tRoleCosigner.setName(body.inputCosignerFirstName + ' ' + body.inputCosignerLastName);
		tRoleCosigner.setEmail(body.inputCosignerEmail);
	    if(body.inputSigningLocationCosigner == 'embedded'){
	    	tRoleCosigner.setClientUserId('2002');
	    }
		if(body.inputAccessCodeCosigner && body.inputAccessCodeCosigner.length){
			tRoleCosigner.setAccessCode(body.inputAccessCodeCosigner);
		}
		if(body.inputAuthenticationCosigner == 'phone'){
			app.helpers.addPhoneAuthToRecipient(tRoleCosigner, body.inputCosignerPhone);
		}

		var tabListCosigner = {
			text: []
		};
		tabListCosigner.text.push(app.helpers.makeTab('Text', {
			tabLabel: 'PhoneCosigner',
			value: body.inputCosignerPhone
		}));

		// Set default Tab values in template
		var tabsCosigner = new docusign.TemplateTabs();
	    tabsCosigner.setTextTabs(tabListCosigner.text);
	    tRoleCosigner.setTabs(tabsCosigner);

	}

	var tRoleEmployee = new docusign.TemplateRole();
	tRoleEmployee.setRoleName('employee');
	tRoleEmployee.setName(app.config.auth.EmployeeName);
	tRoleEmployee.setEmail(app.config.auth.EmployeeEmail);

	// create a list of template roles and add our newly created role
	var templateRolesList = [];
	templateRolesList.push(tRoleApplicant);
	if(body.inputCosignerCheckbox){
		templateRolesList.push(tRoleCosigner);
	}
	templateRolesList.push(tRoleEmployee);

	// assign template role(s) to the envelope
	envDef.setTemplateRoles(templateRolesList);

	// send the envelope by setting |status| to "sent". To save as a draft set to "created"
	// - note that the envelope will only be 'sent' when it reaches the DocuSign server with the 'sent' status (not in the following call)
	envDef.setStatus('sent');

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
			console.error('Error: ' + response);
			console.error(envelopeSummary);
	        res.send('Error creating envelope, please try again');
			return;
		}

		// Create and save envelope locally (temporary)
		app.helpers.createAndSaveLocal(req, envelopeSummary.envelopeId)
		.then(function(){

			req.session.remainingSigners = [];

			if(body.inputSigningLocation == 'embedded'){
				var tApplicantRecipient = {
					recipientId: _.find(app.config.templatesByKey.cosigner_on_auto_loan.json.recipients.signers,{roleName: 'applicant'}).recipientId,
					clientUserId: tRoleApplicant.clientUserId,
					name: tRoleApplicant.name,
					email: tRoleApplicant.email
				};
			}
			if(body.inputCosignerCheckbox){
				if(body.inputSigningLocationCosigner == 'embedded'){
					var tCoSignerRecipient = {
						recipientId: _.find(app.config.templatesByKey.cosigner_on_auto_loan.json.recipients.signers,{roleName: 'cosigner'}).recipientId,
						clientUserId: tRoleCosigner.clientUserId,
						name: tRoleCosigner.name,
						email: tRoleCosigner.email
					}
					req.session.remainingSigners.push(tCoSignerRecipient);
				} else {
					req.session.remainingSigners.push('remote-signer');
				}
			}

			req.session.remainingSigners.push('remote-signer'); // last signer is remote (employee) 

			if(body.inputSigningLocation == 'embedded'){
				app.helpers.getRecipientUrl(envelopeSummary.envelopeId, tApplicantRecipient, function(err, data){
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

