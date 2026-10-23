import { STARTER_MERMAID_CODE } from '@mermaidchart/shared';

export interface MermaidTemplate {
  id: string;
  label: string;
  code: string;
}

export const MERMAID_TEMPLATES: MermaidTemplate[] = [
  {
    id: 'flowchart',
    label: 'Flowchart',
    code: STARTER_MERMAID_CODE,
  },
  {
    id: 'sequence',
    label: 'Sequence Diagram',
    code: `sequenceDiagram
    autonumber
    actor User
    participant Client as Web App
    participant API as Express API
    participant Disk as Disk Storage

    User->>Client: Edit Mermaid diagram
    Client->>Client: Debounced preview (300ms)
    Client->>API: PUT /api/projects/:p/charts/:c (baseRevision)
    API->>Disk: Atomic write (.tmp -> rename)
    Disk-->>API: Saved (revision + 1)
    API-->>Client: 200 OK { chart }
`,
  },
  {
    id: 'state',
    label: 'State Diagram',
    code: `stateDiagram-v2
    [*] --> Saved
    Saved --> Editing : User types
    Editing --> Saving : 1s debounce
    Saving --> Saved : 200 OK
    Saving --> Conflict : 409 Revision mismatch
    Conflict --> Saving : Overwrite
    Conflict --> Saved : Load theirs
`,
  },
  {
    id: 'class',
    label: 'Class Diagram',
    code: `classDiagram
    class Project {
        +string id
        +string name
        +number revision
        +string updatedAt
    }
    class Chart {
        +string id
        +string projectId
        +string name
        +string code
        +number revision
    }
    Project "1" *-- "0..*" Chart : contains
`,
  },
  {
    id: 'er',
    label: 'ER Diagram',
    code: `erDiagram
    PROJECT ||--o{ CHART : contains
    PROJECT {
        string id PK
        string name
        int revision
        datetime updatedAt
    }
    CHART {
        string id PK
        string projectId FK
        string name
        string code
        int revision
    }
`,
  },
  {
    id: 'pie',
    label: 'Pie Chart',
    code: `pie title Diagram Types in Project
    "Flowcharts" : 45
    "Sequence Diagrams" : 30
    "Architecture & ER" : 15
    "State Machines" : 10
`,
  },
];
