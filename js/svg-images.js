// js/svg-images.js
// All 16 approved SVG share images — no black backgrounds, official signage style

export const SHELTER_IMAGES = [
  {
    id: 'shelter-emergency',
    name: 'Emergency Shelter',
    svg: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#007700"/>
      <rect x="8" y="8" width="304" height="184" fill="none" stroke="white" stroke-width="5"/>
      <polygon points="160,28 80,82 240,82" fill="white"/>
      <rect x="88" y="80" width="144" height="8" fill="white"/>
      <rect x="96" y="86" width="128" height="72" fill="white"/>
      <rect x="126" y="110" width="68" height="48" fill="#007700"/>
      <circle cx="160" cy="100" r="12" fill="white"/>
      <rect x="0" y="162" width="320" height="38" fill="#005500"/>
      <text x="160" y="179" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="16" fill="white">EMERGENCY</text>
      <text x="160" y="196" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="16" fill="white">SHELTER</text>
    </svg>`
  },
  {
    id: 'shelter-in-place',
    name: 'Shelter In Place',
    svg: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#FFD700"/>
      <rect x="6" y="6" width="308" height="188" fill="none" stroke="#111" stroke-width="5"/>
      <polygon points="160,16 64,68 256,68" fill="#111"/>
      <rect x="72" y="66" width="176" height="10" fill="#111"/>
      <rect x="80" y="74" width="160" height="78" fill="#FFD700" stroke="#111" stroke-width="4"/>
      <circle cx="160" cy="94" r="14" fill="#111"/>
      <rect x="147" y="108" width="26" height="28" fill="#111"/>
      <line x1="147" y1="114" x2="130" y2="128" stroke="#111" stroke-width="4" stroke-linecap="round"/>
      <line x1="173" y1="114" x2="190" y2="128" stroke="#111" stroke-width="4" stroke-linecap="round"/>
      <line x1="152" y1="136" x2="147" y2="154" stroke="#111" stroke-width="4" stroke-linecap="round"/>
      <line x1="168" y1="136" x2="173" y2="154" stroke="#111" stroke-width="4" stroke-linecap="round"/>
      <rect x="0" y="158" width="320" height="42" fill="#111"/>
      <text x="160" y="176" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="14" fill="#FFD700">SHELTER</text>
      <text x="160" y="195" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="14" fill="#FFD700">IN PLACE</text>
    </svg>`
  },
  {
    id: 'storm-shelter',
    name: 'Storm Shelter',
    svg: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#1a4fa0"/>
      <rect x="10" y="10" width="300" height="180" rx="20" fill="#1a4fa0" stroke="white" stroke-width="5"/>
      <rect x="64" y="22" width="192" height="18" rx="9" fill="white"/>
      <rect x="76" y="48" width="168" height="16" rx="8" fill="white"/>
      <rect x="90" y="72" width="140" height="14" rx="7" fill="white"/>
      <rect x="104" y="94" width="112" height="13" rx="6" fill="white"/>
      <rect x="120" y="115" width="80" height="11" rx="5" fill="white"/>
      <rect x="136" y="134" width="48" height="9" rx="4" fill="white"/>
      <rect x="148" y="151" width="24" height="7" rx="3" fill="white"/>
      <rect x="0" y="168" width="320" height="32" fill="#0d3070"/>
      <text x="160" y="183" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="14" fill="white">STORM SHELTER</text>
    </svg>`
  },
  {
    id: 'accessible-shelter',
    name: 'Accessible Shelter',
    svg: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#d8d8d8"/>
      <rect x="6" y="6" width="308" height="188" fill="none" stroke="#555" stroke-width="3"/>
      <polygon points="160,12 40,68 280,68" fill="#333"/>
      <rect x="48" y="66" width="224" height="10" fill="#333"/>
      <circle cx="96" cy="90" r="12" fill="#333"/>
      <polygon points="80,102 112,102 122,138 70,138" fill="#333"/>
      <line x1="70" y1="116" x2="54" y2="134" stroke="#333" stroke-width="4" stroke-linecap="round"/>
      <line x1="112" y1="116" x2="126" y2="134" stroke="#333" stroke-width="4" stroke-linecap="round"/>
      <circle cx="160" cy="90" r="12" fill="#333"/>
      <rect x="147" y="102" width="26" height="28" fill="#333"/>
      <line x1="147" y1="109" x2="130" y2="122" stroke="#333" stroke-width="4" stroke-linecap="round"/>
      <line x1="173" y1="109" x2="190" y2="122" stroke="#333" stroke-width="4" stroke-linecap="round"/>
      <line x1="152" y1="130" x2="148" y2="145" stroke="#333" stroke-width="4" stroke-linecap="round"/>
      <line x1="168" y1="130" x2="172" y2="145" stroke="#333" stroke-width="4" stroke-linecap="round"/>
      <circle cx="230" cy="88" r="10" fill="#333"/>
      <path d="M220 97 L220 114 L240 114" fill="none" stroke="#333" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M240 114 L240 124" fill="none" stroke="#333" stroke-width="4" stroke-linecap="round"/>
      <line x1="232" y1="124" x2="250" y2="124" stroke="#333" stroke-width="4" stroke-linecap="round"/>
      <circle cx="220" cy="138" r="13" fill="none" stroke="#333" stroke-width="4"/>
      <circle cx="244" cy="138" r="13" fill="none" stroke="#333" stroke-width="4"/>
      <rect x="0" y="158" width="320" height="42" fill="#333"/>
      <text x="160" y="177" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="14" fill="white">STORM SHELTER</text>
      <text x="160" y="194" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#ccc">Wheelchair accessible</text>
    </svg>`
  }
];

