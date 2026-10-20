export interface RhMcpOption {
  id: string;
  label: string;
}

export const RH_MCP_OPTIONS: RhMcpOption[] = [
  {
    id: 'github',
    label: 'GitHub (Kanban & PRs)',
  },
  {
    id: 'gcloud',
    label: 'GCloud CLI',
  },
  {
    id: 'gitlab',
    label: 'GitLab CI/CD',
  },
  {
    id: 'veo',
    label: 'Veo & NanoBanana (Creative)',
  },
  {
    id: 'context7',
    label: 'Context7 (Docs)',
  },
  {
    id: 'figma',
    label: 'Figma (Design context)',
  },
  {
    id: 'stitch',
    label: 'Stitch (Remote MCP)',
  },
];
