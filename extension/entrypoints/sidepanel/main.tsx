import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './style.css';

const container = document.getElementById('root');
if (!container)
  throw new Error('#root is missing from the side panel document');

/*
 * Bootstrap's dark theme is an attribute, not a media query.
 *
 * Everything Bootstrap compiles to a literal colour — `.alert-warning`,
 * `.text-bg-light`, `.btn-outline-secondary`, the form controls' own borders —
 * is reachable only through `data-bs-theme`, and nothing was ever setting it.
 * So a member on a dark system got the tokens' dark ground with Bootstrap's
 * light components on top of it, which is most of what "text does not appear in
 * dark mode" meant on this surface.
 *
 * Kept in sync rather than read once: the side panel is a long-lived document
 * and a member can change their system theme while it is open.
 */
const dark = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
const applyTheme = () => {
  document.documentElement.dataset.bsTheme = dark?.matches ? 'dark' : 'light';
};
applyTheme();
dark?.addEventListener('change', applyTheme);

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
