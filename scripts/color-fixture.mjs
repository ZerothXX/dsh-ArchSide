export const colorIds = ['blue', 'purple', 'teal', 'orange', 'slate', 'rose', 'olive', 'brown'];
export function colorFixture(count) {
  const old = ['blue', 'slate', 'purple', 'teal', 'purple', 'orange', 'orange', 'blue', 'slate', 'teal'];
  const titles = ['项目定位与功能范围', '系统架构总览', 'Agent 编排', '角色、会话与回答', '角色知识库', '图像创作流水线', '模型管理与环境配置', '前端工作台', '研究子项目与外部集成', '质量、验证与限制'];
  const chapters = Array.from({ length: count }, (_, i) =>
    `## ${i + 1} ${titles[i]}\n<!-- archside: ${JSON.stringify({ id: `chapter-${i}`, color: old[i] })} -->\n### ${i + 1}.1 内部结构\n<!-- archside: {"id":"section-${i}"} -->\n`).join('\n');
  let pairs;
  if (count === 8) pairs = Array.from({ length: count }, (_, i) => [i, (i + 1) % count, 1]);
  else if (count === 9) pairs = Array.from({ length: count }, (_, a) => Array.from({ length: count - a - 1 }, (_, i) => {
    const b = a + i + 1; return [a, b, a === 0 && b === 8 ? 0 : 1];
  })).flat();
  else pairs = [[0, 1, 1], ...Array.from({ length: 8 }, (_, a) => [a, 8, a === 2 ? 0 : 2]),
    ...Array.from({ length: 8 }, (_, a) => [9, a, a === 5 ? 0 : 3]), [8, 9, 1]];
  const edges = pairs.flatMap(([a, b, weight], i) => Array.from({ length: weight }, (_, j) => ({
    id: `edge-${i}-${j}`, source: `section-${a}`, target: `section-${b}`, kind: 'data', label: '',
  })));
  return { markdown: `# ${count} 个独立章节 · 八色分配验证\n${chapters}\n\`\`\`archside\n${JSON.stringify({ version: 1, edges })}\n\`\`\`\n`,
    edges, expectedColors: [...colorIds, ...(count === 9 ? ['blue'] : count === 10 ? ['teal', 'rose'] : [])] };
}
