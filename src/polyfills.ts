/**
 * NativeScript Polyfills
 */

// Install @nativescript/core polyfills (XHR, setTimeout, requestAnimationFrame)
import '@nativescript/core/globals';
// Disable browser-only Zone patches before Zone loads (MutationObserver, XHR, etc.)
import '@nativescript/zone-js/dist/pre-zone-polyfills';
// Zone.js core — defines the Zone global required by Angular's NgZone
import 'zone.js';
// NativeScript-specific Zone patches
import '@nativescript/zone-js';
// Install @nativescript/angular specific polyfills
import '@nativescript/angular/polyfills';