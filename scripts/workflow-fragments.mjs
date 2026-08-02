export const normalizeWorkflowText = (text) => text.replace(/\r\n/g, "\n");

export const hasWorkflowFragment = (content, fragment) => normalizeWorkflowText(content).includes(normalizeWorkflowText(fragment));
