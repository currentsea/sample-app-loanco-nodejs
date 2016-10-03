var docusign = require('docusign-esign');
var Q = require('q');
var _ = require('lodash');

var setup = {};

setup.Templates = function(next){
  // Ensure template exists (with an exact name)
  // - create if not exists, using local json
  // - template json pre-compiled to handle/avoid docusign bug (SignHere gets moved 21 points, InitialHere 16 points)


  // login call available off the AuthenticationApi
  var templatesApi = new docusign.TemplatesApi();
  templatesApi.listTemplates(app.config.auth.AccountId, function (error, templateList, response) {

    var promises = [];

    // iterate over config.templates
    _.each(app.config.templates, function(templateObj){

      var templateDef = Q.defer();
      promises.push(templateDef.promise);

      var template = _.find(templateList.envelopeTemplates, {name: templateObj.name});

      if(template){
        app.config.templatesByKey[templateObj.key].id = template.templateId;
        // console.log(app.config);
        console.log('--Template Exists--');
        templateDef.resolve();
      } else {
        console.log('--Template Creating--');
        setup.InsertTemplate(templateObj)
        .then(templateDef.resolve);
      }

    });

    Q.all(promises)
    .then(function(){
      console.log('--All template saving done--');
      next(null); //, template.templateId);
    });

  });
}

setup.InsertTemplate = function(templateObj){

    var def = Q.defer();

    var templateJson = templateObj.json;

    delete templateJson.templateId; // use a unique template ID
    templateJson.name = templateObj.name;
    templateJson.envelopeTemplateDefinition = {}; // required, but fine to be empty

    // load json into constructor
    var templateDef = new docusign.EnvelopeTemplateDefinition();
    try {
      templateDef.constructFromObject(templateJson);

      var template = new docusign.EnvelopeTemplate();
      template.constructFromObject(templateJson);
      template.setEnvelopeTemplateDefinition(templateDef);
    }catch(err){
      console.error('--Templates cannot be creating using NodeJS SDK (yet, bug to-be-fixed)! --');
      console.error(err.stack);
      def.resolve();
      return def.promise;
    }

    app.helpers.removeEmptyAndNulls(template);

    var templatesApi = new docusign.TemplatesApi();
    templatesApi.createTemplate(app.config.auth.AccountId, template, function (err, templateList, response) {
      if(err){
        def.reject();
        return console.error(err.response.error);
      }

      console.log('Saved template!');
      def.resolve();

    });

    return def.promise;

}


module.exports = setup;
