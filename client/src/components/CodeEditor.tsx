import React, { useEffect, useRef } from 'react';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  keymap,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, indentOnInput } from '@codemirror/language';
import { searchKeymap } from '@codemirror/search';
import { oneDark } from '@codemirror/theme-one-dark';

interface CodeEditorProps {
  value: string;
  onChange: (nextValue: string) => void;
}

const customEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13.5px',
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    lineHeight: '1.6',
  },
  '.cm-content': {
    padding: '12px 0',
  },
});

export const CodeEditor: React.FC<CodeEditorProps> = ({ value, onChange }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isExternalSyncRef = useRef<boolean>(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged && !isExternalSyncRef.current) {
        const docText = update.state.doc.toString();
        onChangeRef.current(docText);
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        indentOnInput(),
        bracketMatching(),
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        oneDark,
        customEditorTheme,
        EditorView.lineWrapping,
        updateListener,
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Only initialize once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (e.g. switching charts, loading conflict version, applying template, undo/redo)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentText = view.state.doc.toString();
    if (currentText !== value) {
      isExternalSyncRef.current = true;
      try {
        view.dispatch({
          changes: {
            from: 0,
            to: currentText.length,
            insert: value,
          },
        });
      } finally {
        isExternalSyncRef.current = false;
      }
    }
  }, [value]);

  return <div ref={containerRef} className="code-editor-host" data-testid="code-editor" />;
};
