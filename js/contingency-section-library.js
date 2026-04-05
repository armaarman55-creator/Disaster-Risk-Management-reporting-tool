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

const CORE_SECTIONS = [
  {
    key: 'legal_authority',
    title: 'Legal Authority and Mandate',
    blocks: [
      text('Prepared under Disaster Management Act 57 of 2002 (as amended), aligned to NDMF and municipal governance frameworks.'),
      list(['State legal mandate and adoption authority', 'Reference PDMC/NDMC submission and distribution requirements'])
    ]
  },
  {
    key: 'hazard_risk_profile',
    title: 'Hazard and Risk Profile',
    blocks: [
      text('Summarise priority hazards from the municipal Disaster Risk Assessment and risk register.'),
      list(['Hydrometeorological', 'Geophysical', 'Biological', 'Technological', 'Human-induced'])
    ]
  },
  {
    key: 'roles_responsibilities',
    title: 'Roles, Responsibilities and Lead Agencies',
    blocks: [table(['Function', 'Lead Agency', 'Support Agencies'])]
  },
  {
    key: 'activation_triggers',
    title: 'Activation Criteria and Alert Levels',
    blocks: [table(['Alert Level', 'Trigger', 'Response Action'])]
  },
  {
    key: 'command_coordination',
    title: 'Command, Control and Coordination',
    blocks: [
      text('Describe JOC/DOC arrangements, strategic-tactical-operational command structure, and spokesperson rules.'),
      list(['SPOC and media protocol', 'DOC/JOC location and contact details'])
    ]
  },
  {
    key: 'resource_mobilisation',
    title: 'Resource Mobilisation and Finance',
    blocks: [
      text('Document internal/external mobilisation and emergency procurement controls.'),
      table(['Resource Type', 'Custodian', 'Availability', 'Funding Source'])
    ]
  },
  {
    key: 'communications_reporting',
    title: 'Communications, Warning and Situation Reports',
    blocks: [
      table(['Stakeholder', 'Method', 'Owner', 'Timeframe']),
      text('Define Sitrep frequency, warning channels, and communication fallback systems.')
    ]
  },
  {
    key: 'recovery_rehabilitation',
    title: 'Recovery, Rehabilitation and Build Back Better',
    blocks: [
      list(['Immediate recovery (0-72h)', 'Short-term recovery (1-30 days)', 'Medium/long-term recovery (30+ days)']),
      text('Include PDNA linkage, grant pathways, infrastructure restoration and resilience upgrades.')
    ]
  },
  {
    key: 'plan_review',
    title: 'Plan Review, Testing and Maintenance',
    blocks: [
      text('Annual review and post-incident review cycle, with version control and exercise evidence.'),
      table(['Activity', 'Frequency', 'Owner', 'Evidence'])
    ]
  }
];

