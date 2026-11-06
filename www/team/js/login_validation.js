/* Sign-in feedback stays in the card: field errors under each input, one alert strip above Sign in.
   Mirrors team_login_field_errors() in R/frontends/team/login-validation.R. */
(function () {
  'use strict';
  var FIELDS = {email: 'team_library_email', password: 'team_library_password'};
  var MESSAGES = {email_empty: 'Enter the email on your invitation.', email_invalid: 'Enter a valid email address.', password_empty: 'Enter your password.'};
  function fieldErrors(email, password) {
    var errors = {}; email = String(email || '').trim();
    if (!email) errors.email = MESSAGES.email_empty;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = MESSAGES.email_invalid;
    if (!password) errors.password = MESSAGES.password_empty;
    return errors;
  }
  function describedBy(input, id, add) {
    var tokens = (input.getAttribute('aria-describedby') || '').split(/\s+/).filter(function (t) { return t && t !== id; });
    if (add) tokens.push(id);
    if (tokens.length) input.setAttribute('aria-describedby', tokens.join(' ')); else input.removeAttribute('aria-describedby');
  }
  function setFieldError(id, message) {
    var input = document.getElementById(id), slot = document.getElementById(id + '_error');
    if (!input) return;
    if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
    if (!slot) return;
    slot.textContent = message || ''; slot.hidden = !message; describedBy(input, slot.id, !!message);
  }
  function setAlert(message) {
    var alert = document.getElementById('team_library_login_alert');
    if (!alert) return;
    alert.textContent = message || ''; alert.hidden = !message;
  }
  // Paints every field (clearing the valid ones) and returns the first invalid input.
  function paint(errors) {
    var first = null;
    Object.keys(FIELDS).forEach(function (key) {
      setFieldError(FIELDS[key], errors[key]);
      if (errors[key] && !first) first = document.getElementById(FIELDS[key]);
    });
    return first;
  }
  // Window capture runs before the foreground progress dialog (document capture) and the Shiny button
  // binding, so an invalid form never opens a modal or reaches the server. Typed values are untouched.
  window.addEventListener('click', function (event) {
    var button = event.target.closest && event.target.closest('#team_library_login');
    if (!button || button.disabled) return;
    var email = document.getElementById(FIELDS.email), password = document.getElementById(FIELDS.password);
    if (!email || !password) return;
    setAlert('');
    var first = paint(fieldErrors(email.value, password.value));
    if (!first) return;
    event.preventDefault(); event.stopImmediatePropagation();
    first.focus();
  }, true);
  document.addEventListener('input', function (event) {
    var id = event.target && event.target.id;
    if ((id === FIELDS.email || id === FIELDS.password) && event.target.getAttribute('aria-invalid') === 'true') setFieldError(id, '');
  });
  function register() {
    if (!window.Shiny || typeof Shiny.addCustomMessageHandler !== 'function') return;
    // Server-side mirror of the checks, and refusals (rejection, attempt limiter, startup failure).
    Shiny.addCustomMessageHandler('team-login-feedback', function (message) {
      message = message || {};
      var fields = message.fields && typeof message.fields === 'object' && !Array.isArray(message.fields) ? message.fields : {};
      var first = paint(fields);
      setAlert(typeof message.alert === 'string' ? message.alert : '');
      // After the foreground dialog, if any, has returned focus.
      if (first) setTimeout(function () { if (first.isConnected) first.focus(); }, 0);
    });
  }
  register();
  if (window.jQuery) jQuery(document).on('shiny:connected', register);
  window.TeamLoginValidation = {fieldErrors: fieldErrors};
})();
