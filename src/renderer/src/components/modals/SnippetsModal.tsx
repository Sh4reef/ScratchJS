import React, { useState } from 'react'
import { X, Bookmark, Plus, FileCode, ArrowRight } from 'lucide-react'
import { Snippet } from '../../types'

interface SnippetsModalProps {
  isOpen: boolean
  onClose: () => void
  onInsertSnippet: (code: string) => void
  onInsertInNewTab: (title: string, code: string) => void
}

const DEFAULT_SNIPPETS: Snippet[] = [
  {
    id: 'snip-1',
    name: 'Async Fetch with Timeout',
    description: 'Fetch an API with an AbortController timeout',
    code: `async function fetchWithTimeout(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return await res.json();
  } finally {
    clearTimeout(id);
  }
}

const data = await fetchWithTimeout('https://api.github.com/zen');
console.log("GitHub Zen:", data);
`
  },
  {
    id: 'snip-2',
    name: 'Array Chunking & Grouping',
    description: 'Split an array into fixed-size chunks',
    code: `const chunk = (arr, size) => 
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );

const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const chunked = chunk(items, 3); // ?
console.log(chunked);
`
  },
  {
    id: 'snip-3',
    name: 'Crypto Hash Generator',
    description: 'Generate SHA-256 and MD5 hashes using Node crypto',
    code: `const crypto = require('crypto');

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

const hash = sha256("Hello, ScratchJS!"); // ?
console.log("SHA-256:", hash);
`
  },
  {
    id: 'snip-4',
    name: 'Deep Object Clone',
    description: 'Deep clone an object using modern structuredClone',
    code: `const original = {
  user: { name: 'Alice', id: 42 },
  tags: ['admin', 'developer'],
  date: new Date()
};

const clone = structuredClone(original);
clone.user.name = 'Bob';

console.log("Original:", original.user.name);
console.log("Clone:", clone.user.name);
`
  }
]

export const SnippetsModal: React.FC<SnippetsModalProps> = ({
  isOpen,
  onClose,
  onInsertSnippet,
  onInsertInNewTab
}) => {
  const [snippets] = useState<Snippet[]>(DEFAULT_SNIPPETS)
  const [selectedSnippet, setSelectedSnippet] = useState<Snippet>(DEFAULT_SNIPPETS[0])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-surface border border-border w-full max-w-2xl rounded-lg shadow-2xl flex flex-col h-[520px] overflow-hidden text-xs">
        {/* Modal Header */}
        <div className="h-11 px-4 border-b border-border flex items-center justify-between select-none">
          <div className="flex items-center space-x-2 font-semibold text-text">
            <Bookmark className="w-4 h-4 text-accent" />
            <span>Code Snippets</span>
          </div>

          <button onClick={onClose} className="p-1 rounded text-textMuted hover:text-text hover:bg-surfaceHover">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2-Column Layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Snippet List */}
          <div className="w-64 border-r border-border bg-background/50 overflow-y-auto p-2 space-y-1">
            {snippets.map((snip) => {
              const isSelected = snip.id === selectedSnippet.id
              return (
                <button
                  key={snip.id}
                  onClick={() => setSelectedSnippet(snip)}
                  className={`w-full text-left p-2 rounded transition flex items-start space-x-2 ${
                    isSelected ? 'bg-surface text-primary font-medium' : 'text-textMuted hover:bg-surface/50 hover:text-text'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <div className="truncate">
                    <p className="truncate font-semibold">{snip.name}</p>
                    <p className="truncate text-[10px] text-textMuted/70">{snip.description}</p>
                  </div>
                </button>
              )
            })}
          </div>

          {/* Right: Code Preview & Action Buttons */}
          <div className="flex-1 flex flex-col bg-surface p-4 overflow-hidden">
            <div className="mb-2">
              <h3 className="font-semibold text-text text-sm">{selectedSnippet.name}</h3>
              <p className="text-textMuted text-xs">{selectedSnippet.description}</p>
            </div>

            <div className="flex-1 bg-background border border-border rounded p-3 overflow-auto font-mono text-[11px] text-text">
              <pre className="whitespace-pre-wrap">{selectedSnippet.code}</pre>
            </div>

            <div className="mt-3 flex items-center justify-end space-x-2">
              <button
                onClick={() => {
                  onInsertSnippet(selectedSnippet.code)
                  onClose()
                }}
                className="px-3 py-1.5 bg-surfaceHover hover:bg-border text-text rounded font-medium transition"
              >
                Insert in Current Tab
              </button>
              <button
                onClick={() => {
                  onInsertInNewTab(selectedSnippet.name, selectedSnippet.code)
                  onClose()
                }}
                className="flex items-center space-x-1.5 px-3 py-1.5 bg-primary text-background font-semibold rounded hover:bg-primary/90 transition"
              >
                <span>Open in New Tab</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
