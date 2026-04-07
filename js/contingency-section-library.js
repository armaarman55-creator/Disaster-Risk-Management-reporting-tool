function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function text(content) {
  return { type: 'text', content };
}

function list(items) {
  return { type: 'list', content: items };
}

function table(headers) {
  return { type: 'table', content: { headers, rows: [] } };
}

// ---------------------------------------------------------------------------
// HVC HAZARD MAPPING
// Maps each plan type to the hazard_name values (as stored in hvc_hazard_scores)
// that are relevant to that plan. fetchHvcBlocksForPlanType() uses this to filter
// the HVC query so only plan-relevant hazard scores are injected, not the full
// municipal risk register.
// ---------------------------------------------------------------------------
const HVC_HAZARD_MAP = {
  // hazard_specific
  flood:                  ['flood', 'flash flood', 'riverine flood', 'coastal flood', 'stormwater flooding'],
  wildfire:               ['veld fire', 'wildfire', 'forest fire', 'informal settlement fire', 'fire'],
  severe_weather:         ['severe thunderstorm', 'severe weather', 'lightning', 'hail', 'high winds', 'tornado'],
  storm:                  ['storm', 'coastal storm', 'tropical cyclone', 'storm surge', 'wind storm'],
  drought:                ['drought', 'water scarcity', 'dry spell'],
  water_shortage:         ['water shortage', 'water service failure', 'water contamination', 'drought'],
  electricity_disruption: ['electricity disruption', 'power outage', 'load shedding', 'infrastructure failure'],
  hazmat:                 ['hazmat', 'hazardous materials', 'chemical spill', 'industrial accident', 'toxic release'],
  landslide:              ['landslide', 'mudslide', 'slope failure', 'rockfall', 'soil erosion'],
  coastal_storm:          ['coastal storm', 'storm surge', 'coastal flooding', 'tsunami', 'king tide'],
  // functional
  evacuation:             [], // all hazards — no filter, full risk register relevant
  shelter:                ['flood', 'fire', 'veld fire', 'storm', 'severe weather', 'displaced persons'],
  communication:          [], // cross-cutting — no filter
  logistics:              [], // cross-cutting — no filter
  damage_assessment:      [], // cross-cutting — no filter
  public_health:          ['epidemic', 'disease outbreak', 'cholera', 'typhoid', 'water contamination', 'flood', 'drought'],
  // event
  mass_gathering:         ['crowd crush', 'mass gathering incident', 'fire', 'severe weather'],
  election:               ['protest', 'civil unrest', 'fire', 'severe weather'],
  protest_unrest:         ['civil unrest', 'protest', 'riot', 'social unrest', 'xenophobia'],
  vip_visit:              ['security incident', 'crowd incident', 'fire', 'severe weather'],
  major_incident:         [], // all hazards — no filter
  // seasonal
  winter:                 ['cold snap', 'snow', 'ice', 'frost', 'informal settlement fire', 'hypothermia'],
  summer:                 ['heat wave', 'drowning', 'veld fire', 'flood', 'severe thunderstorm'],
  festive_season:         ['road accident', 'crowd incident', 'fire', 'flood', 'severe weather'],
  fire_season:            ['veld fire', 'wildfire', 'forest fire', 'informal settlement fire', 'fire'],
};

// Section keys within each plan type that should receive HVC risk data inline
// (injected as an additional block into that specific section, not just hvc_placeholders)
const HVC_SECTION_TARGETS = {
  flood:                  ['hazard_risk_profile', 'flood_risk_zones'],
  wildfire:               ['hazard_risk_profile', 'veld_fire_risk_rating'],
  severe_weather:         ['hazard_risk_profile', 'saws_warning_thresholds'],
  storm:                  ['hazard_risk_profile', 'coastal_storm_surge'],
  drought:                ['hazard_risk_profile', 'water_supply_monitoring'],
  water_shortage:         ['hazard_risk_profile', 'water_service_failure'],
  electricity_disruption: ['hazard_risk_profile', 'load_shedding_impact'],
  hazmat:                 ['hazard_risk_profile', 'hazmat_site_register'],
  landslide:              ['hazard_risk_profile', 'slope_stability_mapping'],
  coastal_storm:          ['hazard_risk_profile', 'coastal_erosion'],
  evacuation:             ['hazard_risk_profile'],
  shelter:                ['hazard_risk_profile'],
  communication:          ['hazard_risk_profile'],
  logistics:              ['hazard_risk_profile'],
  damage_assessment:      ['hazard_risk_profile'],
  public_health:          ['hazard_risk_profile', 'disease_surveillance'],
  mass_gathering:         ['hazard_risk_profile', 'crowd_safety_risk_assessment'],
  election:               ['hazard_risk_profile'],
  protest_unrest:         ['hazard_risk_profile', 'intelligence_liaison'],
  vip_visit:              ['hazard_risk_profile'],
  major_incident:         ['hazard_risk_profile'],
  winter:                 ['hazard_risk_profile', 'cold_snap_thresholds'],
  summer:                 ['hazard_risk_profile', 'heat_health_action'],
  festive_season:         ['hazard_risk_profile'],
  fire_season:            ['hazard_risk_profile', 'fpa_collaboration'],
};

// ---------------------------------------------------------------------------
// TIER 1 — CORE SECTIONS (all plan types, always inserted)
// ---------------------------------------------------------------------------
const CORE_SECTIONS = [
  {
    key: 'legal_authority',
    title: 'Legal Authority and Mandate',
    blocks: [
      text('This contingency plan is prepared in terms of Section 53(2)(k) of the Disaster Management Act, No. 57 of 2002 (as amended by Act 16 of 2015), which requires municipal disaster management plans to include contingency plans and emergency procedures for disasters, including responsibilities, response and relief actions, emergency procurement, communication links and information dissemination. In terms of Section 54(3) of the Act, local disasters must be managed in accordance with existing legislation and contingency arrangements.'),
      text('This plan operationalises preparedness and response arrangements for the applicable contingency planning category and is aligned with intergovernmental disaster management structures. The plan is reviewed annually, or following a significant disaster event, in accordance with Section 48 of the Act. The plan may be shared with the National Disaster Management Centre (NDMC) and the relevant Provincial Disaster Management Centre (PDMC) for alignment and coordination purposes.'),
      list([
        'Disaster Management Act 57 of 2002 (as amended by Act 16 of 2015)',
        'National Disaster Management Framework (NDMF) 2005',
        'Local Government: Municipal Systems Act 32 of 2000',
        'Municipal Finance Management Act 56 of 2003',
        'South African National Standard SANS 10263-1/2/3',
        'Sendai Framework for Disaster Risk Reduction 2015–2030'
      ])
    ]
  },
  {
    key: 'hazard_risk_profile',
    title: 'Municipal Hazard and Risk Profile',
    blocks: [
      text('This plan is informed by the municipality\'s Disaster Risk Assessment (DRA), conducted in accordance with NDMC guidelines. The DRA identifies priority hazards based on likelihood, consequence, and community vulnerability. Hazard likelihood and severity ratings are maintained in the municipal risk register, updated annually in conjunction with the PDMC. Seasonal profiles are aligned with forecasts issued by the South African Weather Service (SAWS).'),
      list([
        'Hydrometeorological: flooding, severe storms, drought, coastal storm surge',
        'Geophysical: landslides, soil erosion, subsidence',
        'Biological: disease outbreaks, vector-borne illness',
        'Technological: hazardous materials incidents, infrastructure failure',
        'Human-induced: fire (informal settlements, veld), unrest, crowd incidents'
      ]),
      text('Vulnerable populations and areas identified include informal settlements, flood-prone riverbanks, peri-urban agricultural communities, the elderly, persons with disabilities, and households lacking access to early warning communication.')
    ]
  },
  {
    key: 'roles_responsibilities',
    title: 'Roles, Responsibilities and Lead Agencies',
    blocks: [
      text('Disaster risk management is a multi-sectoral function. All role-players must have current Memoranda of Understanding (MOUs) or mutual assistance agreements in place, as required by NDMF policy. Roles and responsibilities are reviewed annually by the Disaster Management Advisory Forum (DMAF).'),
      table(['Function', 'Lead Agency', 'Support Agencies']),
      list([
        'Overall coordination: Municipal DRM Centre — PDMC, NDMC',
        'Law enforcement / public order: SAPS — Metro/Municipal Police',
        'Fire suppression: Fire & Rescue Services — Working on Fire (WoF)',
        'Emergency medical services: EMS / Provincial Health — NSRI, private EMS',
        'Social relief: Department of Social Development — NGOs (Gift of the Givers)',
        'Infrastructure assessment: Public Works / Engineering — SANRAL, ESKOM, DWS',
        'Shelter / housing: Human Settlements — SASSA, faith-based organisations',
        'Environmental health: Municipal Health Services — NICD, DFFE',
        'Communications: Corporate Communications — SAWS, community radio'
      ])
    ]
  },
  {
    key: 'activation_triggers',
    title: 'Activation Criteria and Alert Levels',
    blocks: [
      text('This plan is activated when any of the following conditions are met. Activation authority rests with the Head of the Municipal Disaster Management Centre, with notification to the Municipal Manager and relevant MAYCO member. All activations must be recorded in the incident log and reported to the PDMC within 24 hours.'),
      table(['Alert Level', 'Trigger Condition', 'Response Action', 'Authority']),
      list([
        'Level 1 — Standby/Monitoring: SAWS Watch or Advisory issued; seasonal preparedness period onset; intelligence of potential mass event',
        'Level 2 — Partial Activation: SAWS Warning (Yellow/Orange); early indicators of hazard impact; incident reports from ward councillors',
        'Level 3 — Full Activation: SAWS Warning (Red) or confirmed disaster onset; request for support from Local Municipality; declaration recommended',
        'Level 4 — Disaster Declaration: Municipality unable to manage with own resources (DMA s.49); formal classification as local disaster by NDMC; provincial/national escalation triggered'
      ])
    ]
  },
  {
    key: 'command_coordination',
    title: 'Command, Control and Coordination Structure',
    blocks: [
      text('The municipality operates a Joint Operations Centre (JOC) model aligned to the NDMC\'s integrated incident management system. The Disaster Operations Centre (DOC) is activated upon reaching Alert Level 2. The DOC houses representatives from all primary and support agencies and maintains continuous situation reporting. A Single Point of Contact (SPOC) is designated for each activated incident.'),
      list([
        'Strategic Level: Municipal Manager / MAYCO — policy decisions, declaration of disaster, resource authorisation',
        'Tactical Level: Head of DRM Centre — overall coordination, inter-agency liaison, PDMC reporting, resource allocation',
        'Operational Level: Incident Commander at site — on-site management, agency coordination, site safety, media exclusion enforcement'
      ]),
      text('All media enquiries are directed to the designated spokesperson only. No field personnel may communicate with media without authorisation. JOC/DOC location and 24-hour contact details are maintained in the Emergency Contact Register.')
    ]
  },
  {
    key: 'resource_mobilisation',
    title: 'Resource Mobilisation and Financial Arrangements',
    blocks: [
      text('Internal resources are mobilised through the municipal supply chain management system using emergency procurement procedures under MFMA s.36 where standard procurement timelines cannot be met. All emergency expenditure must be documented and reported to the Chief Financial Officer within 48 hours of incurrence. Post-disaster cost recovery applications are submitted to the PDMC in the prescribed format within 30 days of incident close-out.'),
      table(['Resource Type', 'Custodian', 'Location', 'Availability', 'Funding Source']),
      list([
        'Non-food relief items (blankets, food parcels, hygiene kits) — pre-positioned at municipal warehouse',
        'Emergency generator capacity — critical facilities on backup power register',
        'Water tankers — Roads/Water Services fleet',
        'Provincial DRM Grant — transferred through PDMC upon disaster classification',
        'Municipal Disaster Relief Fund — contingency reserve maintained per MFMA',
        'COGTA/National Treasury Municipal Disaster Recovery Grant (post-classification)',
        'NGO pre-agreements — active MOUs listed in Emergency Contact Register'
      ])
    ]
  },
  {
    key: 'communications_reporting',
    title: 'Communications, Warning and Situation Reporting',
    blocks: [
      text('Early warning dissemination chain: SAWS → NDMC → PDMC → Municipal DRM Centre → Ward Councillors → Communities. Warning messages are issued in the three most widely spoken languages in the municipality and include: what the hazard is, which areas are affected, what people should do, where to go for help, and who to call.'),
      table(['Stakeholder', 'Method', 'Responsible', 'Timeframe']),
      list([
        'PDMC: Phone + email Sitrep — within 1 hour of Alert Level 2',
        'Municipal Manager: Phone — within 30 minutes of Alert Level 2',
        'Ward Councillors: WhatsApp broadcast — within 30 minutes',
        'Community radio: Written bulletin — within 1 hour',
        'General public: SMS/website/social media — within 2 hours',
        'Media: Press briefing by designated spokesperson — as required'
      ]),
      text('Situation Reports (Sitreps) are submitted to the PDMC every 6 hours during active incidents, or as directed. Backup communications: VHF radio (primary), HF radio (regional), satellite phone (Head of DRM). All communications during an active incident must be logged and timestamped in the Incident Log, retained for a minimum of 5 years.')
    ]
  },
  {
    key: 'recovery_rehabilitation',
    title: 'Recovery, Rehabilitation and Build Back Better',
    blocks: [
      text('Recovery begins as soon as life safety is secured. The municipality adopts a Build Back Better approach aligned to Sendai Framework Priority 4, ensuring that reconstruction reduces future risk rather than recreating pre-disaster vulnerabilities. Recovery projects are registered in the Municipal Disaster Grant project system and monitored quarterly by the DRM Advisory Forum.'),
      list([
        'Immediate recovery (0–72 hours): Damage and Needs Assessment (DNA) initiated; temporary shelter activation; essential service restoration prioritised',
        'Short-term recovery (1–30 days): Transitional Residential Units (TRUs) deployed by Human Settlements; SASSA disaster relief grants activated; infrastructure rapid repair',
        'Medium/long-term recovery (30 days+): Post-Disaster Needs Assessment (PDNA) to PDMC; reconstruction per National Building Regulations; spatial planning review to prevent re-settlement in high-risk zones; community resilience building'
      ]),
      text('PDNA is submitted in the prescribed national methodology format within 14 days of significant event classification. Reconstruction in high-risk zones must demonstrate risk reduction measures as a condition of approval.')
    ]
  },
  {
    key: 'environmental_health_safety',
    title: 'Environmental and Public Health Safeguards',
    blocks: [
      text('All disaster response operations must comply with the National Environmental Management Act (NEMA), the National Health Act, and the Occupational Health and Safety Act (Act 85 of 1993). Environmental Health Practitioners (EHPs) are deployed to all shelter sites and disaster sites within 6 hours of activation. A post-disaster environmental health report is submitted to the Head of DRM within 14 days of incident close-out.'),
      list([
        'Water quality monitoring: EHP testing of all distributed water within 24 hours; boil-water advisory issued if SANS 241 thresholds breached',
        'Sanitation: minimum 1 toilet per 20 persons at shelter sites (SPHERE standard); separate facilities for men and women',
        'Waste management: hazardous waste separated and segregated; DFFE notified for any contamination events',
        'Vector control: fogging/residual spraying authorised upon EHP instruction following floods or shelter operations',
        'Disease surveillance: all notifiable medical conditions reported to NICD within 24 hours per National Health Act'
      ])
    ]
  },
  {
    key: 'plan_review',
    title: 'Plan Review, Testing and Maintenance',
    blocks: [
      text('This plan is reviewed annually and additionally following: any significant disaster event in the municipality; change in key personnel or agency contact details; legislative or policy amendments at national or provincial level; findings from a plan exercise or simulation. Review is the responsibility of the Head of Municipal DRM Centre, with input from the DRM Advisory Forum.'),
      table(['Activity', 'Frequency', 'Owner', 'Evidence Required']),
      list([
        'Annual plan review: every 12 months — Head of DRM — signed revision log',
        'Post-incident review: within 30 days of significant event — DRM Centre — lessons learnt report',
        'Tabletop exercise: minimum once per year — DRM Centre + agencies — exercise report',
        'Full-scale simulation: once per 2 years — DRM Centre + agencies — AAR (After Action Review)',
        'Contact register update: quarterly — DRM duty officer — updated register',
        'PDMC/NDMC submission: on adoption and after amendment — Head of DRM — submission receipt'
      ])
    ]
  }
];

