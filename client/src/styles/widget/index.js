/**
 * All widget CSS is imported as strings (`?inline`) and injected into the Shadow DOM by
 * widget/mount.jsx. Nothing is ever added to the host page's stylesheets, and the host
 * page's CSS cannot reach inside. Every class is still prefixed `sv-` for readability.
 */
import base from './base.css?inline';
import launcher from './launcher.css?inline';
import windowCss from './window.css?inline';
import welcome from './welcome.css?inline';
import messages from './messages.css?inline';
import composer from './composer.css?inline';
import overlays from './overlays.css?inline';

export default [base, launcher, windowCss, welcome, messages, composer, overlays].join('\n');
