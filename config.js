
var docusign = require('docusign-esign');
var _ = require('lodash');
var fs = require('fs');
var path = require('path');

var config = {};

// Load .env if exists
try {
  if(fs.statSync(path.join(__dirname,'.env')).isFile()){
    require('dotenv').config();
  }
}catch(err){
  console.info('Not including .env');
}

var docusignEnv = process.env.DOCUSIGN_ENVIRONMENT;
var docusignBaseUrl = 'https://' + docusignEnv + '.docusign.net/restapi';

config.auth = {
	Username: process.env.DOCUSIGN_USERNAME,
	Password: process.env.DOCUSIGN_PASSWORD,
	IntegratorKey: process.env.DOCUSIGN_IK,
	EmployeeEmail: process.env.EMPLOYEE_EMAIL,
	EmployeeName: process.env.EMPLOYEE_NAME,
	LocalReturnUrl: process.env.LOCAL_RETURN_URL
};

config.brand_id = process.env.BRAND_ID;
config.google_maps_api_key = process.env.GOOGLE_MAPS_API_KEY;
config.default_email = process.env.DEFAULT_EMAIL;
config.force_https = process.env.FORCE_HTTPS == 'true' ? true:false; // change to false!

app.locals.googletag = process.env.GOOGLE_ANALYTICS;

config.templates = [
	{
		key: 'cosigner_on_auto_loan',
		name: 'Auto Loan with Cosigner',
		json: require('./pdfs/template-auto-loan.json') // import the name of the template, see if one exists already
	}	
];
config.templatesByKey = {};
_.each(config.templates, function(template){
	config.templatesByKey[template.key] = template; // app.config.templatesByKey.cosigner_on_auto_loan = {...}
});

config.ApiClient = null; // will be created in a moment

config.loginToDocuSign = function(next){

	// initialize the api client
	var apiClient = new docusign.ApiClient();
	apiClient.setBasePath(docusignBaseUrl);

	// create JSON formatted auth header
	var creds = JSON.stringify({
	  Username: config.auth.Username,
	  Password: config.auth.Password,
	  IntegratorKey: config.auth.IntegratorKey
	});
	apiClient.addDefaultHeader('X-DocuSign-Authentication', creds);

	// assign api client to the Configuration object
	docusign.Configuration.default.setDefaultApiClient(apiClient);

	// login call available off the AuthenticationApi
	var authApi = new docusign.AuthenticationApi();

	// login has some optional parameters we can set
	var loginOps = new authApi.LoginOptions();
	loginOps.setApiPassword('true'); // include a replacement API password we could use in subsequent authentication requests
	loginOps.setIncludeAccountIdGuid('true'); // gives us our long guid back, in case we used the shorter integer account ID
	authApi.login(loginOps, function (err, loginInfo, response) {
		if (err) {
			console.error(err.response ? err.response.error : err);
			next(err);
			return;
		}
		if (loginInfo) {
			// list of user account(s)
			// note that a given user may be a member of multiple accounts
			var loginAccounts = loginInfo.getLoginAccounts();

			// console.log('LoginInformation: ');
			// console.log(JSON.stringify(loginAccounts,null,2));

			var found = _.find(loginAccounts,{accountId: config.auth.AccountId});
			if(!found){
				found = _.find(loginAccounts,{accountIdGuid: config.auth.AccountId});
			}
			if(!found && config.auth.AccountId){
				// specified an AccountId and we could not find it
				return next('Specified an AccountId that we could not find');
			} else {
				// Just choose the default one
				found = _.find(loginAccounts,{isDefault: "true"});
				if(!found){
					return next('No Default Account found');
				}
			}

			config.auth.AccountId = found.accountId; // not the GUID

			var UserBaseUrl = found.baseUrl.substr(0,found.baseUrl.indexOf('/restapi') + '/restapi'.length); // remove everything after "/restapi"

			console.log('UserBaseUrl:', UserBaseUrl);
			config.auth.BaseUrl = UserBaseUrl;

			// Update the baseURL for subsequence calls
			// - update the apiClient that will be used elsewhere
			apiClient.setBasePath(UserBaseUrl);
			docusign.Configuration.default.setDefaultApiClient(apiClient);

			next(null);

		} else {
			console.error(response.body);
			next('No loginInfo');
		}
	});

}

module.exports = config;
