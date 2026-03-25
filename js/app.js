diff --git a/js/app.js b/js/app.js
index ca89092b19b2ea55d485972f7ffac8137739c088..7cc8996e172c8d01cfc5545b6b12fc5163a998b3 100644
--- a/js/app.js
+++ b/js/app.js
@@ -145,51 +145,51 @@ export function navigateTo(pageId, navItem) {
     stakeholders: 'Stakeholder directory',
     admin:        'Disaster Admin Panel',
     profile:      'My profile',
     'risk-map':   'Risk map',
     history:      'Assessment history',
     mitigations:  'Mitigations',
     idp:          'IDP Linkage',
     reports:      'Reports'
   };
   setEl('tb-crumb', crumbs[pageId] || pageId);
 
   loadPageModule(pageId);
 }
 
 async function loadPageModule(pageId) {
   try {
     switch (pageId) {
       case 'dashboard':    { const m = await import('./dashboard.js');    m.initDashboard(_user);    break; }
       case 'community':    { const m = await import('./community.js');    m.initCommunity(_user);    break; }
       case 'routes':       { const m = await import('./routes.js');       m.initRoutes(_user);       break; }
       case 'sitrep':       { const m = await import('./sitrep.js');       m.initSitrep(_user);       break; }
       case 'mopup':        { const m = await import('./mopup.js');        m.initMopup(_user);        break; }
       case 'stakeholders': { const m = await import('./stakeholders.js'); m.initStakeholders(_user); break; }
       case 'hvc':          { const m = await import('./hvc.js');          m.initHVC(_user);          break; }
       case 'idp':          { const m = await import('./idp.js');          m.initIDP(_user);          break; }
-      case 'admin':        { const m = await import('./admin.js');        m.initAdmin(_user);        break; }
+      case 'admin':        { const m = await import('./admin.js?v=20260325'); m.initAdmin(_user);    break; }
       case 'profile':      { const m = await import('./profile.js');      m.initProfile(_user);      break; }
       case 'risk-map':    renderPlaceholder('risk-map',    'Risk map',          'Complete HVC assessments to generate a full risk map.');    break;
       case 'history':     renderPlaceholder('history',     'Assessment history','All completed HVC assessments will appear here.');           break;
       case 'mitigations': renderPlaceholder('mitigations', 'Mitigation library','Pre-built mitigations from the hazard library.');            break;
       case 'reports':     renderPlaceholder('reports',     'Reports',           'Export centre — SitReps, HVC reports and IDP summaries.');   break;
     }
   } catch(e) {
     console.warn('Page module load failed:', pageId, e);
   }
 }
 
 // ── FOOTER ────────────────────────────────────────────────
 function initFooter() {
   document.getElementById('footer-theme-btn')?.addEventListener('click', toggleTheme);
   document.getElementById('rail-theme-btn')?.addEventListener('click',   toggleTheme);
   document.getElementById('footer-signout')?.addEventListener('click', async () => {
     const { signOut } = await import('./auth.js');
     signOut();
   });
 
   // Clicking avatar or name goes to profile
   ['user-av', 'user-info-wrap'].forEach(id => {
     document.getElementById(id)?.addEventListener('click', () => navigateTo('profile'));
   });
 }