export const ROUTE_IMAGES = [
  {
    id: 'evacuation-route',
    name: 'Evacuation Route',
    svg: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#f0f0f0"/>
      <circle cx="160" cy="96" r="88" fill="#1a4fa0"/>
      <circle cx="160" cy="96" r="80" fill="none" stroke="white" stroke-width="6"/>
      <polygon points="76,96 112,70 112,84 200,84 200,108 112,108 112,122" fill="white"/>
      <text x="160" y="152" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="16" fill="white">EVACUATION</text>
      <text x="160" y="173" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="16" fill="white">ROUTE</text>
    </svg>`
  },
  {
    id: 'follow-alternate',
    name: 'Follow Alternate Route',
    svg: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#FFD700"/>
      <rect x="6" y="6" width="308" height="188" fill="none" stroke="#111" stroke-width="5"/>
      <text x="160" y="54" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="30" fill="#111">FOLLOW</text>
      <text x="160" y="92" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="26" fill="#111">ALTERNATE</text>
      <text x="160" y="130" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="30" fill="#111">ROUTE</text>
      <polygon points="50,152 50,172 220,172 220,183 296,162 220,141 220,152" fill="#111"/>
    </svg>`
  },
  {
    id: 'disaster-response',
    name: 'Disaster Response Route',
    svg: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="white"/>
      <rect x="5" y="5" width="310" height="190" fill="none" stroke="#aaa" stroke-width="2"/>
      <circle cx="160" cy="68" r="50" fill="#FFD700" stroke="#111" stroke-width="4"/>
      <polygon points="160,26 122,92 198,92" fill="#111"/>
      <line x1="136" y1="50" x2="184" y2="50" stroke="#FFD700" stroke-width="4"/>
      <line x1="142" y1="64" x2="178" y2="64" stroke="#FFD700" stroke-width="4"/>
      <line x1="148" y1="78" x2="172" y2="78" stroke="#FFD700" stroke-width="4"/>
      <line x1="10" y1="128" x2="310" y2="128" stroke="#aaa" stroke-width="1.5"/>
      <line x1="10" y1="160" x2="310" y2="160" stroke="#aaa" stroke-width="1.5"/>
      <text x="160" y="148" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="13" fill="#111">DISASTER RESPONSE ROUTE</text>
      <text x="160" y="174" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#555">EMERGENCY VEHICLES ONLY</text>
      <text x="160" y="188" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#555">DURING A DISASTER</text>
    </svg>`
  },
  {
    id: 'alternative-route-arrow',
    name: 'Alternative Route',
    svg: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#1a5c1a"/>
      <rect x="6" y="6" width="308" height="188" fill="none" stroke="white" stroke-width="4"/>
      <text x="160" y="54" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="18" fill="white">ALTERNATIVE</text>
      <text x="160" y="80" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="18" fill="white">ROUTE</text>
      <polygon points="24,112 24,136 218,136 218,152 304,124 218,96 218,112" fill="white"/>
      <text x="160" y="172" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="13" fill="#aaffaa">USE THIS ROAD</text>
    </svg>`
  }
];

