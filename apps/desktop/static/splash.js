'use strict';

// Shows the status main passes in the query string (e.g. while the database is
// being updated). The copy comes from main (SPLASH_UPDATING), so it lives in one place.
(function () {
  const message = new URLSearchParams(location.search).get('message');
  if (message) document.getElementById('status').textContent = message;
})();
