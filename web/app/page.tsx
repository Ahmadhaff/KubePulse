'use client';

import { FormEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import Markdown from './components/Markdown';

type Message = {
  id: number;
  role: 'user' | 'agent' | 'error';
  text: string;
  time: string;
  tools?: string[];
};

const SUGGESTIONS = [
  'What is the weather in Paris?',
  'Compare the weather in Tokyo and London',
  'Is it warmer in Tunis or Madrid? Use Fahrenheit.',
  'Explain what Kubernetes is in two sentences',
];

const MAX_HISTORY = 20;

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const nextId = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Auto-grow the textarea up to a max height.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  async function ask(text: string, base: Message[]) {
    const message = text.trim();
    if (!message || loading) return;

    // Previous turns give the agent conversational memory.
    const history = base
      .filter((m) => m.role !== 'error')
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }));

    const userMsg: Message = { id: nextId.current++, role: 'user', text: message, time: now() };
    setMessages([...base, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, history }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(
          Array.isArray(data.message)
            ? data.message.join(', ')
            : data.message || `Request failed (${res.status})`,
        );
      }
      setMessages((m) => [
        ...m,
        {
          id: nextId.current++,
          role: 'agent',
          text: data.reply,
          time: now(),
          tools: data.toolsUsed ?? [],
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: nextId.current++,
          role: 'error',
          text: err instanceof Error ? err.message : 'Something went wrong',
          time: now(),
        },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    ask(input, messages);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask(input, messages);
    }
  }

  function retry() {
    // Drop the trailing error, then resend the last user message.
    const withoutError = messages.slice(0, -1);
    const last = withoutError[withoutError.length - 1];
    if (last?.role === 'user') ask(last.text, withoutError.slice(0, -1));
  }

  async function copy(m: Message) {
    try {
      await navigator.clipboard.writeText(m.text);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((id) => (id === m.id ? null : id)), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <div className="logo">K</div>
          <div>
            <h1>KubeAgent</h1>
            <span className="status">
              <i className={loading ? 'dot busy' : 'dot'} />
              {loading ? 'Thinking…' : 'Online'}
            </span>
          </div>
        </div>
        <button
          className="ghost"
          onClick={() => setMessages([])}
          disabled={loading || messages.length === 0}
        >
          New chat
        </button>
      </header>

      <main className="messages">
        {messages.length === 0 && !loading && (
          <div className="empty">
            <div className="logo big">K</div>
            <h2>How can I help?</h2>
            <p>Ask about the weather in any city, or anything else.</p>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => ask(s, messages)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, idx) => (
          <div key={m.id} className={`row ${m.role}`}>
            {m.role !== 'user' && (
              <div className={m.role === 'error' ? 'avatar err' : 'avatar'}>
                {m.role === 'error' ? '!' : 'K'}
              </div>
            )}
            <div className="col">
              <div className={`bubble ${m.role}`}>
                {m.role === 'agent' ? <Markdown text={m.text} /> : m.text}
              </div>
              <div className="meta">
                <span>{m.time}</span>
                {m.tools && m.tools.length > 0 && (
                  <span className="tool">Used {m.tools.join(', ')}</span>
                )}
                {m.role === 'agent' && (
                  <button className="link" onClick={() => copy(m)}>
                    {copiedId === m.id ? 'Copied' : 'Copy'}
                  </button>
                )}
                {m.role === 'error' && idx === messages.length - 1 && !loading && (
                  <button className="link" onClick={retry}>
                    Retry
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {loading && (
          <div className="row agent">
            <div className="avatar">K</div>
            <div className="col">
              <div className="bubble agent typing">
                <span />
                <span />
                <span />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </main>

      <form onSubmit={onSubmit} className="composer">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message KubeAgent…  (Enter to send, Shift+Enter for a new line)"
          rows={1}
          maxLength={4000}
          autoFocus
        />
        <button type="submit" disabled={loading || !input.trim()} aria-label="Send">
          Send
        </button>
      </form>
    </div>
  );
}
