// src/googleAuth.js
//
// Google Identity Services renders its button inside a cross-origin iframe, so
// no stylesheet of ours can size it. Everything here has to be settled through
// renderButton's own options.

// GIS treats `width` as a MINIMUM width in pixels and refuses anything above
// 400. It is not a CSS length: "100%" is unparseable and makes the button fall
// back to its smallest size, which is what made it look shrunken.
const GIS_MIN_WIDTH = 200;
const GIS_MAX_WIDTH = 400;
const FALLBACK_WIDTH = 320;

function widthFor(element) {
  // offsetWidth is 0 while the element is still unlaid-out or hidden; sizing
  // the button to 0 is how it ends up as a stub.
  const measured = Math.round(element.offsetWidth || 0);
  if (!measured) return FALLBACK_WIDTH;
  return Math.min(Math.max(measured, GIS_MIN_WIDTH), GIS_MAX_WIDTH);
}

// The GSI script tag is `async defer`, so window.google may not exist yet when
// React first mounts. Poll briefly rather than throwing on a cold load.
function whenGisReady(timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve(window.google.accounts.id);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(timer);
        resolve(window.google.accounts.id);
      } else if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error("Google sign-in script did not load"));
      }
    }, 50);
  });
}

/**
 * Render the Google button into `elementId` and keep it sized to its container.
 * Returns a cleanup function; call it when the host component unmounts.
 */
export function renderGoogleButton(elementId, clientId, callback) {
  let cancelled = false;
  let resizeTimer = null;
  let lastWidth = null;

  const draw = (gis) => {
    const element = document.getElementById(elementId);
    if (!element || cancelled) return;

    const width = widthFor(element);
    // The button lives in an iframe and cannot reflow, so it is only worth
    // redrawing when the width actually changes.
    if (width === lastWidth) return;
    lastWidth = width;

    element.innerHTML = "";
    gis.renderButton(element, {
      theme: "outline",
      size: "large",
      type: "standard",
      shape: "pill",
      text: "continue_with",
      logo_alignment: "left",
      width, // pixels, never a percentage
    });
  };

  const onResize = (gis) => () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => draw(gis), 150);
  };

  let detachResize = () => {};

  whenGisReady()
    .then((gis) => {
      if (cancelled) return;
      gis.initialize({ client_id: clientId, callback });
      draw(gis);

      const handler = onResize(gis);
      window.addEventListener("resize", handler);
      detachResize = () => window.removeEventListener("resize", handler);
    })
    .catch((err) => {
      console.error("Google sign-in unavailable:", err.message);
    });

  return () => {
    cancelled = true;
    clearTimeout(resizeTimer);
    detachResize();
  };
}