export const CLOSURE_IMAGES = [
  {
    id: 'road-closed-barrier',
    name: 'Road Closed Barrier',
    svg: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#f5f5f5"/>
      <rect x="12" y="10" width="296" height="106" rx="5" fill="white" stroke="#cc0000" stroke-width="5"/>
      <rect x="12" y="10" width="296" height="42" rx="5" fill="#cc0000"/>
      <rect x="12" y="40" width="296" height="12" fill="#cc0000"/>
      <text x="160" y="38" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="22" fill="white">ROAD</text>
      <text x="160" y="96" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="40" fill="#cc0000">CLOSED</text>
      <rect x="12" y="124" width="296" height="30" rx="4" fill="white" stroke="#555" stroke-width="2"/>
      <rect x="12" y="124" width="38" height="30" fill="#cc0000"/>
      <rect x="88" y="124" width="38" height="30" fill="#cc0000"/>
      <rect x="164" y="124" width="38" height="30" fill="#cc0000"/>
      <rect x="240" y="124" width="68" height="30" fill="#cc0000"/>
      <rect x="68" y="154" width="12" height="36" rx="2" fill="#888"/>
      <rect x="204" y="154" width="12" height="36" rx="2" fill="#888"/>
      <rect x="50" y="188" width="220" height="8" rx="3" fill="#666"/>
    </svg>`
  },
  {
    id: 'no-entry',
    name: 'No Entry',
    svg: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#f5f5f5"/>
      <circle cx="160" cy="90" r="82" fill="#cc0000"/>
      <circle cx="160" cy="90" r="74" fill="none" stroke="white" stroke-width="8"/>
      <rect x="94" y="75" width="132" height="32" rx="5" fill="white"/>
      <rect x="20" y="164" width="280" height="30" rx="5" fill="#cc0000"/>
      <text x="160" y="179" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="13" fill="white">ROAD CLOSED</text>
      <text x="160" y="192" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="12" fill="white">NO ENTRY</text>
    </svg>`
  },
  {
    id: 'road-ahead-closed',
    name: 'Road Ahead Closed',
    svg: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#f5f5f5"/>
      <rect x="62" y="8" width="196" height="160" rx="8" fill="#FF8C00" transform="rotate(45 160 88)"/>
      <rect x="70" y="16" width="180" height="144" rx="5" fill="none" stroke="white" stroke-width="3" transform="rotate(45 160 88)"/>
      <rect x="143" y="20" width="34" height="64" rx="17" fill="white"/>
      <circle cx="160" cy="100" r="18" fill="white"/>
      <rect x="10" y="152" width="300" height="42" rx="6" fill="#FF8C00"/>
      <text x="160" y="169" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="14" fill="white">ROAD AHEAD</text>
      <text x="160" y="188" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="14" fill="white">CLOSED</text>
    </svg>`
  },
  {
    id: 'detour',
    name: 'Road Closed + Detour',
    svg: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#f5f5f5"/>
      <rect x="30" y="6" width="260" height="72" rx="5" fill="white" stroke="#cc0000" stroke-width="4"/>
      <rect x="30" y="6" width="260" height="30" rx="5" fill="#cc0000"/>
      <rect x="30" y="26" width="260" height="10" fill="#cc0000"/>
      <text x="160" y="27" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="18" fill="white">ROAD CLOSED</text>
      <text x="160" y="66" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="14" fill="#cc0000">NO THRU TRAFFIC</text>
      <rect x="18" y="88" width="284" height="78" rx="5" fill="#FFD700" stroke="#555" stroke-width="2"/>
      <rect x="24" y="94" width="272" height="66" rx="4" fill="none" stroke="#111" stroke-width="2"/>
      <text x="148" y="136" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="38" fill="#111">DETOUR</text>
      <polygon points="224,114 224,130 278,130 278,141 308,122 278,103 278,114" fill="#111"/>
      <rect x="148" y="168" width="24" height="28" rx="3" fill="#888"/>
      <rect x="136" y="194" width="48" height="6" rx="2" fill="#666"/>
    </svg>`
  }
];