// ---------------------------------------------------------------------------
// TIER 2 — CATEGORY SECTIONS
// ---------------------------------------------------------------------------
const CATEGORY_SECTIONS = {
  hazard_specific: [
    {
      key: 'early_warning_monitoring',
      title: 'Early Warning and Monitoring Systems',
      blocks: [
        text('This plan integrates with the South African Weather Service (SAWS) impact-based early warning system. Warning levels are classified as: Watch (possible threat), Advisory (probable threat), Warning (imminent threat — Yellow/Orange/Red by severity). The municipality subscribes to SAWS alerting services and has designated a 24-hour monitoring officer during active hazard seasons. Warnings received are disseminated within 30 minutes to all ward-level structures.'),
        list([
          'SAWS Weather API and impact-based early warning alerts',
          'NDMC Seasonal Hazard Profiles (updated each season)',
          'DWS national dam levels monitoring portal (flood/drought)',
          'MODIS/FPA hotspot mapping (fire)',
          'Provincial geotechnical alerts (landslide)',
          'NERSA/Eskom grid monitoring feeds (electricity disruption)'
        ])
      ]
    },
    {
      key: 'affected_area_mapping',
      title: 'Affected Area Mapping and Spatial Risk Zones',
      blocks: [
        text('Hazard-specific risk zones are mapped using the municipal GIS system and updated following each significant event. Maps are available at the DOC, shared with all responding agencies, and published on the municipal website during active events for public information. Mapping is updated following any significant event and shared with the spatial planning department to inform land-use decisions.'),
        list([
          'Flood lines: 1:10, 1:50, 1:100 year return period maps per ward',
          'Fire risk index zones and veld fire susceptibility areas',
          'Drought-affected ward boundaries and water stress zones',
          'Informal settlement footprints in high-risk areas',
          'Landslide susceptibility zones (Council for Geoscience data)',
          'Coastal inundation zones at 0.5m, 1m, 2m surge heights'
        ])
      ]
    },
    {
      key: 'search_rescue_operations',
      title: 'Search and Rescue Operations',
      blocks: [
        text('SAR operations are conducted under the Incident Commander with appropriately qualified personnel only. No member of the public or unqualified personnel may enter dangerous environments. All SAR operations use a buddy system and mandatory PPE appropriate to the hazard type. A rescue operations log is maintained by the Incident Commander throughout.'),
        list([
          'Municipal Fire and Rescue: primary SAR capability for structural and water incidents',
          'NSRI: activated for coastal and flood water incidents via MRCC at 021-449-3500',
          'SANDF: requested through NDMC when municipal capacity is overwhelmed',
          'SAPS K9: structural collapse and missing persons searches',
          'Provincial EMS: advanced medical SAR capability'
        ])
      ]
    },
    {
      key: 'damage_impact_assessment',
      title: 'Damage and Impact Assessment',
      blocks: [
        text('Rapid damage assessments are initiated within 6 hours of an incident. Assessment teams are multi-disciplinary (engineering, EHP, social worker, GIS officer). Data is captured on the NDMC standard DNA form and uploaded to the provincial reporting system within 24 hours. Impact Status Display Charts (ISDCs) are updated in the DOC every 6 hours during active incidents and shared with the PDMC in Sitrep format.'),
        table(['Sector', 'Lead Department', 'Support Agency', 'Assessment Form', 'Reporting Deadline']),
        list([
          'Housing: Human Settlements + Building Inspectorate — 24 hours',
          'Infrastructure: Public Works / SANRAL / Eskom / DWS — 24 hours',
          'Agriculture: DALRRD + Agricultural union — 48 hours',
          'Health: Municipal Health + NICD — 24 hours',
          'Education: Provincial DoE + School principals — 48 hours'
        ])
      ]
    }
  ],

  functional: [
    {
      key: 'standard_operating_procedures',
      title: 'Standard Operating Procedures',
      blocks: [
        text('Detailed SOPs govern each operational component of this plan. SOPs are maintained by the responsible department and reviewed annually in conjunction with the plan review cycle. All SOPs are held at the DOC and are accessible to deployed personnel in both digital and printed form.'),
        table(['SOP Reference', 'Title', 'Owner', 'Version', 'Last Reviewed']),
        list([
          'SOPs must reference applicable legislation and best practice for the specific service function',
          'All SOPs require sign-off by the relevant Head of Department and the Head of DRM',
          'Field personnel must be briefed on applicable SOPs before each deployment',
          'SOP deviations during operations must be documented in the incident log'
        ])
      ]
    },
    {
      key: 'multi_agency_coordination',
      title: 'Multi-Agency Coordination Protocols',
      blocks: [
        text('This plan operates on an integrated agency model. No single agency commands another; coordination is achieved through the JOC. Each agency maintains its own chain of command and is represented at the JOC by a designated liaison officer with authority to commit resources. Coordination meetings are held every 8 hours during active incidents. Minutes are recorded and distributed to all agency representatives within 1 hour of each meeting.'),
        list([
          'Liaison officers must have delegated authority to make operational decisions',
          'Resource requests between agencies are routed through the JOC, not directly between field teams',
          'All joint operational decisions are recorded in the JOC log',
          'Escalation to PDMC is the responsibility of the Head of DRM, not individual agencies',
          'Post-incident multi-agency debrief within 7 days of incident close-out'
        ])
      ]
    },
    {
      key: 'capacity_equipment_register',
      title: 'Capacity and Equipment Register',
      blocks: [
        text('A current inventory of personnel, vehicles, and specialist equipment is maintained by the DRM Centre and updated quarterly. The register includes availability status, location, and deployment lead time for each asset. Pre-season verification of all equipment is mandatory.'),
        table(['Asset Type', 'Asset Description', 'Owner Department', 'Location', 'Availability Status', 'Lead Time'])
      ]
    },
    {
      key: 'training_exercises',
      title: 'Training and Exercise Programme',
      blocks: [
        text('All personnel with DRM responsibilities complete a minimum of 16 hours of DRM training per annum. Training is aligned to NDMC and DMISA curricula. Exercise records are maintained and form part of the plan review evidence base.'),
        table(['Programme', 'Type', 'Frequency', 'Target Group', 'Evidence Required'])
      ]
    }
  ],

  event: [
    {
      key: 'event_profile',
      title: 'Event Profile and Classification',
      blocks: [
        text('Events are classified by anticipated attendance. Each classification triggers different resource requirements, lead-times, and approval authorities. All Large and Major events require a pre-event multi-agency safety meeting minimum 14 days before the event.'),
        table(['Class', 'Attendance', 'Risk Rating', 'DRM Lead Time', 'Action Required']),
        list([
          'Small (< 500): Venue risk checklist; organiser self-manages',
          'Medium (500 – 5,000): DRM notification; EMS standby; traffic management plan',
          'Large (5,001 – 20,000): Full event safety plan; JOC activation; SAPS command post',
          'Major (> 20,000): Multi-agency command post; NDMC notification; dedicated DOC'
        ])
      ]
    },
    {
      key: 'crowd_safety_risk_assessment',
      title: 'Crowd Safety Risk Assessment',
      blocks: [
        text('A crowd safety risk assessment is conducted for all Medium and above events using the Event Safety Council methodology. Crowd density monitoring is maintained throughout the event. Pre-agreed interventions are activated at defined density thresholds.'),
        list([
          'Structural capacity and current safety certificate status',
          'Ingress/egress capacity and crowd flow modelling (required for > 5,000)',
          'Emergency vehicle access routes and ambulance corridor clearance',
          'Proximity to trauma hospital and pre-notification requirements',
          'Weather forecast and exposure risk for outdoor events',
          'Alcohol licensing status and crowd behaviour risk assessment',
          '4 persons/m²: crowd flow intervention — 5 persons/m²: zone closure — 6+ persons/m²: emergency protocol declared'
        ])
      ]
    },
    {
      key: 'security_coordination',
      title: 'Security and Law Enforcement Coordination',
      blocks: [
        text('SAPS is the primary law enforcement authority at all events. A joint security plan is developed with the organiser, SAPS, Metro Police, and private security at least 14 days before major events. Security briefings are held 2 hours before event opening. Command post locations, radio channels, and escalation procedures are confirmed at briefing.'),
        list([
          'SAPS: public order management, crowd control, crime prevention',
          'Metro/Municipal Police: bylaw enforcement, traffic control, access management',
          'Private security: venue perimeter, accreditation checks, internal crowd management',
          'Joint security plan must be signed off by SAPS Station Commander',
          'Dedicated radio channel established for security coordination',
          'Escalation trigger: SAPS Public Order Policing requested when crowd behaviour deteriorates'
        ])
      ]
    },
    {
      key: 'medical_emergency_plan',
      title: 'Medical Emergency Plan',
      blocks: [
        text('EMS is deployed in accordance with HPCSA-recommended ratios. For events > 5,000 persons, a dedicated medical command post is established on-site. The nearest trauma hospital is pre-notified of the event date, expected attendance, and mass casualty thresholds. A mass casualty incident is declared by the on-site medical commander upon predetermined casualty numbers.'),
        list([
          'ALS (Advanced Life Support): 1 unit per 10,000 attendees',
          'BLS (Basic Life Support): 1 unit per 5,000 attendees',
          'Medical command post: mandatory for events > 10,000 attendees',
          'Pre-hospital care area (PHA): clear signage, direct ambulance access kept clear throughout event',
          'Triage protocol: START system for mass casualty incidents',
          'Hospital pre-notification: nearest Level 2/3 hospital placed on Major Incident standby upon MCI declaration'
        ])
      ]
    },
    {
      key: 'traffic_access_management',
      title: 'Traffic and Access Management',
      blocks: [
        text('Traffic management plans are developed for all Large and Major events in consultation with the municipal Traffic Department, SAPS Traffic, and SANRAL (where applicable). Emergency vehicle access corridors are marked and kept clear throughout the event. Dedicated emergency access lanes must be separate from public entry/exit routes.'),
        list([
          'Primary emergency route: designated and signed before event opens',
          'Secondary emergency route: identified and pre-cleared for ambulance/fire access',
          'Road closures: gazetted and communicated minimum 5 days before event',
          'Parking plan: overflow areas, pedestrian routes and disabled parking designated',
          'SAPS Traffic: stationed at key intersections for duration of event',
          'Post-event traffic dispersal plan: staggered exit to prevent gridlock'
        ])
      ]
    }
  ],

  seasonal: [
    {
      key: 'seasonal_forecast_integration',
      title: 'Seasonal Forecast Integration',
      blocks: [
        text('This plan is activated in alignment with the NDMC annual National Contingency Plan for the relevant season, updated each season based on SAWS seasonal outlook. The SAWS seasonal forecast and NDMC hazard profile are reviewed at the start of each season, and this plan is adjusted accordingly. The municipality participates in the provincial seasonal preparedness forum convened by the PDMC before each season.'),
        list([
          'SAWS seasonal outlook reviewed: start of each season (March/September)',
          'NDMC National Seasonal Contingency Plan: received and distributed to all agencies',
          'Provincial seasonal preparedness forum: attendance mandatory for Head of DRM',
          'Plan activation date: communicated to all agencies minimum 2 weeks before season onset',
          'Seasonal hazard profile: updated in municipal risk register each season'
        ])
      ]
    },
    {
      key: 'pre_season_readiness_checklist',
      title: 'Pre-Season Readiness Checklist',
      blocks: [
        text('Before each season, the following readiness actions are completed and signed off by the Head of DRM. Non-completed items are escalated to the Municipal Manager for resource resolution.'),
        list([
          'All emergency contacts verified and updated in the Emergency Contact Register',
          'Resource inventory completed — gaps identified and procurement initiated',
          'Pre-positioned supplies inspected, restocked, and storage conditions verified',
          'Early warning dissemination channels tested with ward-level confirmation',
          'Community awareness campaigns launched (radio, social media, ward meetings)',
          'MOUs with NGOs and service providers confirmed active and contact persons verified',
          'Seasonal training exercise completed with all primary agencies',
          'This plan reviewed, updated with seasonal adjustments, and redistributed',
          'PDMC pre-season briefing attended and seasonal plan received',
          'HVC/risk register reviewed and seasonal hazard profile updated'
        ])
      ]
    },
    {
      key: 'vulnerable_population_register',
      title: 'Vulnerable Population Register',
      blocks: [
        text('A georeferenced register of at-risk populations is maintained and updated annually. The register is used to prioritise early warning, evacuation assistance, and relief distribution. Data is treated as confidential and shared only with responding agencies on a need-to-know basis.'),
        table(['Category', 'Ward', 'Number of Persons', 'Location/Facility', 'Special Requirements', 'Contact Person']),
        list([
          'Elderly persons living alone in flood/fire-risk zones',
          'Persons with mobility impairments or requiring medical equipment',
          'Informal settlement households in mapped high-risk areas',
          'Homeless persons: street sleep locations by ward',
          'Hospitals, clinics, old-age homes, disability facilities',
          'Schools and early childhood development centres',
          'Households without communication access (no phone/radio)'
        ])
      ]
    },
    {
      key: 'post_season_debrief',
      title: 'Post-Season Debrief and Lessons Learnt',
      blocks: [
        text('A structured debrief is conducted within 30 days of season close. Attendees include all primary agencies and selected community representatives. The debrief captures what worked, what did not, resource gaps, coordination failures, and recommendations. Lessons learnt are incorporated into the next season\'s plan revision and reported to the PDMC.'),
        table(['Issue Identified', 'Category', 'Recommended Action', 'Responsible', 'Target Date'])
      ]
    }
  ]
};

