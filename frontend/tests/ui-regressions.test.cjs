const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const root = path.resolve(__dirname, '..');
const cache = new Map();

// Compile project TSX for actual React SSR without adding a test runtime dependency.
function load(relative) {
  let filename = path.resolve(root, relative);
  if (!fs.existsSync(filename)) filename = ['.tsx', '.ts'].map(ext => filename + ext).find(fs.existsSync);
  if (cache.has(filename)) return cache.get(filename).exports;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  cache.set(filename, mod);
  const nativeRequire = mod.require.bind(mod);
  mod.require = (id) => {
    if (id.startsWith('@/')) return load(id.slice(2));
    if (id.startsWith('.')) return load(path.resolve(path.dirname(filename), id));
    return nativeRequire(id);
  };
  const source = fs.readFileSync(filename, 'utf8');
  mod._compile(ts.transpileModule(source, { compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
  }}).outputText, filename);
  return mod.exports;
}

function source(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function ast(file) { return ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); }
function walk(node, fn) { fn(node); ts.forEachChild(node, child => walk(child, fn)); }

test('empty chat has stable markup across server renders and a labelled composer', () => {
  const { ChatPanel } = load('components/chat/ChatPanel');
  const props = { conversationId: null, onConversationCreated() {}, onMessageSent() {} };
  const first = renderToStaticMarkup(React.createElement(ChatPanel, props));
  for (let i = 0; i < 8; i++) assert.equal(renderToStaticMarkup(React.createElement(ChatPanel, props)), first);
  assert.match(first, /Big ideas\./);
  assert.match(first, /Meet your team\./);
  assert.equal((first.match(/<textarea/g) || []).length, 1);
  assert.equal((first.match(/type="file"/g) || []).length, 1);
  assert.match(first, /aria-label="Attach files"/);
  assert.match(first, /textarea[^>]*aria-label="Message"/);
});

test('command palette and shortcut dialog retain centering with motion transforms', () => {
  for (const [file, name, expected] of [
    ['components/layout/CommandPalette', 'CommandPalette', /translateX\(-50%\)/],
    ['components/layout/ShortcutsOverlay', 'ShortcutsOverlay', /translateX\(-50%\) translateY\(-50%\)/],
  ]) {
    const Component = load(file)[name];
    const html = renderToStaticMarkup(React.createElement(Component, { open: true, onClose() {} }));
    assert.match(html, /role="dialog"/);
    assert.match(html, expected);
  }
});

test('the shared composer preserves IME composition and Shift+Enter', () => {
  const tree = ast('components/chat/ChatPanel.tsx');
  const handlers = [];
  walk(tree, node => {
    if (ts.isJsxAttribute(node) && node.name.getText(tree) === 'onKeyDown') handlers.push(node.initializer.expression.getText(tree));
  });
  assert.equal(handlers.length, 1);
  for (const expression of handlers) {
    let sent = 0, prevented = 0;
    const handle = vm.runInNewContext(`(${expression})`, { handleSend: () => sent++ });
    const event = (shiftKey, isComposing) => ({ key: 'Enter', shiftKey, nativeEvent: { isComposing }, preventDefault: () => prevented++ });
    handle(event(false, true));
    handle(event(true, false));
    assert.equal(sent, 0);
    assert.equal(prevented, 0);
    handle(event(false, false));
    assert.equal(sent, 1);
    assert.equal(prevented, 1);
  }
});

test('history controls never nest interactive buttons', () => {
  const tree = ast('components/chat/ChatHistory.tsx');
  const tag = node => ts.isJsxElement(node) ? node.openingElement.tagName.getText(tree) : '';
  walk(tree, node => {
    if (!['button', 'motion.button'].includes(tag(node))) return;
    node.children.forEach(child => walk(child, inner => {
      assert.ok(!['button', 'motion.button'].includes(tag(inner)), 'A button contains another button');
    }));
  });
});