export const RELIEF_IMAGES = [
  {
    id: 'distribution-point',
    name: 'Distribution Point',
    svg: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#007700"/>
      <rect x="6" y="6" width="308" height="188" fill="none" stroke="white" stroke-width="5"/>
      <circle cx="160" cy="52" r="26" fill="white"/>
      <polygon points="160,80 142,58 178,58" fill="white"/>
      <circle cx="160" cy="50" r="12" fill="#007700"/>
      <text x="160" y="108" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="18" fill="white">RELIEF</text>
      <text x="160" y="130" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="16" fill="white">DISTRIBUTION</text>
      <text x="160" y="150" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="16" fill="white">POINT</text>
      <rect x="14" y="160" width="292" height="32" rx="5" fill="#005500"/>
      <text x="160" y="181" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#aaffaa">FOOD · WATER · BLANKETS · KITS</text>
    </svg>`
  },
  {
    id: 'red-cross-tent',
    name: 'Red Cross Relief Tent',
    svg: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#eaf5ea"/>
      <rect x="0" y="168" width="320" height="32" fill="#c8e6c8"/>
      <polygon points="160,14 24,168 296,168" fill="white" stroke="#bbb" stroke-width="2"/>
      <polygon points="160,14 24,168 92,168" fill="#f0f0f0"/>
      <polygon points="160,14 228,168 296,168" fill="#f0f0f0"/>
      <line x1="160" y1="14" x2="160" y2="168" stroke="#ddd" stroke-width="2"/>
      <rect x="118" y="76" width="84" height="84" rx="5" fill="white" stroke="#cc0000" stroke-width="2.5"/>
      <rect x="118" y="104" width="84" height="28" fill="#cc0000"/>
      <rect x="132" y="76" width="56" height="84" fill="#cc0000"/>
      <rect x="132" y="104" width="56" height="28" fill="#cc0000"/>
      <polygon points="118,104 202,104 202,132 118,132" fill="#cc0000"/>
      <rect x="0" y="168" width="320" height="32" fill="#cc0000"/>
      <text x="160" y="189" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="13" fill="white">SA RED CROSS RELIEF POINT</text>
    </svg>`
  },
  {
    id: 'relief-parcel',
    name: 'Relief Parcel Box',
    svg: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#f8f8f8"/>
      <rect x="40" y="8" width="240" height="36" rx="5" fill="#007700"/>
      <text x="160" y="23" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="13" fill="white">RELIEF PARCEL</text>
      <text x="160" y="38" text-anchor="middle" font-family="Arial,sans-serif" font-size="10" fill="#aaffaa">1 box per household</text>
      <rect x="30" y="106" width="260" height="86" rx="5" fill="#e8e0d0" stroke="#aaa" stroke-width="2"/>
      <polygon points="30,106 30,68 110,88 110,106" fill="#d8d0c0" stroke="#aaa" stroke-width="1.5"/>
      <polygon points="290,106 290,64 210,86 210,106" fill="#ccc0b0" stroke="#aaa" stroke-width="1.5"/>
      <polygon points="30,106 110,88 210,86 290,106 160,96" fill="#ddd8c8" stroke="#aaa" stroke-width="1"/>
      <rect x="42" y="116" width="34" height="68" rx="8" fill="#1a8aff"/>
      <rect x="50" y="108" width="18" height="10" rx="3" fill="#0066cc"/>
      <text x="59" y="155" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="9" fill="white">WATER</text>
      <ellipse cx="120" cy="124" rx="26" ry="10" fill="#FFD700"/>
      <rect x="94" y="124" width="52" height="36" fill="#FFD700" stroke="#cc9900" stroke-width="1.5"/>
      <text x="120" y="146" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="10" fill="#555">FOOD</text>
      <ellipse cx="192" cy="174" rx="30" ry="14" fill="#999"/>
      <ellipse cx="192" cy="162" rx="30" ry="14" fill="#ccc" stroke="#999" stroke-width="1.5"/>
      <text x="192" y="166" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="9" fill="#333">BLANKET</text>
      <rect x="240" y="116" width="38" height="46" rx="3" fill="#007700"/>
      <text x="259" y="136" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="9" fill="white">HYGIENE</text>
      <text x="259" y="148" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="9" fill="white">KIT</text>
    </svg>`
  },
  {
    id: 'relief-truck',
    name: 'Relief Delivery Truck',
    svg: `<svg viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="200" fill="#f5f5f5"/>
      <rect x="0" y="168" width="320" height="6" fill="#ccc"/>
      <rect x="6" y="72" width="186" height="100" rx="4" fill="white" stroke="#555" stroke-width="2"/>
      <rect x="6" y="72" width="186" height="26" rx="4" fill="#cc0000"/>
      <rect x="6" y="88" width="186" height="10" fill="#cc0000"/>
      <text x="99" y="88" text-anchor="middle" font-family="Arial Black,sans-serif" font-weight="900" font-size="12" fill="white">DISASTER RELIEF</text>
      <rect x="14" y="104" width="40" height="60" rx="3" fill="#1a8aff" fill-opacity=".3" stroke="#1a8aff" stroke-width="2"/>
      <text x="34" y="137" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" font-weight="700" fill="#1a8aff">WATER</text>
      <rect x="62" y="104" width="40" height="60" rx="3" fill="#FFD700" fill-opacity=".5" stroke="#cc9900" stroke-width="2"/>
      <text x="82" y="137" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" font-weight="700" fill="#886600">FOOD</text>
      <rect x="110" y="104" width="40" height="60" rx="3" fill="#007700" fill-opacity=".25" stroke="#007700" stroke-width="2"/>
      <text x="130" y="132" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" font-weight="700" fill="#007700">BLAN-</text>
      <text x="130" y="144" text-anchor="middle" font-family="Arial,sans-serif" font-size="9" font-weight="700" fill="#007700">KETS</text>
      <rect x="158" y="104" width="28" height="60" rx="3" fill="#cc0000" fill-opacity=".2" stroke="#cc0000" stroke-width="2"/>
      <text x="172" y="137" text-anchor="middle" font-family="Arial,sans-serif" font-size="8" font-weight="700" fill="#cc0000">MEDS</text>
      <rect x="194" y="88" width="118" height="82" rx="5" fill="white" stroke="#555" stroke-width="2"/>
      <rect x="204" y="98" width="62" height="38" rx="4" fill="#b0d8ff" stroke="#555" stroke-width="1.5"/>
      <line x1="235" y1="98" x2="235" y2="136" stroke="#555" stroke-width="1.5"/>
      <line x1="234" y1="88" x2="234" y2="170" stroke="#555" stroke-width="2"/>
      <circle cx="54" cy="170" r="22" fill="#333" stroke="#555" stroke-width="2"/>
      <circle cx="54" cy="170" r="11" fill="#666"/>
      <circle cx="148" cy="170" r="22" fill="#333" stroke="#555" stroke-width="2"/>
      <circle cx="148" cy="170" r="11" fill="#666"/>
      <circle cx="270" cy="170" r="20" fill="#333" stroke="#555" stroke-width="2"/>
      <circle cx="270" cy="170" r="10" fill="#666"/>
    </svg>`
  }
];

export const ALL_IMAGES = {
  shelter: SHELTER_IMAGES,
  route: ROUTE_IMAGES,
  closure: CLOSURE_IMAGES,
  relief: RELIEF_IMAGES
};