// ---------------------------------------------------------------------------
// TIER 3 — TYPE-SPECIFIC SECTION LIBRARIES
// ---------------------------------------------------------------------------
const TYPE_SECTIONS = {

  // ── HAZARD-SPECIFIC ──────────────────────────────────────────────────────

  flood: [
    {
      key: 'flood_risk_zones',
      title: 'Flood Risk Zone Mapping',
      blocks: [
        text('Flood-risk zones have been identified based on the 1:10, 1:50, and 1:100-year flood lines. High-risk zones are mapped in the municipal GIS and listed in the Vulnerable Population Register. Informal settlements in flood-prone areas are mapped and subject to accelerated warning timelines due to structural vulnerability and limited vehicle access.'),
        text('The floodplain development restriction policy (SPLUMA-aligned) prohibits new development within the 1:50-year flood line without formal risk mitigation approval. Zone maps are publicly available on the municipal website and at ward offices.'),
        table(['Zone', 'Flood Line', 'Wards Affected', 'Approx. Households at Risk', 'Evacuation Zone Linked'])
      ]
    },
    {
      key: 'stormwater_infrastructure',
      title: 'Stormwater Infrastructure Status and Maintenance',
      blocks: [
        text('Pre-season stormwater infrastructure inspections are conducted annually before the summer season. Blockages and capacity deficiencies are logged and prioritised for repair before the season. During flood events, Roads and Stormwater deploys clearing teams to priority hotspots based on the infrastructure defect register.'),
        table(['Asset ID', 'Location / Ward', 'Asset Type', 'Condition Rating', 'Known Defect', 'Repair Priority', 'Status'])
      ]
    },
    {
      key: 'dam_safety_protocols',
      title: 'Dam and Water Level Monitoring Protocols',
      blocks: [
        text('Upstream dam levels are monitored via the Department of Water and Sanitation (DWS) national dam safety monitoring system. The municipality has a direct alert agreement with relevant dam operators. Upon receiving a dam safety alert, this plan is escalated immediately to Alert Level 3. Downstream communities within the dam break inundation zone are pre-registered for priority evacuation notification.'),
        list([
          'DWS national dam safety system: monitored daily during summer season',
          'Dam operator direct alert: call received → DRM Centre notified within 15 minutes',
          'Dam break inundation zone mapped and overlaid on evacuation zone maps',
          'Downstream community early warning: minimum 1 hour before projected wave arrival',
          'Dam safety escalation threshold: any indication of structural compromise → immediate Alert Level 3'
        ])
      ]
    },
    {
      key: 'informal_settlement_response',
      title: 'Informal Settlement Flood Response',
      blocks: [
        text('Informal settlements in flood-prone zones require specialised response protocols: residents require earlier warning timelines due to proximity and structural vulnerability; emergency vehicle access is often limited; complex land tenure prevents pre-event permanent relocation.'),
        list([
          'Pre-event community liaison through ward-based volunteers allocated to each at-risk settlement',
          'Designated temporary assembly points for each at-risk settlement — mapped and signposted',
          'Pre-agreed temporary shelter locations confirmed with Human Settlements before each season',
          'Community-based early warning volunteer network with designated flood wardens per settlement',
          'Rapid damage assessment team deployed to informal settlements within 2 hours of flood onset',
          'Emergency tarpaulin stock pre-positioned for roof damage response'
        ])
      ]
    },
    {
      key: 'floodwater_rescue',
      title: 'Floodwater Rescue Procedures',
      blocks: [
        text('Floodwater rescue is conducted by trained swift-water rescue personnel only. No member of the public or unqualified personnel may enter moving floodwater under any circumstances. All flood rescue operations use a buddy system and mandatory PPE including Personal Flotation Devices (PFDs).'),
        list([
          'Swift-water rescue resources: boats, throw bags, PPE — locations listed in Capacity Register',
          'NSRI activated for incidents beyond municipal swift-water capability via MRCC 021-449-3500',
          'Helicopter rescue requested through PDMC/NDMC when required',
          'No entry to floodwater without safety officer assessment and authorisation',
          'All flood rescue operations logged by Incident Commander — entry/exit times, personnel, outcomes'
        ])
      ]
    }
  ],

  wildfire: [
    {
      key: 'veld_fire_risk_rating',
      title: 'Veld and Wildfire Risk Rating System',
      blocks: [
        text('The municipality uses the MODIS/FPA fire risk index and the National Fire Danger Rating System (NFDRS) to assess daily fire risk. Risk ratings (Low, Moderate, High, Very High, Extreme) determine pre-positioning of resources and activation of burn bans. The municipality is a member of the local Fire Protection Association (FPA) and receives daily fire risk ratings during fire season.'),
        table(['Risk Rating', 'NFDRS / FPA Index Range', 'Municipal Response', 'Resource Pre-positioning', 'Burn Ban Status'])
      ]
    },
    {
      key: 'fire_break_maintenance',
      title: 'Firebreak Maintenance Programme',
      blocks: [
        text('Municipal firebreaks are maintained as required by the National Veld and Forest Fire Act (Act 101 of 1998). Pre-season firebreak inspection is conducted annually. Landowners on the municipal boundary are responsible for their own firebreaks; non-compliance is reported to the FPA and DFFE.'),
        table(['Firebreak Reference', 'Location / Route', 'Length (km)', 'Last Maintained', 'Condition', 'Responsible Department', 'Compliance Status'])
      ]
    },
    {
      key: 'aerial_resources',
      title: 'Aerial Fire-Fighting Resources',
      blocks: [
        text('Aerial resources (helicopters, fixed-wing) are contracted seasonally through the Department of Forestry, Fisheries and the Environment (DFFE) Working on Fire (WoF) programme. Activation of aerial support during the season is requested through the PDMC or DFFE regional office. Minimum landing zone dimensions and GPS coordinates for operational sites are pre-registered with WoF.'),
        table(['Resource Type', 'Provider', 'Base Location', 'ETA to Municipality', 'Activation Contact', 'Season Active'])
      ]
    },
    {
      key: 'working_on_fire_coordination',
      title: 'Working on Fire Programme Coordination',
      blocks: [
        text('Joint operational briefings between WoF, municipal fire services, and SAPS are held at Alert Level 2 during elevated fire danger periods. WoF crews are available for ground fire-fighting support during activation. Contact details for the WoF team leader are in the Emergency Contact Register.'),
        list([
          'WoF crew deployment: activated through DFFE regional office or PDMC',
          'Joint briefing protocol: held within 2 hours of Alert Level 2 activation during fire season',
          'WoF operational command: WoF team leader reports to Incident Commander on scene',
          'Mutual aid: additional WoF crews available through inter-provincial deployment if required',
          'Post-fire: WoF participation in post-fire secondary hazard assessment and rehabilitation'
        ])
      ]
    },
    {
      key: 'post_fire_erosion',
      title: 'Post-Fire Secondary Hazard Management',
      blocks: [
        text('Following significant veld fires, soil erosion and flash flood risk increases substantially in burnt areas. Within 48 hours of fire suppression, a post-fire secondary hazard assessment is initiated covering: slope stability, stormwater drainage vulnerability, and water catchment contamination risk.'),
        list([
          'Slope stability assessment in burnt areas above informal settlements and infrastructure',
          'Water catchment contamination monitoring — EHP sampling within 48 hours',
          'Stormwater drainage clearance in burn scar runoff zones',
          'Erosion mitigation: sandbag barriers and brush packing on slopes above critical assets',
          'Invasive alien plant management: post-fire is optimal treatment window',
          'Revegetation programme: coordinated with DFFE and SANParks where applicable'
        ])
      ]
    }
  ],

  severe_weather: [
    {
      key: 'saws_warning_thresholds',
      title: 'SAWS Impact-Based Warning Thresholds',
      blocks: [
        text('All SAWS impact-based warnings are actioned according to the thresholds below. Thresholds are specific to the hazard type (rain, wind, lightning, temperature) and are calibrated to local conditions. Full threshold tables are maintained in the DRM Operations Manual and updated each season.'),
        table(['SAWS Level', 'Hazard Type', 'Threshold', 'Expected Impact', 'Municipal Response', 'Alert Level Triggered'])
      ]
    },
    {
      key: 'lightning_safety',
      title: 'Lightning Safety Protocols',
      blocks: [
        text('Lightning is one of the leading causes of weather-related fatalities in South Africa. Lightning safety protocols are activated upon issuance of a SAWS lightning Watch or Warning. Lightning fatalities must be reported to SAPS and documented in the incident record. Annual lightning fatality statistics are submitted to the NDMC.'),
        list([
          'All outdoor municipal workers: seek shelter immediately upon lightning Watch/Warning',
          'Schools: notify parents; follow shelter-in-place protocols; no outdoor activity',
          'Outdoor events: suspended or relocated to covered venue upon lightning Warning',
          'Agricultural communities: notified via community radio and ward volunteer network',
          'Open water (swimming pools, dams, beaches): cleared immediately upon Warning',
          'Lightning conductors: all critical facilities inspected annually for compliance'
        ])
      ]
    },
    {
      key: 'wind_damage_response',
      title: 'Wind Damage Response',
      blocks: [
        text('Severe wind events cause roof damage, falling trees, and structure collapse, particularly in informal settlements with corrugated iron roofing. Response actions are coordinated by the DRM Centre upon Alert Level 2 or above activation.'),
        list([
          'Structural fire services / Building Inspectors: dangerous structure assessment within 4 hours',
          'Roads Department: road clearance for fallen trees; hazard signage deployment',
          'Utility Services: power line hazard management coordinated with Eskom/municipal electricity',
          'Human Settlements: emergency tarpaulin deployment for roof damage within 24 hours',
          'All roof damage cases assessed within 24 hours and entered in the emergency housing register',
          'Media notification: road closures and unsafe areas communicated within 2 hours'
        ])
      ]
    },
    {
      key: 'emergency_sheltering_activation',
      title: 'Emergency Sheltering Activation',
      blocks: [
        text('Community halls and designated shelter sites are activated as emergency shelters for households displaced by severe weather. Activation is authorised by the Head of DRM upon Alert Level 3 and above. Social Development is notified simultaneously for humanitarian support deployment.'),
        list([
          'Shelter site network: refer to Approved Shelter Site Register for locations and capacities',
          'Opening trigger: confirmed structural damage requiring occupants to vacate, or proactive precautionary activation for high-risk zones',
          'Site manager: pre-designated per site; on-call during all severe weather Alert Level 2+',
          'EHP deployment: within 6 hours of shelter opening for water, sanitation and hygiene setup',
          'DSD social workers: deployed to all sites with > 50 persons within 12 hours'
        ])
      ]
    }
  ],

  storm: [
    {
      key: 'coastal_storm_surge',
      title: 'Coastal Storm Surge and Inundation Risk',
      blocks: [
        text('Storm surge risk is modelled using CSIR coastal modelling and South African Navy Hydrographic Office data. Inundation zones are mapped at 0.5m, 1m, and 2m surge heights. Coastal communities in these zones are registered in the Vulnerable Population Register for priority early warning and evacuation assistance.'),
        list([
          'Storm surge warnings: issued by SAWS; supplemented by TNPA for harbour and port areas',
          'Inundation zone mapping: 0.5m / 1m / 2m surge heights — reviewed after each significant event',
          'Pre-event evacuation: mandatory for Zone A (0.5m inundation zone) upon SAWS Red Warning',
          'Low-lying infrastructure: roads, pump stations, and critical facilities in surge zones pre-identified',
          'Vessel evacuation: coordinated with NSRI and TNPA prior to storm arrival'
        ])
      ]
    },
    {
      key: 'harbour_coordination',
      title: 'Harbour and Port Coordination',
      blocks: [
        text('During storm events, coordination with TNPA and NSRI is activated at Alert Level 2. Port closure decisions rest with TNPA Harbour Master. Municipal DRM Centre maintains direct communication with Port Control during activations. NSRI activation is via the Maritime Rescue Coordination Centre (MRCC) at 021-449-3500.'),
        list([
          'TNPA Harbour Master: sole authority for port closure and vessel movement restrictions',
          'MRCC: all maritime SAR activations — 021-449-3500 (24-hour)',
          'Commercial vessel shelter: designated safe anchorage coordinates shared with TNPA pre-season',
          'Storm preparation timeline: port operations wind-down minimum 6 hours before storm landfall',
          'Post-storm: harbour inspection and clearance required before resuming operations'
        ])
      ]
    },
    {
      key: 'inland_storm_response',
      title: 'Inland Storm Response Protocols',
      blocks: [
        text('Inland storms causing flooding, wind damage, and infrastructure disruption are managed through activation of the relevant sub-plans. The DRM Centre coordinates all agencies and maintains the incident log throughout. Concurrent hazards (storm + flood + power failure) are managed under unified command with section leads for each hazard.'),
        list([
          'Concurrent hazard protocol: Incident Commander designates sub-commanders per hazard stream',
          'Stormwater clearance teams: deployed to priority drainage points upon SAWS Orange Warning',
          'Infrastructure inspection: Roads and Electrical departments on standby from Alert Level 2',
          'Public messaging: road closures and shelter locations communicated within 2 hours of activation'
        ])
      ]
    }
  ],

  drought: [
    {
      key: 'water_supply_monitoring',
      title: 'Water Supply System Monitoring',
      blocks: [
        text('Dam levels, borehole yields, and reticulation pressures are monitored daily during drought conditions. Trigger level decisions are made by the Municipal Manager in consultation with the Water Services Department and communicated to the public within 24 hours of level change.'),
        table(['Supply Level', 'Trigger Threshold', 'Restriction Level', 'Key Actions', 'Communication Required'])
      ]
    },
    {
      key: 'water_trucking_operations',
      title: 'Alternative Water Supply Operations',
      blocks: [
        text('When reticulation supply is interrupted or insufficient, water is distributed via municipal water tankers, a JoJo tank network at schools, clinics, and community facilities, or private tanker contractors under emergency procurement. Distribution point locations are pre-identified and communicated to communities in advance of Level 3 restriction. EHPs monitor water quality at all distribution points.'),
        list([
          'Municipal water tankers: [quantity] — deployed from [depot] — capacity [litres per vehicle]',
          'JoJo tank network: [locations] — replenishment schedule: [frequency] per drought level',
          'Private tanker contractors: emergency procurement pre-approved under MFMA s.36',
          'Minimum standard: 15 litres per person per day at distribution points (SPHERE)',
          'Water quality testing: EHP samples every distribution point every 24 hours during operations'
        ])
      ]
    },
    {
      key: 'demand_management',
      title: 'Water Demand Management and Restrictions',
      blocks: [
        text('Restriction levels 1–4 are formally gazetted as a municipal by-law amendment and enforced by Water Services and SAPS. Tariff surcharges for excessive use apply at Level 2 and above. A public communication campaign is launched simultaneously with any restriction announcement using all available channels.'),
        table(['Level', 'Trigger Dam/Supply %', 'Restrictions Applied', 'Enforcement', 'Tariff Implication'])
      ]
    },
    {
      key: 'agricultural_liaison',
      title: 'Agricultural Sector Drought Liaison',
      blocks: [
        text('For districts with significant agricultural activity, drought liaison with the Department of Agriculture, Land Reform and Rural Development (DALRRD) is activated at Level 2 restriction. Livestock water emergency support is coordinated with DALRRD and the relevant agricultural union.'),
        list([
          'DALRRD liaison activated: Level 2 restriction triggers formal engagement',
          'Livestock water trucking: coordinated with DALRRD for farms beyond reticulation',
          'Agricultural disaster declaration: DALRRD initiates if crop/livestock losses reach threshold',
          'Irrigation restriction: DWS coordinates irrigation water use reduction per dam level',
          'AgriSA / agricultural union: weekly briefings during Level 3/4 restrictions'
        ])
      ]
    }
  ],

  water_shortage: [
    {
      key: 'water_service_failure',
      title: 'Water Service Failure Response',
      blocks: [
        text('Water service failures (burst mains, pump failure, contamination) are distinguished from drought-related shortages by their sudden onset. The Water Services fault line is activated immediately and affected areas are mapped. Water trucking is deployed within 4 hours for outages exceeding 6 hours duration. EHP is notified for any contamination events.'),
        list([
          'Water Services fault line: 24-hour number in Emergency Contact Register',
          'Affected area notification: SMS and community radio within 2 hours of confirmed outage',
          'Water trucking deployment: within 4 hours for residential outages > 6 hours',
          'Critical facility priority: hospitals, clinics, dialysis centres prioritised first',
          'Repair timeline communicated: public update every 4 hours until resolution',
          'EHP contamination protocol: boil-water advisory issued if source integrity compromised'
        ])
      ]
    },
    {
      key: 'boil_water_advisory',
      title: 'Boil Water Advisory Protocol',
      blocks: [
        text('A boil water advisory is issued when E. coli or other indicators breach SANS 241 thresholds, or when system integrity is compromised. The advisory is issued jointly by Municipal Health Services and Water Services and maintained until two consecutive clear test results are received at least 24 hours apart.'),
        list([
          'Trigger: E. coli detection above SANS 241 thresholds OR confirmed pipe integrity breach',
          'Issuing authority: joint — Head of Environmental Health + Head of Water Services',
          'Communication: all channels within 2 hours of confirmed contamination',
          'Duration: maintained until two consecutive negative tests ≥ 24 hours apart',
          'Languages: advisory issued in top 3 languages of municipal area',
          'Vulnerable facilities: hospitals, schools, and clinics directly notified by phone within 1 hour',
          'NICD notification: required for confirmed waterborne disease outbreak'
        ])
      ]
    }
  ],

  electricity_disruption: [
    {
      key: 'critical_facility_backup',
      title: 'Critical Facility Backup Power Register',
      blocks: [
        text('Critical facilities with backup generation must be registered and inspected bi-annually. Fuel pre-positioning contracts must ensure a minimum 72-hour generator runtime for all Tier 1 critical facilities. Backup power adequacy is reviewed before each winter and summer season.'),
        table(['Facility Name', 'Tier', 'Backup System Type', 'Capacity (kVA)', 'Fuel Runtime', 'Last Inspection', 'Contact Person'])
      ]
    },
    {
      key: 'load_shedding_impact',
      title: 'Load Shedding and Prolonged Outage Impact Management',
      blocks: [
        text('Load shedding schedules (Eskom stages 1–8) are monitored and integrated into the municipal operations plan. Prolonged unplanned outages exceeding 8 hours trigger escalation to Alert Level 2 and notification to all critical facilities.'),
        table(['Stage / Outage Duration', 'Municipal Risk Level', 'Key Hazards', 'Actions Required']),
        list([
          'Stage 4 and above: informal settlement fire risk increases due to candle/paraffin use — fire patrols activated',
          'Stage 4 and above: water pump stations monitored for supply interruption',
          'Stage 4 and above: traffic signal blackouts — Traffic Department deploys officers to major intersections',
          'Stage 4 and above: cold chain integrity at municipal health facilities verified every 4 hours',
          'Unplanned outage > 8 hours: Alert Level 2; all critical facilities notified; Eskom escalation initiated'
        ])
      ]
    },
    {
      key: 'eskom_liaison',
      title: 'Eskom and NERSA Liaison Protocol',
      blocks: [
        text('The municipality maintains a direct account manager relationship with Eskom for planned outage scheduling and emergency escalation. During major incidents, escalation is through the Eskom Emergency Line and the municipal designated contact. DRM Centre maintains Eskom regional emergency contact details in the Emergency Contact Register.'),
        list([
          'Eskom account manager: direct line in Emergency Contact Register',
          'Eskom Emergency Line: 0860 037 566 (24-hour)',
          'Planned outage notification: Eskom provides minimum 48 hours advance notice',
          'Unplanned major outage: DRM Centre initiates escalation to Eskom Region within 30 minutes',
          'NERSA complaint mechanism: for distribution failures not resolved within SLA — contact details in Register',
          'Municipal-owned distribution network: fault response by municipal Electrical Department — contact in Register'
        ])
      ]
    }
  ],

  hazmat: [
    {
      key: 'hazmat_site_register',
      title: 'Hazardous Materials Site Register',
      blocks: [
        text('A register of all licensed hazardous material facilities within and adjacent to the municipality is maintained, including chemical manufacturers, fuel depots, agricultural chemical stores, mining operations, and major transport routes for dangerous goods (ADR routes). The register is compiled in coordination with DFFE Major Hazard Installation inspectorate and updated annually.'),
        table(['Facility / Route', 'Substance Class', 'Max Quantity (tonnes)', 'Risk Rating', 'Buffer Zone Radius', 'Site Emergency Contact', 'DFFE Registration No.'])
      ]
    },
    {
      key: 'spill_containment',
      title: 'Hazmat Spill Containment and Response Tiers',
      blocks: [
        text('All hazmat incidents require DFFE notification within 24 hours and a written incident report within 7 days. Response tier is assessed by the Incident Commander on arrival and escalated as conditions develop.'),
        list([
          'Tier 1 (Small / contained): managed by municipal Fire & Rescue with hazmat kit; isolate, contain, absorb, notify DFFE',
          'Tier 2 (Medium / potential off-site impact): additional hazmat unit required; exclusion zone established; DFFE notified immediately; nearby communities assessed for evacuation',
          'Tier 3 (Major / confirmed off-site impact): SAHRA/NDMC/SANDF support requested; full community evacuation within inundation/plume zone; NICD notified for health risk; environmental remediation contractor activated',
          'Substance identification: Emergency Response Guidebook (ERG) used on scene for unknown substances',
          'Transport incidents: SAPS closes road; DRM Centre notifies DFFE and nearest hazmat team'
        ])
      ]
    },
    {
      key: 'decontamination_operations',
      title: 'Decontamination Operations',
      blocks: [
        text('Decontamination corridors are established at the hot/warm/cold zone interface by trained hazmat personnel. Entry to the hot zone requires SCBA and appropriate chemical-resistant PPE rated for the substance involved. Contaminated materials are handled as hazardous waste under NEMA.'),
        list([
          'Hot zone: substance contact area — entry restricted to SCBA-equipped hazmat personnel only',
          'Warm zone: decontamination corridor — trained personnel with full chemical PPE',
          'Cold zone: command post, media holding, public assembly — general PPE',
          'Personnel decontamination: completed before transport to medical facilities',
          'Equipment decontamination: specialist contractor if contaminated with Class 6.1 or CBRN substances',
          'Decon equipment locations: [Fire Station X] and [Station Y] — listed in Capacity Register'
        ])
      ]
    },
    {
      key: 'public_exclusion',
      title: 'Public Exclusion Zone Management',
      blocks: [
        text('Exclusion zones are established based on substance type and quantity using the Emergency Response Guidebook (ERG) or specialist manufacturer advice. SAPS controls the perimeter. All media are kept outside the cold zone. Exclusion zone size is reviewed every 2 hours and adjusted based on atmospheric conditions, spill progression, and specialist guidance.'),
        list([
          'Initial exclusion radius: set per ERG initial isolation and protective action distances',
          'Zone expansion authority: Incident Commander in consultation with hazmat specialist',
          'SAPS perimeter: established immediately — no unauthorised access beyond cold zone boundary',
          'Community notification: households within protective action zone notified within 30 minutes',
          'Duration: zone maintained until specialist confirms safe air quality and surface conditions',
          'Media briefing point: minimum 500m from cold zone boundary'
        ])
      ]
    }
  ],

  landslide: [
    {
      key: 'slope_stability_mapping',
      title: 'Slope Instability and Landslide Susceptibility Mapping',
      blocks: [
        text('Areas of slope instability are mapped based on the Council for Geoscience (CGS) national landslide inventory and municipal engineering assessments. Mapping is updated following any significant landslide event and shared with the spatial planning department. High-susceptibility zones are incorporated into land-use planning controls to prevent new residential development on at-risk slopes.'),
        table(['Zone', 'Location / Ward', 'Susceptibility Rating', 'Geology', 'Households in Zone', 'Last Assessed', 'Planning Control in Place'])
      ]
    },
    {
      key: 'rainfall_thresholds',
      title: 'Rainfall Threshold Triggers for Landslide Risk',
      blocks: [
        text('Rainfall thresholds are calibrated to local soil conditions based on CGS guidance and reviewed following each landslide event. Thresholds trigger escalating municipal responses and community notifications in susceptibility zones.'),
        table(['Rainfall Threshold (mm/24h)', 'Soil / Geology Context', 'Alert Level', 'Response Actions', 'Community Notification']),
        list([
          '50mm/24h: enhanced monitoring; notify wards in susceptibility zones via ward volunteers',
          '75mm/24h: Alert Level 2; voluntary evacuation recommended for highest-risk households',
          '100mm/24h: Alert Level 3; mandatory evacuation order for mapped high-risk zones',
          'Sustained rainfall > 48h: compound risk assessment — lower thresholds apply to saturated soils',
          'Post-event: threshold review within 30 days if landslide occurs below trigger thresholds'
        ])
      ]
    },
    {
      key: 'infrastructure_on_slopes',
      title: 'Infrastructure Vulnerability on Slopes',
      blocks: [
        text('Critical infrastructure on or below slopes is identified and inspected pre-season. This includes roads, pipelines, power lines, and structures below identified unstable slopes. The Roads Department maintains an emergency road closure register for landslide-prone routes.'),
        table(['Infrastructure Asset', 'Type', 'Slope Exposure Rating', 'Owner', 'Pre-season Inspection Date', 'Emergency Closure Plan'])
      ]
    }
  ],

  coastal_storm: [
    {
      key: 'coastal_erosion',
      title: 'Coastal Erosion and Infrastructure Risk',
      blocks: [
        text('Coastal erosion hotspots are mapped by DFFE and the municipality in accordance with the Integrated Coastal Management Act (Act 24 of 2008). Structures within the coastal buffer zone are registered. During storm events, monitoring teams assess erosion progression at known hotspots and report to the DOC every 6 hours.'),
        table(['Hotspot ID', 'Location', 'Erosion Rate (m/year)', 'Structures at Risk', 'Monitoring Frequency', 'Last Assessment'])
      ]
    },
    {
      key: 'coastal_infrastructure_protection',
      title: 'Coastal Infrastructure Protection and Resilience',
      blocks: [
        text('Coastal infrastructure subject to storm damage is catalogued and pre-season inspections are mandatory. Infrastructure protection measures are reviewed after each significant storm event. Long-term coastal erosion management is embedded in the municipality\'s Coastal Management Programme (CMP).'),
        list([
          'Seawall and revetment inspection: annually and post-storm — Public Works + coastal engineer',
          'Beach access infrastructure: inspected pre-season; closed upon storm warning',
          'Coastal roads: erosion risk rating per segment; closure thresholds pre-defined',
          'Coastal CMP: reviewed every 5 years; incorporates updated sea-level rise projections',
          'TNPA coordination: joint inspection of harbour entrance structures after each major storm'
        ])
      ]
    },
    {
      key: 'marine_search_rescue',
      title: 'Marine Search and Rescue Coordination',
      blocks: [
        text('All marine SAR is coordinated through the Maritime Rescue Coordination Centre (MRCC). NSRI is the primary response agency for maritime incidents within the coastal municipality. Municipal DRM supports with land-side coordination, crowd and media management at beach access points.'),
        list([
          'MRCC: 021-449-3500 (24-hour) — all marine SAR requests',
          'NSRI Station: [Station name and location] — primary maritime response',
          'Beach closure authority: municipal lifeguard service / Metro Police',
          'Land-side support: DRM Centre coordinates EMS, SAPS, crowd management at beach access',
          'Post-incident: MRCC incident report shared with DRM Centre within 48 hours'
        ])
      ]
    }
  ],

  // ── FUNCTIONAL ────────────────────────────────────────────────────────────

  evacuation: [
    {
      key: 'evacuation_zone_mapping',
      title: 'Evacuation Zone Mapping',
      blocks: [
        text('The municipality has designated evacuation zones A, B, and C based on hazard type and severity. Zone maps are reviewed annually, updated following any boundary change, and publicly available on the municipal website and at ward offices. Zone-specific routes and assembly points are signposted in the field.'),
        list([
          'Zone A (highest risk): immediate mandatory evacuation at Alert Level 3',
          'Zone B (moderate risk): precautionary evacuation at Alert Level 3; mandatory at Alert Level 4',
          'Zone C (lower risk): shelter-in-place or voluntary evacuation; monitor closely',
          'Zone maps: GIS-linked; updated after each significant event or spatial change',
          'Assembly points: minimum 2 per zone; mapped, signposted, and communicated pre-season'
        ])
      ]
    },
    {
      key: 'vulnerable_persons_evacuation',
      title: 'Vulnerable Persons Evacuation Assistance',
      blocks: [
        text('A pre-identified list of persons requiring evacuation assistance is maintained by Social Development and DRM. Ward-based volunteers are assigned to each registered household for evacuation assistance. Accessible transport is pre-arranged for each identified person and medical transport through EMS for those requiring clinical care during transit.'),
        list([
          'Register maintained by: Social Development in partnership with DRM Centre',
          'Update frequency: annually and after any significant change in household status',
          'Ward volunteer assignment: 1 volunteer per maximum 5 registered households',
          'Contact protocol: ward volunteer calls registrant upon Alert Level 2 activation',
          'Accessible transport: pre-booked per season; confirmed available by pre-season readiness check',
          'Medical transport: coordinated with EMS for persons with active medical needs'
        ])
      ]
    },
    {
      key: 'transport_fleet',
      title: 'Evacuation Transport Fleet',
      blocks: [
        text('The evacuation transport fleet is verified as operationally ready at the start of each season and upon activation. Fuel is pre-positioned at the municipal depot. Driver callout procedure is activated by the DRM Centre upon Alert Level 2.'),
        table(['Vehicle Type', 'Quantity', 'Passenger Capacity', 'Operator / Department', 'Depot Location', 'Contact'])
      ]
    },
    {
      key: 're_entry_criteria',
      title: 'Re-Entry Criteria and Procedures',
      blocks: [
        text('Re-entry to evacuated areas is authorised by the Incident Commander only, upon confirmation of all clearance criteria. Re-entry is staged: emergency services first, then residents, then general public. A re-entry checkpoint is established at the zone boundary.'),
        list([
          'Hazard passed and area confirmed safe by specialist assessment',
          'Structural assessment completed by Building Inspectorate — no unsafe structures without barricading',
          'Utilities (water, electricity) restored or confirmed safe to occupy without',
          'Environmental health clearance issued by EHP (water quality, contamination check)',
          'SAPS has cleared the area for safety — no ongoing security risk',
          'Re-entry announcement: communicated on all channels minimum 2 hours before opening'
        ])
      ]
    },
    {
      key: 'pets_livestock',
      title: 'Pets and Livestock Management During Evacuation',
      blocks: [
        text('SPCA and relevant agricultural authority (DALRRD) are pre-notified upon Alert Level 2 activation. A designated animal shelter location is identified for each evacuation zone. Emergency animal welfare incidents are managed by the municipality in partnership with the SPCA and DALRRD.'),
        list([
          'SPCA activation: Alert Level 2 notification — contact in Emergency Contact Register',
          'Companion animal shelter: designated site per evacuation zone — listed in Shelter Register',
          'Livestock evacuation routes: agreed with farmers in high-risk zones pre-season',
          'Livestock water and feed: DALRRD coordinates emergency provision during extended evacuations',
          'No companion animals allowed in human evacuation shelters (SPHERE and health compliance)',
          'Post-event: animal reunification process managed by SPCA with DRM coordination'
        ])
      ]
    }
  ],

  shelter: [
    {
      key: 'shelter_site_register',
      title: 'Approved Shelter Site Register',
      blocks: [
        text('Sites are inspected pre-season and rated by the DRM Centre. Minimum requirements: 3.5m² covered floor space per person (SPHERE), adequate ablution facilities, vehicle access for supply deliveries, and proximity to a water source. Site managers are pre-designated and trained annually.'),
        table(['Site Name', 'Address / Ward', 'Capacity (persons)', 'Wheelchair Accessible', 'Ablutions', 'Water Source', 'Site Manager', 'Contact'])
      ]
    },
    {
      key: 'site_management',
      title: 'Shelter Site Management Protocols',
      blocks: [
        text('Registration of all displaced persons is conducted upon arrival using the official displaced persons database form. Registration data feeds into the official system for SASSA grant access and post-disaster recovery tracking.'),
        list([
          'Registration: every displaced person registered on arrival — name, ID, ward of origin, special needs',
          'Security: SAPS or contracted security at each site; separate sleeping areas for single men, families, vulnerable persons',
          'Hygiene: EHP inspection within 6 hours of opening; cleaning schedule maintained; hygiene kits distributed to all households',
          'Psychosocial: DSD social workers deployed to all sites with > 50 persons; trauma counselling referral pathway established',
          'Food: culturally appropriate rations; minimum 2,100 kcal per person per day (SPHERE)',
          'Daily site report: submitted by Site Manager to DRM Centre — occupancy, incidents, needs'
        ])
      ]
    },
    {
      key: 'sphere_standards',
      title: 'SPHERE Humanitarian Standards Compliance',
      blocks: [
        text('This plan aligns to SPHERE Handbook minimum standards. Compliance is assessed by the EHP and reported in each Sitrep.'),
        list([
          'Space: minimum 3.5m² covered space per person in collective shelter',
          'Water: minimum 15 litres per person per day for all uses',
          'Sanitation: 1 toilet per 20 persons; separate facilities for men and women; maintained hygienically',
          'Food: nutritionally adequate rations (minimum 2,100 kcal/person/day); cultural and dietary needs considered',
          'Health: health post within 1 hour travel of site; referral pathway to nearest hospital established',
          'Protection: safe and private spaces for women, girls, and vulnerable persons'
        ])
      ]
    },
    {
      key: 'shelter_exit_strategy',
      title: 'Shelter Exit Strategy',
      blocks: [
        text('Displaced persons exit emergency shelter through one of three pathways. No persons may be evicted from an emergency shelter without a confirmed onward pathway. Exit is managed by the Site Manager in coordination with Human Settlements and DSD.'),
        list([
          'Pathway 1 — Return home: when re-entry criteria are met and home is structurally safe',
          'Pathway 2 — Transitional shelter: TRU deployment via Human Settlements for destroyed or severely damaged homes',
          'Pathway 3 — Permanent relocation: for households in high-risk zones; managed by Human Settlements with DSD support',
          'Exit timeline: planned with each household from day 7 of shelter occupation',
          'Vulnerable persons: exit pathway confirmed with DSD before departure from shelter',
          'Site closure: deregistration of all occupants; site restoration to pre-use condition'
        ])
      ]
    }
  ],

  communication: [
    {
      key: 'stakeholder_notification_matrix',
      title: 'Stakeholder Notification Matrix',
      blocks: [
        text('All notifications are logged with timestamp, method, recipient, and confirmation of receipt. The duty officer is responsible for all notifications below Alert Level 3. The Head of DRM assumes notification responsibility from Alert Level 3 upwards.'),
        table(['Stakeholder', 'Notification Method', 'Responsible Officer', 'Timeframe', 'Confirmation Required'])
      ]
    },
    {
      key: 'public_warning',
      title: 'Public Warning System',
      blocks: [
        text('Warning messages are issued in the three most widely spoken languages in the municipality. All messages follow the standard format: what the hazard is, which areas are affected, what people should do, where to go for help, and who to call. Messages are clear, concise, and free of technical jargon.'),
        list([
          'Municipal SMS broadcast: registered community members — managed by DRM Centre',
          'Community radio: [list stations] — pre-agreed broadcast protocol; bulletin within 1 hour',
          'Municipal website: emergency banner within 30 minutes of Alert Level 2',
          'Social media: official accounts only; approval by spokesperson before posting',
          'Ward councillor WhatsApp broadcast: ward-level reach — within 30 minutes',
          'Public address vehicles: informal settlements — deployed from Alert Level 2 in high-risk areas',
          'Siren network: where installed — [locations and activation authority]'
        ])
      ]
    },
    {
      key: 'media_liaison',
      title: 'Media Liaison and Spokesperson Protocol',
      blocks: [
        text('One designated spokesperson is authorised per incident. All media requests are routed through Corporate Communications. Field personnel may not speak to media. Press briefings are held at scheduled intervals during major incidents at a designated media briefing point safely removed from the operational area.'),
        list([
          'Designated spokesperson: [Title] — authorised by Municipal Manager on activation',
          'Backup spokesperson: [Title] if primary is unavailable',
          'Media briefing frequency: every 6 hours during major incidents; daily during sustained events',
          'Media briefing point: designated location separate from JOC and operational area',
          'Social media monitoring: dedicated monitor during Alert Level 2+ to identify and correct misinformation',
          'No on-scene interviews: SAPS enforces media exclusion at operational perimeter'
        ])
      ]
    },
    {
      key: 'social_media_monitoring',
      title: 'Social Media Monitoring and Rumour Management',
      blocks: [
        text('A dedicated social media monitor is deployed during Alert Level 2+ activations. Rumours and misinformation are identified, assessed, and corrected within 1 hour via official channels. All official posts require approval from the designated spokesperson before publication.'),
        list([
          'Platforms monitored: Facebook, X (Twitter), WhatsApp public groups, community forums',
          'Rumour identification: monitor flags to spokesperson within 30 minutes of identifying misinformation',
          'Correction protocol: official correction posted within 1 hour; SAPS informed if panic-inducing',
          'Monitoring hours: 24/7 during active incidents; 8-hour shifts during Alert Level 2 watch',
          'Archive: all social media monitoring logs retained for post-incident review'
        ])
      ]
    },
    {
      key: 'backup_comms',
      title: 'Backup Communications Systems',
      blocks: [
        text('All backup systems are tested monthly. Test logs are maintained in the DRM operations file. Failure of primary communications triggers immediate switchover to backup systems.'),
        table(['System', 'Type', 'Coverage', 'Location', 'Monthly Test Date', 'Responsible Officer'])
      ]
    }
  ],

  logistics: [
    {
      key: 'supply_chain',
      title: 'Emergency Supply Chain Management',
      blocks: [
        text('Emergency procurement is activated under MFMA Regulation 36 when the urgency of the situation prevents normal procurement processes. All emergency procurement must be authorised by the CFO and documented with full audit trail. Pre-approved supplier lists for common disaster relief commodities are maintained and reviewed annually.'),
        list([
          'Pre-approved supplier list: maintained by Supply Chain; reviewed annually before each season',
          'Commodities on pre-approved list: food parcels, blankets, tarpaulins, bottled water, hygiene kits, sandbags',
          'Emergency procurement authorisation: CFO written approval required within 24 hours of verbal authorisation',
          'Maximum procurement period under Reg. 36: as determined by CFO — full tender on any extension',
          'Audit trail: all emergency procurement documented and submitted to Auditor-General on request'
        ])
      ]
    },
    {
      key: 'staging_areas',
      title: 'Staging Area Locations',
      blocks: [
        text('Staging areas are identified on the response map and communicated to all agencies at JOC activation. Areas are pre-inspected for access, security, and storage suitability before each season.'),
        table(['Staging Area', 'Address / Ward', 'Floor Area (m²)', 'Vehicle Access', 'Security', 'Power Supply', 'Custodian'])
      ]
    },
    {
      key: 'commodity_tracking',
      title: 'Relief Commodity Tracking and Distribution',
      blocks: [
        text('All commodities are tracked from receipt through distribution using the official commodity register. A chain-of-custody record is maintained for each commodity type. Distribution is needs-based, prioritising the most vulnerable households. Post-distribution monitoring visits confirm commodities reached intended recipients. Distribution records are retained for a minimum of 5 years for audit purposes.'),
        table(['Commodity', 'Quantity Received', 'Source', 'Distribution Point', 'Quantity Distributed', 'Date', 'Signature'])
      ]
    },
    {
      key: 'volunteer_management',
      title: 'Volunteer Management',
      blocks: [
        text('Municipal volunteers are recruited, vetted, and registered in accordance with the DMA Volunteer Regulations (Government Notice R.878 of 2010). Deployment is through the DRM Centre only; volunteers may not self-deploy.'),
        list([
          'Registration: all volunteers registered in the municipal volunteer database; ID verified',
          'Vetting: criminal record check required for all registered volunteers',
          'Training: minimum 8 hours annual training per volunteer — aligned to NDMC volunteer curriculum',
          'Deployment: authorised by DRM Centre duty officer; volunteers assigned to team leader',
          'Welfare during deployment: food, water, PPE, and accidental injury cover provided by DRM Centre',
          'Post-deployment: debrief and incident record within 48 hours; welfare follow-up for trauma exposure'
        ])
      ]
    }
  ],

  damage_assessment: [
    {
      key: 'rapid_assessment_methodology',
      title: 'Rapid Damage Assessment Methodology',
      blocks: [
        text('Rapid assessments use the NDMC standard Damage and Needs Assessment (DNA) form, adapted for this municipality. Assessment teams of 2–4 persons (minimum: engineer + EHP or social worker) are deployed within 6 hours. GIS-captured data is mapped and included in the first Sitrep to PDMC.'),
        list([
          'DNA Form: NDMC standard form adapted for municipal context — available in printed and digital format',
          'Team composition: structural engineer + EHP or social worker; GIS officer for mapping',
          'Deployment timeline: teams dispatched within 6 hours of incident',
          'Compilation: sector leads compile sub-assessments; DRM Centre consolidates within 24 hours',
          'Submission: consolidated DNA submitted to PDMC within 24 hours of field deployment'
        ])
      ]
    },
    {
      key: 'sector_teams',
      title: 'Sector Assessment Teams',
      blocks: [
        text('Sector teams are pre-designated and briefed at the start of each hazard season. All sector leads must attend the pre-season readiness briefing.'),
        table(['Sector', 'Lead Department', 'Support Agency', 'Team Size', 'Assessment Tool', 'Reporting Deadline'])
      ]
    },
    {
      key: 'pdna',
      title: 'Post-Disaster Needs Assessment (PDNA)',
      blocks: [
        text('For significant events (classified disasters), a full PDNA is conducted within 14 days using the prescribed national methodology. The PDNA informs disaster grant applications and long-term reconstruction planning. The PDNA is led by the municipality with support from the PDMC and relevant sector departments. Community participation is an integral component of the PDNA process.'),
        list([
          'Initiation authority: Head of DRM upon disaster classification by NDMC',
          'Timeline: initiated within 14 days; draft submitted to PDMC within 30 days',
          'Methodology: national PDNA methodology (aligned to PDNA Global Handbook)',
          'Sectors assessed: housing, infrastructure, livelihoods, agriculture, health, education',
          'Community participation: ward-level consultation sessions included in methodology',
          'Output: PDNA report used for disaster recovery grant application to COGTA/National Treasury'
        ])
      ]
    }
  ],

  public_health: [
    {
      key: 'disease_surveillance',
      title: 'Disease Surveillance and Notifiable Conditions',
      blocks: [
        text('Environmental Health Practitioners (EHPs) conduct active disease surveillance during and following disaster events. All notifiable medical conditions (NMCs) are reported to the NICD within 24 hours as required by the National Health Act. Watch priorities during disaster events are listed below.'),
        list([
          'Post-flood: cholera, typhoid, hepatitis A (waterborne risk), leptospirosis, skin infections',
          'Shelter conditions: acute respiratory illness, measles, meningitis (overcrowding risk)',
          'Post-drought / water shortage: diarrhoeal disease, cholera',
          'Vector-borne (endemic areas): malaria, dengue fever — surveillance intensified post-flood',
          'NICD notification: all NMCs reported within 24 hours — hotline 0800 111 131',
          'Weekly EHP surveillance report submitted to Head of DRM and Municipal Health Services'
        ])
      ]
    },
    {
      key: 'mass_casualty',
      title: 'Mass Casualty Management',
      blocks: [
        text('A Mass Casualty Incident (MCI) is declared by the on-scene EMS commander when casualties exceed the capacity of deployed EMS resources. MCI protocols follow the START triage system.'),
        list([
          'MCI declaration: on-scene EMS commander in consultation with Incident Commander',
          'START triage: immediate (red), delayed (yellow), minor (green), deceased (black)',
          'Hospital surge: nearest Level 2/3 hospital placed on Major Incident standby immediately',
          'Additional EMS: requested through PDMC EMS coordinator upon MCI declaration',
          'SANDF medical: requested if civilian EMS capacity insufficient — through NDMC',
          'Family reunification centre: activated at designated location within 2 hours of MCI',
          'No casualty information released until next-of-kin notification in progress'
        ])
      ]
    },
    {
      key: 'vector_control',
      title: 'Vector Control Operations',
      blocks: [
        text('Following flood events or during shelter operations, vector control is conducted by EHPs. All insecticides used comply with WHO-approved formulations. Community education on vector prevention forms part of every public health response.'),
        list([
          'Trigger: standing water, rodent activity, or confirmed vector-borne disease cluster',
          'Indoor residual spraying: EHP authorisation required; residents notified 24 hours in advance',
          'Larval source reduction: stagnant water drainage and treatment within 48 hours of flood recession',
          'Rodent control: snap traps and bait stations at all shelter sites from day 3 of occupation',
          'Community education: vector prevention messaging distributed with relief commodities'
        ])
      ]
    },
    {
      key: 'pharmaceutical_stockpile',
      title: 'Essential Medicine and Pharmaceutical Stockpile',
      blocks: [
        text('The municipality and provincial DOH jointly maintain an emergency pharmaceutical stockpile. Cold chain integrity is maintained at all times. Stockpile access is restricted to authorised health personnel.'),
        list([
          'Stockpile contents: oral rehydration salts, antibiotics, wound care supplies, analgesics, chronic disease medication (90-day buffer)',
          'Cold chain items: vaccines, insulin — maintained at 2–8°C; temperature monitored continuously',
          'Replenishment cycle: quarterly — verified by HOD Health before each season',
          'Access authority: HOD Health or designated EHP manager',
          'Stockpile location: [Address — restricted to authorised personnel]',
          'Provincial top-up: DOH emergency pharmacist on call for stockpile resupply during activations'
        ])
      ]
    }
  ],

  // ── EVENT ─────────────────────────────────────────────────────────────────

  mass_gathering: [
    {
      key: 'event_classification',
      title: 'Event Classification and Risk Rating',
      blocks: [
        text('All events above 500 persons must be registered with the municipal DRM Centre minimum 30 days before the event (Large and Major events: minimum 60 days). Failure to register is an offence under municipal by-law.'),
        table(['Class', 'Attendance', 'Registration Lead Time', 'DRM Action Required', 'Approval Authority'])
      ]
    },
    {
      key: 'venue_risk_assessment',
      title: 'Venue Risk Assessment',
      blocks: [
        text('Venue risk assessments are conducted for all Medium and above events by the DRM Centre in consultation with Fire & Rescue, Building Inspections, and EMS. Assessments must be completed and signed off minimum 7 days before the event.'),
        list([
          'Structural capacity: current occupancy certificate and structural engineer sign-off',
          'Ingress/egress: crowd flow modelling required for events > 5,000 — entry/exit per minute capacity calculated',
          'Emergency vehicle access: minimum 4m clear access lane to all event zones at all times',
          'Proximity to trauma hospital: drive time assessment; pre-notification protocol confirmed',
          'Weather exposure: outdoor events require weather contingency plan (shelter, cancellation thresholds)',
          'Alcohol licensing: high-risk modifier applied to all events with unrestricted alcohol sales'
        ])
      ]
    },
    {
      key: 'crowd_crush_protocol',
      title: 'Crowd Crush Prevention and Response Protocol',
      blocks: [
        text('Crowd density monitoring is maintained throughout all Large and Major events. Upon crowd crush declaration, immediate EMS deployment is activated, the zone is evacuated, and the Incident Commander assumes full operational control of the affected zone. No communications to media until casualties are confirmed and next-of-kin notification is in progress.'),
        list([
          '4 persons/m²: Warning threshold — crowd flow intervention; open additional access gates',
          '5 persons/m²: Critical threshold — zone closure activated; dispersal announcement made',
          '6+ persons/m²: Emergency — crowd crush protocol declared; full zone evacuation',
          'Monitoring method: CCTV + designated crowd safety stewards at 1 per 250 persons',
          'Communication to crowd: calm, clear announcements via PA system — no words that cause panic',
          'Post-incident: SAPS scene preservation; independent crowd safety investigation'
        ])
      ]
    },
    {
      key: 'ems_ratios',
      title: 'EMS Staffing Ratios and Pre-hospital Care',
      blocks: [
        text('EMS deployment ratios follow HPCSA guidelines. Pre-hospital care area (PHA) is established with clear signage and a direct ambulance access corridor kept clear throughout the event.'),
        list([
          '1 ALS (Advanced Life Support) unit per 10,000 attendees',
          '1 BLS (Basic Life Support) unit per 5,000 attendees',
          '1 dedicated medical command post per event > 10,000 attendees',
          'PHA location: pre-identified and communicated to all event staff before opening',
          'Ambulance access corridor: minimum 4m wide; stewarded to prevent obstruction',
          'Hospital pre-notification: MCI threshold agreed with nearest Level 2/3 trauma hospital before event'
        ])
      ]
    }
  ],

  election: [
    {
      key: 'iec_coordination',
      title: 'IEC and Electoral Operations Coordination',
      blocks: [
        text('The municipality coordinates with the Independent Electoral Commission (IEC) from six weeks before polling day. The DRM Centre participates in the IEC Joint Operations Committee (JOC) established for the election period. Municipal responsibilities include ensuring unimpeded access to voting stations, managing infrastructure issues, and coordinating emergency services for any incident.'),
        list([
          'IEC JOC participation: mandatory from 6 weeks pre-election',
          'Municipal election coordinator: designated by Municipal Manager — contact in Emergency Contact Register',
          'Voting station facilities: access confirmed for persons with disabilities; ablutions verified',
          'Election day on-call: DRM Centre staffed 24/7 from eve of polling to results declaration',
          'Incident reporting: all incidents at voting stations reported to IEC JOC and DRM Centre within 30 minutes'
        ])
      ]
    },
    {
      key: 'voting_station_risk',
      title: 'Voting Station Risk Assessment',
      blocks: [
        text('Each voting station is assessed by the DRM Centre in the pre-election period. Stations identified as higher risk receive enhanced monitoring and dedicated EMS standby. Assessments are submitted to the IEC JOC.'),
        table(['Station Name', 'Ward', 'Expected Voters', 'Structural Risk', 'Access Risk', 'Crowd Risk', 'Communication Coverage', 'Risk Rating', 'Enhanced Monitoring?'])
      ]
    },
    {
      key: 'results_centre_security',
      title: 'Results Centre Security and Access Control',
      blocks: [
        text('SAPS has primary responsibility for results centre security. Municipal DRM supports with infrastructure management, fire safety compliance, and emergency response capacity. Access control is managed by SAPS with IEC accreditation.'),
        list([
          'Accreditation: IEC accreditation required for all personnel entering the results centre',
          'SAPS perimeter: established from start of results counting until final results declared',
          'Fire safety: Fire & Rescue inspection of results centre completed before counting commences',
          'EMS standby: 1 BLS unit on-site at results centre throughout counting period',
          'Media zone: designated media area outside security perimeter; no access without IEC media accreditation',
          'Power supply: backup generator confirmed operational before counting commences'
        ])
      ]
    }
  ],

  protest_unrest: [
    {
      key: 'intelligence_liaison',
      title: 'Intelligence and Threat Assessment Liaison',
      blocks: [
        text('The DRM Centre maintains liaison with the SAPS Joint Intelligence Centre (JIC) during periods of elevated social tension. Threat assessments inform the activation level of this plan. All intelligence information is treated as restricted and is not shared externally without SAPS authorisation.'),
        list([
          'SAPS JIC: contact through SAPS Station Commander or Crime Intelligence — details in Emergency Contact Register',
          'Threat level receipt: DRM Centre notified of elevated threat level by SAPS JIC',
          'Pre-activation monitoring: DRM Centre on watch from threat level notification',
          'Information handling: restricted classification — internal DRM team only',
          'Intelligence sharing: between SAPS, Metro Police, and DRM Centre only'
        ])
      ]
    },
    {
      key: 'infrastructure_protection',
      title: 'Critical Infrastructure Protection',
      blocks: [
        text('During unrest events, critical infrastructure sites are prioritised for protection and placed on heightened security. Protection is coordinated with SAPS, SANDF (if deployed), and the infrastructure operators. Facility lock-down procedures are activated upon DRM instruction.'),
        list([
          'Tier 1 (immediate): water treatment works and pump stations, hospitals and clinics, emergency services facilities',
          'Tier 2 (high): electrical substations and main supply lines, telecommunications infrastructure, municipal administrative buildings',
          'Tier 3 (elevated): schools, libraries, community centres, sports facilities',
          'Lock-down trigger: Head of DRM instruction upon confirmed Tier 1 threat',
          'SANDF request: through NDMC — only when SAPS capacity is exceeded'
        ])
      ]
    },
    {
      key: 'post_unrest_assessment',
      title: 'Post-Unrest Damage Assessment',
      blocks: [
        text('Once SAPS has declared an area safe, a rapid damage assessment is initiated using the standard DNA methodology. The assessment informs municipal restoration and insurance claim processes.'),
        list([
          'Area safety clearance: SAPS Station Commander issues clearance before any DRM or civilian entry',
          'Assessment timeline: teams deployed within 2 hours of safety clearance',
          'Priority assessment: roads, public facilities, health facilities, utility systems',
          'Insurance documentation: photographic evidence and repair cost estimates captured simultaneously',
          'Restoration prioritisation: essential services first; public infrastructure second; general municipal assets third'
        ])
      ]
    },
    {
      key: 'community_dialogue',
      title: 'Community Dialogue and De-escalation Protocol',
      blocks: [
        text('The municipality, through ward councillors and the Office of the Speaker, maintains community dialogue structures. During escalating tension, community dialogue is initiated proactively. De-escalation is a primary objective. The use of force by law enforcement is a last resort.'),
        list([
          'Ward councillor engagement: immediate upon intelligence of elevated tension',
          'Community leaders: traditional authorities, civic organisations, faith leaders contacted within 2 hours',
          'SAPS Community Policing Forum: activated as primary community interface',
          'Municipal ombudsman / complaints channel: publicised prominently during tension periods',
          'Service delivery response: where unrest is service-delivery-linked, relevant department head attends community meeting within 48 hours',
          'De-escalation debrief: within 7 days of incident — lessons learnt documented'
        ])
      ]
    }
  ],

  vip_visit: [
    {
      key: 'vip_protection_liaison',
      title: 'VIP Protection Unit Liaison',
      blocks: [
        text('VIP protection is the primary responsibility of the SAPS VIP Protection Unit. The municipality\'s role is supportive: infrastructure management, public space management, and emergency medical standby. The municipal DRM Centre receives a briefing from SAPS minimum 5 days before the visit and is integrated into the SAPS JOC for the duration.'),
        list([
          'SAPS VIP Protection: primary command and protection authority throughout visit',
          'Municipal DRM: supporting role — infrastructure, public space, EMS, crowd management',
          'SAPS briefing: received minimum 5 days pre-visit; DRM attendance mandatory',
          'Information classification: visit details treated as restricted until publicly announced',
          'JOC integration: Municipal DRM representative joins SAPS JOC from briefing to debrief'
        ])
      ]
    },
    {
      key: 'route_security',
      title: 'Route Security and Contingency Routing',
      blocks: [
        text('Primary, secondary, and tertiary VIP routes are identified by SAPS with municipal input. Municipal Traffic and Roads departments implement road closures and diversions. DRM Centre ensures emergency vehicle access is maintained at all points along all route options throughout the visit.'),
        list([
          'Route survey: joint SAPS + Municipal Traffic survey minimum 3 days pre-visit',
          'Road closures: gazetted and communicated to public minimum 24 hours before visit',
          'Emergency access: ambulance and fire routes independent of VIP route maintained at all times',
          'Contingency route activation: SAPS decision within JOC — municipal traffic implements within 15 minutes',
          'Road infrastructure: any defects on VIP routes repaired minimum 48 hours before visit'
        ])
      ]
    },
    {
      key: 'medical_support',
      title: 'VIP Event Medical Support Plan',
      blocks: [
        text('A dedicated EMS team is pre-positioned along the VIP route. The nearest designated trauma hospital is pre-notified of the visit date, route, and standby requirements. An air-capable EMS unit is on standby if the risk profile warrants aerial medical evacuation capability.'),
        list([
          'Dedicated EMS: minimum 1 ALS unit per VIP movement — pre-positioned at midpoint of route',
          'Hospital pre-notification: nearest Level 2/3 trauma hospital on standby throughout visit',
          'Aerial EMS: risk-based decision by SAPS — requested through provincial EMS if required',
          'Medical briefing: EMS team briefed by SAPS on specific medical requirements of the VIP',
          'Debrief: medical commander submits report to SAPS JOC and DRM Centre within 24 hours'
        ])
      ]
    }
  ],

  major_incident: [
    {
      key: 'major_incident_declaration',
      title: 'Major Incident Declaration Criteria and Process',
      blocks: [
        text('A major incident is declared by the Incident Commander when the incident involves multiple fatalities or critical casualties, requires multiple agencies simultaneously, has potential for escalation beyond municipal capacity, or has significant media and public impact. Declaration is communicated immediately to the Municipal Manager, Head of DRM, PDMC, SAPS, and EMS. A unified command is established within 30 minutes of declaration.'),
        list([
          'Declaration authority: Incident Commander (field) or Head of DRM (from DOC)',
          'Mandatory notifications upon declaration: Municipal Manager, PDMC, SAPS, EMS, relevant HODs',
          'Notification timeline: within 15 minutes of declaration',
          'Unified Command setup: within 30 minutes of declaration at designated command post location',
          'Escalation to disaster: Head of DRM recommends to Municipal Manager if incident exceeds municipal capacity'
        ])
      ]
    },
    {
      key: 'unified_command',
      title: 'Unified Command Structure',
      blocks: [
        text('Upon major incident declaration, a Unified Command is established with five sections. All section chiefs report to the Incident Commander. No section may commit resources or make public statements without IC authorisation.'),
        list([
          'Incident Commander (IC): Senior official from lead agency for the incident type',
          'Planning Section: situation analysis, resource tracking, documentation, Sitrep production',
          'Operations Section: all operational resources — SAR, EMS, fire, police',
          'Logistics Section: resources, supply, communications, facilities, transport',
          'Finance/Admin Section: cost tracking, emergency procurement, legal, personnel records',
          'Public Information Officer: designated spokesperson — reports to IC; media briefings only'
        ])
      ]
    },
    {
      key: 'family_reunification',
      title: 'Family Reunification Centre',
      blocks: [
        text('A Family Reunification Centre (FRC) is established within 2 hours of a major incident involving missing or unaccounted persons. No information about casualties is released at the FRC until next-of-kin notification has been completed. FRC is managed by Social Development with multi-agency support.'),
        list([
          'FRC location: [designated location] — communicated via media within 1 hour of activation',
          'Lead agency: Department of Social Development — DSD social workers manage FRC operations',
          'Support agencies: SAPS (missing persons register), Home Affairs (identity verification), NGO welfare services',
          'Information protocol: no casualty names or details released until SAPS confirms next-of-kin notification',
          'Psychosocial support: trauma counsellors deployed at FRC from opening',
          'Media exclusion: FRC is a media-free zone; spokesperson provides updates outside the FRC perimeter'
        ])
      ]
    },
    {
      key: 'fatality_management',
      title: 'Fatality Management',
      blocks: [
        text('Fatality management is the primary responsibility of SAPS and the Government Mortuary. The DRM Centre coordinates access routes for the Government Mortuary vehicle and ensures scene preservation until authorised by SAPS. Deceased persons may not be moved or removed from the scene without SAPS authorisation and scene documentation.'),
        list([
          'Scene preservation: SAPS cordons scene; no movement of deceased without SAPS authorisation',
          'Forensic Pathology Service: notified by SAPS for all unnatural deaths — attend scene',
          'Government Mortuary: SAPS coordinates body transportation; DRM secures access route',
          'Mass fatality: Disaster Victim Identification (DVI) team requested through SAPS for > 5 fatalities',
          'Next-of-kin: SAPS Family Violence, Child Protection and Sexual Offences unit leads notification',
          'Dignity: DRM ensures scene area is appropriately secured from public view throughout'
        ])
      ]
    }
  ],

  // ── SEASONAL ──────────────────────────────────────────────────────────────

  winter: [
    {
      key: 'cold_snap_thresholds',
      title: 'Cold Snap Alert Levels and Response Thresholds',
      blocks: [
        text('Temperature thresholds may be adjusted downward where wind chill factor is significant. Thresholds are reviewed annually against provincial weather patterns.'),
        table(['Forecast Temperature', 'Wind Chill Adjusted', 'Alert Level', 'Key Response Actions', 'Activation Authority'])
      ]
    },
    {
      key: 'homeless_cold_weather',
      title: 'Homeless Cold Weather Response',
      blocks: [
        text('The municipality, in partnership with DSD and NGOs, operates a cold weather shelter programme. Shelters open when forecast minimum temperature drops below 2°C. Municipal Law Enforcement and DSD outreach workers are deployed to known homeless concentrations to offer transport to shelters. No person is forced into a shelter.'),
        list([
          'Shelter locations and capacities: maintained in Approved Shelter Site Register — winter section',
          'Opening trigger: forecast minimum temperature < 2°C (or lower with wind chill)',
          'Outreach deployment: Law Enforcement + DSD workers — minimum 2 teams per Alert Level 1 night',
          'Known homeless locations: mapped by DSD and ward volunteers; updated monthly',
          'Transport: municipal vehicle for mobility-impaired homeless persons to shelter',
          'Capacity overflow: NGO overflow shelter agreements activated if municipal sites at capacity'
        ])
      ]
    },
    {
      key: 'informal_settlement_fire',
      title: 'Informal Settlement Winter Fire Response',
      blocks: [
        text('Winter months see increased fire risk in informal settlements due to reliance on candles, paraffin stoves, and open fires for heating. Fire & Rescue increases patrols in identified high-risk settlements during cold periods. All informal settlement fires must be reported to the DRM Centre within 1 hour.'),
        list([
          'Fire patrols: Fire & Rescue units patrol identified high-risk settlements from Alert Level 1 nights',
          'Community fire watches: ward-based volunteers on overnight watch rotation in highest-risk settlements',
          'Pre-positioned equipment: fire extinguishers and hose reels at ward-level storage per high-risk settlement',
          'Community awareness: annual pre-winter fire safety campaign — safe heating, candle safety',
          'Rapid response: Fire & Rescue response target for informal settlement fires = 8 minutes',
          'Post-fire: immediate tarpaulin deployment by Human Settlements; TRU assessment within 24 hours'
        ])
      ]
    },
    {
      key: 'snow_ice_protocols',
      title: 'Snow and Ice Road Management',
      blocks: [
        text('Applicable to municipalities in mountainous regions (Western Cape passes, Eastern Cape highlands, KZN Drakensberg, Northern Cape). Mountain passes are monitored daily during winter. Road closure decisions are made by the Roads Department in coordination with SANRAL and SAPS.'),
        list([
          'Pass monitoring: daily temperature and road surface check from 1 May to 31 August',
          'Closure authority: Roads Department HOD in consultation with SAPS Traffic',
          'Closure communication: all channels within 30 minutes of closure decision',
          'Gritting routes: gritting schedule and stockpile locations confirmed pre-season',
          'Gritter deployment: triggered when road surface temperature drops below 0°C (or forecast < 2°C)',
          'Stranded motorist protocol: SAPS coordinates assistance; DRM Centre provides shelter information'
        ])
      ]
    }
  ],

  summer: [
    {
      key: 'heat_health_action',
      title: 'Heat Health Action Plan',
      blocks: [
        text('Heat wave thresholds are issued by SAWS as part of the impact-based warning system. Upon heat watch or warning, targeted interventions are activated for vulnerable populations. Heat wave fatalities are reported to the NICD and included in the post-season debrief.'),
        list([
          'Heat watch: DRM team briefed; vulnerable population register reviewed; cooling centres placed on standby',
          'Heat warning (Yellow): public advisory issued; cooling centres opened; elderly persons contacted by ward volunteers',
          'Heat warning (Orange/Red): proactive welfare checks on all registered vulnerable persons; water distribution at public facilities increased; EMS on heightened standby',
          'Cooling centres: libraries, community centres, shopping centres — list confirmed pre-season',
          'Heat fatalities: reported to NICD within 24 hours; post-season debrief captures heat mortality data'
        ])
      ]
    },
    {
      key: 'drowning_prevention',
      title: 'Drowning Prevention Programme — Summer Season',
      blocks: [
        text('Drowning is one of the leading causes of unintentional injury deaths in South Africa during summer. The municipality operates a structured drowning prevention programme in partnership with NSRI and Lifesaving SA.'),
        list([
          'NSRI partnership: formal MOU; joint pre-season planning meeting by October each year',
          'Lifeguard coverage: all managed beaches and dams — operational from December to end of March',
          'Warning flag system: green/yellow/red/purple flags at all guarded swimming areas',
          'School water safety programme: delivered pre-December to all municipal schools near water bodies',
          'Unguarded swimming areas: hazard signs maintained; ward volunteers conduct awareness in surrounding communities',
          'Drowning statistics: captured in incident log; submitted to NICD and NSRI post-season'
        ])
      ]
    },
    {
      key: 'veld_fire_summer_readiness',
      title: 'Summer Veld Fire Readiness',
      blocks: [
        text('Summer conditions (high temperatures, low humidity, dry vegetation) increase veld fire risk significantly. Summer fire readiness is maintained in addition to the fire season plan, with elevated monitoring during heat wave periods.'),
        list([
          'Daily NFDRS check: fire danger index monitored from 1 October to 30 April',
          'Fire risk communication: NFDRS rating published on municipal website and social media daily during high-risk periods',
          'WoF pre-positioning: confirmed available with DFFE before December peak season',
          'Heat + fire compound risk: Alert Level raised by 1 when SAWS heat warning coincides with Very High fire danger'
        ])
      ]
    }
  ],

  festive_season: [
    {
      key: 'inter_agency_ops',
      title: 'Inter-Agency Festive Season Operations Plan',
      blocks: [
        text('The municipality participates in the provincial Safer Festive Season Operation coordinated by SAPS, RTMC, and PDMC. An inter-agency operations plan is developed by November each year and activated on 1 December.'),
        list([
          'Key agencies in festive JOC: SAPS, Municipal/Metro Traffic, EMS, Fire & Rescue, Social Development, Environmental Health, Tourism, DRM Centre',
          'Festive JOC activation: 1 December — deactivation: 7 January',
          'Operations centre: [location] — staffed 24/7 from activation to deactivation',
          'RTMC: road safety coordination, accident statistics, early warning on high-accident routes',
          'NDMC notification: DRM Centre notifies PDMC of festive season ops plan activation by 25 November'
        ])
      ]
    },
    {
      key: 'road_safety',
      title: 'Road Safety Coordination',
      blocks: [
        text('The municipality coordinates with the Road Traffic Management Corporation (RTMC) and the Arrive Alive campaign during the festive period. Traffic calming at key tourist and exit route intersections is activated for the festive period.'),
        list([
          'RTMC partnership: joint operations plan; daily statistics sharing during festive period',
          'Arrive Alive campaign: municipal participation with roadblocks, speed enforcement, alcohol testing',
          'High-accident routes: pre-identified per historical data; enhanced SAPS Traffic presence',
          'Traffic calming: speed humps and signage verified operational on high-speed approach routes',
          'Emergency recovery vehicles: pre-positioned on N-routes and high-volume exit routes',
          'School scholar transport: shutdown dates confirmed and communicated to communities pre-season'
        ])
      ]
    },
    {
      key: 'extended_services',
      title: 'Extended Services and On-Call Roster',
      blocks: [
        text('All essential services operate on extended rosters from 24 December to 7 January. The DRM Centre operates 24/7 throughout this period. An on-call Senior Manager is designated for each day of the festive period. Rosters must be confirmed and distributed to all agencies by 15 December.'),
        list([
          'DRM Centre: 24/7 staffed from 24 December to 7 January',
          'EMS: surge roster — additional units deployed for peak travel days (24/25/31 Dec, 1 Jan)',
          'Fire & Rescue: full roster — no leave during peak festive period',
          'Water Services: 24-hour fault line staffed; maintenance teams on call',
          'Electrical: 24-hour fault line; critical infrastructure team on standby',
          'On-call Senior Manager: designated per day — roster distributed to PDMC by 15 December'
        ])
      ]
    },
    {
      key: 'border_post_management',
      title: 'Border Post and Cross-Border Movement Management',
      blocks: [
        text('Applicable to municipalities near international borders (Limpopo, Mpumalanga, North West, Northern Cape). Cross-border movement surges during the festive season create crowd management, road safety, and public health challenges. The municipality coordinates with the Border Management Authority (BMA) and SAPS.'),
        list([
          'BMA liaison: contact confirmed pre-season; included in festive JOC',
          'Queuing management: crowd safety assessment for peak crossing days (24-27 Dec, 31 Dec-2 Jan)',
          'Water and sanitation: EHP confirms facilities operational at crossing points before peak period',
          'EMS at border crossing: 1 BLS unit on standby during peak crossing days',
          'Disease screening: EHP on standby at major crossing points during disease outbreak periods'
        ])
      ]
    }
  ],

  fire_season: [
    {
      key: 'fpa_collaboration',
      title: 'Fire Protection Association Collaboration',
      blocks: [
        text('The municipality is a member of the local Fire Protection Association (FPA) in terms of the National Veld and Forest Fire Act (Act 101 of 1998). Annual FPA meeting participation is mandatory for the DRM Centre and relevant operational departments. FPA fire risk information, firebreak compliance monitoring, and mutual aid are managed through the FPA secretariat.'),
        list([
          'FPA name and contact: [FPA name] — contact in Emergency Contact Register',
          'Annual membership fee: confirmed budget allocation by March each year',
          'FPA AGM attendance: DRM Centre and Fire & Rescue representation mandatory',
          'Fire risk daily rating: received from FPA during fire season and distributed to DRM teams',
          'Firebreak compliance: FPA inspection report reviewed by DRM Centre before each fire season'
        ])
      ]
    },
    {
      key: 'burn_ban',
      title: 'Burn Ban Declaration and Enforcement',
      blocks: [
        text('A burn ban is declared by the municipality under NVFFA s.12 conditions during extreme fire danger. Burn ban declarations are gazetted as municipal notices, published on all channels, and enforced by Environmental Management, SAPS, and Municipal Compliance. Contraventions are reported to SAPS for criminal prosecution under the NVFFA.'),
        list([
          'Declaration trigger: FPA / NFDRS Extreme fire danger rating, or Head of DRM recommendation',
          'Declaration authority: Municipal Manager upon recommendation from Head of DRM',
          'Gazette notice: issued within 2 hours of declaration; published simultaneously on all channels',
          'Enforcement: joint teams — Environmental Management + SAPS + Municipal Compliance',
          'Duration: maintained until NFDRS returns below High rating for minimum 48 hours',
          'Contravention: SAPS criminal charge under NVFFA s.12; municipality pursues civil cost recovery'
        ])
      ]
    },
    {
      key: 'aerial_pre_booking',
      title: 'Pre-Season Aerial Resource Booking',
      blocks: [
        text('Aerial firefighting resources are pre-contracted for the fire season. The municipality confirms pre-season service level agreements with the DFFE regional office before August each year. Activation of aerial resources during the season is through the PDMC or DFFE regional contact.'),
        list([
          'Pre-season SLA confirmation: DFFE regional office — by August each year',
          'Aircraft types contracted: [helicopter / fixed-wing] — capacity and water bucket size in Capacity Register',
          'Nearest base: [base name] — ETA to furthest point in municipality: [X minutes]',
          'Activation contact: DFFE regional office and WoF coordinator — in Emergency Contact Register',
          'Landing zones: GPS coordinates of pre-registered LZs submitted to WoF pre-season',
          'Fuel pre-positioning: [location] available for refuelling operations'
        ])
      ]
    },
    {
      key: 'mutual_aid_fire',
      title: 'Inter-Municipal Fire Mutual Aid Agreement',
      blocks: [
        text('The municipality has mutual aid agreements with neighbouring municipalities for cross-boundary fire response. Agreements specify activation authority, resource types, cost-sharing, and liability arrangements. Mutual aid is activated through DRM Centres of both parties.'),
        list([
          'Mutual aid partners: [municipalities] — agreements signed and held at DRM Centre',
          'Activation: Head of DRM of requesting municipality contacts Head of DRM of partner',
          'Response time commitment: [X hours] from activation to resource arrival at boundary',
          'Cost recovery: requesting municipality bears all operational costs unless agreement specifies otherwise',
          'Liability: covered under respective municipal insurance; indemnity clause in each agreement',
          'Annual review: mutual aid agreements reviewed at FPA AGM each year'
        ])
      ]
    },
    {
      key: 'post_fire_land',
      title: 'Post-Fire Land Rehabilitation',
      blocks: [
        text('Following significant veld fires, the municipality initiates a rehabilitation programme. Post-fire is the optimal window for invasive alien plant management. Rehabilitation costs are included in the post-disaster expenditure report.'),
        list([
          'Erosion barrier installation: rock packing and brush packing on slopes above critical assets within 48 hours of fire control',
          'Indigenous revegetation: coordinated with DFFE and SANParks where applicable — planting within first rain season',
          'Water catchment monitoring: EHP sampling of downstream water sources for contamination within 48 hours',
          'Invasive alien plant management: DFFE Working for Water teams activated for post-fire treatment',
          'Agricultural recovery: DALRRD assessment of veld condition and grazing recovery timeline within 7 days',
          'Rehabilitation costs: submitted for disaster grant consideration where applicable per COGTA guidelines'
        ])
      ]
    }
  ]
};