test('FastAPI form validation errors are always readable strings', () => {
  const { apiErrorMessage } = load('lib/api-error');
  assert.equal(apiErrorMessage({ detail: [{ msg: 'Invalid email' }, { msg: 'Password too short' }] }, 'Failed'), 'Invalid email; Password too short');
  assert.equal(apiErrorMessage({ detail: 'Invalid credentials' }, 'Failed'), 'Invalid credentials');
  assert.equal(apiErrorMessage({ detail: { msg: 'Try again' } }, 'Failed'), 'Try again');
  assert.equal(apiErrorMessage({ detail: [{ input: 'secret' }] }, 'Failed'), 'Failed');
  assert.equal(apiErrorMessage(null, 'Failed'), 'Failed');
});

test('first paint honors a saved theme before React hydrates', () => {
  const tree = ast('app/layout.tsx');
  let script;
  walk(tree, node => {
    if (ts.isPropertyAssignment(node) && node.name.getText(tree) === '__html') script = node.initializer.text;
  });
  assert.ok(script);
  for (const [saved, lightSystem, expected] of [['dark', true, 'dark'], ['light', false, 'light'], [null, true, 'light'], ['invalid', false, 'dark']]) {
    let theme;
    vm.runInNewContext(script, {
      localStorage: { getItem: () => saved },
      window: { matchMedia: () => ({ matches: lightSystem }) },
      document: { documentElement: { setAttribute: (_, value) => theme = value }, querySelector: () => null },
    });
    assert.equal(theme, expected);
  }
});

function functionFromSource(file, name, context) {
  const tree = ast(file);
  let expression;
  walk(tree, node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) expression = node.initializer.getText(tree);
  });
  assert.ok(expression, `Missing ${name}`);
  const js = ts.transpileModule(`(${expression})`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  return vm.runInNewContext(js, context);
}

function sendHarness(fetch) {
  const state = { input: 'Keep my draft', attachedFiles: [{ name: 'note.txt', type: 'text', content: 'notes' }], messages: [], thinking: false, error: null, created: [] };
  const context = {
    input: state.input, attachedFiles: state.attachedFiles, isRecording: false, isRecordingRef: { current: false },
    buildMessageWithFiles: text => text, isThinking: false, loadingConversation: false,
    sendingRef: { current: false }, conversationGenerationRef: { current: 1 }, followMessagesRef: { current: false },
    setShowScrollToBottom() {}, setInput: value => state.input = value, setAttachedFiles: value => state.attachedFiles = value,
    setError: value => state.error = value, resetPipeline() {},
    setMessages: update => state.messages = update(state.messages), setIsThinking: value => state.thinking = value,
    conversationId: null, AbortController, createRequestRef: { current: null }, fetch, API_URL: 'http://example.invalid',
    getAuthHeaders: () => ({}), pendingMessageRef: { current: null }, pendingAttachmentsRef: { current: [] },
    skipNextLoadRef: { current: false }, onConversationCreated: id => state.created.push(id), wsRef: { current: null },
  };
  return { state, context, send: functionFromSource('components/chat/ChatPanel.tsx', 'handleSend', context) };
}

test('failed conversation creation restores the draft and attachment instead of losing them', async () => {
  const { state, context, send } = sendHarness(async () => ({ ok: false }));
  await send();
  assert.equal(state.input, 'Keep my draft');
  assert.equal(state.attachedFiles[0].name, 'note.txt');
  assert.equal(state.messages.length, 0);
  assert.equal(state.thinking, false);
  assert.equal(context.sendingRef.current, false);
  assert.equal(context.pendingMessageRef.current, null);
  assert.equal(state.created.length, 0);
  assert.match(state.error, /draft has been restored/);
});

test('double submission creates only one conversation', async () => {
  let resolve, requests = 0;
  const response = new Promise(r => resolve = r);
  const { state, send } = sendHarness(() => { requests++; return response; });
  const first = send();
  await send();
  assert.equal(requests, 1);
  resolve({ ok: true, json: async () => ({ id: 'new-chat' }) });
  await first;
  assert.deepEqual(state.created, ['new-chat']);
});

test('a completed create request cannot navigate back after the user changes chats', async () => {
  let resolve;
  const response = new Promise(r => resolve = r);
  const { state, context, send } = sendHarness(() => response);
  const pending = send();
  context.conversationGenerationRef.current += 1;
  resolve({ ok: true, json: async () => ({ id: 'stale-chat' }) });
  await pending;
  assert.equal(state.created.length, 0);
  assert.equal(context.pendingMessageRef.current, null);
});

