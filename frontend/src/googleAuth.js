// src/googleAuth.js
export const renderGoogleButton = (elementId, clientId, callback) => {
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: callback,
  });

  window.google.accounts.id.renderButton(
    document.getElementById(elementId),
    {
      theme: "outline",
      size: "large",
      type: "standard",
      // width: "1000px",
      shape: "pill",
      text:"continue_with",
    }
  );
};
