// Restore path encoded by 404.html for GitHub Pages SPA routing
(function () {
  var params = new URLSearchParams(window.location.search);
  var p = params.get('p');
  if (p) {
    var parts = p.split('&');
    var path = '/' + decodeURIComponent(parts[0]);
    var query = parts.length > 1 ? '?' + parts.slice(1).join('&') : '';
    window.history.replaceState(null, null, path + query + window.location.hash);
  }
})();
