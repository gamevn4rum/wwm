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

// Refuse to be framed. GitHub Pages cannot send X-Frame-Options or a CSP frame-ancestors header,
// and a meta-tag CSP ignores frame-ancestors, so this is the only clickjacking guard the site has.
if (window.top !== window.self) {
  try {
    window.top.location = window.self.location.href;
  } catch (e) {
    document.documentElement.style.display = 'none';
  }
}
