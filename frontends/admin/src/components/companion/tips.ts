// Copied from Nexo frontends/nexo/src/companion at 2ec1f69d; keep in step by hand.
// Admin: one tip per client-zone screen, written from each page's own copy (no feature the page does not have).
import type { Screen } from './model';
/** Per-screen tips. order: steps 1, 3, 4, 5 and a declined request; shipping: step 2 · Accepted; results: step 6 · Released. */
export const tips: Record<Screen, { title: string; text: string }> = {
  home: { title: 'Your orders', text: 'Each order shows the step it has reached; open one to see what happens next. Released datasets are listed under Datasets.' },
  request: { title: 'Request an order', text: 'Tell the lab what you would like measured. The lab reviews the request first: ship nothing until the order shows Accepted.' },
  order: { title: 'Follow your order', text: 'The six steps show where this order is. The panel under them says whether anything is needed from you.' },
  shipping: { title: 'Send your samples', text: 'Write the order code on every box and ship as this page says. The lab records the arrival here.' },
  results: { title: 'Your results', text: 'Download the files the lab shared under Your files. When the lab has turned Nexo on for you, Open in Nexo lets you explore the dataset.' },
  choose: { title: 'Choose a client', text: 'You belong to more than one client. Pick the one whose orders you want to see; you can change it later.' },
  notifications: { title: 'Your emails', text: 'These are the emails the lab sends you. Each kind stays on until you turn it off here.' },
  'sign-in': { title: 'Sign in', text: 'Use your email and password to follow your orders and results. New to the service? Request access below.' },
  'request-access': { title: 'Request access', text: 'Tell the lab who you are and what you would like measured. The lab reviews it by hand; if approved, you get a link to set your password.' },
  'forgot-password': { title: 'Forgot your password?', text: 'Enter the email you sign in with and we send a link to choose a new password. The link works once, for one hour.' },
  'reset-password': { title: 'Choose a new password', text: 'Type the new password twice. This link works once; after the change you sign in again with the new password.' },
  activate: { title: 'Choose your password', text: 'Type your password twice to activate your account. Then you sign in with your email and this password.' },
  invite: { title: 'Your invitation', text: 'The card shows the email this invitation is for and when it expires. Accept it with that email before then.' },
};
export const welcome = { title: "Hi, I'm your lab guide", text: "Your orders and released results are all here. I'll stay nearby; click me any time." };
