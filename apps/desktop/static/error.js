'use strict';

// Fills the error screen from the query string. The copy itself comes from main
// (startupErrorCopy), so this page holds no second copy of the strings.
(function () {
  const params = new URLSearchParams(location.search);
  const text = (id, value) => {
    const el = document.getElementById(id);
    el.textContent = value || '';
    el.hidden = !value;
  };

  document.body.dataset.kind = params.get('kind') || '';
  const title = params.get('title') || '';
  text('title', title);
  if (title) document.title = title;
  text('body', params.get('body'));
  const logs = params.get('logs');
  text('logs', logs ? `Logs: ${logs}` : '');
  text('detail', params.get('detail'));

  const api = window.mygolfviz;
  const wire = (id, action) => {
    const button = document.getElementById(id);
    button.addEventListener('click', () => {
      if (!api) return;
      button.disabled = true;
      api[action]()
        .catch(() => {})
        .finally(() => {
          button.disabled = false;
        });
    });
  };
  wire('restart', 'restartBackend');
  wire('open-logs', 'openLogs');
  wire('quit', 'quit');
})();