// ---------------------------------------------------------------------------
// TARGETED ENV HEALTH ENRICHMENT
// These add plan-specific environmental health context as an extra block
// to the universal environmental_health_safety core section.
// Plans not listed still get the universal core env health section —
// these entries simply enrich it with hazard-specific language.
// ---------------------------------------------------------------------------
const TARGETED_ENV_HEALTH_ENRICHMENT = {
  flood:                  'Water contamination surveillance, waterborne disease monitoring, vector control in flooded areas, and sanitation checks at all emergency shelters are mandatory components of flood response. EHPs must be deployed within 6 hours of Alert Level 3 activation.',
  wildfire:               'Air quality monitoring and smoke inhalation health advisory are required during active wildfire events. Post-fire water catchment contamination must be tested within 48 hours of suppression. EHP participation in post-fire secondary hazard assessment is mandatory.',
  drought:                'Water quality at all emergency distribution points must be tested by EHPs every 24 hours during drought emergency operations. Sanitation conditions in drought-affected communities must be monitored to prevent disease outbreak linked to inadequate hygiene.',
  water_shortage:         'EHP-led water quality verification and boil-water advisory governance are mandatory for all contamination events and extended outages. Two consecutive clear test results (≥ 24 hours apart) are required before a boil-water advisory is lifted.',
  hazmat:                 'Environmental contamination monitoring runs in parallel with exclusion, decontamination, and remediation operations. DFFE notification is required within 24 hours of all hazmat spill events. Air quality and soil sampling must be conducted by specialist environmental consultants for Tier 2 and Tier 3 events.',
  landslide:              'Post-landslide water source contamination (sediment, pathogens from disturbed soil) must be assessed by EHPs within 24 hours. Temporary sanitation facilities for displaced households must meet SPHERE standards.',
  coastal_storm:          'Post-storm coastal water quality testing is required at all managed beaches and water intake points within 24 hours of storm passage. Algal bloom risk increases after storm events — EHP monitoring mandatory.',
  shelter:                'Shelter operations require continuous EHP oversight for water quality (SANS 241), sanitation ratios (SPHERE), hygiene kit distribution, and communicable disease surveillance. EHP must submit a shelter health compliance report to Head of DRM every 48 hours.',
  public_health:          'All public health response operations must be coordinated with the Provincial Health Department and NICD. EHPs are the primary environmental health authority and their instructions on water quality, vector control, and isolation measures are binding on all other agencies.',
  wildfire_season:        'Smoke inhalation health advisories must be issued via all channels when SAWS air quality index exceeds health thresholds during fire events. Vulnerable populations (elderly, respiratory conditions) require direct notification.',
};

