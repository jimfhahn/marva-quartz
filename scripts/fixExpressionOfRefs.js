const fs = require('fs');
const path = require('path');

// Read the profiles
const profilesPath = path.join(__dirname, '..', 'public', 'profiles.json');
const data = JSON.parse(fs.readFileSync(profilesPath, 'utf8'));

let updateCount = 0;

// Fix all expressionOf fields in Work templates
for (const profile of data) {
  if (profile.json && profile.json.Profile && profile.json.Profile.resourceTemplates) {
    for (const rt of profile.json.Profile.resourceTemplates) {
      const rtId = rt.id || '';
      
      // Only process Work resource templates
      if (rtId.includes(':Work')) {
        for (const prop of rt.propertyTemplates || []) {
          const propURI = prop.propertyURI || '';
          
          // Find expressionOf properties
          if (propURI === 'http://id.loc.gov/ontologies/bibframe/expressionOf') {
            const valueConstraint = prop.valueConstraint || {};
            const refs = valueConstraint.valueTemplateRefs || [];
            
            // If it has valueTemplateRefs, clear them (LC standard is empty array)
            if (refs.length > 0) {
              console.log(`Fixing ${profile.name} - ${rtId}`);
              console.log(`  Before: valueTemplateRefs = ${JSON.stringify(refs)}`);
              
              // Clear the valueTemplateRefs array
              valueConstraint.valueTemplateRefs = [];
              
              console.log(`  After: valueTemplateRefs = []`);
              updateCount++;
            }
          }
        }
      }
    }
  }
}

// Write back the updated profiles
fs.writeFileSync(profilesPath, JSON.stringify(data, null, 2), 'utf8');

console.log(`\n✅ Fixed ${updateCount} expressionOf field configurations`);
console.log('The Hub fields should no longer appear inline in Work forms.');
console.log('The expressionOf field will now only show the lookup modal.');
