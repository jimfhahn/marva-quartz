const fs = require('fs');
const path = require('path');

const HUB_TEMPLATE_ID = 'lc:RT:bf2:Hub:Hub';
const HUB_BASIC_TEMPLATE_ID = 'lc:RT:bf2:HubBasic:Hub';
const HUB_LABEL_URI = 'http://www.w3.org/2000/01/rdf-schema#label';
const HUB_LABEL_PROPERTY_LABEL = 'Hub label';
const HUB_MARC_KEY_URI = 'http://id.loc.gov/ontologies/bflc/marcKey';
const HUB_MARC_KEY_PROPERTY_LABEL = 'MARC label';
const HUB_TEMPLATE_REF = HUB_TEMPLATE_ID;
const EXPRESSION_OF_URI = 'http://id.loc.gov/ontologies/bibframe/expressionOf';
const HUB_LOOKUP_SOURCE = 'https://id.loc.gov/resources/hubs';

const PENN_ITEM_TEMPLATE_IDS = new Set([
  'lc:RT:bf2:Monograph:Item',
  'lc:RT:bf2:PrintPhoto:Item',
  'lc:RT:bf2:RareMat:Item',
  'lc:RT:bf2:35mmFeatureFilm:Item',
  'lc:RT:bf2:MIBluRayDVD:Item',
  'lc:RT:bf2:Cartographic:Item',
  'lc:RT:bf2:Analog:Item',
  'lc:RT:bf2:Serial:Item',
  'lc:RT:bf2:SoundCDR:Item',
  'lc:RT:bf2:SoundRecording:Item',
  'lc:RT:bf2:SoundCassette:Item',
  'lc:RT:bf2:NotatedMusic:Item'
]);

const profilesPath = path.resolve(__dirname, '..', 'public', 'profiles.json');
const profilesJson = JSON.parse(fs.readFileSync(profilesPath, 'utf-8'));

const ensureArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined) {
    return [];
  }
  return [value];
};

const makeLiteralProperty = (propertyURI, propertyLabel) => ({
  mandatory: 'false',
  repeatable: 'true',
  type: 'literal',
  resourceTemplates: [],
  valueConstraint: {
    valueTemplateRefs: [],
    useValuesFrom: [],
    defaults: [],
    valueDataType: {}
  },
  propertyURI,
  propertyLabel
});

const makePhysicalLocationProperty = () => ({
  propertyLabel: 'Storing or shelving location',
  propertyURI: 'http://id.loc.gov/ontologies/bibframe/physicalLocation',
  resourceTemplates: [],
  valueConstraint: {
    valueTemplateRefs: ['lc:RT:bf2:Item:physicalLocation'],
    useValuesFrom: [],
    valueDataType: 'http://www.w3.org/2001/XMLSchema#string',
    defaults: []
  },
  mandatory: 'false',
  repeatable: 'true',
  type: 'resource',
  remark: ''
});

const makeSublocationProperty = () => ({
  propertyLabel: 'Sublocation',
  propertyURI: 'http://id.loc.gov/ontologies/bibframe/sublocation',
  resourceTemplates: [],
  valueConstraint: {
    valueTemplateRefs: ['lc:RT:bf2:Item:Location'],
    useValuesFrom: [],
    defaults: [],
    valueDataType: {}
  },
  mandatory: 'false',
  repeatable: 'true',
  type: 'resource',
  remark: ''
});

let hubLabelAdded = 0;
let hubMarcKeyAdded = 0;
let hubBasicLabelAdded = 0;
let expressionUpdated = 0;
let physicalLocationAdded = 0;
let sublocationAdded = 0;
let physicalLocationRefsUpdated = 0;
let sublocationRefsUpdated = 0;