const CATEGORY_SECTIONS = {
  hazard_specific: [
    { key: 'early_warning_monitoring', title: 'Early Warning and Monitoring Systems', blocks: [text('Define SAWS-linked thresholds, 24-hour monitoring and hazard watch procedures.')] },
    { key: 'affected_area_mapping', title: 'Affected Area Mapping and Spatial Risk Zones', blocks: [text('Maintain hazard maps and GIS layers for operational response prioritisation.')] },
    { key: 'search_rescue_operations', title: 'Search and Rescue Operations', blocks: [text('Define SAR triggers, specialist capability, safety controls and logging requirements.')] },
    { key: 'damage_impact_assessment', title: 'Damage and Impact Assessment', blocks: [text('Rapid multidisciplinary assessment within 6 hours, DNA capture and Sitrep integration.')] }
  ],
  functional: [
    { key: 'standard_operating_procedures', title: 'Standard Operating Procedures', blocks: [text('List SOPs, owners, review dates and deployment instructions.')] },
    { key: 'multi_agency_coordination', title: 'Multi-Agency Coordination Protocols', blocks: [text('Define agency liaison model, coordination meetings and escalation paths.')] },
    { key: 'capacity_equipment_register', title: 'Capacity and Equipment Register', blocks: [table(['Asset', 'Owner', 'Location', 'Availability', 'Lead Time'])] },
    { key: 'training_exercises', title: 'Training and Exercise Programme', blocks: [table(['Programme', 'Frequency', 'Target Group', 'Evidence'])] }
  ],
  event: [
    { key: 'event_profile', title: 'Event Profile and Classification', blocks: [table(['Class', 'Attendance', 'Risk Rating', 'Action Required'])] },
    { key: 'crowd_safety_risk_assessment', title: 'Crowd Safety Risk Assessment', blocks: [text('Assess crowd density, flow, ingress/egress, structural safety, and trigger thresholds.')] },
    { key: 'security_coordination', title: 'Security and Law Enforcement Coordination', blocks: [text('Define SAPS/Metro/private security roles, command post and briefings.')] },
    { key: 'medical_emergency_plan', title: 'Medical Emergency Plan', blocks: [text('Specify EMS ratios, medical command post, triage and hospital pre-alert pathways.')] },
    { key: 'traffic_access_management', title: 'Traffic and Access Management', blocks: [text('Pre-plan closures, diversions, emergency lanes, and traffic authority responsibilities.')] }
  ],
  seasonal: [
    { key: 'seasonal_forecast_integration', title: 'Seasonal Forecast Integration', blocks: [text('Align plan activation with NDMC seasonal plans and SAWS outlook updates.')] },
    { key: 'pre_season_readiness_checklist', title: 'Pre-Season Readiness Checklist', blocks: [list(['Contacts updated', 'Resource inventory complete', 'Early warning channels tested', 'MOUs confirmed active', 'Plan redistributed'])] },
    { key: 'vulnerable_population_register', title: 'Vulnerable Population Register', blocks: [text('Maintain georeferenced at-risk populations for early warning and assistance prioritisation.')] },
    { key: 'post_season_debrief', title: 'Post-Season Debrief and Lessons Learnt', blocks: [text('Capture lessons, gaps, corrective actions and include in next season revision.')] }
  ]
};

