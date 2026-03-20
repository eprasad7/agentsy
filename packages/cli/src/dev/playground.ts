/**
 * Minimal playground HTML served at GET /playground.
 */
export function getPlaygroundHtml(agentName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${agentName} — Agentsy Playground</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0f; color: #e0e0e0; height: 100vh; display: flex; flex-direction: column; }
    header { padding: 16px 24px; border-bottom: 1px solid #1a1a2e; display: flex; align-items: center; gap: 12px; }
    header h1 { font-size: 16px; font-weight: 600; color: #f0f0f0; }
    header span { font-size: 12px; color: #666; background: #1a1a2e; padding: 2px 8px; border-radius: 4px; }
    #messages { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 16px; }
    .msg { max-width: 720px; line-height: 1.6; padding: 12px 16px; border-radius: 8px; }
    .msg.user { align-self: flex-end; background: #1e3a5f; }
    .msg.assistant { align-self: flex-start; background: #1a1a2e; }
    .msg.tool { align-self: flex-start; background: #1a2e1a; font-family: monospace; font-size: 13px; white-space: pre-wrap; }
    .meta { font-size: 11px; color: #666; margin-top: 8px; }
    form { padding: 16px 24px; border-top: 1px solid #1a1a2e; display: flex; gap: 8px; }
    input { flex: 1; padding: 12px 16px; background: #111118; border: 1px solid #2a2a3e; border-radius: 8px; color: #e0e0e0; font-size: 14px; outline: none; }
    input:focus { border-color: #4a6fa5; }
    button { padding: 12px 24px; background: #4a6fa5; color: white; border: none; border-radius: 8px; font-size: 14px; cursor: pointer; }
    button:hover { background: #5a7fb5; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
  </style>
</head>
<body>
  <header>
    <h1>${agentName}</h1>
    <span>agentsy dev</span>
  </header>
  <div id="messages"></div>
  <form id="form">
    <input id="input" type="text" placeholder="Type a message..." autocomplete="off" />
    <button type="submit">Send</button>
  </form>
  <script>
    const msgs = document.getElementById('messages');
    const form = document.getElementById('form');
    const input = document.getElementById('input');

    function addMsg(role, text, meta) {
      const div = document.createElement('div');
      div.className = 'msg ' + role;
      div.textContent = text;
      if (meta) {
        const m = document.createElement('div');
        m.className = 'meta';
        m.textContent = meta;
        div.appendChild(m);
      }
      msgs.appendChild(div);
      msgs.scrollTop = msgs.scrollHeight;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      addMsg('user', text);
      form.querySelector('button').disabled = true;
      try {
        const res = await fetch('/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: text }),
        });
        const data = await res.json();
        if (data.steps) {
          for (const step of data.steps) {
            if (step.type === 'tool_call') {
              addMsg('tool', step.toolName + '(' + JSON.stringify(step.toolArgs) + ')\\n→ ' + (step.toolResult || ''));
            }
          }
        }
        addMsg('assistant', data.output, 'Cost: $' + data.costUsd.toFixed(4) + ' | Tokens: ' + data.tokensIn + ' in / ' + data.tokensOut + ' out | ' + (data.durationMs / 1000).toFixed(1) + 's');
      } catch (err) {
        addMsg('assistant', 'Error: ' + err.message);
      }
      form.querySelector('button').disabled = false;
      input.focus();
    });
  </script>
</body>
</html>`;
}
