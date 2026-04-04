export interface PlaceholderData {
  municipality_name?: string;
  plan_type?: string;
  priority_wards?: string;
}

export function applyPlaceholders(content: string, data: PlaceholderData): string {
  const replacements: Record<string, string> = {
    municipality_name: data.municipality_name ?? 'Municipality',
    plan_type: data.plan_type ?? 'plan',
    priority_wards: data.priority_wards ?? 'Not yet identified'
  };

  return content.replace(/\{\{\s*(municipality_name|plan_type|priority_wards)\s*\}\}/g, (_m, token) => {
    return replacements[token] ?? '';
  });
}
