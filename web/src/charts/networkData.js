export function buildNetwork(artists) {
  const nodes = artists.filter(a => a.tier !== 'archived' && a.status !== 'archived').slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const key = v => String(v || '').trim().toLowerCase();
  const mentions = (a, b) => (a.collaborations || []).some(entry => (typeof entry === 'string' ? [entry] : [entry?.id, entry?.name]).some(v => v && [key(b.id), key(b.name)].includes(key(v))));
  const edges = [];
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) if (mentions(nodes[i], nodes[j]) || mentions(nodes[j], nodes[i])) edges.push([nodes[i].id, nodes[j].id]);
  return { nodes, edges };
}