test('failed deletion leaves the conversation visible and reports an error', async () => {
  let listChanges = 0, error, changedChat = false;
  const context = {
    mutationController: { current: null }, AbortController, setPending() {}, setError: value => error = value,
    API_URL: 'http://example.invalid', getAuthHeaders: () => ({}), fetch: async () => ({ ok: false }),
    listVersion: { current: 0 }, setConversations: () => listChanges++, setResults: () => listChanges++,
    setDeleteId() {}, activeId: 'chat', onNewChat: () => changedChat = true,
  };
  await functionFromSource('components/chat/ChatHistory.tsx', 'mutate', context)('chat', 'delete');
  assert.equal(listChanges, 0);
  assert.equal(changedChat, false);
  assert.match(error, /Could not delete/);
  assert.equal(context.mutationController.current, null);
});

test('task starters prepare editable drafts and focus the caret without sending a request', () => {
  const { STARTERS } = load('components/workspace/WorkspaceWelcome');
  for (const starter of STARTERS) {
    let draft, focused = false, selection, templates;
    const insert = functionFromSource('components/chat/ChatPanel.tsx', 'insertPrompt', {
      setInput: value => draft = value,
      setShowTemplates: value => templates = value,
      requestAnimationFrame: callback => callback(),
      inputRef: { current: { focus: () => focused = true, setSelectionRange: (start, end) => selection = [start, end] } },
      handleSend: () => assert.fail('A starter must not send a message before it is customized'),
      fetch: () => assert.fail('A starter must not make a network request'),
    });
    insert(starter.prompt);
    assert.equal(draft, starter.prompt);
    assert.ok(focused);
    assert.deepEqual(selection, [draft.length, draft.length]);
    assert.equal(templates, false);
  }
});

test('sidebar identifies the current view and retains meaningful collapsed controls', () => {
  const { Sidebar } = load('components/layout/Sidebar');
  for (const [currentView, label] of [['chat', 'Workspace'], ['agents', 'Your team'], ['dashboard', 'Insights']]) {
    for (const collapsed of [true, false]) {
      const html = renderToStaticMarkup(React.createElement(Sidebar, { currentView, collapsed, onNavigate() {}, onToggle() {} }));
      assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
      assert.match(html, new RegExp(`aria-current="page" aria-label="${label}"`));
      assert.match(html, /aria-label="Search tasks and commands"/);
      assert.match(html, /title="New task"/);
      assert.doesNotMatch(html, /role="dialog"/, 'Sign in must not interrupt the initial workspace');
    }
  }
});

test('notifications stay within the viewport when opened from the header or near a screen edge', () => {
  const { getNotificationPlacement } = load('components/notifications/NotificationCenter');
  for (const [width, height, rect] of [
    [1440, 900, { top: 22, bottom: 56, right: 1380 }],
    [375, 667, { top: 14, bottom: 48, right: 359 }],
    [320, 568, { top: 14, bottom: 48, right: 304 }],
    [768, 320, { top: 14, bottom: 48, right: 752 }],
    [375, 667, { top: 610, bottom: 644, right: 44 }],
  ]) {
    const result = getNotificationPlacement(rect, width, height);
    assert.ok(result.left >= 12);
    assert.ok(result.left + result.width <= width - 12);
    assert.ok(result.top >= 0);
    assert.ok(result.top + result.maxHeight <= height - 12);
    assert.ok(result.maxHeight > 100);
    if (rect.top < 60) assert.ok(result.top >= rect.bottom, 'Header notifications should open below the bell');
  }
});

test('failed specialist deletion keeps the card visible and shows an actionable error', async () => {
  let removed = false, error, pending;
  const remove = functionFromSource('components/agents/AgentBuilder.tsx', 'handleDelete', {
    deletingId: null, confirm: () => true, setDeletingId: value => pending = value,
    setError: value => error = value, API_URL: 'http://example.invalid',
    fetch: async () => ({ ok: false }), setAgents: () => removed = true,
  });
  await remove('my-specialist');
  assert.equal(removed, false);
  assert.equal(pending, null);
  assert.match(error, /Could not delete.*try again/);
});
