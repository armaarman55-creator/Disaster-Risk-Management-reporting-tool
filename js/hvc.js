// js/hvc.js — Entry point for the HVC Assessment Tool
// Logic is split across three modules:
//   hvc-state.js       — shared state, constants, descriptors, ward picker
//   hvc-form.js        — page rendering, form, scoring, save, auto-save
//   hvc-assessments.js — view, edit, delete, download (XLSX / Word / PDF)
export { initHVC } from './hvc-form.js';
