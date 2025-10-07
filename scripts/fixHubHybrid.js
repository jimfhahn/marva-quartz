const fs = require('fs');
const path = require('path');

const profilesPath = path.resolve(__dirname, '..', 'public', 'profiles.json');
const profilesJson = JSON.parse(fs.readFileSync(profilesPath, 'utf-8'));

let fixedCount = 0;

for (const profile of profilesJson) {
  const resourceTemplates = profile?.json?.Profile?.resourceTemplates;
  if (!Array.isArray(resourceTemplates)) {
    continue;
  }

  for (const rt of resourceTemplates) {
    if (!Array.isArray(rt.propertyTemplates)) {
      continue;
    }

    for (const pt of rt.propertyTemplates) {
      if (pt.propertyURI === 'http://id.loc.gov/ontologies/bibframe/expressionOf') {
        console.log(`\nFound expressionOf in ${rt.id}:`);
        console.log('  Current type:', pt.type);
        console.log('  Current valueConstraint:', JSON.stringify(pt.valueConstraint, null, 2));
        
        // Set up Penn hybrid lookup + literal configuration
        pt.type = 'lookup';
        pt.propertyLabel = 'Expression of [search for a Hub]';
        
        // Penn customization: support both lookup AND literal entry
        pt.valueConstraint = {
          valueTemplateRefs: ['lc:RT:bf2:Hub:Hub'], // Enable literal Hub entry
          useValuesFrom: ['https://id.loc.gov/resources/hubs'], // Enable Hub lookup
          valueDataType: {
            dataTypeURI: 'http://id.loc.gov/ontologies/bibframe/Hub'
          },
          defaults: [],
          editable: 'true' // Allow literal entry in addition to lookup
        };
        
        fixedCount++;
        console.log('  Fixed to Penn hybrid lookup + literal configuration');
      }
    }
  }
}

fs.writeFileSync(profilesPath, JSON.stringify(profilesJson, null, 2) + '\n');
console.log(`\n✅ Fixed ${fixedCount} expressionOf properties to Penn hybrid configuration`);
console.log('The Hub field now supports both lookup search AND literal entry');