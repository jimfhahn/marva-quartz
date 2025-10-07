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
        
        // Reset to pure lookup configuration like upstream
        pt.type = 'lookup';
        pt.propertyLabel = 'Expression of [search for a Hub]';
        
        // Clear out resource-type configurations that might interfere
        delete pt.resourceTemplates;
        
        // Set up clean lookup constraint
        pt.valueConstraint = {
          useValuesFrom: ['https://id.loc.gov/resources/hubs'],
          valueDataType: {
            dataTypeURI: 'http://id.loc.gov/ontologies/bibframe/Hub'
          },
          defaults: []
        };
        
        // Remove fields that might cause issues
        delete pt.valueConstraint.valueTemplateRefs;
        delete pt.valueConstraint.editable;
        
        fixedCount++;
        console.log('  Fixed to pure lookup configuration');
      }
    }
  }
}

fs.writeFileSync(profilesPath, JSON.stringify(profilesJson, null, 2) + '\n');
console.log(`\n✅ Fixed ${fixedCount} expressionOf properties to pure lookup configuration`);
console.log('The Hub search modal should now open when clicking the field');