const TYPE_SECTIONS = {
  flood: [
    { key: 'flood_risk_zones', title: 'Flood Risk Zone Mapping', blocks: [text('Map 1:10, 1:50 and 1:100 flood lines and ward-level high-risk populations.')] },
    { key: 'stormwater_infrastructure', title: 'Stormwater Infrastructure Status and Maintenance', blocks: [table(['Asset', 'Condition', 'Defect', 'Priority'])] },
    { key: 'dam_safety_protocols', title: 'Dam and Water Level Monitoring Protocols', blocks: [text('Define DWS monitoring links, thresholds and downstream evacuation notification paths.')] },
    { key: 'informal_settlement_response', title: 'Informal Settlement Flood Response', blocks: [text('Include accelerated warning, relocation points and shelter activation process.')] },
    { key: 'floodwater_rescue', title: 'Floodwater Rescue Procedures', blocks: [text('Define swift-water rescue control, PPE standards and specialist escalation routes.')] }
  ],
  wildfire: [
    { key: 'veld_fire_risk_rating', title: 'Veld and Wildfire Risk Rating System', blocks: [text('Use FPA/NFDRS/MODIS ratings to drive readiness and pre-positioning.')] },
    { key: 'fire_break_maintenance', title: 'Firebreak Maintenance Programme', blocks: [text('Maintain seasonal schedule, compliance monitoring and enforcement workflow.')] },
    { key: 'aerial_resources', title: 'Aerial Fire-Fighting Resources', blocks: [table(['Resource', 'Provider', 'Activation Trigger', 'ETA'])] },
    { key: 'working_on_fire_coordination', title: 'Working on Fire Programme Coordination', blocks: [text('Define WoF liaison, contact pathways and joint operational briefing cadence.')] },
    { key: 'post_fire_erosion', title: 'Post-Fire Secondary Hazard Management', blocks: [text('Assess erosion and flash-flood risk in burn scar areas within 48 hours.')] }
  ],
  severe_weather: [
    { key: 'saws_warning_thresholds', title: 'SAWS Impact-Based Warning Thresholds', blocks: [table(['SAWS Level', 'Threshold', 'Municipal Response'])] },
    { key: 'lightning_safety', title: 'Lightning Safety Protocols', blocks: [text('Set school/outdoor/agricultural alert actions and shelter-in-place controls.')] },
    { key: 'wind_damage_response', title: 'Wind Damage Response', blocks: [text('Cover unsafe structure triage, road clearance and emergency housing support.')] }
  ],
  storm: [
    { key: 'coastal_storm_surge', title: 'Coastal Storm Surge and Inundation Risk', blocks: [text('Apply to coastal municipalities: surge zones, warnings, evacuation and maritime links.')] },
    { key: 'harbour_coordination', title: 'Harbour and Port Coordination', blocks: [text('Define TNPA/NSRI/MRCC coordination and closure authority workflow.')] }
  ],
  drought: [
    { key: 'water_supply_monitoring', title: 'Water Supply System Monitoring', blocks: [table(['Dam/Supply Level', 'Action'])] },
    { key: 'water_trucking_operations', title: 'Alternative Water Supply Operations', blocks: [text('Define tanker deployments, distribution points and water quality testing requirements.')] },
    { key: 'demand_management', title: 'Water Demand Management and Restrictions', blocks: [text('Document level-based restrictions, enforcement and communication campaign model.')] },
    { key: 'agricultural_liaison', title: 'Agricultural Sector Drought Liaison', blocks: [text('Coordinate DALRRD/agricultural unions for livestock and irrigation emergency support.')] }
  ],
  water_shortage: [
    { key: 'water_service_failure', title: 'Water Service Failure Response', blocks: [text('Cover burst mains/pump failure/contamination incident workflow and timelines.')] },
    { key: 'boil_water_advisory', title: 'Boil Water Advisory Protocol', blocks: [text('Define SANS 241-based thresholds, advisories and clearance criteria.')] }
  ],
  electricity_disruption: [
    { key: 'critical_facility_backup', title: 'Critical Facility Backup Power Register', blocks: [table(['Facility', 'Backup Capacity', 'Fuel Runtime', 'Owner'])] },
    { key: 'load_shedding_impact', title: 'Load Shedding and Prolonged Outage Impact Management', blocks: [text('Track stage-based municipal risks and critical escalation triggers.')] },
    { key: 'eskom_liaison', title: 'Eskom and NERSA Liaison Protocol', blocks: [text('Maintain escalation channels and regional contact pathways for major incidents.')] }
  ],
  hazmat: [
    { key: 'hazmat_site_register', title: 'Hazardous Materials Site Register', blocks: [table(['Facility/Site', 'Substance Class', 'Risk', 'Contact'])] },
    { key: 'spill_containment', title: 'Hazmat Spill Containment and Response Tiers', blocks: [text('Define Tier 1-3 containment, exclusion, evacuation and regulatory notifications.')] },
    { key: 'decontamination_operations', title: 'Decontamination Operations', blocks: [text('Specify corridor setup, PPE, equipment locations and post-event handling.')] },
    { key: 'public_exclusion', title: 'Public Exclusion Zone Management', blocks: [text('Define ERG-informed exclusion radii and perimeter control procedures.')] }
  ],
  landslide: [
    { key: 'slope_stability_mapping', title: 'Slope Instability and Landslide Susceptibility Mapping', blocks: [text('Map high-susceptibility zones and integrate with planning controls.')] },
    { key: 'rainfall_thresholds', title: 'Rainfall Threshold Triggers for Landslide Risk', blocks: [table(['Rainfall Threshold', 'Alert Level', 'Action'])] },
    { key: 'infrastructure_on_slopes', title: 'Infrastructure Vulnerability on Slopes', blocks: [text('Track critical infrastructure exposure, inspections and closure procedures.')] }
  ],
  coastal_storm: [
    { key: 'coastal_erosion', title: 'Coastal Erosion and Infrastructure Risk', blocks: [text('Monitor coastal hotspots and manage long-term coastal infrastructure resilience.')] }
  ],
  evacuation: [
    { key: 'evacuation_zone_mapping', title: 'Evacuation Zone Mapping', blocks: [text('Define Zone A/B/C trigger logic, boundaries and publication requirements.')] },
    { key: 'vulnerable_persons_evacuation', title: 'Vulnerable Persons Evacuation Assistance', blocks: [text('Maintain assisted evacuation lists and transport pathways.')] },
    { key: 'transport_fleet', title: 'Evacuation Transport Fleet', blocks: [table(['Vehicle Type', 'Quantity', 'Capacity', 'Operator', 'Contact'])] },
    { key: 're_entry_criteria', title: 'Re-Entry Criteria and Procedures', blocks: [text('Define authority, safety checks and staged re-entry protocol.')] },
    { key: 'pets_livestock', title: 'Pets and Livestock Management During Evacuation', blocks: [text('Define animal welfare, shelter and livestock movement coordination.')] }
  ],
  shelter: [
    { key: 'shelter_site_register', title: 'Approved Shelter Site Register', blocks: [table(['Site Name', 'Location', 'Capacity', 'Accessibility', 'Facilities'])] },
    { key: 'site_management', title: 'Shelter Site Management Protocols', blocks: [text('Define registration, security, hygiene and psychosocial support operations.')] },
    { key: 'sphere_standards', title: 'SPHERE Humanitarian Standards Compliance', blocks: [text('Define minimum standards for space, water, sanitation, food and referral pathways.')] },
    { key: 'shelter_exit_strategy', title: 'Shelter Exit Strategy', blocks: [text('Define return, transitional shelter and permanent relocation pathways.')] }
  ],
  communication: [
    { key: 'stakeholder_notification_matrix', title: 'Stakeholder Notification Matrix', blocks: [table(['Stakeholder', 'Method', 'Responsible', 'Timeframe'])] },
    { key: 'public_warning', title: 'Public Warning System', blocks: [text('Define multilingual warning channels and content standards.')] },
    { key: 'media_liaison', title: 'Media Liaison and Spokesperson Protocol', blocks: [text('Single spokesperson model, media brief schedules and clearance controls.')] },
    { key: 'social_media_monitoring', title: 'Social Media Monitoring and Rumour Management', blocks: [text('Define monitor role, approval workflow and correction SLA.')] },
    { key: 'backup_comms', title: 'Backup Communications Systems', blocks: [table(['System', 'Coverage', 'Location'])] }
  ],
  logistics: [
    { key: 'supply_chain', title: 'Emergency Supply Chain Management', blocks: [text('Define emergency procurement controls and supplier readiness.')] },
    { key: 'staging_areas', title: 'Staging Area Locations', blocks: [table(['Staging Area', 'Address', 'Size', 'Access', 'Custodian'])] },
    { key: 'commodity_tracking', title: 'Relief Commodity Tracking and Distribution', blocks: [text('Define chain-of-custody and post-distribution verification process.')] },
    { key: 'volunteer_management', title: 'Volunteer Management', blocks: [text('Define volunteer registration, vetting, deployment and welfare support.')] }
  ],
  damage_assessment: [
    { key: 'rapid_assessment_methodology', title: 'Rapid Damage Assessment Methodology', blocks: [text('Apply standard DNA forms with 6-hour deployment and 24-hour reporting targets.')] },
    { key: 'sector_teams', title: 'Sector Assessment Teams', blocks: [table(['Sector', 'Lead Department', 'Support'])] },
    { key: 'pdna', title: 'Post-Disaster Needs Assessment', blocks: [text('Define 14-day PDNA initiation for significant events and reconstruction planning linkage.')] }
  ],
  public_health: [
    { key: 'disease_surveillance', title: 'Disease Surveillance and Notifiable Conditions', blocks: [text('Define EHP surveillance, NICD reporting timelines and disease watch priorities.')] },
    { key: 'mass_casualty', title: 'Mass Casualty Management', blocks: [text('Define MCI declaration, surge pathways and family reunification activation.')] },
    { key: 'vector_control', title: 'Vector Control Operations', blocks: [text('Define vector control interventions post-flood/shelter operations and education.')] },
    { key: 'pharmaceutical_stockpile', title: 'Essential Medicine and Pharmaceutical Stockpile', blocks: [text('Define stockpile governance, replenishment and access controls.')] }
  ],
  mass_gathering: [
    { key: 'event_classification', title: 'Event Classification and Risk Rating', blocks: [table(['Class', 'Attendance', 'DRM Action Required'])] },
    { key: 'venue_risk_assessment', title: 'Venue Risk Assessment', blocks: [text('Assess structural safety, crowd flow, emergency access and exposure factors.')] },
    { key: 'crowd_crush_protocol', title: 'Crowd Crush Prevention and Response Protocol', blocks: [text('Define threshold-based interventions and emergency control procedures.')] },
    { key: 'ems_ratios', title: 'EMS Staffing Ratios and Pre-hospital Care', blocks: [text('Document ALS/BLS ratios, PHA setup and access protection.')] }
  ],
  election: [
    { key: 'iec_coordination', title: 'IEC and Electoral Operations Coordination', blocks: [text('Define IEC JOC coordination and municipal support responsibilities.')] },
    { key: 'voting_station_risk', title: 'Voting Station Risk Assessment', blocks: [text('Assess station readiness: access, structure, crowd, emergency and comms.')] },
    { key: 'results_centre_security', title: 'Results Centre Security and Access Control', blocks: [text('Define SAPS lead role, accreditation and emergency support obligations.')] }
  ],
  protest_unrest: [
    { key: 'intelligence_liaison', title: 'Intelligence and Threat Assessment Liaison', blocks: [text('Maintain JIC liaison for threat-informed activation and confidentiality controls.')] },
    { key: 'infrastructure_protection', title: 'Critical Infrastructure Protection', blocks: [text('Prioritise essential services and define lock-down/access controls.')] },
    { key: 'post_unrest_assessment', title: 'Post-Unrest Damage Assessment', blocks: [text('Initiate rapid DNA after area safety confirmation and restoration planning.')] },
    { key: 'community_dialogue', title: 'Community Dialogue and De-escalation Protocol', blocks: [text('Define stakeholder engagement structure for de-escalation and local stability.')] }
  ],
  vip_visit: [
    { key: 'vip_protection_liaison', title: 'VIP Protection Unit Liaison', blocks: [text('Define SAPS VIP liaison model and municipal support scope.')] },
    { key: 'route_security', title: 'Route Security and Contingency Routing', blocks: [text('Define primary/alternate route protections and emergency access protections.')] },
    { key: 'medical_support', title: 'VIP Event Medical Support Plan', blocks: [text('Define dedicated EMS deployment and trauma hospital pre-alert protocol.')] }
  ],
  major_incident: [
    { key: 'major_incident_declaration', title: 'Major Incident Declaration Criteria and Process', blocks: [text('Define declaration thresholds, mandatory notifications and command setup timelines.')] },
    { key: 'unified_command', title: 'Unified Command Structure', blocks: [text('Define IC sections, authority controls and joint command governance.')] },
    { key: 'family_reunification', title: 'Family Reunification Centre', blocks: [text('Define FRC setup, governance, agencies and information release controls.')] },
    { key: 'fatality_management', title: 'Fatality Management', blocks: [text('Define SAPS/mortuary controls, scene preservation and forensic notification protocol.')] }
  ],
  winter: [
    { key: 'cold_snap_thresholds', title: 'Cold Snap Alert Levels and Response Thresholds', blocks: [table(['Temperature', 'Action'])] },
    { key: 'homeless_cold_weather', title: 'Homeless Cold Weather Response', blocks: [text('Define shelter activation thresholds and outreach deployment model.')] },
    { key: 'informal_settlement_fire', title: 'Informal Settlement Winter Fire Response', blocks: [text('Define patrols, awareness and equipment pre-positioning in high-risk settlements.')] },
    { key: 'snow_ice_protocols', title: 'Snow and Ice Road Management', blocks: [text('Define closure authority, communication workflow and gritting deployment criteria.')] }
  ],
  summer: [
    { key: 'heat_health_action', title: 'Heat Health Action Plan', blocks: [text('Define heat thresholds, cooling centres, targeted outreach and water support actions.')] },
    { key: 'drowning_prevention', title: 'Drowning Prevention Programme', blocks: [text('Define patrol partnerships, warning systems and public education interventions.')] }
  ],
  festive_season: [
    { key: 'inter_agency_ops', title: 'Inter-Agency Festive Season Operations Plan', blocks: [text('Define seasonal JOC partners, activation date and integrated duty model.')] },
    { key: 'road_safety', title: 'Road Safety Coordination', blocks: [text('Define RTMC/Arrive Alive/SAPS traffic operations and hotspot interventions.')] },
    { key: 'extended_services', title: 'Extended Services and On-Call Roster', blocks: [text('Define 24/7 essential service rosters and accountability controls.')] }
  ],
  fire_season: [
    { key: 'fpa_collaboration', title: 'Fire Protection Association Collaboration', blocks: [text('Define FPA governance, participation and information-sharing obligations.')] },
    { key: 'burn_ban', title: 'Burn Ban Declaration and Enforcement', blocks: [text('Define declaration criteria, publication and enforcement process.')] },
    { key: 'aerial_pre_booking', title: 'Pre-Season Aerial Resource Booking', blocks: [text('Define pre-contracting workflow and activation contact pathways.')] },
    { key: 'mutual_aid_fire', title: 'Inter-Municipal Fire Mutual Aid Agreement', blocks: [text('Define activation authority, cost-sharing and liability model.')] },
    { key: 'post_fire_land', title: 'Post-Fire Land Rehabilitation', blocks: [text('Define erosion mitigation, ecological restoration and monitoring controls.')] }
  ]
};

