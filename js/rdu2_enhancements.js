// RDU2 redirect — sends to our custom page
(function() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('id') === 'RDU2') {
    window.location.replace('rdu2.html');
  }
})();
