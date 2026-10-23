import React from 'react';
import {
  Square,
  Diamond,
  Database,
  CircleDot,
  ArrowRight,
  GitCommitHorizontal,
  BoxSelect,
  Paintbrush,
  ArrowRightLeft,
} from 'lucide-react';
import { generateNextNodeId } from '../diagramManipulator';

interface QuickInsertToolbarProps {
  code: string;
  onChangeCode: (nextCode: string) => void;
  onInsertSnippet: (snippet: string) => void;
}

export const QuickInsertToolbar: React.FC<QuickInsertToolbarProps> = ({
  code,
  onChangeCode,
  onInsertSnippet,
}) => {
  const handleAddNode = (shapeBracket: (id: string) => string) => {
    const nextId = generateNextNodeId(code, 'N');
    onInsertSnippet(`    ${ shapeBracket(nextId) }`);
  };

  const handleToggleDirection = () => {
    const match = code.match(/^(\s*(?:flowchart|graph)\s+)(TD|TB|LR|RL|BT)\b/m);
    if (match) {
      const currentDir = match[2];
      const nextDir = currentDir === 'LR' ? 'TD' : 'LR';
      const updated = code.replace(
        /^(\s*(?:flowchart|graph)\s+)(TD|TB|LR|RL|BT)\b/m,
        `$1${nextDir}`
      );
      onChangeCode(updated);
    } else {
      onInsertSnippet('flowchart TD');
    }
  };

  return (
    <div className="quick-insert-toolbar" data-testid="quick-insert-toolbar">
      <div className="toolbar-section">
        <span className="toolbar-section-label">Add Node:</span>
        <button
          type="button"
          className="toolbar-chip"
          onClick={() => handleAddNode((id) => `${id}[New Step]`)}
          title="Insert Rectangle Node"
          data-testid="insert-rect-node-btn"
        >
          <Square size={12} />
          <span>Box</span>
        </button>
        <button
          type="button"
          className="toolbar-chip"
          onClick={() => handleAddNode((id) => `${id}(Rounded Step)`)}
          title="Insert Rounded Node"
        >
          <CircleDot size={12} />
          <span>Rounded</span>
        </button>
        <button
          type="button"
          className="toolbar-chip"
          onClick={() => handleAddNode((id) => `${id}{Decision?}`)}
          title="Insert Diamond Decision Node"
          data-testid="insert-decision-node-btn"
        >
          <Diamond size={12} />
          <span>Decision</span>
        </button>
        <button
          type="button"
          className="toolbar-chip"
          onClick={() => handleAddNode((id) => `${id}[(Database)]`)}
          title="Insert Cylinder Database Node"
        >
          <Database size={12} />
          <span>DB</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section">
        <span className="toolbar-section-label">Connect:</span>
        <button
          type="button"
          className="toolbar-chip"
          onClick={() => onInsertSnippet('    A --> B')}
          title="Insert Solid Arrow"
          data-testid="insert-arrow-btn"
        >
          <ArrowRight size={12} />
          <span>A --&gt; B</span>
        </button>
        <button
          type="button"
          className="toolbar-chip"
          onClick={() => onInsertSnippet('    A -->|Label| B')}
          title="Insert Labeled Arrow"
        >
          <GitCommitHorizontal size={12} />
          <span>Labeled</span>
        </button>
        <button
          type="button"
          className="toolbar-chip"
          onClick={() => onInsertSnippet('    A -.-> B')}
          title="Insert Dotted Arrow"
        >
          <span>-.-&gt;</span>
        </button>
      </div>

      <div className="toolbar-divider" />

      <div className="toolbar-section">
        <button
          type="button"
          className="toolbar-chip"
          onClick={() =>
            onInsertSnippet('    subgraph Group["Subgroup Title"]\n        G1[Item]\n    end')
          }
          title="Insert Subgraph Block"
          data-testid="insert-subgraph-btn"
        >
          <BoxSelect size={12} />
          <span>Subgraph</span>
        </button>
        <button
          type="button"
          className="toolbar-chip"
          onClick={() =>
            onInsertSnippet(
              '    style A fill:#e0e7ff,stroke:#4f46e5,stroke-width:2px,color:#1e1b4b'
            )
          }
          title="Insert Node Style Rule"
        >
          <Paintbrush size={12} />
          <span>Style</span>
        </button>
        <button
          type="button"
          className="toolbar-chip"
          onClick={handleToggleDirection}
          title="Toggle Flowchart Direction (TD / LR)"
          data-testid="toggle-direction-btn"
        >
          <ArrowRightLeft size={12} />
          <span>TD / LR</span>
        </button>
      </div>
    </div>
  );
};
