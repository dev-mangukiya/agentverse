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
  assert.match(first, /What can we help you with\?/);
  assert.match(first, /One chat for research, writing, and code\./);
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
    setShowScrollToBottom() {}, setInput: value => state.input = typeof value === "function" ? value(state.input) : value, setAttachedFiles: value => state.attachedFiles = typeof value === "function" ? value(state.attachedFiles) : value,
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
  for (const [currentView, label] of [['chat', 'Chat'], ['agents', 'Agents'], ['dashboard', 'Activity']]) {
    for (const collapsed of [true, false]) {
      const html = renderToStaticMarkup(React.createElement(Sidebar, { currentView, collapsed, onNavigate() {}, onToggle() {} }));
      assert.equal((html.match(/aria-current="page"/g) || []).length, 1);
      assert.match(html, new RegExp(`aria-current="page" aria-label="${label}"`));
      assert.match(html, /aria-label="Search chats and commands"/);
      assert.match(html, /title="New chat"/);
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
    getAuthHeaders: () => ({}), deletingId: null, confirm: () => true, setDeletingId: value => pending = value,
    setError: value => error = value, API_URL: 'http://example.invalid',
    fetch: async () => ({ ok: false }), setAgents: () => removed = true,
  });
  await remove('my-specialist');
  assert.equal(removed, false);
  assert.equal(pending, null);
  assert.match(error, /Could not delete.*try again/);
});

function frameClock() {
  let nextId = 1;
  const pending = new Map();
  return {
    request(callback) { const id = nextId++; pending.set(id, callback); return id; },
    cancel(id) { pending.delete(id); },
    tick(time) { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(callback => callback(time)); },
    get pending() { return pending.size; },
  };
}

test('stream bursts batch Markdown updates and flush exact Unicode and code on completion', () => {
  const { createTextBuffer } = load('lib/chat-motion');
  const clock = frameClock(), paints = [];
  const buffer = createTextBuffer(clock, text => paints.push(text));
  const chunks = ['Hello ', '👩🏽‍💻', '\n```js\n', 'const a = 1;\n', '```'];
  chunks.forEach(chunk => buffer.append(chunk));
  assert.equal(clock.pending, 1);
  assert.equal(paints.length, 0);
  clock.tick(0);
  assert.deepEqual(paints, [chunks.join('')]);
  buffer.append('\nDone');
  clock.tick(8);
  assert.equal(paints.length, 1);
  buffer.flush(); // Finalization must work even when RAF is paused in a hidden tab.
  assert.equal(paints.at(-1), chunks.join('') + '\nDone');
  assert.equal(clock.pending, 0);
  buffer.cancel();
  buffer.append('late token');
  clock.tick(100);
  assert.equal(paints.length, 2);
});