const TARGETED_ENV_HEALTH = {
  flood: 'Water contamination surveillance, vector control and sanitation checks are mandatory for flood response and shelters.',
  drought: 'Environmental Health Practitioners (EHPs) test all emergency tanker and distribution-point water quality.',
  water_shortage: 'EHP-led water quality verification and boil-water advisory governance are mandatory for outages and contamination.',
  hazmat: 'Environmental health and contamination monitoring run alongside exclusion, decontamination and remediation operations.',
  shelter: 'Shelter operations require EHP oversight for water, sanitation, hygiene and communicable-disease controls.'
};

function toPlanSection(def, order) {
  return {
    key: def.key,
    title: def.title,
    order,
    editable: true,
    seed_source: 'library:v1',
    content_blocks: def.blocks.map((b, idx) => ({
      id: uid(`${def.key}_blk_${idx + 1}`),
      type: b.type,
      content: b.content
    }))
  };
}

export function buildLibrarySections(category, planTypeCode) {
  const core = [...CORE_SECTIONS];
  const categorySections = CATEGORY_SECTIONS[category] || [];
  const typeSections = TYPE_SECTIONS[planTypeCode] || [];

  const envNote = TARGETED_ENV_HEALTH[planTypeCode];
  if (envNote) {
    core.push({
      key: 'environmental_health_safety',
      title: 'Environmental and Public Health Safeguards',
      blocks: [text(envNote)]
    });
  }

  const merged = [];
  const seen = new Set();
  [...core, ...categorySections, ...typeSections].forEach(def => {
    if (!def || seen.has(def.key)) return;
    seen.add(def.key);
    merged.push(def);
  });

  return merged.map((def, idx) => toPlanSection(def, idx + 1));
}