for (const profile of profilesJson) {
  const resourceTemplates = profile?.json?.Profile?.resourceTemplates;
  if (!Array.isArray(resourceTemplates)) {
    continue;
  }

  for (const rt of resourceTemplates) {
    if (!Array.isArray(rt.propertyTemplates)) {
      continue;
    }

    // Ensure literal fields on Hub templates
    if (rt.id === HUB_TEMPLATE_ID || rt.id === HUB_BASIC_TEMPLATE_ID) {
      const hasLabel = rt.propertyTemplates.some((pt) => pt.propertyURI === HUB_LABEL_URI);
      const hasMarcKey = rt.propertyTemplates.some((pt) => pt.propertyURI === HUB_MARC_KEY_URI);

      if (!hasLabel) {
        const labelProperty = makeLiteralProperty(HUB_LABEL_URI, HUB_LABEL_PROPERTY_LABEL);
        rt.propertyTemplates.unshift(labelProperty);
        if (rt.id === HUB_TEMPLATE_ID) {
          hubLabelAdded += 1;
        } else {
          hubBasicLabelAdded += 1;
        }
      }

      if (rt.id === HUB_TEMPLATE_ID && !hasMarcKey) {
        const marcKeyProperty = makeLiteralProperty(HUB_MARC_KEY_URI, HUB_MARC_KEY_PROPERTY_LABEL);
        rt.propertyTemplates.push(marcKeyProperty);
        hubMarcKeyAdded += 1;
      }
    }

    // Ensure Penn item templates retain location helpers
    if (PENN_ITEM_TEMPLATE_IDS.has(rt.id)) {
      const physicalLocationIndex = rt.propertyTemplates.findIndex(
        (pt) => pt.propertyURI === 'http://id.loc.gov/ontologies/bibframe/physicalLocation'
      );
      if (physicalLocationIndex === -1) {
        rt.propertyTemplates.unshift(makePhysicalLocationProperty());
        physicalLocationAdded += 1;
      } else {
        const physicalPt = rt.propertyTemplates[physicalLocationIndex];
        if (!Array.isArray(physicalPt.valueConstraint?.valueTemplateRefs)) {
          physicalPt.valueConstraint = physicalPt.valueConstraint || {};
          physicalPt.valueConstraint.valueTemplateRefs = ensureArray(
            physicalPt.valueConstraint.valueTemplateRefs
          );
        }
        if (!physicalPt.valueConstraint.valueTemplateRefs.includes('lc:RT:bf2:Item:physicalLocation')) {
          physicalPt.valueConstraint.valueTemplateRefs.push('lc:RT:bf2:Item:physicalLocation');
          physicalLocationRefsUpdated += 1;
        }
      }

      const sublocationIndex = rt.propertyTemplates.findIndex(
        (pt) => pt.propertyURI === 'http://id.loc.gov/ontologies/bibframe/sublocation'
      );
      if (sublocationIndex === -1) {
        const newProperty = makeSublocationProperty();
        const targetIndex = rt.propertyTemplates.findIndex(
          (pt) => pt.propertyURI === 'http://id.loc.gov/ontologies/bibframe/physicalLocation'
        );
        if (targetIndex === -1) {
          rt.propertyTemplates.unshift(newProperty);
        } else {
          rt.propertyTemplates.splice(targetIndex + 1, 0, newProperty);
        }
        sublocationAdded += 1;
      } else {
        const sublocationPt = rt.propertyTemplates[sublocationIndex];
        if (!Array.isArray(sublocationPt.valueConstraint?.valueTemplateRefs)) {
          sublocationPt.valueConstraint = sublocationPt.valueConstraint || {};
          sublocationPt.valueConstraint.valueTemplateRefs = ensureArray(
            sublocationPt.valueConstraint.valueTemplateRefs
          );
        }
        if (!sublocationPt.valueConstraint.valueTemplateRefs.includes('lc:RT:bf2:Item:Location')) {
          sublocationPt.valueConstraint.valueTemplateRefs.push('lc:RT:bf2:Item:Location');
          sublocationRefsUpdated += 1;
        }
      }
    }

    // Attach Hub template to expressionOf value constraints
    for (const pt of rt.propertyTemplates) {
      if (pt.propertyURI !== EXPRESSION_OF_URI) {
        continue;
      }

      pt.propertyLabel = 'Expression of [search for a Hub]';

      if (!pt.valueConstraint) {
        pt.valueConstraint = {
          valueTemplateRefs: [],
          useValuesFrom: [],
          defaults: [],
          valueDataType: {}
        };
      }

      pt.valueConstraint.valueTemplateRefs = ensureArray(pt.valueConstraint.valueTemplateRefs);

      if (!pt.valueConstraint.valueTemplateRefs.includes(HUB_TEMPLATE_REF)) {
        pt.valueConstraint.valueTemplateRefs.push(HUB_TEMPLATE_REF);
        expressionUpdated += 1;
      }

      // Ensure field is editable so catalogers can add literal hubs
      pt.valueConstraint.editable = 'true';

      // Ensure lookup-based search is enabled while allowing literal fallback
      pt.type = 'lookup';
      pt.resourceTemplates = Array.isArray(pt.resourceTemplates) ? pt.resourceTemplates : [];

      pt.valueConstraint.useValuesFrom = ensureArray(pt.valueConstraint.useValuesFrom);
      if (!pt.valueConstraint.useValuesFrom.includes(HUB_LOOKUP_SOURCE)) {
        pt.valueConstraint.useValuesFrom.push(HUB_LOOKUP_SOURCE);
      }

      pt.valueConstraint.valueDataType = pt.valueConstraint.valueDataType || {};
      if (!pt.valueConstraint.valueDataType.dataTypeURI) {
        pt.valueConstraint.valueDataType.dataTypeURI = 'http://id.loc.gov/ontologies/bibframe/Hub';
      }
    }
  }
}

fs.writeFileSync(profilesPath, `${JSON.stringify(profilesJson, null, 2)}\n`);

console.log('Hub label added to Hub templates:', hubLabelAdded);
console.log('Hub MARC label added to Hub templates:', hubMarcKeyAdded);
console.log('Hub label added to HubBasic templates:', hubBasicLabelAdded);
console.log('expressionOf properties updated:', expressionUpdated);
console.log('Penn item templates physicalLocation added:', physicalLocationAdded);
console.log('Penn item templates sublocation added:', sublocationAdded);
console.log('Penn item templates physicalLocation refs updated:', physicalLocationRefsUpdated);
console.log('Penn item templates sublocation refs updated:', sublocationRefsUpdated);
