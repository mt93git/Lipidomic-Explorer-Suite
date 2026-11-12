/** A synthetic answer in the analyst's companion format (plain lines, section titles, a Source line) for the mock's
 *  POST /companion/ask; any other question gets the guide's fallback. Synthetic text, no network. */
const pca = ['Happy to help! This is what the sources say:', '', 'Definition',
  'Principal component analysis places each sample by its scores on the first two components of the prepared data. Each axis title gives the share of variance that component explains.', '',
  'Relevance', 'Samples that sit close together have similar overall lipid profiles. Whether groups separate along PC1 or PC2 shows how much the condition drives the variation. PCA is exploratory: it does not test a difference.', '',
  'New insights', 'The sources do not cover this part.', '',
  'Source: Jolliffe, I. T., & Cadima, J. (2016). Principal component analysis: A review and recent developments. Philosophical Transactions of the Royal Society A, 374(2065), 20150202.', '',
  'That is quoted exactly as written in the sources. Is there something else you would like to know?'].join('\n');
export function mockCompanionAsk(question: string) {
  return /\bpca\b/i.test(question)
    ? { text: pca, label: 'Knowledge base · 3 passages', grounded: true }
    : { text: 'I have no information about this.\n\nI can only share what is in the knowledge base, so a more specific question, or a different wording, might help. Happy to try again!', label: 'Knowledge base · no matching source', grounded: false };
}