// ---------------------------------------------------------------------------
// toPlanSection — converts a section definition to the runtime shape
// ---------------------------------------------------------------------------
function toPlanSection(def, order) {
  return {
    key: def.key,
    title: def.title,
    order,
    editable: true,
    seed_source: 'library:v2',
    content_blocks: def.blocks.map((b, idx) => ({
      id: uid(`${def.key}_blk_${idx + 1}`),
      type: b.type,
      content: b.content
    }))
  };
}

// ---------------------------------------------------------------------------
// buildLibrarySections — main export
// Returns the full ordered section list for a given category + plan type.
// Order: core (with env health promoted as a universal core section) →
//        category → type-specific → plan_review always last.
// ---------------------------------------------------------------------------
export function buildLibrarySections(category, planTypeCode) {
  const core = [...CORE_SECTIONS];
  const categorySections = CATEGORY_SECTIONS[category] || [];
  const typeSections = TYPE_SECTIONS[planTypeCode] || [];

  // Enrich the universal environmental_health_safety section with
  // plan-type-specific language if available, without making it conditional
  const enrichment = TARGETED_ENV_HEALTH_ENRICHMENT[planTypeCode];
  if (enrichment) {
    const envIdx = core.findIndex(s => s.key === 'environmental_health_safety');
    if (envIdx >= 0) {
      core[envIdx] = {
        ...core[envIdx],
        blocks: [
          ...core[envIdx].blocks,
          text(enrichment)
        ]
      };
    }
  }

  const merged = [];
  const seen = new Set();
  [...core, ...categorySections, ...typeSections].forEach(def => {
    if (!def || seen.has(def.key)) return;
    seen.add(def.key);
    merged.push(def);
  });

  // Always pin plan_review to the end
  const reviewIdx = merged.findIndex(def => def.key === 'plan_review');
  if (reviewIdx >= 0) {
    const [planReview] = merged.splice(reviewIdx, 1);
    merged.push(planReview);
  }

  return merged.map((def, idx) => toPlanSection(def, idx + 1));
}

// Named exports — HVC maps are defined as plain const above and exported here,
// matching the single-export-block pattern so module loaders don't trip on
// top-level export statements scattered through the file.
export { HVC_HAZARD_MAP, HVC_SECTION_TARGETS };