function streamHarness() {
  const tree = ast('components/chat/ChatPanel.tsx');
  let handler;
  walk(tree, node => {
    if (ts.isBinaryExpression(node) && node.left.getText(tree) === 'ws.onmessage') handler = node.right.getText(tree);
  });
  assert.ok(handler);
  const state = { messages: [], updates: 0, refreshed: 0, thinking: true };
  const clock = frameClock();
  const ws = {};
  const context = {
    destroyed: false, ws, wsRef: { current: ws }, streamSequence: 0,
    requestAnimationFrame: function(callback) { 'use strict'; assert.equal(this, undefined, 'native RAF cannot be called with the clock as its receiver'); return clock.request(callback); },
    cancelAnimationFrame: function(id) { 'use strict'; assert.equal(this, undefined); clock.cancel(id); },
    createLiveText: load('lib/chat-motion').createLiveText,
    streamingMessageRef: { current: null }, sendingRef: { current: true },
    callbacksRef: { current: { onMessageSent() { state.refreshed++; }, emitPipeline() {} } },
    setMessages(update) { state.messages = update(state.messages); state.updates++; },
    setIsThinking(value) { state.thinking = value; }, setToolActivity() {}, setThinkingAgent() {},
    thinkingAgentRef: { current: '' }, setThinkingPhase() {}, setActiveAgents() {}, setError() {},
    pipelineAgentsRef: { current: [] }, notifyRef: { current: null }, conversationId: 'chat-1',
    setIsStopping() {}, stopTimeoutRef: { current: null }, clearTimeout() {},
  };
  const js = ts.transpileModule(`(${handler})`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const receive = vm.runInNewContext(js, context);
  return { state, context, clock, emit: data => receive({ data: JSON.stringify(data) }) };
}

test('saved response preserves the streamed bubble identity and cannot be overwritten by a pending frame', () => {
  const h = streamHarness();
  h.emit({ type: 'stream_start', agent: 'writer' });
  const renderKey = h.state.messages[0].renderKey;
  h.emit({ type: 'stream_token', token: 'First draft' });
  h.emit({ type: 'pipeline_complete' });
  assert.equal(h.state.thinking, true, 'composer stays locked until the saved response');
  h.emit({ type: 'response', message: { id: 'saved-42', role: 'agent', content: 'Final reviewed answer', agent_name: 'writer' } });
  assert.equal(h.state.messages.length, 1);
  assert.equal(h.state.messages[0].renderKey, renderKey);
  assert.equal(h.state.messages[0].id, 'saved-42', 'feedback uses the real server id');
  assert.equal(h.state.messages[0].isStreaming, false);
  assert.equal(h.state.messages[0].content, 'Final reviewed answer');
  assert.equal(h.state.refreshed, 1);
  h.clock.tick(100);
  assert.equal(h.state.messages[0].content, 'Final reviewed answer');
  assert.equal(h.clock.pending, 0);
});

test('stream end flushes the last chunk and errors retain partial replies without exposing feedback', () => {
  const h = streamHarness();
  h.emit({ type: 'stream_start' });
  h.emit({ type: 'stream_token', token: 'Some ' });
  h.emit({ type: 'stream_end' });
  assert.equal(h.state.messages[0].liveText.getSnapshot(), 'Some ');
  h.emit({ type: 'stream_token', token: 'more text' });
  h.emit({ type: 'error', content: 'Connection interrupted' });
  assert.equal(h.state.messages[0].content, 'Some more text');
  assert.equal(h.state.messages[0].incomplete, true);
  assert.equal(h.state.messages[0].isStreaming, false);
  assert.equal(h.clock.pending, 0);
});

test('stale socket events and queued paints cannot update a different conversation', () => {
  const h = streamHarness();
  h.emit({ type: 'stream_start' });
  h.emit({ type: 'stream_token', token: 'old conversation' });
  h.context.destroyed = true;
  h.emit({ type: 'response', message: { id: 'old', content: 'Old final answer' } });
  h.clock.tick(100);
  assert.equal(h.state.updates, 1);
  assert.equal(h.state.refreshed, 0);
});

test('follow scrolling eases toward a changing target, settles exactly, and stops on interruption', () => {
  const { createScrollFollower } = load('lib/chat-motion');
  const clock = frameClock();
  let top = 0, bottom = 500;
  const follower = createScrollFollower(clock, () => ({ top, bottom }), value => { top = value; }, () => false);
  follower.follow(); follower.follow();
  assert.equal(clock.pending, 1);
  clock.tick(0);
  assert.ok(top > 0 && top < 500);
  const previous = top;
  bottom = 750;
  clock.tick(16);
  assert.ok(top > previous && top < bottom);
  for (let time = 32; time < 1000; time += 16) clock.tick(time);
  assert.equal(top, 750);
  assert.equal(clock.pending, 0);
  bottom = 1000;
  follower.follow();
  follower.stop();
  clock.tick(1016);
  assert.equal(top, 750);
  assert.equal(follower.running, false);
});

test('reduced motion and initial history positioning avoid animated scrolling', () => {
  const { createScrollFollower } = load('lib/chat-motion');
  const clock = frameClock();
  let top = 0, bottom = 2000;
  const follower = createScrollFollower(clock, () => ({ top, bottom }), value => { top = value; }, () => true);
  follower.follow();
  clock.tick(0);
  assert.equal(top, 2000);
  assert.equal(clock.pending, 0);
  bottom = 5000;
  follower.jump();
  assert.equal(top, 5000);
  assert.equal(clock.pending, 0);
});

function scrollHarness() {
  const tree = ast('hooks/useChatScroll.ts');
  let effect;
  walk(tree, node => {
    if (ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect' && node.arguments[0].getText(tree).includes('new ResizeObserver')) effect = node.arguments[0].getText(tree);
  });
  const clock = frameClock(), handlers = new Map();
  const viewport = {
    clientHeight: 400, scrollHeight: 1000, scrollTop: 600, clientWidth: 500,
    getBoundingClientRect: () => ({ left: 0 }),
    addEventListener: (name, callback) => handlers.set(name, callback),
    removeEventListener: name => handlers.delete(name),
  };
  let onResize, visible = false, disconnected = false;
  const followingRef = { current: true };
  const followerRef = { current: null };
  const context = {
    viewportRef: { current: viewport }, contentRef: { current: {} }, followingRef, followerRef,
    loadingRef: { current: false }, jumpOnResize: { current: false },
    showLatest: value => { visible = value; },
    window: { matchMedia: () => ({ matches: false }) },
    createScrollFollower: load('lib/chat-motion').createScrollFollower,
    requestAnimationFrame: function(callback) { 'use strict'; assert.equal(this, undefined, 'native RAF cannot be called with the clock as its receiver'); return clock.request(callback); },
    cancelAnimationFrame: function(id) { 'use strict'; assert.equal(this, undefined); clock.cancel(id); },
    ResizeObserver: class { constructor(callback) { onResize = callback; } observe() {} disconnect() { disconnected = true; } },
  };
  const js = ts.transpileModule(`(${effect})`, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const cleanup = vm.runInNewContext(js, context)();
  return { viewport, followingRef, followerRef, clock, handlers, resize: () => onResize(), cleanup, get visible() { return visible; }, get disconnected() { return disconnected; } };
}

test('scrolling up takes control immediately, even near the bottom, until the reader returns', () => {
  const h = scrollHarness();
  h.resize();
  assert.equal(h.clock.pending, 1);
  h.handlers.get('wheel')({ deltaY: -1 });
  assert.equal(h.clock.pending, 0);
  h.viewport.scrollTop = 599;
  h.handlers.get('scroll')();
  assert.equal(h.followingRef.current, false);
  assert.equal(h.visible, true);
  h.viewport.scrollHeight = 1100;
  h.resize();
  assert.equal(h.clock.pending, 0);
  h.viewport.scrollTop = 700;
  h.handlers.get('scroll')();
  assert.equal(h.followingRef.current, true);
  assert.equal(h.visible, false);
  h.resize();
  h.cleanup();
  assert.equal(h.clock.pending, 0);
  assert.equal(h.handlers.size, 0);
  assert.equal(h.disconnected, true);
});

test('touch and keyboard read-back pause follow scrolling', () => {
  for (const gesture of ['touch', 'keyboard', 'scrollbar']) {
    const h = scrollHarness();
    if (gesture === 'touch') {
      h.handlers.get('touchstart')({ touches: [{ clientY: 100 }] });
      h.handlers.get('touchmove')({ touches: [{ clientY: 120 }] });
    } else if (gesture === 'keyboard') {
      h.handlers.get('keydown')({ key: 'PageUp', target: { closest: () => null } });
    } else h.handlers.get('pointerdown')({ clientX: 503, button: 0 });
    assert.equal(h.followingRef.current, false, gesture);
    h.resize();
    assert.equal(h.clock.pending, 0, gesture);
    h.cleanup();
  }
});

test('hundreds of streamed tokens update only the live text subscription, not chat state', () => {
  const h = streamHarness();
  h.state.messages = [{ id: 'old', role: 'agent', content: 'Earlier response' }, { id: 'pending', renderKey: 'stable', role: 'agent', awaiting: true, content: '' }];
  const previous = h.state.messages[0];
  h.emit({ type: 'stream_start', agent: 'writer' });
  assert.equal(h.state.messages.length, 2);
  assert.equal(h.state.messages[1].renderKey, 'stable');
  const source = h.state.messages[1].liveText;
  let rendered = 0;
  const unsubscribe = source.subscribe(() => rendered++);
  for (let index = 0; index < 300; index++) {
    h.emit({ type: 'stream_token', token: `word${index} ` });
    h.clock.tick(index * 16);
  }
  assert.equal(h.state.updates, 1, 'no parent render on tokens');
  assert.equal(h.state.messages[0], previous, 'completed rows retain their object identity');
  assert.equal(rendered, 300);
  assert.match(source.getSnapshot(), /word299 $/);
  unsubscribe();
  source.append('final'); source.flush();
  assert.equal(rendered, 300);
});

test('tool preambles reset the same bubble and the final answer replaces it once', () => {
  const h = streamHarness();
  h.emit({ type: 'stream_start' });
  h.emit({ type: 'stream_token', token: 'Let me check' });
  const key = h.state.messages[0].renderKey;
  h.emit({ type: 'stream_reset' });
  assert.equal(h.state.messages[0].awaiting, true);
  assert.equal(h.clock.pending, 0);
  h.emit({ type: 'stream_start' });
  h.emit({ type: 'stream_token', token: 'The answer is 42.' });
  h.emit({ type: 'response', message: { id: 42, role: 'agent', content: 'The answer is 42.' } });
  assert.equal(h.state.messages.length, 1);
  assert.equal(h.state.messages[0].renderKey, key);
  assert.equal(h.state.messages[0].content, 'The answer is 42.');
});

test('stop acknowledgement preserves partial text and adopts its saved id', () => {
  const h = streamHarness();
  h.emit({ type: 'stream_start' });
  h.emit({ type: 'stream_token', token: 'Partial answer' });
  h.emit({ type: 'cancelled', message: { id: 99, role: 'agent', content: 'Partial answer', interrupted: true } });
  assert.equal(h.state.messages[0].id, 99);
  assert.equal(h.state.messages[0].content, 'Partial answer');
  assert.equal(h.state.messages[0].interrupted, true);
  assert.equal(h.state.thinking, false);
  assert.equal(h.context.sendingRef.current, false);
  assert.equal(h.clock.pending, 0);
});

test('background quality metadata never changes the current turn or the delivered answer', () => {
  const h = streamHarness();
  h.state.messages = [{ id: 11, role: 'agent', content: 'Already delivered' }];
  h.emit({ type: 'stream_start' });
  h.emit({ type: 'stream_token', token: 'Next reply' });
  h.emit({ type: 'message_updated', id: 11, critic_score: 8, critic_review: 'Good answer' });
  assert.equal(h.state.messages[0].content, 'Already delivered');
  assert.equal(h.state.messages[0].critic_score, 8);
  assert.equal(h.state.thinking, true);
  assert.equal(h.context.sendingRef.current, true);
  assert.equal(h.state.messages[1].liveText.content, 'Next reply');
});

test('Stop sends cancellation without deleting the follow-up draft or unlocking early', () => {
  let sent, thinking = true, stopping = false;
  const context = {
    sendingRef: { current: true }, isStopping: false, createRequestRef: { current: null }, conversationId: 'chat',
    pendingMessageRef: { current: null }, pendingAttachmentsRef: { current: [] },
    WebSocket: { OPEN: 1 }, wsRef: { current: { readyState: 1, send: text => sent = JSON.parse(text) } },
    setIsThinking: value => thinking = value, setIsStopping: value => stopping = value,
    setInput() { assert.fail('must preserve draft'); }, setAttachedFiles() { assert.fail('must preserve draft files'); },
    stopTimeoutRef: { current: null }, setTimeout: () => 123,
  };
  functionFromSource('components/chat/ChatPanel.tsx', 'handleStop', context)();
  assert.equal(sent.type, 'stop');
  assert.equal(thinking, true);
  assert.equal(stopping, true);
});

test('markdown retains unlabelled fences, ordered-list starts, and user line breaks', () => {
  const { MarkdownRenderer } = load('components/chat/MarkdownRenderer');
  const html = renderToStaticMarkup(React.createElement(MarkdownRenderer, { content: '```\n  first line\n    second line\n```\n\n3. Third\n4. Fourth' }));
  assert.match(html, /<pre[^>]*><code>  first line\n    second line\n<\/code><\/pre>/);
  assert.match(html, /<ol start="3"/);
  assert.match(html, /Copy/);
  const { ChatMessage } = load('components/chat/ChatMessage');
  const user = renderToStaticMarkup(React.createElement(ChatMessage, { message: { id: 1, role: 'user', content: 'first\nsecond' }, busy: false, onSend() {}, onFeedback() {} }));
  assert.match(user, /user-message-text">first\nsecond/);
});

test('Stop racing a completed save keeps the final answer and its completed status', () => {
  const h = streamHarness();
  h.emit({ type: 'stream_start', agent: 'writer' });
  h.emit({ type: 'stream_token', token: 'Finished answer' });
  h.emit({ type: 'cancelled', message: { id: 'saved-final', role: 'agent', content: 'Finished answer', interrupted: false } });
  assert.equal(h.state.messages.length, 1);
  assert.equal(h.state.messages[0].id, 'saved-final');
  assert.equal(h.state.messages[0].interrupted, false);
  assert.equal(h.state.messages[0].isStreaming, false);
  assert.equal(h.state.thinking, false);
});
