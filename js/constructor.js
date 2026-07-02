(function () {
  if (window.__livettaConstructorReady) return;

  const script = document.createElement('script');
  script.src = '/js/constructor-fallback.js?v=20260703-clean-constructor';
  script.defer = true;
  document.head.appendChild(script);
})();
